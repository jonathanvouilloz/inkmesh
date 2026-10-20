import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument } from '#lib/core/documents.ts';
import { unreadCount } from '#lib/core/inbox.ts';
import { actions, load } from './+page.server.ts';

let data: string;
let owner: User;
let ann: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-inbox-page-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	ann = await createUser({ email: 'ann@example.com', name: 'Ann', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	acceptInvitation(createInvitation('demo', 'editor', owner), ann.id);
	unreadCount(owner.id); // the owner's cursor starts here
	await createDocument('demo', 'notes/a.md', ann);
	await createDocument('demo', 'notes/mine.md', owner);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User) => ({ user, actor: { id: user.id, name: user.name }, locale: 'en' });

async function read(upTo: string) {
	const form = new FormData();
	form.set('upTo', upTo);
	const event = { request: new Request('http://localhost/inbox', { method: 'POST', body: form }), locals: locals(owner) };
	try {
		return await actions.read(event as never);
	} catch (err) {
		return err;
	}
}

it("lists others' events with unread state", async () => {
	const page = (await load({ locals: locals(owner), parent: async () => ({}) } as never)) as { items: unknown[] };
	expect(page.items).toEqual([
		expect.objectContaining({ type: 'create', path: 'notes/a.md', author: 'Ann', workspaceName: 'Demo', unread: true }),
		expect.objectContaining({ type: 'join', author: 'Ann', unread: false })
	]);
});

it('mark all as read clears the count', async () => {
	const { items } = (await load({ locals: locals(owner), parent: async () => ({}) } as never)) as { items: { id: number }[] };
	expect(await read(String(items[0].id))).toEqual({});
	expect(unreadCount(owner.id)).toBe(0);
});

it('a bad cursor is 400', async () => {
	for (const upTo of ['', '-1', '1.5', 'x', '1e3']) expect(await read(upTo)).toMatchObject({ status: 400 });
	expect(unreadCount(owner.id)).toBe(1);
});
