import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createSession, createUser, loginSucceeded, type User } from '#lib/core/accounts.ts';
import { createAgent } from '#lib/core/agents.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument, importDocument, readDocument } from '#lib/core/documents.ts';
import { clearSessionTimers } from '#lib/core/sessions.ts';
import { handle } from '../../../hooks.server.ts';
import { fallback } from '../[...rest]/+server.ts';
import { GET as changesGET } from './workspaces/[workspace]/changes/+server.ts';
import { GET as documentGET } from './workspaces/[workspace]/documents/[...path]/+server.ts';
import { GET as treeGET } from './workspaces/[workspace]/tree/+server.ts';
import { GET as workspacesGET } from './workspaces/+server.ts';

const IP = '1.2.3.4';
let data: string;
let jon: User;
let ann: User;
let zoe: User;
let jonToken: string;
let annToken: string;
let zoeToken: string;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-api-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	ann = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
	zoe = await createUser({ email: 'zoe@b.c', name: 'Zoe', password: 'long enough 1' });
	const owner = await createUser({ email: 'own@b.c', name: 'Owner', password: 'long enough 1' });
	await createWorkspace('demo', 'Demo', owner);
	acceptInvitation(createInvitation('demo', 'editor', owner), jon.id);
	acceptInvitation(createInvitation('demo', 'reader', owner), ann.id);
	await createDocument('demo', 'notes/a.md', owner);
	jonToken = createAgent(jon.id, 'reporter').token;
	annToken = createAgent(ann.id, 'reader-bot').token;
	zoeToken = createAgent(zoe.id, 'stranger').token;
});
afterEach(() => {
	loginSucceeded('bearer|' + IP);
	clearSessionTimers();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

type Handler = (event: never) => Promise<Response> | Response;
function call(
	handler: Handler,
	target: string,
	params: Record<string, string> = {},
	headers: Record<string, string> = {}
) {
	const url = new URL(target, 'http://localhost');
	const event = { request: new Request(url, { headers }), url, params, getClientAddress: () => IP };
	return handler(event as never);
}
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

it('lists my workspaces with my role', async () => {
	const res = await call(workspacesGET, '/api/v1/workspaces', {}, bearer(jonToken));
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ workspaces: [{ slug: 'demo', name: 'Demo', role: 'editor' }] });
	const none = await call(workspacesGET, '/api/v1/workspaces', {}, bearer(zoeToken));
	expect(await none.json()).toEqual({ workspaces: [] });
});

it('401 without or with a bad token, with the challenge header', async () => {
	const cookie = { cookie: `inkmesh_session=${createSession(jon.id)}` };
	for (const headers of [{}, bearer('ink_nope'), { authorization: jonToken }, cookie]) {
		const res = await call(workspacesGET, '/api/v1/workspaces', {}, headers);
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toBe('Bearer realm="inkmesh"');
		expect((await res.json()).error.code).toBe('unauthorized');
	}
});

it('throttles failed tokens', async () => {
	for (let i = 0; i < 10; i++)
		expect((await call(workspacesGET, '/api/v1/workspaces', {}, bearer('ink_bad'))).status).toBe(401);
	const res = await call(workspacesGET, '/api/v1/workspaces', {}, bearer(jonToken));
	expect(res.status).toBe(429);
	expect((await res.json()).error.code).toBe('too_many_requests');
});

it('a non-member gets 404 for an existing workspace and for a missing one', async () => {
	const existing = await call(treeGET, '/api/v1/workspaces/demo/tree', { workspace: 'demo' }, bearer(zoeToken));
	const missing = await call(treeGET, '/api/v1/workspaces/nope/tree', { workspace: 'nope' }, bearer(zoeToken));
	expect(existing.status).toBe(404);
	expect(missing.status).toBe(404);
	const body = await existing.json();
	expect(body.error.code).toBe('not_found');
	expect(await missing.json()).toEqual(body);
	const doc = await call(
		documentGET,
		'/api/v1/workspaces/demo/documents/notes/a.md',
		{ workspace: 'demo', path: 'notes/a.md' },
		bearer(zoeToken)
	);
	expect(await doc.json()).toEqual(body);
});

it('reads a document with its hash and ETag', async () => {
	const { hash, source } = await readDocument('demo', 'notes/a.md', jon);
	const res = await call(
		documentGET,
		'/api/v1/workspaces/demo/documents/notes/a.md',
		{ workspace: 'demo', path: 'notes/a.md' },
		bearer(annToken)
	);
	expect(res.status).toBe(200);
	expect(res.headers.get('etag')).toBe(`"${hash}"`);
	expect(await res.json()).toEqual({ path: 'notes/a.md', content: source, hash });
});

it('400 on a bad path', async () => {
	const res = await call(
		documentGET,
		'/api/v1/workspaces/demo/documents/x',
		{ workspace: 'demo', path: '../x.md' },
		bearer(jonToken)
	);
	expect(res.status).toBe(400);
	expect((await res.json()).error.code).toBe('bad_request');
});

it('404 on a missing document', async () => {
	const res = await call(documentGET, '/x', { workspace: 'demo', path: 'notes/missing.md' }, bearer(jonToken));
	expect(res.status).toBe(404);
	const body = await res.json();
	expect(body.error.code).toBe('not_found');
	expect(body.error.message).not.toContain(data);
});

it('the tree has the M3 shape', async () => {
	const res = await call(treeGET, '/api/v1/workspaces/demo/tree', { workspace: 'demo' }, bearer(annToken));
	expect(res.status).toBe(200);
	const { tree } = await res.json();
	expect(tree).toEqual([
		{
			name: 'notes',
			path: 'notes',
			kind: 'folder',
			children: [{ name: 'a.md', path: 'notes/a.md', kind: 'doc', title: 'a', modified: expect.any(String) }]
		}
	]);
});

it('changes pages with a cursor', async () => {
	const get = (query: string, token = annToken) =>
		call(changesGET, `/api/v1/workspaces/demo/changes${query}`, { workspace: 'demo' }, bearer(token));
	for (const bad of ['abc', '-1', '1.5', ''])
		expect((await get(`?since=${bad}`)).status, bad).toBe(400);
	const first = await (await get('')).json();
	expect(first.more).toBe(false);
	await importDocument('demo', 'notes/b.md', new TextEncoder().encode('# B\n'), { actor: jon });
	const res = await get(`?since=${first.cursor}`);
	expect(res.status).toBe(200);
	const page = await res.json();
	expect(page).toMatchObject({ events: [{ type: 'create', path: 'notes/b.md', author: 'Jon' }], more: false });
	expect(page.cursor).toBe(page.events[0].id);
	expect((await (await get(`?since=${page.cursor}`)).json()).events).toEqual([]);
	expect((await get('', zoeToken)).status).toBe(404);
});

it('unknown /api paths answer a JSON 404 for every method', async () => {
	const res = await fallback({} as never);
	expect(res.status).toBe(404);
	expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'not found' } });
});

it('never reads the session cookie on the agent paths', async () => {
	const token = createSession(jon.id);
	for (const [p, actor] of [
		['/api/v1/workspaces', false],
		['/mcp', false],
		['/oauth/token', false],
		['/oauth/register', false],
		['/demo', true]
	] as const) {
		const url = new URL(p, 'http://localhost');
		const event = {
			request: new Request(url),
			url,
			locals: {} as App.Locals,
			cookies: { get: () => token, delete: () => {} }
		};
		await handle({ event: event as never, resolve: async () => new Response('') });
		expect(event.locals.actor === null, p).toBe(!actor);
		expect(event.locals.user === null, p).toBe(!actor);
	}
});
