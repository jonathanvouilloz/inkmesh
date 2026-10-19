import { error } from '@sveltejs/kit';
import { readDocument } from '#lib/core/documents.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { RequestHandler } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export const GET: RequestHandler = async ({ params, locals }) => {
	requireRole(params.workspace, locals, 'reader');
	let source: string;
	try {
		({ source } = await readDocument(params.workspace, params.path, locals.actor!));
	} catch (err) {
		if (err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
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
};
