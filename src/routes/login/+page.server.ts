import { error, fail, redirect } from '@sveltejs/kit';
import {
	authenticate,
	createLoginLink,
	loginAllowed,
	loginFailed,
	loginSucceeded,
	loginUndo,
	normalize,
	userByEmail,
	validEmail
} from '#lib/core/accounts.ts';
import { appUrl, loginLinkMail, mailEnabled, sendMail } from '#lib/core/mail.ts';
import { safeNext } from '#lib/server/redirect.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX = 1024;

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	const mail = mailEnabled();
	return {
		next: url.searchParams.get('next') ?? '',
		mail,
		method: mail && url.searchParams.get('method') === 'link' ? ('link' as const) : ('password' as const)
	};
};

export const actions: Actions = {
	password: async ({ request, url, cookies, getClientAddress }) => {
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
		redirect(303, safeNext(url.searchParams.get('next')));
	},
	link: async ({ request, url, locals, getClientAddress }) => {
		if (!mailEnabled()) error(404);
		const form = await request.formData();
		const email = form.get('email');
		if (typeof email !== 'string') return fail(400, { error: 'invite.email' as const, method: 'link' as const });
		// Kept, so a typo is corrected rather than typed again.
		if (!validEmail(email.trim()))
			return fail(400, { error: 'invite.email' as const, method: 'link' as const, email: email.slice(0, MAX) });
		const ipKey = 'link-ip|' + getClientAddress();
		const emailKey = 'link-email|' + normalize(email);
		if (!loginAllowed(ipKey) || !loginAllowed(emailKey, 3))
			return fail(429, { error: 'login.throttled' as const, method: 'link' as const, email });
		// Every request counts, known address or not, so the throttle reveals nothing either.
		loginFailed(ipKey);
		loginFailed(emailKey);
		const user = userByEmail(email);
		if (user) {
			const token = createLoginLink(user.id, safeNext(url.searchParams.get('next')));
			// Not awaited: the answer time must not tell whether an email went out.
			void sendMail(loginLinkMail(user, appUrl() + '/login/link/' + token, locals.locale), 'login link', user.id);
		}
		return { sent: true as const, email, method: 'link' as const };
	}
};
