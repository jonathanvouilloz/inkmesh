import { error } from '@sveltejs/kit';
import { loginFailed } from '#lib/core/accounts.ts';
import { sharedScope } from '#lib/core/publicLinks.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params, getClientAddress }) => {
	const scope = sharedScope(params.token);
	if (!scope) {
		loginFailed('share-miss|' + getClientAddress());
		error(404);
	}
	return {
		token: params.token,
		workspaceName: scope.workspace.name,
		path: scope.path,
		signup: !!scope.signupRole,
		// Only to build the Edit link; the members' route does its own check.
		slug: scope.workspace.slug
	};
};
