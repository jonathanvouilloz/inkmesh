import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Actor } from '#lib/core/actor.ts';
import { MAX_COMMENT_CHARS } from '#lib/core/comments.ts';
import { MAX_DOCUMENT_BYTES } from '#lib/core/documents.ts';
import { InvalidContent } from '#lib/core/paths.ts';
import { ops, toApiError } from '#lib/server/agent-api.ts';
import { version } from '../../../package.json';

const instructions =
	'Every tool takes a workspace slug: call list_workspaces first. Paths are relative to the workspace; documents end in .md. Read a document before updating it and pass its hash as expected_hash. Comments on a document are read with read_comments and added with add_comment.';

const name = z.string().min(1);
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
// TextEncoder would silently turn a lone surrogate into U+FFFD.
function bytes(content: string): Uint8Array {
	if (!content.isWellFormed()) throw new InvalidContent('not-utf8');
	return new TextEncoder().encode(content);
}

async function run(fn: () => unknown) {
	try {
		return text(await fn());
	} catch (err) {
		let e;
		try {
			e = toApiError(err);
		} catch {
			// Unknown errors are bugs: logged, never echoed to the model.
			console.error(err);
			throw new Error('internal error');
		}
		return { isError: true, ...text({ error: { code: e.code, message: e.message, ...e.extra } }) };
	}
}

export function mcpServer(actor: Actor): McpServer {
	const server = new McpServer({ name: 'inkmesh', version }, { instructions });
	const readOnly = { readOnlyHint: true, openWorldHint: false };
	const destructive = { destructiveHint: true, openWorldHint: false };
	// MCP defaults destructiveHint to true for tools that are not read-only.
	const additive = { destructiveHint: false, openWorldHint: false };
	const closed = { openWorldHint: false };
	server.registerTool(
		'list_workspaces',
		{
			title: 'List workspaces',
			description: 'The workspaces you can reach, with your role in each.',
			inputSchema: z.object({}),
			annotations: readOnly
		},
		() => run(() => ops.workspaces(actor))
	);
	server.registerTool(
		'list_tree',
		{
			title: 'List tree',
			description: 'The folders and documents of a workspace.',
			inputSchema: z.object({ workspace: name }),
			annotations: readOnly
		},
		({ workspace }) => run(() => ops.tree(actor, workspace))
	);
	server.registerTool(
		'read_document',
		{
			title: 'Read document',
			description: 'The full file, frontmatter included, and its hash.',
			inputSchema: z.object({ workspace: name, path: name }),
			annotations: readOnly
		},
		({ workspace, path }) => run(() => ops.read(actor, workspace, path))
	);
	server.registerTool(
		'create_document',
		{
			title: 'Create document',
			description: 'Creates a document; fails with a conflict when it exists.',
			inputSchema: z.object({ workspace: name, path: name, content: z.string() }),
			annotations: additive
		},
		({ workspace, path, content }) =>
			run(async () => {
				const done = await ops.write(actor, workspace, path, bytes(content), 'create');
				return { path: done.path, hash: done.hash };
			})
	);
	server.registerTool(
		'update_document',
		{
			title: 'Update document',
			description:
				'Replaces the full file if it still has expected_hash; a conflict carries currentHash.',
			inputSchema: z.object({ workspace: name, path: name, content: z.string(), expected_hash: name }),
			annotations: closed
		},
		({ workspace, path, content, expected_hash }) =>
			run(async () => {
				const mode = { expectedHash: expected_hash };
				const done = await ops.write(actor, workspace, path, bytes(content), mode);
				return { path: done.path, hash: done.hash };
			})
	);
	server.registerTool(
		'replace_document',
		{
			title: 'Replace document',
			description: 'Writes the full file whatever it holds now, creating it if missing.',
			inputSchema: z.object({ workspace: name, path: name, content: z.string() }),
			annotations: destructive
		},
		({ workspace, path, content }) =>
			run(async () => {
				const done = await ops.write(actor, workspace, path, bytes(content), 'replace');
				return { path: done.path, hash: done.hash, replaced: !done.created };
			})
	);
	server.registerTool(
		'move',
		{
			title: 'Move',
			description: 'Moves or renames a document or folder; links to it are rewritten.',
			inputSchema: z.object({ workspace: name, from: name, to: name }),
			annotations: closed
		},
		({ workspace, from, to }) => run(() => ops.move(actor, workspace, from, to))
	);
	server.registerTool(
		'delete',
		{
			title: 'Delete',
			description: 'Deletes a document or a folder with its content.',
			inputSchema: z.object({ workspace: name, path: name }),
			annotations: destructive
		},
		({ workspace, path }) =>
			run(async () => {
				await ops.remove(actor, workspace, path);
				return { deleted: path };
			})
	);
	server.registerTool(
		'changes',
		{
			title: 'Changes',
			description:
				'Events by others since a cursor (the 50 latest without one); pass the returned cursor next time.',
			inputSchema: z.object({ workspace: name, since: z.number().int().min(0).optional() }),
			annotations: readOnly
		},
		({ workspace, since }) => run(() => ops.changes(actor, workspace, since))
	);
	server.registerTool(
		'search',
		{
			title: 'Search',
			description: 'Full-text search of the documents of a workspace, best first, at most 20.',
			inputSchema: z.object({ workspace: name, query: name }),
			annotations: readOnly
		},
		({ workspace, query }) => run(() => ops.search(actor, workspace, query))
	);
	server.registerTool(
		'read_comments',
		{
			title: 'Read comments',
			description: "A document's comments, oldest first.",
			inputSchema: z.object({ workspace: name, path: name }),
			annotations: readOnly
		},
		({ workspace, path }) => run(() => ops.comments(actor, workspace, path))
	);
	server.registerTool(
		'add_comment',
		{
			title: 'Add comment',
			description: "Adds a Markdown comment at the end of a document's thread.",
			inputSchema: z.object({ workspace: name, path: name, body: z.string().min(1).max(MAX_COMMENT_CHARS) }),
			annotations: additive
		},
		({ workspace, path, body }) => run(() => ops.comment(actor, workspace, path, body))
	);
	return server;
}

export const mcpHandler = createMcpHandler(({ authInfo }) => mcpServer(authInfo!.extra!.actor as Actor), {
	// Worst-case JSON escaping of a legal document (\u00XX per control byte), plus the envelope.
	maxRequestBodySize: 6 * MAX_DOCUMENT_BYTES + 64 * 1024
});
