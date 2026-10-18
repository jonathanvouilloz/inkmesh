import { error } from '@sveltejs/kit';
import { assertRole, Forbidden, type Membership, type Role } from '#lib/core/access.ts';

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
