import { fail, redirect } from '@sveltejs/kit';
import { consumeLoginLink, deleteSession, loginLinkUser } from '#lib/core/accounts.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

// The GET only reads: mail scanners and link previews open the link without using it.
export const load: PageServerLoad = ({ params }) => ({ email: loginLinkUser(params.token)?.email ?? null });

export const actions: Actions = {
	default: ({ params, cookies }) => {
		const used = consumeLoginLink(params.token);
		if (!used) return fail(410, { expired: true as const });
		// Already signed in (maybe as someone else): the old session would otherwise stay valid in the database.
		const old = cookies.get('inkmesh_session');
		if (old) deleteSession(old);
		startSession(cookies, used.user.id);
		// `next` went through safeNext when the link was created.
		redirect(303, used.next);
	}
};
