import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { workspaceDir } from '#lib/core/data.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument, deletePath } from '#lib/core/documents.ts';
import { actions, load } from './+page.server.ts';

let data: string;
let owner: User;
let reader: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-deleted-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	await createDocument('demo', 'notes/gone.md', owner);
	await deletePath('demo', 'notes/gone.md', owner);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User) => ({ user, actor: { id: user.id, name: user.name }, locale: 'en' });

async function restore(fields: Record<string, string>, user: User = owner) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	const event = {
		params: { workspace: 'demo' },
		request: new Request('http://localhost/demo/-/history', { method: 'POST', body: form }),
		locals: locals(user)
	};
	try {
		return await actions.restore(event as never);
	} catch (err) {
		return err;
	}
}

it('lists deleted documents for a reader', async () => {
	const page = await load({ params: { workspace: 'demo' }, locals: locals(reader), parent: async () => ({}) } as never);
	expect(page).toEqual({
		deleted: [{ path: 'notes/gone.md', commit: expect.any(String), name: 'Owner', date: expect.any(String) }]
	});
});

it('restore redirects to the document', async () => {
	expect(await restore({ path: 'notes/gone.md' })).toMatchObject({ status: 303, location: '/demo/notes/gone.md' });
	expect(fs.existsSync(path.join(workspaceDir('demo'), 'notes/gone.md'))).toBe(true);
});

it('a reader cannot restore', async () => {
	expect(await restore({ path: 'notes/gone.md' }, reader)).toMatchObject({ status: 403 });
	expect(fs.existsSync(path.join(workspaceDir('demo'), 'notes/gone.md'))).toBe(false);
});

it('restoring over a new document is refused', async () => {
	await createDocument('demo', 'notes/gone.md', owner);
	expect(await restore({ path: 'notes/gone.md' })).toMatchObject({
		status: 409,
		data: { restoreError: 'exists', path: 'notes/gone.md' }
	});
});

it('an unknown or invalid path is a 404', async () => {
	for (const p of ['never.md', '../x.md', '.inkmesh/comments/a.md'])
		expect(await restore({ path: p })).toMatchObject({ status: 404 });
});
