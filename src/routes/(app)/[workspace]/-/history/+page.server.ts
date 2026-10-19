import { error, fail, redirect } from '@sveltejs/kit';
import { deletedDocuments, restoreDeleted } from '#lib/core/documents.ts';
import { Conflict, InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import { docHref } from '#lib/ui/href.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	await parent(); // the layouts' redirect and 404 come first
	requireRole(params.workspace, locals, 'reader');
	return { deleted: await deletedDocuments(params.workspace, locals.actor!) };
};

export const actions: Actions = {
	restore: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const path = (await request.formData()).get('path');
		if (typeof path !== 'string') error(400);
		try {
			await restoreDeleted(params.workspace, path, locals.actor!);
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { restoreError: 'exists' as const, path });
			if (err instanceof InvalidPath || (err as { code?: string }).code === 'ENOENT') return fail(404);
			throw err;
		}
		redirect(303, docHref(params.workspace, path));
	}
};
