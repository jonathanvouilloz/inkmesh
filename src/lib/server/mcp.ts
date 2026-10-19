import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Actor } from '#lib/core/actor.ts';
import { ops, toApiError } from '#lib/server/agent-api.ts';
import { version } from '../../../package.json';

const instructions =
	'Every tool takes a workspace slug: call list_workspaces first. Paths are relative to the workspace; documents end in .md. Read a document before updating it and pass its hash as expected_hash.';

const name = z.string().min(1);
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const bytes = (content: string) => new TextEncoder().encode(content);

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
	const readOnly = { readOnlyHint: true };
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
			inputSchema: z.object({ workspace: name, path: name, content: z.string() })
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
			inputSchema: z.object({ workspace: name, path: name, content: z.string(), expected_hash: name })
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
			annotations: { destructiveHint: true }
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
			inputSchema: z.object({ workspace: name, from: name, to: name })
		},
		({ workspace, from, to }) => run(() => ops.move(actor, workspace, from, to))
	);
	server.registerTool(
		'delete',
		{
			title: 'Delete',
			description: 'Deletes a document or a folder with its content.',
			inputSchema: z.object({ workspace: name, path: name }),
			annotations: { destructiveHint: true }
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
	return server;
}

export const mcpHandler = createMcpHandler(({ authInfo }) => mcpServer(authInfo!.extra!.actor as Actor), {
	maxRequestBodySize: 8 * 1024 * 1024
});
