import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { workspaceDir } from '#lib/core/data.ts';
import { createDocument, ensureWorkspace, readDocument, writeDocument } from '#lib/core/documents.ts';
import { actions } from './+page.server.ts';

const doc = 'examples/kitchen-sink.md';
let data: string;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-save-'));
	process.env.INKMESH_DATA = data;
	await ensureWorkspace('demo');
	await createDocument('demo', doc, { id: 1, name: 'Owner' });
});
afterEach(() => {
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

function save(body: string, hash: string) {
	const form = new FormData();
	form.set('body', body);
	form.set('hash', hash);
	const event = {
		params: { workspace: 'demo', path: doc },
		request: new Request('http://localhost/demo/x', { method: 'POST', body: form })
	};
	return actions.save(event as unknown as Parameters<typeof actions.save>[0]);
}

it('rejects a stale hash with 409', async () => {
	expect(await save('# Changed\n', 'stale')).toMatchObject({ status: 409, data: { conflict: true } });
	expect(fs.readFileSync(path.join(workspaceDir('demo'), doc), 'utf8')).toBe('# kitchen-sink\n');
});

it('saves with the right hash and returns the new one', async () => {
	const actor = { id: 1, name: 'Owner' };
	const first = await readDocument('demo', doc);
	const { hash } = await writeDocument('demo', doc, '# T\n\nOne\nline\n\nTwo\n', {
		expectedHash: first.hash,
		actor
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
