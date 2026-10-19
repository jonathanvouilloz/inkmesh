import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { workspaceDir } from '#lib/core/data.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument, readDocument, writeDocument } from '#lib/core/documents.ts';
import { clearSessionTimers } from '#lib/core/sessions.ts';
import { actions } from './+page.server.ts';

const doc = 'examples/kitchen-sink.md';
let data: string;
let owner: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-save-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	await createDocument('demo', doc, owner);
});
afterEach(() => {
	clearSessionTimers();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

function save(body: string, hash: string, user: User | null = owner) {
	const form = new FormData();
	form.set('body', body);
	form.set('hash', hash);
	const event = {
		params: { workspace: 'demo', path: doc },
		request: new Request('http://localhost/demo/x', { method: 'POST', body: form }),
		locals: { user, actor: user && { id: user.id, name: user.name }, locale: 'en' }
	};
	return actions.save(event as unknown as Parameters<typeof actions.save>[0]);
}

it('rejects a stale hash with 409', async () => {
	expect(await save('# Changed\n', 'stale')).toMatchObject({ status: 409, data: { conflict: true } });
	expect(fs.readFileSync(path.join(workspaceDir('demo'), doc), 'utf8')).toBe('# kitchen-sink\n');
});

it('saves with the right hash and returns the new one', async () => {
	const first = await readDocument('demo', doc, owner);
	const { hash } = await writeDocument('demo', doc, '# T\n\nOne\nline\n\nTwo\n', {
		expectedHash: first.hash,
		actor: owner
	});
	// Browsers send multipart values with CRLF line breaks; the LF file must stay LF.
	const result = (await save('# T\r\n\r\nOne\r\nline edited\r\n\r\nTwo\r\n', hash)) as {
		hash: string;
	};
	expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
	expect(result.hash).not.toBe(hash);
	expect(fs.readFileSync(path.join(workspaceDir('demo'), doc), 'utf8')).toBe(
		'# T\n\nOne\nline edited\n\nTwo\n'
	);
});

it("refuses a reader's save with 403", async () => {
	const reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	const { hash } = await readDocument('demo', doc, owner);
	await expect(save('# Changed\n', hash, reader)).rejects.toMatchObject({ status: 403 });
	expect(fs.readFileSync(path.join(workspaceDir('demo'), doc), 'utf8')).toBe('# kitchen-sink\n');
});

it('hides the workspace from a non-member with 404', async () => {
	const stranger = await createUser({ email: 'stranger@example.com', name: 'Stranger', password: 'long-enough-1' });
	const { hash } = await readDocument('demo', doc, owner);
	await expect(save('# Changed\n', hash, stranger)).rejects.toMatchObject({ status: 404 });
});

it('refuses an anonymous save with 401', async () => {
	const { hash } = await readDocument('demo', doc, owner);
	await expect(save('# Changed\n', hash, null)).rejects.toMatchObject({ status: 401 });
	expect(fs.readFileSync(path.join(workspaceDir('demo'), doc), 'utf8')).toBe('# kitchen-sink\n');
});
