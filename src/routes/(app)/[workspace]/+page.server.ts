import { fail, redirect } from '@sveltejs/kit';
import { createDocument } from '#lib/core/documents.ts';
import { Conflict, InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ params, request, locals }) => {
		// Actions run before the layout load, so the role check is repeated here.
		requireRole(params.workspace, locals, 'editor');
		const path = String((await request.formData()).get('path') ?? '').trim();
		let created: string;
		try {
			created = await createDocument(params.workspace, path, locals.actor!);
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { createError: 'exists' as const, path });
			if (err instanceof InvalidPath) return fail(400, { createError: 'invalid' as const, path });
			throw err;
		}
		redirect(303, `/${params.workspace}/${created.split('/').map(encodeURIComponent).join('/')}`);
	}
};
