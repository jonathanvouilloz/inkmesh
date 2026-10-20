import { error, fail, redirect } from '@sveltejs/kit';
import {
	createInvitation,
	Forbidden,
	members,
	pendingInvitations,
	removeMember,
	revokeInvitation,
	ROLES,
	setRole,
	type Role,
	workspace
} from '#lib/core/access.ts';
import { hashToken, loginAllowed, loginFailed, validEmail } from '#lib/core/accounts.ts';
import type { TreeNode } from '#lib/core/documents.ts';
import { appUrl, invitationMail, mailEnabled, sendMail } from '#lib/core/mail.ts';
import { Conflict } from '#lib/core/paths.ts';
import {
	createPublicLink,
	publicLinks,
	revokePublicLink,
	setSignupRole,
	type SignupRole
} from '#lib/core/publicLinks.ts';
import { isNotFound, requireRole } from '#lib/server/guard.ts';
import type { Actions, PageServerLoad } from './$types';

const docPaths = (nodes: TreeNode[]): string[] =>
	nodes.flatMap((n) => (n.kind === 'doc' ? [n.path] : docPaths(n.children ?? [])));

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	const { tree } = await parent(); // the layouts' redirect and 404 come first
	const own = requireRole(params.workspace, locals, 'editor').role;
	return {
		...(own === 'owner' && {
			publicLinks: publicLinks(params.workspace, locals.actor!),
			documents: docPaths(tree),
			share: url.searchParams.get('share')
		}),
		members: members(params.workspace),
		mail: mailEnabled(),
		// The creator's id stays on the server; the page only learns whether it may revoke.
		pending: pendingInvitations(params.workspace).map(({ createdById, ...p }) => ({
			...p,
			canRevoke: own === 'owner' || createdById === locals.actor!.id
		})),
		// A link can grant at most the inviter's own role.
		roles: ROLES.slice(0, ROLES.indexOf(own) + 1)
	};
};

const role = (value: FormDataEntryValue | null): Role =>
	ROLES.includes(value as Role) ? (value as Role) : error(400);
const userId = (value: FormDataEntryValue | null): number =>
	/^\d{1,15}$/.test(String(value)) ? Number(value) : error(400);
// '' turns sign-up off.
const signup = (value: FormDataEntryValue | null): SignupRole | null =>
	value === '' ? null : value === 'reader' || value === 'editor' ? value : error(400);

// Core checks the owner rule itself; its refusals become 403, the last-owner guard a message.
function attempt(run: () => void, leaves = false) {
	try {
		run();
	} catch (err) {
		if (err instanceof Forbidden) error(403);
		if (err instanceof Conflict) return fail(409, { error: 'members.lastOwner' as const });
		throw err;
	}
	// An owner who removed or demoted themselves can no longer see this page.
	if (leaves) redirect(303, '/');
}

export const actions: Actions = {
	invite: async ({ params, locals, request, url }) => {
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		const wanted = role(form.get('role'));
		// Stored with the invitation, so the sign-up form starts with it.
		const field = form.get('email');
		const email = mailEnabled() && typeof field === 'string' ? field.trim() : '';
		const key = 'invite-mail|' + locals.actor!.id;
		// Checked before the invitation exists, so a refusal leaves no pending link behind.
		if (email && !validEmail(email)) return fail(400, { mailError: 'email' as const, email });
		if (email && !loginAllowed(key, 20)) return fail(429, { mailError: 'throttled' as const, email });
		let token: string;
		try {
			token = createInvitation(params.workspace, wanted, locals.actor!, email);
		} catch (err) {
			if (err instanceof Forbidden) error(403); // above the inviter's own role
			throw err;
		}
		// `invited` is the pending row's id, so the page can point at the new row.
		const [link, invited] = [url.origin + '/invite/' + token, hashToken(token)];
		if (!email) return { link, invited };
		loginFailed(key);
		const name = workspace(params.workspace)!.name;
		// The emailed link starts with INKMESH_URL, never the request's host.
		const mail = invitationMail(email, locals.actor!.name, name, wanted, appUrl() + '/invite/' + token, locals.locale);
		if (!(await sendMail(mail, 'invitation', locals.actor!.id))) return { link, invited, mailError: 'failed' as const, email };
		return { link, invited, mailed: email };
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
		const [id, wanted] = [userId(form.get('userId')), role(form.get('role'))];
		return attempt(
			() => setRole(params.workspace, id, wanted, locals.actor!),
			id === locals.actor!.id && wanted === 'reader'
		);
	},
	remove: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'editor');
		const id = userId((await request.formData()).get('userId'));
		return attempt(() => removeMember(params.workspace, id, locals.actor!), id === locals.actor!.id);
	},
	shareCreate: async ({ params, locals, request, url }) => {
		requireRole(params.workspace, locals, 'owner');
		const form = await request.formData();
		const signupRole = signup(form.get('signup'));
		const scope = String(form.get('scope') ?? '');
		try {
			const token = await createPublicLink(params.workspace, scope || null, signupRole, locals.actor!);
			return { shareUrl: url.origin + '/s/' + token };
		} catch (err) {
			if (isNotFound(err)) return fail(404, { shareError: 'missing' as const });
			throw err;
		}
	},
	shareSignup: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'owner');
		const form = await request.formData();
		setSignupRole(params.workspace, userId(form.get('id')), signup(form.get('signup')), locals.actor!);
	},
	shareRevoke: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'owner');
		revokePublicLink(params.workspace, userId((await request.formData()).get('id')), locals.actor!);
	}
};
