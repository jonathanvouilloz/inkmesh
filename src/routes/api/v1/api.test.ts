import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createSession, createUser, loginSucceeded, type User } from '#lib/core/accounts.ts';
import { createAgent } from '#lib/core/agents.ts';
import { closeDb } from '#lib/core/db.ts';
import {
	createDocument,
	history,
	importDocument,
	MAX_DOCUMENT_BYTES,
	readDocument
} from '#lib/core/documents.ts';
import { clearSessionTimers } from '#lib/core/sessions.ts';
import { handle } from '../../../hooks.server.ts';
import { fallback } from '../[...rest]/+server.ts';
import { GET as changesGET } from './workspaces/[workspace]/changes/+server.ts';
import {
	DELETE as documentDELETE,
	GET as documentGET,
	PUT as documentPUT
} from './workspaces/[workspace]/documents/[...path]/+server.ts';
import { POST as movePOST } from './workspaces/[workspace]/move/+server.ts';
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
	headers: Record<string, string> = {},
	init: RequestInit = {}
) {
	const url = new URL(target, 'http://localhost');
	const event = { request: new Request(url, { headers, ...init }), url, params, getClientAddress: () => IP };
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

it('throttles failed tokens without locking out valid ones', async () => {
	for (let i = 0; i < 10; i++)
		expect((await call(workspacesGET, '/api/v1/workspaces', {}, bearer('ink_bad'))).status).toBe(401);
	expect((await call(workspacesGET, '/api/v1/workspaces')).status).toBe(401);
	const res = await call(workspacesGET, '/api/v1/workspaces', {}, bearer('ink_bad'));
	expect(res.status).toBe(429);
	expect((await res.json()).error.code).toBe('too_many_requests');
	expect((await call(workspacesGET, '/api/v1/workspaces', {}, bearer(jonToken))).status).toBe(200);
});

it('requests without a token are not counted as failures', async () => {
	for (let i = 0; i < 20; i++) expect((await call(workspacesGET, '/api/v1/workspaces')).status).toBe(401);
	expect((await call(workspacesGET, '/api/v1/workspaces', {}, bearer(jonToken))).status).toBe(200);
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
		['/.well-known/oauth-authorization-server', false],
		['/.well-known/oauth-protected-resource/mcp', false],
		['/demo', true]
	] as const) {
		const url = new URL(p, 'http://localhost');
		const event = {
			request: new Request(url),
			url,
			route: { id: null },
			locals: {} as App.Locals,
			cookies: { get: () => token, delete: () => {} }
		};
		await handle({ event: event as never, resolve: async () => new Response('') });
		expect(event.locals.actor === null, p).toBe(!actor);
		expect(event.locals.user === null, p).toBe(!actor);
	}
});

const enc = (s: string) => new TextEncoder().encode(s);
const put = (path: string, body: BodyInit, headers: Record<string, string> = {}, token = jonToken) =>
	call(documentPUT, '/x', { workspace: 'demo', path }, { ...bearer(token), ...headers }, { method: 'PUT', body });
const get = (path: string) => call(documentGET, '/x', { workspace: 'demo', path }, bearer(jonToken));
const hashOf = async (path: string) => (await readDocument('demo', path, jon)).hash;

it('creates with If-None-Match and refuses a second create', async () => {
	const res = await put('notes/b.md', '# B\n', { 'if-none-match': '*' });
	expect(res.status).toBe(201);
	const hash = await hashOf('notes/b.md');
	expect(await res.json()).toEqual({ path: 'notes/b.md', hash });
	const again = await put('notes/b.md', '# other\n', { 'if-none-match': '*' });
	expect(again.status).toBe(409);
	expect((await again.json()).error).toMatchObject({ code: 'conflict', currentHash: hash });
});

