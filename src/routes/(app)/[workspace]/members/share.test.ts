import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument, listTree } from '#lib/core/documents.ts';
import { actions, load } from './+page.server.ts';

let data: string;
let owner: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-share-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	await createDocument('demo', 'notes/a.md', { id: owner.id, name: owner.name });
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User) => ({ user, actor: { id: user.id, name: user.name }, locale: 'en' });
const url = new URL('http://localhost/demo/members?share=notes/a.md');

// The action's answer: what it returns (a result or failure) or throws (an error).
async function act(name: keyof typeof actions, fields: Record<string, string>, user = owner) {
	const event = {
		params: { workspace: 'demo' },
		request: new Request(url, { method: 'POST', body: new URLSearchParams(fields) }),
		locals: locals(user),
		url
	};
	try {
		return await actions[name]!(event as never);
	} catch (err) {
		return err;
	}
}

const page = async (user = owner) => {
	const tree = await listTree('demo', { id: user.id, name: user.name });
	return (await load({
		params: { workspace: 'demo' },
		locals: locals(user),
		url,
		parent: async () => ({ tree })
	} as never)) as Record<string, unknown>;
};

async function editor() {
	const user = await createUser({ email: 'editor@example.com', name: 'Editor', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'editor', owner), user.id);
	return user;
}

it('an owner creates a link shown once', async () => {
	const { shareUrl } = (await act('shareCreate', { scope: 'notes/a.md', signup: '' })) as { shareUrl: string };
	expect(shareUrl).toMatch(/^http:\/\/localhost\/s\/[A-Za-z0-9_-]{43}$/);
	const loaded = await page();
	expect(loaded).toMatchObject({
		publicLinks: [{ path: 'notes/a.md', signupRole: null, createdBy: 'Owner' }],
		documents: ['notes/a.md'],
		share: 'notes/a.md'
	});
	expect(JSON.stringify(loaded)).not.toContain(shareUrl.split('/').pop()!);

	await act('shareCreate', { scope: '', signup: 'editor' });
	expect((await page()).publicLinks).toMatchObject([{}, { path: null, signupRole: 'editor' }]);
});

it('refuses a bad sign-up role and a missing document', async () => {
	expect(await act('shareCreate', { scope: '', signup: 'owner' })).toMatchObject({ status: 400 });
	expect(await act('shareCreate', { scope: 'nope.md', signup: '' })).toMatchObject({
		status: 404,
		data: { shareError: 'missing' }
	});
	expect((await page()).publicLinks).toEqual([]);
});

it('an editor sees and manages nothing', async () => {
	const user = await editor();
	const loaded = await page(user);
	expect(loaded).not.toHaveProperty('publicLinks');
	expect(loaded).not.toHaveProperty('documents');
	for (const [name, fields] of [
		['shareCreate', { scope: '', signup: '' }],
		['shareSignup', { id: '1', signup: 'reader' }],
		['shareRevoke', { id: '1' }]
	] as const)
		expect(await act(name, fields, user)).toMatchObject({ status: 403 });
});

it('sign-up can be changed and revoked', async () => {
	await act('shareCreate', { scope: '', signup: '' });
	const [{ id }] = (await page()).publicLinks as Array<{ id: number }>;
	await act('shareSignup', { id: String(id), signup: 'reader' });
	expect((await page()).publicLinks).toMatchObject([{ signupRole: 'reader' }]);
	await act('shareSignup', { id: String(id), signup: '' });
	expect((await page()).publicLinks).toMatchObject([{ signupRole: null }]);
	await act('shareRevoke', { id: String(id) });
	expect((await page()).publicLinks).toEqual([]);
});
