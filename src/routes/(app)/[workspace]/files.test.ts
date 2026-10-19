import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { workspaceDir } from '#lib/core/data.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument } from '#lib/core/documents.ts';
import { actions } from './+page.server.ts';
import { GET } from './-/raw/[...path]/+server.ts';

let data: string;
let owner: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-files-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User | null) => ({
	user,
	actor: user && { id: user.id, name: user.name },
	locale: 'en'
});

type Name = keyof typeof actions;
function act(name: Name, fields: Array<[string, string | File]>, user: User | null = owner) {
	const form = new FormData();
	for (const [k, v] of fields) form.append(k, v);
	const event = {
		params: { workspace: 'demo' },
		request: new Request('http://localhost/demo', { method: 'POST', body: form }),
		locals: locals(user)
	};
	return actions[name]!(event as unknown as Parameters<NonNullable<(typeof actions)[Name]>>[0]);
}

// Resolves to the thrown redirect, or fails the test if the action returned instead.
async function redirected(p: unknown) {
	try {
		await p;
	} catch (err) {
		return err as { status: number; location: string };
	}
	throw new Error('expected a redirect');
}

function download(file: string, user: User | null = owner) {
	const event = { params: { workspace: 'demo', path: file }, locals: locals(user) };
	return GET(event as unknown as Parameters<typeof GET>[0]);
}

const file = (name: string, text: string) => new File([text], name);

it('reports each file of a mixed import', async () => {
	const result = await act('import', [
		['folder', 'notes'],
		['files', file('a.md', '# A\n')],
		['files', file('b.markdown', '# B\n')],
		['files', file('photo.png', 'png')],
		['files', file('a.md', '# A again\n')],
		['files', file('folder', '')]
	]);
	expect(result).toEqual({
		results: [
			{ name: 'a.md', path: 'notes/a.md', outcome: 'imported' },
			{ name: 'b.markdown', path: 'notes/b.md', outcome: 'imported' },
			{ name: 'photo.png', outcome: 'invalid' },
			{ name: 'a.md', path: 'notes/a.md', outcome: 'exists' },
			{ name: 'folder', outcome: 'invalid' }
		]
	});
	expect(fs.readFileSync(path.join(workspaceDir('demo'), 'notes/a.md'), 'utf8')).toBe('# A\n');
	expect(fs.readFileSync(path.join(workspaceDir('demo'), 'notes/b.md'), 'utf8')).toBe('# B\n');
});

it('replaces with overwrite and maps content errors', async () => {
	await createDocument('demo', 'a.md', owner);
	const result = await act('import', [
		['folder', ''],
		['overwrite', '1'],
		['files', file('a.md', '# New\n')],
		['files', new File([new Uint8Array([0xff, 0xfe])], 'bad.md')]
	]);
	expect(result).toEqual({
		results: [
			{ name: 'a.md', path: 'a.md', outcome: 'replaced' },
			{ name: 'bad.md', path: 'bad.md', outcome: 'not-utf8' }
		]
	});
});

it('creates a folder and redirects to it', async () => {
	const err = await redirected(act('folder', [['parent', 'a'], ['name', 'b c']]));
	expect(err).toMatchObject({ status: 303, location: '/demo/a/b%20c' });
	expect(fs.statSync(path.join(workspaceDir('demo'), 'a/b c')).isDirectory()).toBe(true);
	expect(await act('folder', [['parent', 'a'], ['name', 'b c']])).toMatchObject({
		status: 409,
		data: { folderError: 'exists', name: 'b c' }
	});
	expect(await act('folder', [['parent', ''], ['name', 'x.md']])).toMatchObject({
		status: 400,
		data: { folderError: 'invalid' }
	});
});

it('move redirects to the new place', async () => {
	await createDocument('demo', 'old.md', owner);
	const err = await redirected(act('move', [['from', 'old.md'], ['to', 'new name.md']]));
	expect(err).toMatchObject({ status: 303, location: '/demo/new%20name.md' });
	expect(await act('move', [['from', 'old.md'], ['to', 'x.md']])).toMatchObject({
		status: 404,
		data: { moveError: 'missing', from: 'old.md' }
	});
});

it('delete redirects to the parent', async () => {
	await createDocument('demo', 'a/b.md', owner);
	await createDocument('demo', 'c.md', owner);
	expect(await redirected(act('delete', [['path', 'a/b.md']]))).toMatchObject({
		status: 303,
		location: '/demo/a'
	});
	expect(await redirected(act('delete', [['path', 'c.md']]))).toMatchObject({
		status: 303,
		location: '/demo'
	});
	expect(await act('delete', [['path', 'c.md']])).toMatchObject({
		status: 404,
		data: { deleteError: 'missing' }
	});
});

it('a reader gets 403 on every action', async () => {
	const reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	await createDocument('demo', 'a.md', owner);
	const calls: Array<[Name, Array<[string, string | File]>]> = [
		['folder', [['parent', ''], ['name', 'x']]],
		['import', [['folder', ''], ['files', file('b.md', '# B\n')]]],
		['move', [['from', 'a.md'], ['to', 'b.md']]],
		['delete', [['path', 'a.md']]]
	];
	for (const [name, fields] of calls)
		await expect(act(name, fields, reader)).rejects.toMatchObject({ status: 403 });
	expect(fs.existsSync(path.join(workspaceDir('demo'), 'a.md'))).toBe(true);
});

it('a reader can download', async () => {
	const reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	await createDocument('demo', 'a.md', owner);
	expect((await download('a.md', reader)).status).toBe(200);
});

it('download sends the raw file', async () => {
	const bytes = Buffer.from('﻿# Été\r\n\r\nText\r\n', 'utf8');
	await act('import', [['folder', 'n'], ['files', new File([bytes], 'r é.md')]]);
	const res = await download('n/r é.md');
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
	expect(res.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''r%20%C3%A9.md");
	expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
	await expect(download('n/missing.md')).rejects.toMatchObject({ status: 404 });
});

it('download by a non-member is 404', async () => {
	const stranger = await createUser({ email: 'stranger@example.com', name: 'Stranger', password: 'long-enough-1' });
	await createDocument('demo', 'a.md', owner);
	await expect(download('a.md', stranger)).rejects.toMatchObject({ status: 404 });
});
