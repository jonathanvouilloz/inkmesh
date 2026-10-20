import { error } from '@sveltejs/kit';
import { readDocument } from '#lib/core/documents.ts';
import { extensionType, readImage } from '#lib/core/images.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import { downloadResponse, imageResponse } from '#lib/server/raw.ts';
import type { RequestHandler } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export const GET: RequestHandler = async ({ params, locals }) => {
	requireRole(params.workspace, locals, 'reader');
	try {
		if (extensionType(params.path)) {
			// readImage checks the signature on every serve; the content type comes from it, never from the name.
			const { bytes, type } = await readImage(params.workspace, params.path, locals.actor!);
			return imageResponse(bytes, type);
		}
		const { source } = await readDocument(params.workspace, params.path, locals.actor!);
		return downloadResponse(params.path, source);
	} catch (err) {
		if (err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
};
