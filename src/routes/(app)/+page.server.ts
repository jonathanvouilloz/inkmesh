import { error, fail, redirect } from '@sveltejs/kit';
import { createWorkspace, workspacesOf } from '#lib/core/access.ts';
import { Conflict, InvalidPath } from '#lib/core/paths.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	return { workspaces: workspacesOf(user.id), admin: user.admin };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		// Actions run before the (app) layout, so the session and admin checks live here.
		if (!locals.user) error(401);
		if (!locals.user.admin) error(403);
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const slug = String(form.get('slug') ?? '').trim();
		try {
			await createWorkspace(slug, name || slug, locals.actor!);
		} catch (err) {
			if (err instanceof InvalidPath) return fail(400, { createError: 'slug' as const, name, slug });
			if (err instanceof Conflict) return fail(409, { createError: 'exists' as const, name, slug });
			throw err;
		}
		redirect(303, '/' + slug);
	}
};
