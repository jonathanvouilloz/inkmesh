import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace, pendingInvitations } from '#lib/core/access.ts';
import { createUser, loginSucceeded, type User } from '#lib/core/accounts.ts';
import { closeDb, db } from '#lib/core/db.ts';
import * as mail from '#lib/core/mail.ts';
import { actions, load } from './+page.server.ts';

const VARS = { SMTP_URL: 'memory:', MAIL_FROM: 'inkmesh <noreply@inkmesh.local>', INKMESH_URL: 'https://inkmesh.example' };
let data: string;
let jon: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-invite-mail-'));
	process.env.INKMESH_DATA = data;
	Object.assign(process.env, VARS);
	mail.outbox.length = 0;
	const owner = await createUser({ email: 'owner@example.ch', name: 'Owner', password: 'long enough 1' });
	await createWorkspace('demo', 'Demo', owner);
	jon = await createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
	acceptInvitation(createInvitation('demo', 'editor', owner), jon.id);
	// The throttle is module state and every test's Jon has the same id.
	loginSucceeded('invite-mail|' + jon.id);
});
afterEach(() => {
	vi.restoreAllMocks();
	closeDb();
	for (const name of Object.keys(VARS)) delete process.env[name];
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = () => ({ user: jon, actor: { id: jon.id, name: jon.name }, locale: 'en' });
// A forged host: the on-screen link follows the request, the emailed one INKMESH_URL.
const url = new URL('http://evil.example/demo/members');

async function invite(fields: Record<string, string>) {
	const event = {
		params: { workspace: 'demo' },
		request: new Request(url, { method: 'POST', body: new URLSearchParams({ role: 'reader', ...fields }) }),
		locals: locals(),
		url
	};
	return (await actions.invite!(event as never)) as Record<string, unknown>;
}

const link = expect.stringMatching(/^http:\/\/evil\.example\/invite\/[\w-]{43}$/);
const readerLinks = () => pendingInvitations('demo').filter((p) => p.role === 'reader').length;

it('an editor emails an invitation', async () => {
	const result = await invite({ email: ' ann@example.ch ' });
	expect(result).toEqual({ link, mailed: 'ann@example.ch' });
	expect(mail.outbox).toHaveLength(1);
	const [sent] = mail.outbox;
	expect(sent.to).toBe('ann@example.ch');
	expect(sent.subject).toBe('Jon invites you to Demo');
	expect(sent.text).toContain('https://inkmesh.example/invite/' + String(result.link).split('/').pop());
	expect(sent.text).toContain('as reader');
	expect(sent.text).not.toContain('evil.example');
	const tables = db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
	for (const { name } of tables)
		expect(JSON.stringify(db().prepare(`SELECT * FROM "${name}"`).all())).not.toContain('ann@example.ch');
});

it('a failed email keeps the link', async () => {
	vi.spyOn(mail.outbox, 'push').mockImplementation(() => {
		throw Object.assign(new Error('to ann@example.ch'), { code: 'ECONNECTION' });
	});
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	expect(await invite({ email: 'ann@example.ch' })).toEqual({ link, mailError: 'failed', email: 'ann@example.ch' });
	expect(readerLinks()).toBe(1);
	expect(JSON.stringify(log.mock.calls)).not.toContain('ann@example.ch');
	expect(log.mock.calls[0]).toEqual([`invitation: send failed for user ${jon.id}`, 'ECONNECTION', undefined]);
});

it('a bad address creates no link', async () => {
	// A list or a header injection would mail several people with one single-use link.
	for (const email of ['nope', '@', 'a@x.ch, b@y.ch', 'a@x.ch\r\nBcc: v@evil.ch', 'a@' + 'b'.repeat(253)])
		expect(await invite({ email })).toMatchObject({ status: 400, data: { mailError: 'email', email } });
	expect(readerLinks()).toBe(0);
	expect(mail.outbox).toHaveLength(0);
});

it('email sends are throttled per inviter', async () => {
	for (let i = 0; i < 20; i++) expect(await invite({ email: `ann${i}@example.ch` })).toHaveProperty('mailed');
	expect(await invite({ email: 'ann20@example.ch' })).toMatchObject({
		status: 429,
		data: { mailError: 'throttled', email: 'ann20@example.ch' }
	});
	expect(readerLinks()).toBe(20);
	expect(mail.outbox).toHaveLength(20);
});

it('email off ignores the field', async () => {
	for (const name of Object.keys(VARS)) delete process.env[name];
	expect(await invite({ email: 'ann@example.ch' })).toEqual({ link });
	expect(await invite({ email: 'nope' })).toEqual({ link });
	expect(mail.outbox).toHaveLength(0);
	const page = (await load({
		params: { workspace: 'demo' },
		locals: locals(),
		url,
		parent: async () => ({ tree: [] })
	} as never)) as Record<string, unknown>;
	expect(page.mail).toBe(false);
});

it('an empty field sends nothing', async () => {
	expect(await invite({ email: '  ' })).toEqual({ link });
	expect(mail.outbox).toHaveLength(0);
});
