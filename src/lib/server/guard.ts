import { error } from '@sveltejs/kit';
import { assertRole, Forbidden, type Membership, type Role } from '#lib/core/access.ts';
import { InvalidPath } from '#lib/core/paths.ts';

const MISSING = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

/** A path that is invalid or not there: what every route answers with a 404. */
export const isNotFound = (err: unknown) =>
	err instanceof InvalidPath || MISSING.has((err as { code?: unknown } | null)?.code as string);

/** `error(404)` when `err` is a not-found; anything else is rethrown. */
export function notFoundOn(err: unknown): never {
	if (isNotFound(err)) error(404);
	throw err;
}

// Actions run before layouts, so a missing actor here is a 401, not the (app) layout's redirect.
export function requireRole(slug: string, locals: App.Locals, min: Role): Membership {
	if (!locals.actor) error(401);
	try {
		return assertRole(slug, locals.actor, min);
	} catch (err) {
		if (err instanceof Forbidden) error(err.message === 'not a member' ? 404 : 403);
		throw err;
	}
}
