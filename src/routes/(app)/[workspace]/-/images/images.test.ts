import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument } from '#lib/core/documents.ts';
import { MAX_IMAGE_BYTES } from '#lib/core/images.ts';
import { GET } from '../raw/[...path]/+server.ts';
import { POST } from './+server.ts';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
let data: string;
let owner: User;
let reader: User;
let stranger: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-images-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	stranger = await createUser({ email: 'stranger@example.com', name: 'Stranger', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	await createDocument('demo', 'notes/report.md', owner);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User) => ({ user, actor: { id: user.id, name: user.name }, locale: 'en' });

// Resolves to the response, or to the status of the error the handler threw.
async function status(p: Response | Promise<Response>) {
	try {
		return (await p).status;
	} catch (err) {
		return (err as { status: number }).status;
	}
}

function upload(fields: Array<[string, string | File]>, user: User = owner) {
	const form = new FormData();
	for (const [k, v] of fields) form.append(k, v);
	const event = {
		params: { workspace: 'demo' },
		request: new Request('http://localhost/demo/-/images', { method: 'POST', body: form }),
		locals: locals(user)
	};
	return POST(event as unknown as Parameters<typeof POST>[0]);
}

function serve(file: string, user: User = owner) {
	const event = { params: { workspace: 'demo', path: file }, locals: locals(user) };
	return GET(event as unknown as Parameters<typeof GET>[0]);
}

const image = (bytes: Uint8Array<ArrayBuffer>, name: string, type = 'image/png') => new File([bytes], name, { type });

it('uploads and serves an image', async () => {
	const res = await upload([['doc', 'notes/report.md'], ['file', image(png, 'shot.png')]]);
	expect(res.status).toBe(201);
	const body = await res.json();
	expect(body).toEqual({ path: expect.stringMatching(/^notes\/report-[0-9a-f]{8}\.png$/), src: body.path.slice(6), alt: 'shot' });

	const served = await serve(body.path, reader);
	expect(served.status).toBe(200);
	expect(served.headers.get('content-type')).toBe('image/png');
	expect(served.headers.get('x-content-type-options')).toBe('nosniff');
	expect(served.headers.get('content-security-policy')).toBe("default-src 'none'");
	expect(served.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
	expect(Buffer.from(await served.arrayBuffer()).equals(png)).toBe(true);
});

it('refuses what is not an image', async () => {
	const svg = image(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml');
	const refused = await upload([['doc', 'notes/report.md'], ['file', svg]]);
	expect(refused.status).toBe(400);
	expect(await refused.json()).toEqual({ error: 'not-image' });

	const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
	big.set(png);
	expect(await status(upload([['doc', 'notes/report.md'], ['file', image(big, 'big.png')]]))).toBe(413);
	expect(await status(upload([['doc', 'notes/report.md']]))).toBe(400);
	expect(await status(upload([['doc', 'notes/missing.md'], ['file', image(png, 'a.png')]]))).toBe(404);

	// A body far over the cap is refused on its Content-Length, before it is read.
	const event = {
		params: { workspace: 'demo' },
		request: new Request('http://localhost/demo/-/images', {
			method: 'POST',
			headers: { 'content-length': String(MAX_IMAGE_BYTES * 2), 'content-type': 'multipart/form-data; boundary=x' },
			body: 'x'
		}),
		locals: locals(owner)
	};
	expect(await status(POST(event as unknown as Parameters<typeof POST>[0]))).toBe(413);

	// Without a length, reading stops at the cap.
	const chunk = new Uint8Array(1024 * 1024);
	let sent = 0;
	const stream = new ReadableStream({
		pull(controller) {
			if (sent++ < 8) controller.enqueue(chunk);
			else controller.close();
		}
	});
	event.request = new Request('http://localhost/demo/-/images', {
		method: 'POST',
		headers: { 'content-type': 'multipart/form-data; boundary=x' },
		body: stream,
		duplex: 'half'
	} as RequestInit);
	expect(await status(POST(event as unknown as Parameters<typeof POST>[0]))).toBe(413);
	expect(sent).toBeLessThan(8);
});

it('a reader cannot upload', async () => {
	expect(await status(upload([['doc', 'notes/report.md'], ['file', image(png, 'a.png')]], reader))).toBe(403);
});

it('a non-member gets 404 on serve', async () => {
	const { path: file } = await (await upload([['doc', 'notes/report.md'], ['file', image(png, 'a.png')]])).json();
	expect(await status(serve(file, stranger))).toBe(404);
	expect(await status(serve('notes/missing.png'))).toBe(404);
});
