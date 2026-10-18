import { fail, redirect } from '@sveltejs/kit';
import {
	authenticate,
	loginAllowed,
	loginFailed,
	loginSucceeded,
	loginUndo,
	normalize
} from '#lib/core/accounts.ts';
import { safeNext } from '#lib/server/redirect.ts';
import { startSession } from '#lib/server/session.ts';
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
		// One key per address (spraying many accounts) and one per account (many addresses on one account).
		const ipKey = `ip|${getClientAddress()}`;
		const emailKey = `email|${normalize(email)}`;
		if (!loginAllowed(ipKey) || !loginAllowed(emailKey))
			return fail(429, { error: 'login.throttled' as const, email });
		// Counted before scrypt, so concurrent attempts cannot all pass the check while it runs.
		loginFailed(ipKey);
		loginFailed(emailKey);
		const user = await authenticate(email, password);
		if (!user) return fail(400, { error: 'login.failed' as const, email });
		loginSucceeded(emailKey);
		loginUndo(ipKey);
		startSession(cookies, user.id);
		redirect(303, safeNext(form.get('next')));
	}
};
