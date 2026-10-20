import { error, fail, redirect } from '@sveltejs/kit';
import { hashPassword, loginAllowed, loginFailed, userByEmail, validUserName } from '#lib/core/accounts.ts';
import { Conflict } from '#lib/core/paths.ts';
import { joinByLink, joinByLinkAsNewUser, sharedScope } from '#lib/core/publicLinks.ts';
import { startSession } from '#lib/server/session.ts';
import { docHref } from '#lib/ui/href.ts';
import type { Actions, PageServerLoad } from './$types';

const MAX = 1024;

/** The link's workspace and sign-up role, or null when it is unknown, revoked or closed to sign-up. */
function link(token: string) {
	const scope = sharedScope(token);
	return scope?.signupRole ? { workspaceName: scope.workspace.name, role: scope.signupRole } : null;
}

const landing = (joined: { workspace: { slug: string }; path: string | null }) =>
	joined.path ? docHref(joined.workspace.slug, joined.path) : '/' + joined.workspace.slug;

// Never returns the token: it stays in the URL.
export const load: PageServerLoad = ({ params, locals }) => ({ link: link(params.token), user: locals.user });

export const actions: Actions = {
	join: ({ params, locals }) => {
		if (!locals.user) error(401);
		let joined;
		try {
			joined = joinByLink(params.token, locals.user.id);
		} catch (err) {
			if (err instanceof Conflict) return fail(410, { error: 'join.closed' as const });
			throw err;
		}
		redirect(303, landing(joined));
	},
	signup: async ({ params, request, cookies, locals, getClientAddress }) => {
		if (locals.user) error(400); // a signed-in visitor joins instead
		const key = 'join|' + getClientAddress();
		if (!loginAllowed(key)) return fail(429, { error: 'join.tooMany' as const });
		loginFailed(key);
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
		const trimmed = validUserName(name);
		if (!trimmed) error(400);
		if (!link(params.token)) return fail(410, { error: 'join.closed' as const });
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
			joined = joinByLinkAsNewUser(params.token, { email, name: trimmed, passwordHash });
			startSession(cookies, joined.user.id);
		} catch (err) {
			// The email taken or the link closed while scrypt ran; the transaction left no account.
			if (!(err instanceof Conflict)) throw err;
			if (userByEmail(email)) return fail(409, { error: 'invite.exists' as const, name, email });
			return fail(410, { error: 'join.closed' as const });
		}
		redirect(303, landing(joined));
	}
};
