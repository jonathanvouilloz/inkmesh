import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { db, transaction } from './db.ts';
import { Conflict } from './paths.ts';

export type User = { id: number; email: string; name: string; admin: boolean };

const SCRYPT: ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }; // N*r*128 = 32 MiB, the default cap
const KEY_LENGTH = 64;
const MIN_PASSWORD = 10;
const SESSION_DAYS = 30;
const LOGIN_LINK_MINUTES = 15;
const SQLITE_CONSTRAINT_UNIQUE = 2067;
// Hash of a throwaway password: unknown emails still pay one scrypt, so timing does not reveal accounts.
const DUMMY_HASH =
	'scrypt$iScuy2xubE+3BqDUKJltaA==$r74J0JwbEWXQnvKJ70KUrOX3HSZHtbtvPHEjSt9hHJzm82DnwxRkAfMMDj1DjAj4MVJEN4hTktGx1wXMjKA92w==';

function derive(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scrypt(password, salt, KEY_LENGTH, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)))
	);
}

export async function hashPassword(password: string): Promise<string> {
	if (password.length < MIN_PASSWORD) throw new RangeError(`password under ${MIN_PASSWORD} characters`);
	const salt = randomBytes(16);
	const hash = await derive(password, salt);
	return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, salt, hash] = stored.split('$');
	if (scheme !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64');
	const actual = await derive(password, Buffer.from(salt, 'base64'));
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const normalize = (email: string) => email.trim().toLowerCase();

/** Exactly one bare address: a list, a display name or a CR/LF would make the mailer write to several people. */
export const validEmail = (email: string) =>
	email.length <= 254 && /^[^\s\x00-\x1f\x7f@,;<>"]+@[^\s\x00-\x1f\x7f@,;<>"]+$/.test(email);

type Row = { id: number; email: string; name: string; admin: number };
const toUser = (r: Row | undefined): User | null =>
	r ? { id: r.id, email: r.email, name: r.name, admin: r.admin === 1 } : null;

export async function createUser(input: {
	email: string;
	name: string;
	password: string;
	admin?: boolean;
}): Promise<User> {
	return insertUser({ ...input, passwordHash: await hashPassword(input.password) });
}

// Synchronous, so a caller can run it inside a transaction with the hash computed beforehand.
export function insertUser(input: { email: string; name: string; passwordHash: string; admin?: boolean }): User {
	const email = normalize(input.email);
	try {
		const { lastInsertRowid } = db()
			.prepare(
				'INSERT INTO users (email, name, password_hash, admin, created_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run(email, input.name, input.passwordHash, input.admin ? 1 : 0, new Date().toISOString());
		return { id: Number(lastInsertRowid), email, name: input.name, admin: !!input.admin };
	} catch (err) {
		if ((err as { errcode?: number }).errcode === SQLITE_CONSTRAINT_UNIQUE) throw new Conflict(email);
		throw err;
	}
}

/** Instance admins: who receives the operational alerts (scripts/alert.ts). */
export function admins(): User[] {
	return (db().prepare('SELECT id, email, name, admin FROM users WHERE admin = 1 ORDER BY id').all() as Row[]).map(
		(r) => toUser(r)!
	);
}

export function userByEmail(email: string): User | null {
	return toUser(
		db().prepare('SELECT id, email, name, admin FROM users WHERE email = ?').get(normalize(email)) as
			| Row
			| undefined
	);
}

export function userById(id: number): User | null {
	return toUser(
		db().prepare('SELECT id, email, name, admin FROM users WHERE id = ?').get(id) as Row | undefined
	);
}

function storedHash(where: 'email' | 'id', value: string | number): { id: number; hash: string } | undefined {
	return db().prepare(`SELECT id, password_hash AS hash FROM users WHERE ${where} = ?`).get(value) as
		| { id: number; hash: string }
		| undefined;
}

export async function authenticate(email: string, password: string): Promise<User | null> {
	const row = storedHash('email', normalize(email));
	const ok = await verifyPassword(password, row?.hash ?? DUMMY_HASH);
	return row && ok ? userById(row.id) : null;
}

// No markup and no control character: names land in git authors and comment headings.
export const UNSAFE_NAME = /[<>\x00-\x1f\x7f]/;

/** The trimmed user name, or null when it is empty, longer than 80 characters or unsafe. */
export function validUserName(name: unknown): string | null {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	return trimmed && trimmed.length <= 80 && !UNSAFE_NAME.test(trimmed) ? trimmed : null;
}

export function updateName(id: number, name: string): void {
	db().prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
}

export async function changePassword(id: number, current: string, next: string): Promise<boolean> {
	const row = storedHash('id', id);
	if (!row || !(await verifyPassword(current, row.hash))) return false;
	await setPassword(id, next);
	return true;
}

export async function setPassword(id: number, next: string): Promise<void> {
	const hash = await hashPassword(next);
	transaction(() => {
		db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
		// A reset after a compromise must kill stolen sessions.
		db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
		db().prepare('DELETE FROM login_links WHERE user_id = ?').run(id);
	});
}

export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function createSession(userId: number): string {
	const token = newToken();
	const now = new Date();
	const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
	db()
		.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
		.run(hashToken(token), userId, expires.toISOString(), now.toISOString());
	return token;
}

export function sessionUser(token: string): User | null {
	const tokenHash = hashToken(token);
	const row = db()
		.prepare(
			'SELECT u.id, u.email, u.name, u.admin, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
		)
		.get(tokenHash) as (Row & { expires_at: string }) | undefined;
	if (row && row.expires_at <= new Date().toISOString()) {
		db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
		return null;
	}
	return toUser(row);
}

export function deleteSession(token: string): void {
	db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function createLoginLink(userId: number, next: string): string {
	const token = newToken();
	const now = new Date();
	const expires = new Date(now.getTime() + LOGIN_LINK_MINUTES * 60 * 1000);
	db().prepare('DELETE FROM login_links WHERE expires_at <= ?').run(now.toISOString());
	db()
		.prepare(
			'INSERT INTO login_links (token_hash, user_id, next, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
		)
		.run(hashToken(token), userId, next, expires.toISOString(), now.toISOString());
	return token;
}

/** The user of an unexpired link, without consuming it: the landing page is a GET. */
export function loginLinkUser(token: string): User | null {
	return toUser(
		db()
			.prepare(
				'SELECT u.id, u.email, u.name, u.admin FROM login_links l JOIN users u ON u.id = l.user_id WHERE l.token_hash = ? AND l.expires_at > ?'
			)
			.get(hashToken(token), new Date().toISOString()) as Row | undefined
	);
}

// One statement deletes and reads, so two concurrent consumes cannot both win.
export function consumeLoginLink(token: string): { user: User; next: string } | null {
	const row = db()
		.prepare('DELETE FROM login_links WHERE token_hash = ? RETURNING user_id, next, expires_at')
		.get(hashToken(token)) as { user_id: number; next: string; expires_at: string } | undefined;
	if (!row || row.expires_at <= new Date().toISOString()) return null;
	const user = userById(row.user_id);
	return user && { user, next: row.next };
}

// shortcut: in-memory, per process and lost on restart; move to SQLite if the app ever runs several processes.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10_000;
const failures = new Map<string, { failures: number; first: number }>();

function entry(key: string) {
	const e = failures.get(key);
	if (e && Date.now() - e.first > WINDOW_MS) {
		failures.delete(key);
		return undefined;
	}
	return e;
}

export function loginAllowed(key: string, max = MAX_FAILURES): boolean {
	return (entry(key)?.failures ?? 0) < max;
}

export function loginFailed(key: string): void {
	if (failures.size >= MAX_KEYS) {
		const now = Date.now();
		for (const [k, v] of failures) if (now - v.first > WINDOW_MS) failures.delete(k);
	}
	const e = entry(key);
	if (e) {
		e.failures++;
		return;
	}
	// Hard cap: a flood inside one window evicts the oldest keys (Map keeps insertion order).
	while (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value!);
	failures.set(key, { failures: 1, first: Date.now() });
}

export function loginSucceeded(key: string): void {
	failures.delete(key);
}

// Takes back one failure counted up front, e.g. a login that turned out right.
export function loginUndo(key: string): void {
	const e = entry(key);
	if (e && --e.failures <= 0) failures.delete(key);
}