it('updates with If-Match', async () => {
	const old = await hashOf('notes/a.md');
	const res = await put('notes/a.md', '# A2\n', { 'if-match': `"${old}"` });
	expect(res.status).toBe(200);
	const hash = await hashOf('notes/a.md');
	expect(await res.json()).toEqual({ path: 'notes/a.md', hash });
	expect((await history('demo', 'notes/a.md', jon))[0]).toMatchObject({
		message: 'Update notes/a.md',
		name: 'Jon',
		agent: 'reporter'
	});
	const stale = await put('notes/a.md', '# A3\n', { 'if-match': `"${old}"` });
	expect(stale.status).toBe(409);
	expect((await stale.json()).error).toMatchObject({ code: 'conflict', currentHash: hash });
	expect((await readDocument('demo', 'notes/a.md', jon)).source).toBe('# A2\n');
	expect((await put('notes/missing.md', '# M\n', { 'if-match': `"${old}"` })).status).toBe(404);
	for (const bad of ['*', `"${hash}", "${old}"`, hash])
		expect((await put('notes/a.md', '# A4\n', { 'if-match': bad })).status, bad).toBe(400);
	expect((await put('notes/a.md', '# A4\n', { 'if-none-match': `"${hash}"` })).status).toBe(400);
});

it('replaces without a precondition', async () => {
	const res = await put('notes/a.md', '# replaced\n');
	expect(res.status).toBe(200);
	expect((await history('demo', 'notes/a.md', jon))[0]).toMatchObject({
		message: 'Replace notes/a.md',
		name: 'Jon',
		agent: 'reporter'
	});
	expect((await put('notes/new.md', '# new\n')).status).toBe(201);
});

it('stores the body byte for byte', async () => {
	const source = '---\r\ntitle: x\r\n---\r\n# Hi\r\n\r\ntext  \r\n';
	expect((await put('notes/crlf.md', enc(source))).status).toBe(201);
	expect((await (await get('notes/crlf.md')).json()).content).toBe(source);
});

it('413 above 3 MiB and 400 for invalid UTF-8', async () => {
	const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1).fill(97);
	const declared = await put('notes/big.md', 'small', { 'content-length': String(MAX_DOCUMENT_BYTES + 1) });
	expect(declared.status).toBe(413);
	expect((await declared.json()).error.code).toBe('payload_too_large');
	// No content-length on a stream: the cap applies to the bytes actually read.
	const stream = new Blob([big]).stream();
	const res = await call(
		documentPUT,
		'/x',
		{ workspace: 'demo', path: 'notes/big.md' },
		bearer(jonToken),
		{ method: 'PUT', body: stream, duplex: 'half' } as RequestInit
	);
	expect(res.status).toBe(413);
	const bad = await put('notes/bad.md', new Uint8Array([0xff, 0xfe]));
	expect(bad.status).toBe(400);
	expect((await bad.json()).error.code).toBe('bad_request');
	expect((await get('notes/big.md')).status).toBe(404);
});

it("a reader's agent gets 403 on every write", async () => {
	const results = [
		await put('notes/a.md', '# x\n', {}, annToken),
		await put('notes/r.md', '# x\n', { 'if-none-match': '*' }, annToken),
		await call(documentDELETE, '/x', { workspace: 'demo', path: 'notes/a.md' }, bearer(annToken), {
			method: 'DELETE'
		}),
		await call(movePOST, '/x', { workspace: 'demo' }, bearer(annToken), {
			method: 'POST',
			body: JSON.stringify({ from: 'notes/a.md', to: 'b.md' })
		})
	];
	for (const res of results) {
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe('forbidden');
	}
});

it('moves and deletes', async () => {
	const move = await call(movePOST, '/x', { workspace: 'demo' }, bearer(jonToken), {
		method: 'POST',
		body: JSON.stringify({ from: 'notes/a.md', to: 'archive/a.md' })
	});
	expect(move.status).toBe(200);
	expect(await move.json()).toEqual({ path: 'archive/a.md' });
	const del = await call(documentDELETE, '/x', { workspace: 'demo', path: 'archive' }, bearer(jonToken), {
		method: 'DELETE'
	});
	expect(del.status).toBe(204);
	expect(await del.text()).toBe('');
	expect((await get('archive/a.md')).status).toBe(404);
	const again = await call(documentDELETE, '/x', { workspace: 'demo', path: 'archive' }, bearer(jonToken), {
		method: 'DELETE'
	});
	expect(again.status).toBe(404);
});

it('bad move bodies are 400', async () => {
	const bodies = [JSON.stringify({ from: 1, to: 'b.md' }), JSON.stringify({ from: 'notes/a.md' }), '{nope', 'null'];
	for (const body of bodies) {
		const res = await call(movePOST, '/x', { workspace: 'demo' }, bearer(jonToken), { method: 'POST', body });
		expect(res.status, body).toBe(400);
		expect((await res.json()).error.code).toBe('bad_request');
	}
});
