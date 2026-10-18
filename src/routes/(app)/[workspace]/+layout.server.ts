import { listTree, ensureWorkspace } from '#lib/core/documents.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, parent }) => {
	// The (app) layout redirects anonymous visitors; awaiting it keeps that ahead of the 401 below.
	await parent();
	const { role } = requireRole(params.workspace, locals, 'reader');
	// A folder deleted or lost on disk comes back empty instead of failing every page.
	await ensureWorkspace(params.workspace);
	return { workspace: params.workspace, role, tree: await listTree(params.workspace, locals.actor!) };
};
