import { error } from '@sveltejs/kit';
import { readDocument } from '#lib/core/documents.ts';
import { CONTENT_TYPES, extensionType, readImage } from '#lib/core/images.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { RequestHandler } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export const GET: RequestHandler = async ({ params, locals }) => {
	requireRole(params.workspace, locals, 'reader');
	try {
		if (extensionType(params.path)) {
			// readImage checks the signature on every serve; the content type comes from it, never from the name.
			const { bytes, type } = await readImage(params.workspace, params.path, locals.actor!);
			return new Response(new Uint8Array(bytes), {
				headers: {
					'content-type': CONTENT_TYPES[type],
					'x-content-type-options': 'nosniff',
					'content-security-policy': "default-src 'none'",
					'cache-control': 'private, max-age=0, must-revalidate'
				}
			});
		}
		const { source } = await readDocument(params.workspace, params.path, locals.actor!);
		// RFC 5987 also reserves ' ( ) *, which encodeURIComponent leaves alone.
		const name = encodeURIComponent(params.path.split('/').pop()!).replace(
			/['()*]/g,
			(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
		);
		return new Response(source, {
			headers: {
				'content-type': 'text/markdown; charset=utf-8',
				'content-disposition': `attachment; filename*=UTF-8''${name}`
			}
		});
	} catch (err) {
		if (err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
};
