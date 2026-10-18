import { error, fail } from '@sveltejs/kit';
import {
	createInvitation,
	Forbidden,
	members,
	pendingInvitations,
	removeMember,
	revokeInvitation,
	ROLES,
	setRole,
	type Role
} from '#lib/core/access.ts';
import { Conflict } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	await parent(); // the layouts' redirect and 404 come first
	const own = requireRole(params.workspace, locals, 'editor').role;
	return {
		members: members(params.workspace),
		pending: pendingInvitations(params.workspace),
		// A link can grant at most the inviter's own role.
		roles: ROLES.slice(0, ROLES.indexOf(own) + 1)
	};
};

const role = (value: FormDataEntryValue | null): Role =>
	ROLES.includes(value as Role) ? (value as Role) : error(400);
const userId = (value: FormDataEntryValue | null): number =>
	/^\d{1,15}$/.test(String(value)) ? Number(value) : error(400);

// Core checks the owner rule itself; its refusals become 403, the last-owner guard a message.
function attempt(run: () => void) {
	try {
		run();
	} catch (err) {
		if (err instanceof Forbidden) error(403);
		if (err instanceof Conflict) return fail(409, { error: 'members.lastOwner' as const });
		throw err;
	}
}

export const actions: Actions = {
	invite: async ({ params, locals, request, url }) => {
		requireRole(params.workspace, locals, 'editor');
		const wanted = role((await request.formData()).get('role'));
		try {
			return { link: url.origin + '/invite/' + createInvitation(params.workspace, wanted, locals.actor!) };
		} catch (err) {
			if (err instanceof Forbidden) error(403); // above the inviter's own role
			throw err;
		}
	},
	revoke: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'editor');
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string') error(400);
		return attempt(() => revokeInvitation(params.workspace, id, locals.actor!));
	},
	setRole: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		return attempt(() =>
			setRole(params.workspace, userId(form.get('userId')), role(form.get('role')), locals.actor!)
		);
	},
	remove: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		return attempt(() => removeMember(params.workspace, userId(form.get('userId')), locals.actor!));
	}
};
