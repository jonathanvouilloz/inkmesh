import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { acceptInvitation, invitation } from '#lib/core/access.ts';
import { createSession, createUser, userByEmail } from '#lib/core/accounts.ts';
import { Conflict } from '#lib/core/paths.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX = 1024;

// Never returns the token: it stays in the URL. An invalid token renders the "no longer valid" state.
export const load: PageServerLoad = ({ params, locals }) => ({
	invitation: invitation(params.token),
	user: locals.user
});

function accept(token: string, userId: number) {
	try {
		return acceptInvitation(token, userId);
	} catch (err) {
		if (err instanceof Conflict) return null;
		throw err;
	}
}

export const actions: Actions = {
	join: ({ params, locals }) => {
		if (!locals.user) error(401);
		const joined = accept(params.token, locals.user.id);
		if (!joined) return fail(410, { error: 'invite.invalid' as const });
		redirect(303, '/' + joined.slug);
	},
	signup: async ({ params, request, cookies, locals }) => {
		if (locals.user) error(400); // a signed-in visitor joins instead
		const form = await request.formData();
		const [name, email, password] = ['name', 'email', 'password'].map((k) => form.get(k));
		// Bounds scrypt work, like the login form.
		if (
			typeof name !== 'string' ||
			typeof email !== 'string' ||
			typeof password !== 'string' ||
			email.length > MAX ||
			password.length > MAX
		)
			error(400);
		const trimmed = name.trim();
		if (!trimmed || trimmed.length > 80) error(400);
		// Checked before scrypt and before using the token, so a refused signup keeps the invitation.
		if (!invitation(params.token)) return fail(410, { error: 'invite.invalid' as const });
		const address = email.trim();
		if (!address.includes('@') || address.length > 254)
			return fail(400, { error: 'invite.email' as const, name, email });
		if (userByEmail(email)) return fail(409, { error: 'invite.exists' as const, name, email });
		let user;
		try {
			user = await createUser({ email, name: trimmed, password });
		} catch (err) {
			if (err instanceof RangeError) return fail(400, { error: 'invite.password' as const, name, email });
			if (err instanceof Conflict) return fail(409, { error: 'invite.exists' as const, name, email });
			throw err;
		}
		// A link used up in between leaves the account without a membership; it can still sign in.
		const joined = accept(params.token, user.id);
		if (!joined) return fail(410, { error: 'invite.invalid' as const });
		cookies.set('inkmesh_session', createSession(user.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 30
		});
		redirect(303, '/' + joined.slug);
	}
};
