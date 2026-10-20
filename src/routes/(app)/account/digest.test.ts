import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb, db } from '#lib/core/db.ts';
import { digestOn, setDigest } from '#lib/core/digest.ts';
import { load as inboxLoad } from '../inbox/+page.server.ts';
import { actions, load } from './+page.server.ts';

const VARS = { SMTP_URL: 'memory:', MAIL_FROM: 'inkmesh <noreply@inkmesh.local>', INKMESH_URL: 'https://inkmesh.example' };
let data: string;
let jon: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-account-digest-'));
	process.env.INKMESH_DATA = data;
	Object.assign(process.env, VARS);
	jon = await createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
});
afterEach(() => {
	closeDb();
	for (const name of Object.keys(VARS)) delete process.env[name];
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const mailOff = () => {
	for (const name of Object.keys(VARS)) delete process.env[name];
};
const locals = (locale: 'en' | 'fr' = 'en') => ({ user: jon, actor: { id: jon.id, name: jon.name }, locale });
const page = () => load({ locals: locals(), parent: async () => ({}) } as never);

function save(on: boolean, locale: 'en' | 'fr' = 'en') {
	const form = new FormData();
	if (on) form.set('digest', '1');
	const event = { request: new Request('http://localhost/account?/digest', { method: 'POST', body: form }), locals: locals(locale) };
	return (async () => actions.digest(event as never))().catch((err) => err);
}

it('turns the digest on and off and keeps the language', async () => {
	expect(await page()).toEqual({ mail: true, digest: false, hour: '08' });
	expect(await save(true, 'fr')).toEqual({ ok: 'digest' });
	expect(digestOn(jon.id)).toBe(true);
	expect(db().prepare('SELECT locale FROM users WHERE id = ?').get(jon.id)).toEqual({ locale: 'fr' });
	expect(await page()).toMatchObject({ digest: true });
	expect(await save(false)).toEqual({ ok: 'digest' });
	expect(digestOn(jon.id)).toBe(false);
});

it('email off refuses the setting', async () => {
	mailOff();
	expect(await save(true)).toMatchObject({ status: 400 });
	expect(digestOn(jon.id)).toBe(false);
	expect(await page()).toMatchObject({ mail: false });
});

it('a signed-out request is 401', async () => {
	const event = { request: new Request('http://localhost/account?/digest', { method: 'POST', body: new FormData() }), locals: { user: null } };
	expect(await (async () => actions.digest(event as never))().catch((err) => err)).toMatchObject({ status: 401 });
});

it('the inbox offers the setting', async () => {
	const hint = async () =>
		((await inboxLoad({ locals: locals(), parent: async () => ({}) } as never)) as { digestHint: boolean }).digestHint;
	expect(await hint()).toBe(true);
	setDigest(jon.id, true, 'en');
	expect(await hint()).toBe(false);
	setDigest(jon.id, false, 'en');
	mailOff();
	expect(await hint()).toBe(false);
});
