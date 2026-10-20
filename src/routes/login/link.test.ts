import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as accounts from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import * as mail from '#lib/core/mail.ts';
import { actions, load } from './+page.server.ts';
import { actions as landing, load as landingLoad } from './link/[token]/+page.server.ts';

const VARS = { SMTP_URL: 'memory:', MAIL_FROM: 'inkmesh <noreply@inkmesh.local>', INKMESH_URL: 'https://inkmesh.example' };
let data: string;
let jon: accounts.User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-link-'));
	process.env.INKMESH_DATA = data;
	Object.assign(process.env, VARS);
	mail.outbox.length = 0;
	jon = await accounts.createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
});
afterEach(() => {
	vi.restoreAllMocks();
	closeDb();
	for (const name of Object.keys(VARS)) delete process.env[name];
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

// Each test uses its own addresses and IPs: the throttle is module state.
function ask(email: string, ip: string, opts: { next?: string; host?: string; locale?: 'en' | 'fr' } = {}) {
	const form = new FormData();
	form.set('email', email);
	if (opts.next !== undefined) form.set('next', opts.next);
	const host = opts.host ?? 'localhost';
	const event = {
		request: new Request(`http://${host}/login?/link`, { method: 'POST', body: form, headers: { host } }),
		url: new URL(`http://${host}/login?/link`),
		locals: { user: null, actor: null, locale: opts.locale ?? 'en' },
		cookies: { set: () => {} },
		getClientAddress: () => ip
	};
	return (async () => actions.link(event as never))().catch((err) => err);
}

async function emailedToken(): Promise<string> {
	await vi.waitFor(() => expect(mail.outbox).toHaveLength(1));
	const url = /https:\/\/inkmesh\.example\/login\/link\/(\S+)/.exec(mail.outbox[0].text);
	return url![1];
}

function landingEvent(token: string, cookies: Record<string, string> = {}) {
	return {
		params: { token },
		request: new Request('http://localhost/login/link/' + token, { method: 'POST' }),
		locals: { user: null, actor: null, locale: 'en' },
		cookies: { get: (name: string) => cookies[name], set: (name: string, value: string) => (cookies[name] = value) }
	} as never;
}

// The action throws its redirect synchronously.
const consume = (token: string, cookies?: Record<string, string>) =>
	(async () => landing.default(landingEvent(token, cookies)))().catch((err) => err);

it('known and unknown addresses get the same answer', async () => {
	const known = await ask('jon@example.ch', '203.0.113.10', { locale: 'fr' });
	const unknown = await ask('nobody@example.ch', '203.0.113.10', { locale: 'fr' });
	expect(known).toEqual({ sent: true, email: 'jon@example.ch', method: 'link' });
	expect(unknown).toEqual({ sent: true, email: 'nobody@example.ch', method: 'link' });
	expect(Object.keys(known)).toEqual(Object.keys(unknown));
	await vi.waitFor(() => expect(mail.outbox).toHaveLength(1));
	expect(mail.outbox[0].to).toBe('jon@example.ch');
	expect(mail.outbox[0].subject).toBe('Votre lien de connexion à inkmesh');
});

it('the emailed link ignores the request host', async () => {
	await accounts.createUser({ email: 'host2@example.ch', name: 'Host', password: 'long enough 1' });
	await ask('host2@example.ch', '203.0.113.20', { host: 'evil.example' });
	await vi.waitFor(() => expect(mail.outbox).toHaveLength(1));
	const url = /\S+\/login\/link\/\S+/.exec(mail.outbox[0].text)![0];
	expect(url.startsWith('https://inkmesh.example/login/link/')).toBe(true);
	expect(url.split('/login/link/')[1]).toHaveLength(43);
});

it('the landing GET never consumes the link', async () => {
	await accounts.createUser({ email: 'ann@example.ch', name: 'Ann', password: 'long enough 1' });
	await ask('ann@example.ch', '203.0.113.30', { next: '/demo/a.md' });
	const token = await emailedToken();
	for (let i = 0; i < 3; i++)
		expect(await landingLoad({ params: { token } } as never)).toEqual({ email: 'ann@example.ch' });
	const cookies: Record<string, string> = {};
	expect(await consume(token, cookies)).toMatchObject({ status: 303, location: '/demo/a.md' });
	expect(accounts.sessionUser(cookies.inkmesh_session)?.email).toBe('ann@example.ch');
	expect(await consume(token)).toMatchObject({ status: 410, data: { expired: true } });
	expect(await landingLoad({ params: { token } } as never)).toEqual({ email: null });
});

it('signing in over an existing session removes the old one', async () => {
	const eve = await accounts.createUser({ email: 'eve@example.ch', name: 'Eve', password: 'long enough 1' });
	const old = accounts.createSession(eve.id);
	await ask('eve@example.ch', '203.0.113.45');
	const cookies: Record<string, string> = { inkmesh_session: old };
	expect(await consume(await emailedToken(), cookies)).toMatchObject({ status: 303 });
	expect(accounts.sessionUser(old)).toBeNull();
	expect(accounts.sessionUser(cookies.inkmesh_session)?.email).toBe('eve@example.ch');
});

it('next is kept and made safe', async () => {
	await accounts.createUser({ email: 'bob@example.ch', name: 'Bob', password: 'long enough 1' });
	await ask('bob@example.ch', '203.0.113.40', { next: '/demo/a.md' });
	expect(await consume(await emailedToken())).toMatchObject({ status: 303, location: '/demo/a.md' });
	mail.outbox.length = 0;
	await ask('bob@example.ch', '203.0.113.40', { next: 'https://evil.example' });
	expect(await consume(await emailedToken())).toMatchObject({ status: 303, location: '/' });
});

it('requests are throttled per address and per IP', async () => {
	for (let i = 0; i < 3; i++)
		expect(await ask('cat@example.ch', `203.0.113.5${i}`)).toMatchObject({ sent: true });
	expect(await ask('cat@example.ch', '203.0.113.59')).toMatchObject({
		status: 429,
		data: { error: 'login.throttled', method: 'link', email: 'cat@example.ch' }
	});
	for (let i = 0; i < 10; i++)
		expect(await ask(`ip${i}@example.ch`, '203.0.113.60')).toMatchObject({ sent: true });
	expect(await ask('ip10@example.ch', '203.0.113.60')).toMatchObject({ status: 429 });
});

it('a bad address is refused', async () => {
	expect(await ask('not an address', '203.0.113.70')).toMatchObject({
		status: 400,
		data: { error: 'invite.email', method: 'link' }
	});
	expect(await ask('a@' + 'b'.repeat(253), '203.0.113.70')).toMatchObject({ status: 400 });
});

it('a failed send changes nothing for the visitor', async () => {
	const dan = await accounts.createUser({ email: 'dan@example.ch', name: 'Dan', password: 'long enough 1' });
	// SMTP replies often quote the recipient: the message must never reach the log.
	const failure = Object.assign(new Error('550 <dan@example.ch> rejected'), { code: 'EENVELOPE', responseCode: 550 });
	vi.spyOn(mail, 'sendMail').mockRejectedValue(failure);
	const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
	expect(await ask('dan@example.ch', '203.0.113.80')).toEqual({ sent: true, email: 'dan@example.ch', method: 'link' });
	await vi.waitFor(() => expect(logged).toHaveBeenCalledOnce());
	const text = JSON.stringify(logged.mock.calls[0]);
	expect(logged.mock.calls[0]).toContain(dan.id);
	expect(text).not.toContain('dan@example.ch');
	expect(text).not.toContain('/login/link/');
	expect(text).toContain('EENVELOPE');
});

it('email off hides the link sign-in', async () => {
	for (const name of Object.keys(VARS)) delete process.env[name];
	const url = new URL('http://localhost/login?method=link&next=/demo');
	expect(load({ locals: { user: null }, url } as never)).toEqual({ next: '/demo', mail: false, method: 'password' });
	expect(await ask('jon@example.ch', '203.0.113.90')).toMatchObject({ status: 404 });
	Object.assign(process.env, VARS);
	expect(load({ locals: { user: null }, url } as never)).toEqual({ next: '/demo', mail: true, method: 'link' });
});
