import { redirect } from '@sveltejs/kit';
import { sharedTree } from '#lib/core/publicLinks.ts';
import { docHref } from '#lib/ui/href.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { path } = await parent();
	if (path !== null) redirect(302, docHref('s/' + params.token, path));
	return { nodes: await sharedTree(params.token) };
};
