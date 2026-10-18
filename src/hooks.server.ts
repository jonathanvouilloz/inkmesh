import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { sessionUser } from '#lib/core/accounts.ts';
import { db } from '#lib/core/db.ts';
import { assertGit } from '#lib/core/git.ts';

export const init: ServerInit = async () => {
	db();
	await assertGit();
};

export const handle: Handle = ({ event, resolve }) => {
	const locale = event.request.headers.get('accept-language')?.startsWith('fr') ? 'fr' : 'en';
	event.locals.locale = locale;
	const token = event.cookies.get('inkmesh_session');
	const user = token ? sessionUser(token) : null;
	// An expired or unknown token would otherwise be sent on every request.
	if (token && !user) event.cookies.delete('inkmesh_session', { path: '/' });
	event.locals.user = user;
	event.locals.actor = user && { id: user.id, name: user.name };
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
};
