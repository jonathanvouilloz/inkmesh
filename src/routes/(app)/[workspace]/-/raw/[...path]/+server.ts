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
	const name = params.path.split('/').pop()!;
	return new Response(source, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
		}
	});
};
