import { error, fail } from '@sveltejs/kit';
import { dev } from '$app/env';
import { workspacesOf } from '#lib/core/access.ts';
import { changePassword, createSession, updateName } from '#lib/core/accounts.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX = 1024;

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	return { workspaces: workspacesOf(user.id) };
};

export const actions: Actions = {
	// Actions run before the (app) layout, so each one checks the session itself.
	rename: async ({ request, locals }) => {
		if (!locals.user) error(401);
		const name = (await request.formData()).get('name');
		const trimmed = typeof name === 'string' ? name.trim() : '';
		if (!trimmed || trimmed.length > 80) return fail(400, { error: 'account.nameBad' as const });
		updateName(locals.user.id, trimmed);
		// The layout load runs in this same request, after the action, on the user read at its start.
		locals.user = { ...locals.user, name: trimmed };
		return { ok: 'rename' as const };
	},
	password: async ({ request, locals, cookies }) => {
		if (!locals.user) error(401);
		const form = await request.formData();
		const current = form.get('current');
		const next = form.get('next');
		// Bounds scrypt work.
		if (typeof current !== 'string' || typeof next !== 'string' || current.length > MAX || next.length > MAX)
			return fail(400, { error: 'account.wrong' as const });
		try {
			if (!(await changePassword(locals.user.id, current, next)))
				return fail(400, { error: 'account.wrong' as const });
		} catch (err) {
			if (err instanceof RangeError) return fail(400, { error: 'account.short' as const });
			throw err;
		}
		// changePassword ended every session, this one included: reissue it.
		cookies.set('inkmesh_session', createSession(locals.user.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 30
		});
		return { ok: 'password' as const };
	}
};
