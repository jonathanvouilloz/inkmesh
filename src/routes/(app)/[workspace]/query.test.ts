import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { importDocument } from '#lib/core/documents.ts';
import { load as layoutLoad } from './+layout.server.ts';
import { load as rootLoad } from './+page.server.ts';
import { load as pathLoad } from './[...path]/+page.server.ts';

let data: string;
let owner: User;

const put = (file: string, date: string, status: string) =>
	importDocument('demo', file, new TextEncoder().encode(`---\ndate: ${date}\nstatus: ${status}\n---\n# ${file}\n`), {
		actor: { id: owner.id, name: owner.name }
	});

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-query-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	await put('a.md', '2026-01-05', 'draft');
	await put('b.md', '2026-03-01', 'done');
	await put('f/x.md', '2026-02-10', 'draft');
	await put('f/y.md', '2026-01-01', 'done');
	await put('f/z.md', '2026-04-01', 'draft');
	await importDocument('demo', 'f/sub/w.md', new TextEncoder().encode('# W\n'), { actor: { id: owner.id, name: owner.name } });
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

type Listing = { query: { nodes: Array<{ path: string }> } };

function event(search: string, user: User, rest?: string) {
	const locals = { user, actor: { id: user.id, name: user.name }, locale: 'en' };
	const params = { workspace: 'demo', path: rest };
	return {
		params,
		url: new URL(`http://localhost/demo${rest ? '/' + rest : ''}${search}`),
		locals,
		parent: () => layoutLoad({ params, locals, parent: async () => ({}) } as never)
	};
}
// Resolves to the value, or to the status (and location) of what the load threw.
async function load(search: string, user: User = owner, rest?: string) {
	try {
		return (await (rest ? pathLoad : rootLoad)(event(search, user, rest) as never)) as unknown as Listing;
	} catch (err) {
		const e = err as { status: number; location?: string };
		return { thrown: e.status, location: e.location };
	}
}
const paths = (r: unknown) => (r as Listing).query.nodes.map((n) => n.path);

it('the root and a folder load a sorted, filtered list', async () => {
	expect(paths(await load('?sort=date&order=desc'))).toEqual(['f', 'b.md', 'a.md']);
	expect(paths(await load('?status=draft', owner, 'f'))).toEqual(['f/x.md', 'f/z.md']);
	expect(paths(await load('', owner, 'f'))).toEqual(['f/sub', 'f/x.md', 'f/y.md', 'f/z.md']);
});

it("the form's parameters redirect to the canonical URL", async () => {
	expect(await load('?field=status&value=draft', owner, 'f')).toEqual({ thrown: 303, location: '/demo/f?status=draft' });
	expect(await load('?sort=date&order=asc&field=&value=')).toEqual({ thrown: 303, location: '/demo?sort=date' });
});

it('a reader can sort and filter', async () => {
	const reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	expect(paths(await load('?status=done&sort=date', reader, 'f'))).toEqual(['f/y.md']);
});

it('a non-member gets 404', async () => {
	const stranger = await createUser({ email: 'x@example.com', name: 'X', password: 'long-enough-1' });
	expect(await load('?sort=date', stranger)).toMatchObject({ thrown: 404 });
	expect(await load('?status=draft', stranger, 'f')).toMatchObject({ thrown: 404 });
});
