import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createWorkspace, roleOf } from '#lib/core/access.ts';
import { createUser, loginSucceeded, userByEmail } from '#lib/core/accounts.ts';
import type { Actor } from '#lib/core/actor.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument } from '#lib/core/documents.ts';
import { createPublicLink } from '#lib/core/publicLinks.ts';
import { handle } from '../../hooks.server.ts';
import { actions, load } from './[token]/+page.server.ts';

const IP = '198.51.100.9';
let data: string;
let jon: Actor;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-join-'));
	process.env.INKMESH_DATA = data;
	const u = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	jon = { id: u.id, name: 'Jon' };
	await createWorkspace('demo', 'Demo', jon);
	await createDocument('demo', 'notes/a.md', jon);
});
afterEach(() => {
	loginSucceeded('join|' + IP);
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

function signup(token: string, email: string, cookies: Record<string, string> = {}) {
	const form = new FormData();
	form.set('name', 'Nina');
	form.set('email', email);
	form.set('password', 'long enough 1');
	const event = {
		params: { token },
		request: new Request('http://localhost/join/' + token, { method: 'POST', body: form }),
		cookies: { set: (name: string, value: string) => (cookies[name] = value) },
		locals: { user: null, actor: null, locale: 'en' },
		getClientAddress: () => IP
	};
	return Promise.resolve(actions.signup(event as never)).catch((err) => err);
}

it('sign-up from a link creates a member with the link\'s role', async () => {
	const t = await createPublicLink('demo', 'notes/a.md', 'reader', jon);
	expect(load({ params: { token: t }, locals: { user: null }, url: new URL('http://x/join/' + t) } as never)).toEqual({
		link: { workspaceName: 'Demo', role: 'reader' },
		user: null
	});
	const cookies: Record<string, string> = {};
	expect(await signup(t, 'nina@b.c', cookies)).toMatchObject({ status: 303, location: '/demo/notes/a.md' });
	expect(roleOf('demo', userByEmail('nina@b.c')!.id)).toBe('reader');
	expect(cookies.inkmesh_session).toBeTruthy();
});

it('a closed link refuses', async () => {
	const t = await createPublicLink('demo', null, null, jon);
	expect(load({ params: { token: t }, locals: { user: null }, url: new URL('http://x/join/' + t) } as never)).toEqual({ link: null, user: null });
	expect(await signup(t, 'nina@b.c')).toMatchObject({ status: 410 });
	expect(userByEmail('nina@b.c')).toBeFalsy();
});

it('sign-ups are throttled per IP', async () => {
	const t = await createPublicLink('demo', null, 'editor', jon);
	for (let i = 0; i < 10; i++) expect((await signup(t, 'bad address')).status).toBe(400);
	expect(await signup(t, 'nina@b.c')).toMatchObject({ status: 429 });
	expect(userByEmail('nina@b.c')).toBeFalsy();
});

it('join and invitation pages are not referred elsewhere, cached or indexed', async () => {
	for (const pathname of ['/join/abc', '/invite/abc']) {
		const url = new URL(pathname, 'http://localhost');
		const event = {
			url,
			request: new Request(url),
			cookies: { get: () => undefined },
			locals: {},
			route: { id: null },
			getClientAddress: () => IP
		};
		const res = await handle({ event: event as never, resolve: async () => new Response('ok') });
		expect(res.headers.get('referrer-policy'), pathname).toBe('same-origin');
		expect(res.headers.get('cache-control'), pathname).toBe('no-store');
		expect(res.headers.get('x-robots-tag'), pathname).toBe('noindex, nofollow');
	}
});
