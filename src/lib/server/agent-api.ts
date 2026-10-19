import type { RequestEvent } from '@sveltejs/kit';
import { Forbidden, workspacesOf } from '#lib/core/access.ts';
import { loginAllowed, loginFailed } from '#lib/core/accounts.ts';
import type { Actor } from '#lib/core/actor.ts';
import { authenticateToken, type AgentAuth } from '#lib/core/agents.ts';
import { addComment, listComments, MAX_COMMENT_CHARS } from '#lib/core/comments.ts';
import {
	deletePath,
	importDocument,
	listTree,
	MAX_DOCUMENT_BYTES,
	movePath,
	readDocument
} from '#lib/core/documents.ts';
import { changes } from '#lib/core/events.ts';
import { Conflict, InvalidContent, InvalidPath } from '#lib/core/paths.ts';
import { search } from '#lib/core/search.ts';

export type ApiErrorCode =
	| 'unauthorized'
	| 'forbidden'
	| 'not_found'
	| 'bad_request'
	| 'conflict'
	| 'payload_too_large'
	| 'too_many_requests';

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: ApiErrorCode,
		message: string,
		public extra?: Record<string, unknown>
	) {
		super(message);
	}
}

const MISSING = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

/** Maps core errors to API errors; anything else is a bug and is rethrown (500, logged, never echoed). */
export function toApiError(err: unknown): ApiError {
	if (err instanceof ApiError) return err;
	// A non-member and a missing workspace get the same answer, so slugs cannot be probed.
	if (err instanceof Forbidden)
		return err.message === 'not a member'
			? new ApiError(404, 'not_found', 'not found')
			: new ApiError(403, 'forbidden', err.message);
	if (err instanceof InvalidPath) return new ApiError(400, 'bad_request', `invalid path: ${err.message}`);
	if (err instanceof InvalidContent)
		return err.message === 'too-large'
			? new ApiError(413, 'payload_too_large', 'the document is larger than 3 MiB')
			: new ApiError(400, 'bad_request', 'the document is not valid UTF-8');
	if (err instanceof Conflict) return new ApiError(409, 'conflict', err.message);
	if (MISSING.has((err as { code?: string } | null)?.code ?? '')) return new ApiError(404, 'not_found', 'not found');
	throw err;
}

const challenge = (err: ApiError): HeadersInit =>
	err.status === 401 ? { 'www-authenticate': 'Bearer realm="inkmesh"' } : {};

export async function apiResponse(
	fn: () => Promise<Response>,
	headers: (err: ApiError) => HeadersInit = challenge
): Promise<Response> {
	try {
		return await fn();
	} catch (err) {
		const e = toApiError(err);
		return Response.json(
			{ error: { code: e.code, message: e.message, ...e.extra } },
			{ status: e.status, headers: headers(e) }
		);
	}
}

/** Bearer header only: the session cookie and the query string are never read. */
export function requireAgent(event: RequestEvent, resource: string | null): AgentAuth {
	const header = event.request.headers.get('authorization');
	// Not counted: MCP clients probe without a token, often from shared IP ranges.
	if (header === null) throw new ApiError(401, 'unauthorized', 'missing or invalid bearer token');
	const token = /^Bearer +(\S+)$/i.exec(header)?.[1];
	const auth = token ? authenticateToken(token, resource) : null;
	if (auth) return auth;
	// Checked after authenticating: failures from a shared IP must not lock out valid tokens.
	const key = 'bearer|' + event.getClientAddress();
	if (!loginAllowed(key)) throw new ApiError(429, 'too_many_requests', 'too many failed attempts, try later');
	loginFailed(key);
	throw new ApiError(401, 'unauthorized', 'missing or invalid bearer token');
}

/** The request body, refused with InvalidContent('too-large') past `max` whatever `content-length` says. */
export async function readBody(request: Request, max = MAX_DOCUMENT_BYTES): Promise<Uint8Array> {
	if (Number(request.headers.get('content-length')) > max) throw new InvalidContent('too-large');
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of request.body ?? []) {
		size += chunk.byteLength;
		if (size > max) throw new InvalidContent('too-large');
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

export type WriteMode = 'create' | 'replace' | { expectedHash: string };

export const ops = {
	workspaces: (actor: Actor) => ({ workspaces: workspacesOf(actor.id) }),
	tree: async (actor: Actor, ws: string) => ({ tree: await listTree(ws, actor) }),
	read: async (actor: Actor, ws: string, path: string) => {
		const { source, hash } = await readDocument(ws, path, actor);
		return { path, content: source, hash };
	},
	write: async (actor: Actor, ws: string, path: string, bytes: Uint8Array, mode: WriteMode) => {
		try {
			const done = await importDocument(ws, path, bytes, {
				actor,
				overwrite: mode === 'replace',
				expectedHash: typeof mode === 'object' ? mode.expectedHash : undefined
			});
			return { path: done.path, hash: done.hash, created: !done.replaced };
		} catch (err) {
			if (!(err instanceof Conflict)) throw err;
			const currentHash = await readDocument(ws, path, actor).then(
				(doc) => doc.hash,
				() => null
			);
			throw new ApiError(409, 'conflict', err.message, { currentHash });
		}
	},
	move: async (actor: Actor, ws: string, from: string, to: string) => ({
		path: await movePath(ws, from, to, actor)
	}),
	remove: (actor: Actor, ws: string, path: string) => deletePath(ws, path, actor),
	// Without `since`: the 50 latest and `more: false`, even when older events exist.
	changes: (actor: Actor, ws: string, since?: number) => changes(ws, actor, since),
	search: (actor: Actor, ws: string, q: string) => {
		const query = q.trim();
		if (!query || query.length > 200)
			throw new ApiError(400, 'bad_request', 'the query must be 1 to 200 characters');
		// The highlight markers are for the UI; agents get plain text.
		const results = search(ws, query, actor).map((hit) => ({
			...hit,
			snippet: hit.snippet.replace(/[\u0002\u0003]/g, '')
		}));
		return { results };
	},
	comments: async (actor: Actor, ws: string, path: string) => ({
		comments: await listComments(ws, path, actor)
	}),
	comment: async (actor: Actor, ws: string, path: string, body: string) => {
		try {
			return { comment: await addComment(ws, path, body, actor) };
		} catch (err) {
			if (!(err instanceof InvalidContent)) throw err;
			// toApiError's messages speak of documents; these speak of the comment.
			throw err.message === 'too-large'
				? new ApiError(413, 'payload_too_large', `the comment is longer than ${MAX_COMMENT_CHARS} characters`)
				: new ApiError(400, 'bad_request', 'the comment is empty');
		}
	}
};
