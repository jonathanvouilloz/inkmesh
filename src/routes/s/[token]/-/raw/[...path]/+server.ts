import { error } from '@sveltejs/kit';
import { Forbidden } from '#lib/core/access.ts';
import { loginFailed } from '#lib/core/accounts.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import { sharedFile, sharedScope } from '#lib/core/publicLinks.ts';
import { downloadResponse, imageResponse } from '#lib/server/raw.ts';
import type { RequestHandler } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	if (!sharedScope(params.token)) {
		loginFailed('share-miss|' + getClientAddress());
		error(404);
	}
	try {
		// sharedFile checks the link's scope and, for an image, its signature.
		const file = await sharedFile(params.token, params.path);
		return file.kind === 'doc' ? downloadResponse(params.path, file.source) : imageResponse(file.bytes, file.type);
	} catch (err) {
		if (err instanceof Forbidden || err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
};
