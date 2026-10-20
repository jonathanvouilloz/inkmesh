import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	authenticate,
	changePassword,
	consumeLoginLink,
	createLoginLink,
	createSession,
	createUser,
	deleteSession,
	hashPassword,
	loginAllowed,
	loginFailed,
	loginLinkUser,
	loginSucceeded,
	loginUndo,
	sessionUser,
	setPassword,
	validUserName,
	verifyPassword
} from './accounts.ts';
import { closeDb, db } from './db.ts';
import { Conflict } from './paths.ts';

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-accounts-'));
	process.env.INKMESH_DATA = dir;
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(dir, { recursive: true, force: true });
});

describe('accounts', () => {
	it('validUserName trims and refuses empty, long and unsafe names', () => {
		expect(validUserName('  Ann Lee ')).toBe('Ann Lee');
		for (const bad of ['', '   ', 'x'.repeat(81), 'a<b', 'a\nb', 'a\x7fb', null, 42]) expect(validUserName(bad)).toBeNull();
		expect(validUserName('x'.repeat(80))).toHaveLength(80);
	});

	it('hashes with scrypt and verifies', async () => {
		const stored = await hashPassword('correct horse 1');
		expect(stored).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
		expect(await verifyPassword('correct horse 1', stored)).toBe(true);
		expect(await verifyPassword('wrong', stored)).toBe(false);
	});
	it('refuses short passwords and duplicate emails', async () => {
		await expect(createUser({ email: 'a@b.c', name: 'A', password: 'short' })).rejects.toBeInstanceOf(
			RangeError
		);
		await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
		await expect(
			createUser({ email: 'A@B.C', name: 'B', password: 'long enough 1' })
		).rejects.toBeInstanceOf(Conflict);
	});
	it('authenticates case-insensitively and trims', async () => {
		await createUser({ email: 'Jon@Example.ch', name: 'Jon', password: 'long enough 1' });
		expect((await authenticate('  jon@example.CH ', 'long enough 1'))?.name).toBe('Jon');
		expect(await authenticate('jon@example.ch', 'nope nope nope')).toBeNull();
		expect(await authenticate('nobody@example.ch', 'long enough 1')).toBeNull();
	});
	it('creates, reads, expires and deletes sessions', async () => {
		const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
		const token = createSession(u.id);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(sessionUser(token)?.id).toBe(u.id);
		expect(sessionUser('not-a-token')).toBeNull();
		db().prepare("update sessions set expires_at = '2000-01-01T00:00:00.000Z'").run();
		expect(sessionUser(token)).toBeNull();
		expect(db().prepare('select count(*) as n from sessions').get()).toEqual({ n: 0 });
	});
	it('a session dies with its user', async () => {
		const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
		const token = createSession(u.id);
		db().prepare('delete from users where id = ?').run(u.id);
		expect(sessionUser(token)).toBeNull();
	});
	it('changes the password only with the current one', async () => {
		const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
		expect(await changePassword(u.id, 'wrong wrong wrong', 'new password 1')).toBe(false);
		expect(await changePassword(u.id, 'long enough 1', 'new password 1')).toBe(true);
		expect((await authenticate('a@b.c', 'new password 1'))?.id).toBe(u.id);
	});
	it('a password change kills the sessions of that user', async () => {
		const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
		const token = createSession(u.id);
		expect(await changePassword(u.id, 'long enough 1', 'new password 1')).toBe(true);
		expect(sessionUser(token)).toBeNull();
		expect(
			db().prepare('select count(*) as n from sessions where user_id = ?').get(u.id)
		).toEqual({ n: 0 });
	});
	it('deletes a session', async () => {
		const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
		const token = createSession(u.id);
		const other = createSession(u.id);
		deleteSession(token);
		expect(sessionUser(token)).toBeNull();
		expect(sessionUser(other)?.id).toBe(u.id);
	});
	it('the throttle holds at most 10,000 keys, evicting the oldest', () => {
		for (let i = 0; i < 10; i++) loginFailed('oldest');
		loginFailed('second');
		expect(loginAllowed('oldest')).toBe(false);
		for (let i = 0; i < 9_998; i++) loginFailed(`flood-${i}`); // map now at the cap
		expect(loginAllowed('oldest')).toBe(false);
		loginFailed('one-more');
		expect(loginAllowed('oldest')).toBe(true); // evicted
		for (let i = 0; i < 9; i++) loginFailed('one-more');
		expect(loginAllowed('one-more')).toBe(false);
		for (let i = 0; i < 9_998; i++) loginSucceeded(`flood-${i}`);
		loginSucceeded('second');
		loginSucceeded('one-more');
	});
	it('the throttle resets 15 minutes after the first failure', () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			for (let i = 0; i < 10; i++) loginFailed('t');
			expect(loginAllowed('t')).toBe(false);
			vi.setSystemTime(new Date('2026-01-01T00:15:00Z'));
			expect(loginAllowed('t')).toBe(false);
			vi.setSystemTime(new Date('2026-01-01T00:15:00.001Z'));
			expect(loginAllowed('t')).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
	it('throttles after ten failures', () => {
		for (let i = 0; i < 10; i++) {
			expect(loginAllowed('k')).toBe(true);
			loginFailed('k');
		}
		expect(loginAllowed('k')).toBe(false);
		loginSucceeded('k');
		expect(loginAllowed('k')).toBe(true);
	});
	it('undoes one counted failure', () => {
		for (let i = 0; i < 10; i++) loginFailed('u');
		loginUndo('u');
		expect(loginAllowed('u')).toBe(true);
		for (let i = 0; i < 9; i++) loginUndo('u');
		loginUndo('u'); // gone at zero, a further undo is a no-op
		for (let i = 0; i < 9; i++) loginFailed('u');
		expect(loginAllowed('u')).toBe(true);
		loginSucceeded('u');
	});

	describe('login links', () => {
		const ann = () => createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
		const count = () => (db().prepare('select count(*) as n from login_links').get() as { n: number }).n;

		it('a login link works once', async () => {
			const u = await ann();
			const t = createLoginLink(u.id, '/demo');
			expect(loginLinkUser(t)).toEqual(u);
			expect(loginLinkUser(t)).toEqual(u); // peeking does not consume
			expect(consumeLoginLink(t)).toEqual({ user: u, next: '/demo' });
			expect(consumeLoginLink(t)).toBeNull();
			expect(loginLinkUser(t)).toBeNull();
			expect(consumeLoginLink('not-a-token')).toBeNull();
		});
		it('a login link expires after 15 minutes', async () => {
			const u = await ann(); // scrypt before faking the clock
			vi.useFakeTimers({ toFake: ['Date'] });
			try {
				vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
				const t = createLoginLink(u.id, '/');
				vi.setSystemTime(new Date('2026-01-01T00:14:59Z'));
				expect(loginLinkUser(t)?.id).toBe(u.id);
				vi.setSystemTime(new Date('2026-01-01T00:15:01Z'));
				expect(loginLinkUser(t)).toBeNull();
				expect(consumeLoginLink(t)).toBeNull();
			} finally {
				vi.useRealTimers();
			}
		});
		it('stores only the hash', async () => {
			const u = await ann();
			const t = createLoginLink(u.id, '/demo');
			expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
			const rows = db().prepare('select * from login_links').all();
			expect(rows).toHaveLength(1);
			expect(JSON.stringify(rows)).not.toContain(t);
		});
		it('two concurrent consumes, one winner', async () => {
			const u = await ann();
			const t = createLoginLink(u.id, '/');
			const results = await Promise.all([
				Promise.resolve().then(() => consumeLoginLink(t)),
				Promise.resolve().then(() => consumeLoginLink(t))
			]);
			expect(results.filter(Boolean)).toHaveLength(1);
		});
		it('a password reset removes login links', async () => {
			const u = await ann();
			const t = createLoginLink(u.id, '/');
			await setPassword(u.id, 'new password 1');
			expect(consumeLoginLink(t)).toBeNull();
			expect(count()).toBe(0);
		});
		it('old links are pruned', async () => {
			const u = await ann();
			createLoginLink(u.id, '/');
			db().prepare("update login_links set expires_at = '2000-01-01T00:00:00.000Z'").run();
			const t = createLoginLink(u.id, '/');
			expect(count()).toBe(1);
			expect(loginLinkUser(t)?.id).toBe(u.id);
		});
		it('deleting the user removes the links', async () => {
			const u = await ann();
			createLoginLink(u.id, '/');
			db().prepare('delete from users where id = ?').run(u.id);
			expect(count()).toBe(0);
		});
	});
});
