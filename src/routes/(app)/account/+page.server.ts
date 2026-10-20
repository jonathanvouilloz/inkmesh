import { error, fail } from '@sveltejs/kit';
import {
	changePassword,
	loginAllowed,
	loginFailed,
	loginSucceeded,
	updateName,
	validUserName
} from '#lib/core/accounts.ts';
import { digestHour, digestOn, setDigest } from '#lib/core/digest.ts';
import { mailEnabled } from '#lib/core/mail.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX = 1024;

export const load: PageServerLoad = async ({ locals, parent }) => {
	await parent(); // the layout's sign-in redirect comes first
	return { mail: mailEnabled(), digest: digestOn(locals.user!.id), hour: String(digestHour()).padStart(2, '0') };
};

export const actions: Actions = {
	// Actions run before the (app) layout, so each one checks the session itself.
	rename: async ({ request, locals }) => {
		if (!locals.user) error(401);
		const trimmed = validUserName((await request.formData()).get('name'));
		if (!trimmed) return fail(400, { error: 'account.nameBad' as const });
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
		// A stolen session must not brute-force the current password; counted before scrypt, like login.
		const key = `pw|${locals.user.id}`;
		if (!loginAllowed(key)) return fail(429, { error: 'login.throttled' as const });
		loginFailed(key);
		try {
			if (!(await changePassword(locals.user.id, current, next)))
				return fail(400, { error: 'account.wrong' as const });
		} catch (err) {
			if (err instanceof RangeError) {
				loginSucceeded(key); // the current password was right, only the new one is too short
				return fail(400, { error: 'account.short' as const });
			}
			throw err;
		}
		loginSucceeded(key);
		// changePassword ended every session, this one included: reissue it.
		startSession(cookies, locals.user.id);
		return { ok: 'password' as const };
	},
	digest: async ({ request, locals }) => {
		if (!locals.user) error(401);
		if (!mailEnabled()) return fail(400);
		// The digest is written in the interface language of this moment.
		setDigest(locals.user.id, (await request.formData()).get('digest') === '1', locals.locale);
		return { ok: 'digest' as const };
	}
};
