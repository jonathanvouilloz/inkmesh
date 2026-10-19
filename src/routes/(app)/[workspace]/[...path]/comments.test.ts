import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { workspaceDir } from '#lib/core/data.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument, history, readDocument, writeDocument } from '#lib/core/documents.ts';
import { clearSessionTimers, endSession } from '#lib/core/sessions.ts';
import { actions, load } from './+page.server.ts';

const doc = 'a.md';
let data: string;
let owner: User;
let reader: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-comments-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	await createDocument('demo', doc, owner);
});
afterEach(() => {
	clearSessionTimers();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User) => ({ user, actor: { id: user.id, name: user.name }, locale: 'en' });

function act(name: 'comment' | 'resolve' | 'restore', fields: Record<string, string>, user: User = owner) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	const event = {
		params: { workspace: 'demo', path: doc },
		request: new Request('http://localhost/demo/a.md', { method: 'POST', body: form }),
		locals: locals(user)
	};
	return actions[name](event as unknown as Parameters<(typeof actions)['comment']>[0]);
}

function open(query = '', user: User = owner) {
	const event = {
		params: { workspace: 'demo', path: doc },
		url: new URL(`http://localhost/demo/a.md${query}`),
		locals: locals(user),
		parent: async () => ({ tree: [] })
	};
	return load(event as unknown as Parameters<typeof load>[0]) as Promise<Record<string, unknown>>;
}

it('a reader comments and resolves', async () => {
	expect(await act('comment', { body: 'Looks **good**.' }, reader)).toEqual({});
	const thread = fs.readFileSync(path.join(workspaceDir('demo'), '.inkmesh/comments/a.md'), 'utf8');
	expect(thread).toMatch(/^## Reader · .+Z\n\nLooks \*\*good\*\*\.\n$/m);
	const [comment] = (await open()).comments as Array<{ id: string; html: string; resolved: boolean }>;
	expect(comment.html).toBe('<p>Looks <strong>good</strong>.</p>');
	expect(comment.resolved).toBe(false);

	await act('resolve', { id: comment.id, resolved: '1' }, reader);
	expect((await open()).comments).toMatchObject([{ id: comment.id, resolved: true }]);
	await expect(act('resolve', { id: '2000-01-01T00:00:00.000Z', resolved: '0' })).resolves.toMatchObject({
		status: 404
	});
});

it('an empty comment is refused', async () => {
	expect(await act('comment', { body: '  \n' })).toMatchObject({
		status: 400,
		data: { commentError: 'empty' }
	});
	expect(await act('comment', { body: 'x'.repeat(10_001) })).toMatchObject({
		status: 400,
		data: { commentError: 'too-large' }
	});
});

it('restore needs an editor', async () => {
	const [first] = await history('demo', doc, owner);
	await expect(act('restore', { commit: first.hash }, reader)).rejects.toMatchObject({ status: 403 });
});

it('restore redirects to the document', async () => {
	const [first] = await history('demo', doc, owner);
	const { hash } = await readDocument('demo', doc, owner);
	await writeDocument('demo', doc, '# Second\n', { expectedHash: hash, actor: owner });
	await endSession('demo', doc, owner);
	await expect(act('restore', { commit: first.hash })).rejects.toMatchObject({
		status: 303,
		location: '/demo/a.md'
	});
	const [top] = await history('demo', doc, owner);
	expect(top.message).toBe(`Restore a.md to ${first.hash.slice(0, 7)}`);
	await expect(act('restore', { commit: 'zzz' })).rejects.toMatchObject({ status: 400 });
});

it('load renders a version', async () => {
	const [first] = await history('demo', doc, owner);
	const { hash } = await readDocument('demo', doc, owner);
	await writeDocument('demo', doc, '---\ntags: x\n---\n# Second\n', { expectedHash: hash, actor: owner });
	await endSession('demo', doc, owner);
	const [second] = await history('demo', doc, owner);

	const old = (await open(`?v=${first.hash}`, reader)).version as { commit: string; html: string };
	expect(old).toMatchObject({ commit: first.hash, html: '<h1>a</h1>' });
	expect((await open(`?v=${second.hash}`)).version).toMatchObject({
		html: '<h1>Second</h1>',
		entries: [['tags', 'x']]
	});
	await expect(open('?v=zzz')).rejects.toMatchObject({ status: 400 });
	await expect(open(`?v=${'0'.repeat(40)}`)).rejects.toMatchObject({ status: 404 });
});
