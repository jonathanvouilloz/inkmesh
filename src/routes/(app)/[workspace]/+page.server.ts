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
		let created: string;
		try {
			created = await createDocument(params.workspace, path, currentActor());
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { createError: 'exists' as const, path });
			if (err instanceof InvalidPath) return fail(400, { createError: 'invalid' as const, path });
			throw err;
		}
		redirect(303, `/${params.workspace}/${created.split('/').map(encodeURIComponent).join('/')}`);
	}
};
