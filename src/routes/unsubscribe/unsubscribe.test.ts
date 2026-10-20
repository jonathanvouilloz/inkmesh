import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { digestOn, setDigest, unsubscribeToken } from '#lib/core/digest.ts';
import { actions, load } from './[token]/+page.server.ts';

let data: string;
let jon: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-unsubscribe-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
	setDigest(jon.id, true, 'en');
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const event = (token: string) => ({ params: { token } });
const post = (token: string) => (async () => actions.default(event(token) as never))().catch((err) => err);

it('a valid token stops the digest', async () => {
	const token = unsubscribeToken(jon.id);
	expect(await load(event(token) as never)).toEqual({ valid: true });
	expect(digestOn(jon.id)).toBe(true);
	expect(await post(token)).toEqual({ done: true });
	expect(digestOn(jon.id)).toBe(false);
});

it('a forged token is refused', async () => {
	const ann = await createUser({ email: 'ann@example.ch', name: 'Ann', password: 'long enough 1' });
	setDigest(ann.id, true, 'en');
	const forged = `${ann.id}.${unsubscribeToken(jon.id).split('.')[1]}`;
	for (const token of [forged, '1.x', 'x']) {
		expect(await load(event(token) as never)).toEqual({ valid: false });
		expect(await post(token)).toMatchObject({ status: 404 });
	}
	expect(digestOn(ann.id)).toBe(true);
	expect(digestOn(jon.id)).toBe(true);
});
