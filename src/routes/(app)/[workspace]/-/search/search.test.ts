import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { importDocument } from '#lib/core/documents.ts';
import { load } from './+page.server.ts';

let data: string;
let owner: User;
let stranger: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-search-page-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	stranger = await createUser({ email: 'sam@example.com', name: 'Sam', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	await importDocument('demo', 'notes/kiwi.md', new TextEncoder().encode('# Fruit\n\nA ripe kiwi.\n'), {
		actor: { id: owner.id, name: owner.name }
	});
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const page = async (q: string | null, user = owner) => {
	const url = new URL('http://localhost/demo/-/search');
	if (q !== null) url.searchParams.set('q', q);
	const locals = { user, actor: { id: user.id, name: user.name }, locale: 'en' };
	try {
		return await load({ params: { workspace: 'demo' }, locals, url, parent: async () => ({}) } as never);
	} catch (err) {
		return err;
	}
};

it('returns the documents that contain the query', async () => {
	expect(await page('  kiwi ')).toEqual({
		q: 'kiwi',
		results: [{ path: 'notes/kiwi.md', title: 'Fruit', snippet: expect.stringContaining('\u0002kiwi\u0003') }]
	});
});

it('returns nothing for an empty query', async () => {
	expect(await page(null)).toEqual({ q: '', results: [] });
	expect(await page('   ')).toEqual({ q: '', results: [] });
});

it('cuts the query at 200 characters', async () => {
	expect(((await page('kiwi ' + 'x'.repeat(300))) as { q: string }).q).toHaveLength(200);
});

it('is a 404 for a non-member', async () => {
	expect(await page('kiwi', stranger)).toMatchObject({ status: 404 });
});
