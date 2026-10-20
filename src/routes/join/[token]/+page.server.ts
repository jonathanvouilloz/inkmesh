import { error, fail, redirect } from '@sveltejs/kit';
import { loginAllowed, loginFailed } from '#lib/core/accounts.ts';
import { Conflict } from '#lib/core/paths.ts';
import { joinByLink, joinByLinkAsNewUser, sharedScope } from '#lib/core/publicLinks.ts';
import { signup } from '#lib/server/signup.ts';
import { docHref } from '#lib/ui/href.ts';
import type { Actions, PageServerLoad } from './$types';

/** The link's workspace and sign-up role, or null when it is unknown, revoked or closed to sign-up. */
function link(token: string) {
	const scope = sharedScope(token);
	return scope?.signupRole ? { workspaceName: scope.workspace.name, role: scope.signupRole } : null;
}

const landing = (joined: { workspace: { slug: string }; path: string | null }) =>
	joined.path ? docHref(joined.workspace.slug, joined.path) : '/' + joined.workspace.slug;

// Never returns the token: it stays in the URL.
export const load: PageServerLoad = ({ params, locals, url }) => {
	// From the sign-in links of SignupForm.
	if (url.searchParams.has('signin')) redirect(303, '/login?next=' + encodeURIComponent(url.pathname));
	return { link: link(params.token), user: locals.user };
};

export const actions: Actions = {
	join: ({ params, locals }) => {
		if (!locals.user) error(401);
		let joined;
		try {
			joined = joinByLink(params.token, locals.user.id);
		} catch (err) {
			if (err instanceof Conflict) return fail(410, { error: 'join.closed' as const });
			throw err;
		}
		redirect(303, landing(joined));
	},
	signup: async ({ params, request, cookies, locals, getClientAddress }) => {
		if (locals.user) error(400); // a signed-in visitor joins instead
		const key = 'join|' + getClientAddress();
		if (!loginAllowed(key)) return fail(429, { error: 'join.tooMany' as const });
		loginFailed(key);
		return signup(
			await request.formData(),
			cookies,
			'join.closed',
			() => !!link(params.token),
			(input) => joinByLinkAsNewUser(params.token, input),
			(joined) => landing(joined)
		);
	}
};
