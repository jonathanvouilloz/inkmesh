import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as accounts from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { actions } from './+page.server.ts';

let data: string;
beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-login-'));
	process.env.INKMESH_DATA = data;
	await accounts.createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
});
afterEach(() => {
	vi.restoreAllMocks();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

function login(email: string, password: string, address: string) {
	const form = new FormData();
	form.set('email', email);
	form.set('password', password);
	const event = {
		request: new Request('http://localhost/login', { method: 'POST', body: form }),
		url: new URL('http://localhost/login?/password'),
		cookies: { set: () => {} },
		getClientAddress: () => address
	};
	return actions.password(event as unknown as Parameters<typeof actions.password>[0]);
}

it('counts concurrent attempts before scrypt, so at most 10 reach it', async () => {
	const authenticate = vi.spyOn(accounts, 'authenticate');
	const results = await Promise.all(
		Array.from({ length: 20 }, () => login('jon@example.ch', 'wrong password', '203.0.113.1'))
	);
	expect(authenticate).toHaveBeenCalledTimes(10);
	expect(results.filter((r) => (r as { status?: number })?.status === 429)).toHaveLength(10);
	// The account key is now full too: another address is refused for this email.
	expect(await login('jon@example.ch', 'long enough 1', '203.0.113.2')).toMatchObject({ status: 429 });
});

it('a success clears the account key and gives back the address count', async () => {
	// The throttle is module state: the first test filled jon's key.
	await accounts.createUser({ email: 'ann@example.ch', name: 'Ann', password: 'long enough 1' });
	for (let i = 0; i < 9; i++) await login('ann@example.ch', 'wrong password', '203.0.113.3');
	await expect(login('ann@example.ch', 'long enough 1', '203.0.113.3')).rejects.toMatchObject({ status: 303 });
	expect(accounts.loginAllowed('email|ann@example.ch')).toBe(true);
	expect(accounts.loginAllowed('ip|203.0.113.3')).toBe(true);
	expect(await login('nobody@example.ch', 'wrong password', '203.0.113.3')).toMatchObject({ status: 400 });
	expect(await login('nobody@example.ch', 'wrong password', '203.0.113.3')).toMatchObject({ status: 429 });
});
