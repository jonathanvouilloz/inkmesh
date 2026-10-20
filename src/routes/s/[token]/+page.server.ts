import { redirect } from '@sveltejs/kit';
import { sharedFolderFields, sharedTree } from '#lib/core/publicLinks.ts';
import { canonicalQuery, queryFolder } from '#lib/ui/folderQuery.ts';
import { docHref } from '#lib/ui/href.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, parent }) => {
	const to = canonicalQuery(url.searchParams);
	if (to !== null) redirect(303, url.pathname + to);
	const { path } = await parent();
	if (path !== null) redirect(302, docHref('s/' + params.token, path));
	const nodes = await sharedTree(params.token);
	const fields = await sharedFolderFields(params.token, '');
	return { nodes, query: queryFolder(nodes, fields, url.searchParams), fields };
};
