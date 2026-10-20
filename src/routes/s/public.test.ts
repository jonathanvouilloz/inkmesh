import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createWorkspace } from '#lib/core/access.ts';
import { createUser, loginSucceeded } from '#lib/core/accounts.ts';
import type { Actor } from '#lib/core/actor.ts';
import { workspaceDir } from '#lib/core/data.ts';
import { closeDb } from '#lib/core/db.ts';
import { createPublicLink } from '#lib/core/publicLinks.ts';
import { handle } from '../../hooks.server.ts';
import { load as layoutLoad } from './[token]/+layout.server.ts';
import { load as rootLoad } from './[token]/+page.server.ts';
import { load as pathLoad } from './[token]/[...path]/+page.server.ts';
import { GET as raw } from './[token]/-/raw/[...path]/+server.ts';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
const IP = '198.51.100.7';
let data: string;
let jon: Actor;

const put = (rel: string, bytes: string | Buffer) => {
	const file = path.join(workspaceDir('demo'), rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, bytes);
};

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-public-'));
	process.env.INKMESH_DATA = data;
	const u = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	jon = { id: u.id, name: 'Jon' };
	await createWorkspace('demo', 'Demo', jon);
	put('notes/a.md', '---\nstatus: draft\n---\n# A\n\n![p](pic.png)\n\n<script>alert(1)</script>\n');
	put('notes/b.md', '# B\n');
	put('notes/pic.png', png);
	put('notes/c.png', png);
});
afterEach(() => {
	loginSucceeded('share|' + IP);
	loginSucceeded('share-miss|' + IP);
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

// Resolves to the value, or to the status (and location) of what the function threw.
async function outcome<T>(run: () => T | Promise<T>) {
	try {
		return await run();
	} catch (err) {
		const e = err as { status: number; location?: string };
		return { thrown: e.status, location: e.location };
	}
}

const event = (token: string, rest?: string) => ({
	params: { token, path: rest },
	getClientAddress: () => IP,
	parent: async () => layoutLoad({ params: { token }, getClientAddress: () => IP } as never)
});
const layout = (token: string) => outcome(() => layoutLoad(event(token) as never));
const root = (token: string) => outcome(() => rootLoad(event(token) as never));
const page = (token: string, rest: string) => outcome(() => pathLoad(event(token, rest) as never));
const serve = (token: string, rest: string) => outcome(() => raw(event(token, rest) as never));

const forbiddenCookies = new Proxy(
	{},
	{
		get() {
			throw new Error('a public route touched the cookies');
		}
	}
);
function request(pathname: string) {
	const url = new URL(pathname, 'http://localhost');
	const ev = {
		url,
		request: new Request(url),
		cookies: forbiddenCookies,
		locals: {} as Record<string, unknown>,
		route: { id: null },
		getClientAddress: () => IP
	};
	return Promise.resolve(handle({ event: ev as never, resolve: async () => new Response('ok') })).then((res) => ({ res, ev }));
}

it('public responses carry no cookie and noindex', async () => {
	const t = await createPublicLink('demo', 'notes/a.md', null, jon);
	const { res, ev } = await request('/s/' + t);
	expect(ev.locals).toMatchObject({ user: null, actor: null, locale: 'en' });
	expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
	expect(res.headers.get('referrer-policy')).toBe('no-referrer');
	expect(res.headers.get('cache-control')).toBe('no-store');
	expect(res.headers.get('x-frame-options')).toBe('DENY');
	expect(res.headers.get('content-security-policy')).toBe(
		"default-src 'none'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
	);
	expect(res.headers.get('set-cookie')).toBeNull();
});

it('a document link redirects to its canonical URL', async () => {
	const t = await createPublicLink('demo', 'notes/a.md', null, jon);
	expect(await root(t)).toEqual({ thrown: 302, location: `/s/${t}/notes/a.md` });
});

it('renders without active content', async () => {
	const t = await createPublicLink('demo', 'notes/a.md', null, jon);
	const doc = (await page(t, 'notes/a.md')) as { kind: string; title: string; html: string; entries: unknown };
	expect(doc).toMatchObject({ kind: 'doc', title: 'A', entries: [['status', 'draft']] });
	expect(doc.html).toContain('<img src="pic.png"');
	// renderHtml drops raw HTML altogether (Task 3), so not even the escaped text remains.
	expect(doc.html).not.toContain('<script');
});

it('a document link answers its own path only', async () => {
	const t = await createPublicLink('demo', 'notes/a.md', null, jon);
	expect(await page(t, 'notes/b.md')).toEqual({ thrown: 404, location: undefined });
	expect(await page(t, 'notes')).toEqual({ thrown: 404, location: undefined });
	expect(await serve(t, 'notes/c.png')).toEqual({ thrown: 404, location: undefined });
	expect(await serve(t, 'notes/b.md')).toEqual({ thrown: 404, location: undefined });
	expect(await serve(t, '.inkmesh/comments/notes/a.md')).toEqual({ thrown: 404, location: undefined });
	const pic = (await serve(t, 'notes/pic.png')) as Response;
	expect(pic.status).toBe(200);
	expect(pic.headers.get('content-type')).toBe('image/png');
	expect(pic.headers.get('x-content-type-options')).toBe('nosniff');
	const md = (await serve(t, 'notes/a.md')) as Response;
	expect(md.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''a.md");
});

it('a workspace link lists folders', async () => {
	const t = await createPublicLink('demo', null, 'reader', jon);
	expect(await layout(t)).toEqual({ token: t, workspaceName: 'Demo', path: null, signup: true, slug: 'demo' });
	const top = (await root(t)) as { nodes: Array<{ name: string }> };
	expect(top.nodes.map((n) => n.name)).toContain('notes');
	const folder = (await page(t, 'notes')) as { kind: string; nodes: Array<{ name: string }> };
	expect(folder.kind).toBe('folder');
	expect(folder.nodes.map((n) => n.name)).toEqual(['a.md', 'b.md']);
	expect(await page(t, 'nowhere')).toEqual({ thrown: 404, location: undefined });
	expect((await page(t, 'notes/b.md')) as { title: string }).toMatchObject({ kind: 'doc', title: 'B' });
	expect(((await serve(t, 'notes/c.png')) as Response).status).toBe(200);
	for (const hidden of ['.inkmesh/comments/notes/a.md', '.git/config', '../other/x.md'])
		expect(await serve(t, hidden)).toEqual({ thrown: 404, location: undefined });
	expect(await page(t, '.git')).toEqual({ thrown: 404, location: undefined });
});

it('an unknown token is 404 and throttled', async () => {
	const t = await createPublicLink('demo', 'notes/a.md', null, jon);
	for (let i = 0; i < 10; i++) {
		const unknown = String(i).padStart(43, 'x');
		expect((await request('/s/' + unknown)).res.status).toBe(200); // the stub resolve; the load answers 404
		expect(await layout(unknown)).toEqual({ thrown: 404, location: undefined });
	}
	const { res } = await request('/s/' + t);
	expect(res.status).toBe(429);
	expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
});
