import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { authenticate, createSession, loginAllowed, loginFailed, loginSucceeded } from '#lib/core/accounts.ts';
import { safeNext } from '#lib/server/redirect.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX = 1024;

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	return { next: url.searchParams.get('next') ?? '' };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = form.get('email');
		const password = form.get('password');
		// Bounds scrypt work and the throttle map's key size.
		if (typeof email !== 'string' || typeof password !== 'string' || email.length > MAX || password.length > MAX)
			return fail(400, { error: 'login.failed' as const });
		const key = `${getClientAddress()}|${email.trim().toLowerCase()}`;
		if (!loginAllowed(key)) return fail(429, { error: 'login.throttled' as const, email });
		const user = await authenticate(email, password);
		if (!user) {
			loginFailed(key);
			return fail(400, { error: 'login.failed' as const, email });
		}
		loginSucceeded(key);
		cookies.set('inkmesh_session', createSession(user.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 30
		});
		redirect(303, safeNext(form.get('next')));
	}
};
