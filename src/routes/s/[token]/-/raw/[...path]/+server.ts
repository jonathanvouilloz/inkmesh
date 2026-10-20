import { error } from '@sveltejs/kit';
import { Forbidden } from '#lib/core/access.ts';
import { loginFailed } from '#lib/core/accounts.ts';
import { sharedFile, sharedScope } from '#lib/core/publicLinks.ts';
import { notFoundOn } from '#lib/server/guard.ts';
import { downloadResponse, imageResponse } from '#lib/server/raw.ts';
import type { RequestHandler } from './$types';

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
		// Out of the link's scope answers like an unknown path.
		if (err instanceof Forbidden) error(404);
		notFoundOn(err);
	}
};
