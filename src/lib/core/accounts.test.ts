import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	authenticate,
	changePassword,
	createSession,
	createUser,
	hashPassword,
	loginAllowed,
	loginFailed,
	loginSucceeded,
	sessionUser,
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
	it('throttles after ten failures', () => {
		for (let i = 0; i < 10; i++) {
			expect(loginAllowed('k')).toBe(true);
			loginFailed('k');
		}
		expect(loginAllowed('k')).toBe(false);
		loginSucceeded('k');
		expect(loginAllowed('k')).toBe(true);
	});
});
