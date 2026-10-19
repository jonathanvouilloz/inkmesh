import type { RequestEvent } from '@sveltejs/kit';
import { Forbidden, workspacesOf } from '#lib/core/access.ts';
import { loginAllowed, loginFailed } from '#lib/core/accounts.ts';
import type { Actor } from '#lib/core/actor.ts';
import { authenticateToken, type AgentAuth } from '#lib/core/agents.ts';
import { listTree, readDocument } from '#lib/core/documents.ts';
import { changes } from '#lib/core/events.ts';
import { Conflict, InvalidContent, InvalidPath } from '#lib/core/paths.ts';

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

const MISSING = new Set(['ENOENT', 'ENOTDIR']);

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
	const key = 'bearer|' + event.getClientAddress();
	if (!loginAllowed(key)) throw new ApiError(429, 'too_many_requests', 'too many failed attempts, try later');
	const token = /^Bearer +(\S+)$/i.exec(event.request.headers.get('authorization') ?? '')?.[1];
	const auth = token ? authenticateToken(token, resource) : null;
	if (!auth) {
		loginFailed(key);
		throw new ApiError(401, 'unauthorized', 'missing or invalid bearer token');
	}
	return auth;
}

export const ops = {
	workspaces: (actor: Actor) => ({ workspaces: workspacesOf(actor.id) }),
	tree: async (actor: Actor, ws: string) => ({ tree: await listTree(ws, actor) }),
	read: async (actor: Actor, ws: string, path: string) => {
		const { source, hash } = await readDocument(ws, path, actor);
		return { path, content: source, hash };
	},
	// Without `since`: the 50 latest and `more: false`, even when older events exist.
	changes: (actor: Actor, ws: string, since?: number) => changes(ws, actor, since)
};
