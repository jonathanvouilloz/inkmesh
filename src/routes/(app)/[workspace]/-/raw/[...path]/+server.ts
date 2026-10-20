import { readDocument } from '#lib/core/documents.ts';
import { extensionType, readImage } from '#lib/core/images.ts';
import { notFoundOn, requireRole } from '#lib/server/guard.ts';
import { downloadResponse, imageResponse } from '#lib/server/raw.ts';
import type { RequestHandler } from './$types';

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
		notFoundOn(err);
	}
};
