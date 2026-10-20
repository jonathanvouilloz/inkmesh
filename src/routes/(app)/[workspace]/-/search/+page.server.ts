import { search } from '#lib/core/search.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	await parent(); // the layouts' redirect and 404 come first
	requireRole(params.workspace, locals, 'reader');
	const q = url.searchParams.get('q')?.trim().slice(0, 200) ?? '';
	return { q, results: q ? search(params.workspace, q, locals.actor!) : [] };
};
