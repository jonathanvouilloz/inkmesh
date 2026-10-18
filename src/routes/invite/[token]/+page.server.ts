import { error, fail, redirect } from '@sveltejs/kit';
import { acceptInvitation, acceptInvitationAsNewUser, invitation } from '#lib/core/access.ts';
import { hashPassword, userByEmail } from '#lib/core/accounts.ts';
import { Conflict } from '#lib/core/paths.ts';
import { startSession } from '#lib/server/session.ts';
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
		let passwordHash;
		try {
			passwordHash = await hashPassword(password);
		} catch (err) {
			if (err instanceof RangeError) return fail(400, { error: 'invite.password' as const, name, email });
			throw err;
		}
		let joined;
		try {
			const created = acceptInvitationAsNewUser(params.token, { email, name: trimmed, passwordHash });
			startSession(cookies, created.user.id);
			joined = created.workspace;
		} catch (err) {
			// The email taken or the link used up while scrypt ran; the transaction left no account.
			if (!(err instanceof Conflict)) throw err;
			if (userByEmail(email)) return fail(409, { error: 'invite.exists' as const, name, email });
			return fail(410, { error: 'invite.invalid' as const });
		}
		redirect(303, '/' + joined.slug);
	}
};
