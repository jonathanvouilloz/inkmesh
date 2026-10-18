import { error } from '@sveltejs/kit';
import { ensureWorkspace, listTree } from '#lib/core/documents.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params }) => {
	// shortcut: single workspace "demo" hard-wired; the workspace list and switcher come with memberships in milestone 2
	if (params.workspace !== 'demo') error(404);
	await ensureWorkspace(params.workspace);
	return { workspace: params.workspace, tree: await listTree(params.workspace) };
};
