import { error, json } from '@sveltejs/kit';
import { saveImage, MAX_IMAGE_BYTES } from '#lib/core/images.ts';
import { InvalidContent, InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { RequestHandler } from './$types';

// The image plus the multipart framing and the doc field.
const MAX_BODY = MAX_IMAGE_BYTES + 64 * 1024;
const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);
const tooLarge = () => json({ error: 'too-large' }, { status: 413 });

export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireRole(params.workspace, locals, 'editor');
	// Refused before buffering: on the announced length, then on the bytes actually read.
	if (Number(request.headers.get('content-length')) > MAX_BODY) return tooLarge();
	let read = 0;
	const body = request.body?.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				read += chunk.byteLength;
				if (read > MAX_BODY) controller.error(new Error('too large'));
				else controller.enqueue(chunk);
			}
		})
	);
	let form: FormData;
	try {
		form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData();
	} catch {
		if (read > MAX_BODY) return tooLarge();
		error(400);
	}
	const doc = form.get('doc');
	const file = form.get('file');
	if (typeof doc !== 'string' || !(file instanceof File)) error(400);
	try {
		const saved = await saveImage(params.workspace, doc, file.name, new Uint8Array(await file.arrayBuffer()), locals.actor!);
		return json(saved, { status: 201 });
	} catch (err) {
		if (err instanceof InvalidContent)
			return err.message === 'too-large' ? tooLarge() : json({ error: 'not-image' }, { status: 400 });
		if (err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? '')) error(404);
		throw err;
	}
};
