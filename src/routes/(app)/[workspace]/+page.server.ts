import { error, fail, redirect } from '@sveltejs/kit';
import { currentActor } from '#lib/core/actor.ts';
import { createDocument } from '#lib/core/documents.ts';
import { Conflict, InvalidPath } from '#lib/core/paths.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	create: async ({ params, request }) => {
		// Actions run before the layout load, so the single-workspace guard is repeated here.
		if (params.workspace !== 'demo') error(404);
		const path = String((await request.formData()).get('path') ?? '').trim();
		try {
			await createDocument(params.workspace, path, currentActor());
		} catch (err) {
			if (err instanceof InvalidPath || err instanceof Conflict)
				return fail(400, { createError: true });
			throw err;
		}
		redirect(303, `/${params.workspace}/${path.split('/').map(encodeURIComponent).join('/')}`);
	}
};
