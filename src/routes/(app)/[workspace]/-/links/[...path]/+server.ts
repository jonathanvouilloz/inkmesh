import { error, json } from '@sveltejs/kit';
import { linksTo } from '#lib/core/documents.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { RequestHandler } from './$types';

/** How many other documents a move of this document or folder would rewrite; asked when a dialog opens. */
export const GET: RequestHandler = async ({ params, locals }) => {
	requireRole(params.workspace, locals, 'reader');
	try {
		return json({ count: (await linksTo(params.workspace, params.path, locals.actor!)).length });
	} catch (err) {
		if (err instanceof InvalidPath) error(404);
		throw err;
	}
};
