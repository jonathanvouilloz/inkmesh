import { error, fail, redirect } from '@sveltejs/kit';
import { acceptInvitation, acceptInvitationAsNewUser, invitation } from '#lib/core/access.ts';
import { Conflict } from '#lib/core/paths.ts';
import { signup } from '#lib/server/signup.ts';
import type { Actions, PageServerLoad } from './$types';

// Never returns the token: it stays in the URL. An invalid token renders the "no longer valid" state.
export const load: PageServerLoad = ({ params, locals, url }) => {
	if (url.searchParams.has('signin')) redirect(303, '/login?next=' + encodeURIComponent(url.pathname));
	return { invitation: invitation(params.token), user: locals.user };
};

function accept(token: string, userId: number) {
	try {
		return acceptInvitation(token, userId);
	} catch (err) {
		if (err instanceof Conflict) return null;
		throw err;
	}
}

export const actions: Actions = {
	join: ({ params, locals }) => {
		if (!locals.user) error(401);
		const joined = accept(params.token, locals.user.id);
		if (!joined) return fail(410, { error: 'invite.invalid' as const });
		redirect(303, '/' + joined.slug);
	},
	signup: async ({ params, request, cookies, locals }) => {
		if (locals.user) error(400); // a signed-in visitor joins instead
		return signup(
			await request.formData(),
			cookies,
			'invite.invalid',
			() => !!invitation(params.token),
			(input) => acceptInvitationAsNewUser(params.token, input),
			(created) => '/' + created.workspace.slug
		);
	}
};
