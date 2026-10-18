import { workspacesOf } from '#lib/core/access.ts';
import { listTree } from '#lib/core/documents.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, parent }) => {
	// The (app) layout redirects anonymous visitors; awaiting it keeps that ahead of the 401 below.
	const { user } = await parent();
	const { role } = requireRole(params.workspace, locals, 'reader');
	return {
		workspace: params.workspace,
		role,
		workspaces: workspacesOf(user.id),
		tree: await listTree(params.workspace, locals.actor!)
	};
};
