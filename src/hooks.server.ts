import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { sessionUser } from '#lib/core/accounts.ts';
import { db } from '#lib/core/db.ts';
import { assertGit } from '#lib/core/git.ts';
import { rebuildIndex } from '#lib/core/search.ts';
import { commitAllSessions } from '#lib/core/sessions.ts';
import { crossSiteForbidden, isAgentPath } from '#lib/server/csrf.ts';

export const init: ServerInit = async () => {
	db();
	await assertGit();
	// Sessions left by a crash are committed, with their author, before any request.
	const recovered = await commitAllSessions();
	if (recovered > 0) console.log(`committed ${recovered} editing session(s) left open`);
	// Files changed outside core (an agent with shell access) are only seen here.
	console.log(`search index: ${await rebuildIndex()} document(s)`);
	process.once('sveltekit:shutdown', () =>
		commitAllSessions()
			.then((made) => {
				if (made > 0) console.log(`committed ${made} editing session(s) at shutdown`);
			})
			.catch((err) => console.error('editing sessions: shutdown commit failed', err))
	);
};

export const handle: Handle = async ({ event, resolve }) => {
	if (crossSiteForbidden(event.request, event.url))
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	const locale = event.request.headers.get('accept-language')?.startsWith('fr') ? 'fr' : 'en';
	event.locals.locale = locale;
	const token = isAgentPath(event.url.pathname) ? undefined : event.cookies.get('inkmesh_session');
	const user = token ? sessionUser(token) : null;
	// An expired or unknown token would otherwise be sent on every request.
	if (token && !user) event.cookies.delete('inkmesh_session', { path: '/' });
	event.locals.user = user;
	event.locals.actor = user && { id: user.id, name: user.name };
	const response = await resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
	// The consent screen cannot be framed, whatever renders it (page, failed action, error page).
	if (event.route.id === '/(app)/oauth/authorize') {
		response.headers.set('x-frame-options', 'DENY');
		response.headers.set('content-security-policy', "frame-ancestors 'none'");
	}
	return response;
};
