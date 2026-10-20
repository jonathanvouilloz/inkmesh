import { error, fail, redirect, type ActionFailure, type Cookies } from '@sveltejs/kit';
import { hashPassword, userByEmail, validUserName, type User } from '#lib/core/accounts.ts';
import { Conflict } from '#lib/core/paths.ts';
import { startSession } from '#lib/server/session.ts';

const MAX = 1024;

type NewUser = { email: string; name: string; passwordHash: string };
type Refused<E> = ActionFailure<{ error: E | 'invite.email' | 'invite.exists' | 'invite.password'; name?: string; email?: string }>;

/**
 * The sign-up of the invitation and join pages: checks the form, hashes the password, calls `create`
 * (the core call that adds the user and the membership in one transaction), starts the session and
 * redirects to `landing`. `open` says whether the token still allows it; `closed` is the error when not.
 */
export async function signup<T extends { user: User }, E extends string>(
	form: FormData,
	cookies: Cookies,
	closed: E,
	open: () => boolean,
	create: (input: NewUser) => T,
	landing: (created: T) => string
): Promise<Refused<E>> {
	const [name, email, password] = ['name', 'email', 'password'].map((k) => form.get(k));
	// Bounds scrypt work, like the login form.
	if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') error(400);
	if (email.length > MAX || password.length > MAX) error(400);
	const trimmed = validUserName(name);
	if (!trimmed) error(400);
	// Checked before scrypt and before using the token, so a refused sign-up keeps an invitation unused.
	if (!open()) return fail(410, { error: closed });
	const address = email.trim();
	if (!address.includes('@') || address.length > 254) return fail(400, { error: 'invite.email' as const, name, email });
	if (userByEmail(email)) return fail(409, { error: 'invite.exists' as const, name, email });
	let passwordHash;
	try {
		passwordHash = await hashPassword(password);
	} catch (err) {
		if (err instanceof RangeError) return fail(400, { error: 'invite.password' as const, name, email });
		throw err;
	}
	let created: T;
	try {
		created = create({ email, name: trimmed, passwordHash });
		startSession(cookies, created.user.id);
	} catch (err) {
		// The email taken or the token used up while scrypt ran; the transaction left no account.
		if (!(err instanceof Conflict)) throw err;
		if (userByEmail(email)) return fail(409, { error: 'invite.exists' as const, name, email });
		return fail(410, { error: closed });
	}
	redirect(303, landing(created));
}
