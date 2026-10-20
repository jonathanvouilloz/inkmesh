import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { loginAllowed, loginFailed, sessionUser } from '#lib/core/accounts.ts';
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

// Every public link response: the token is in the URL, revocation is immediate, and the page runs nothing.
const PUBLIC_HEADERS = {
	'x-robots-tag': 'noindex, nofollow',
	'referrer-policy': 'no-referrer',
	'cache-control': 'no-store',
	'x-frame-options': 'DENY',
	'content-security-policy':
		"default-src 'none'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};

export const handle: Handle = async ({ event, resolve }) => {
	if (crossSiteForbidden(event.request, event.url))
		return new Response('Cross-site form submissions are forbidden', { status: 403 });
	const locale = event.request.headers.get('accept-language')?.startsWith('fr') ? 'fr' : 'en';
	event.locals.locale = locale;
	const render = { transformPageChunk: ({ html }: { html: string }) => html.replace('%lang%', locale) };
	// Public links: no session, the cookie is never read nor set (the routes count unknown tokens in share-miss).
	if (event.url.pathname.startsWith('/s/')) {
		event.locals.user = null;
		event.locals.actor = null;
		const ip = event.getClientAddress();
		let response: Response;
		if (!loginAllowed('share|' + ip, 300) || !loginAllowed('share-miss|' + ip))
			response = new Response(null, { status: 429 });
		else {
			loginFailed('share|' + ip);
			response = await resolve(event, render);
		}
		for (const [name, value] of Object.entries(PUBLIC_HEADERS)) response.headers.set(name, value);
		return response;
	}
	const token = isAgentPath(event.url.pathname) ? undefined : event.cookies.get('inkmesh_session');
	const user = token ? sessionUser(token) : null;
	// An expired or unknown token would otherwise be sent on every request.
	if (token && !user) event.cookies.delete('inkmesh_session', { path: '/' });
	event.locals.user = user;
	event.locals.actor = user && { id: user.id, name: user.name };
	const response = await resolve(event, render);
	// Join and invitation links carry their token in the URL too: never sent to another site, cached or indexed.
	// same-origin, not no-referrer: under no-referrer the sign-up POST would send `Origin: null` and fail the CSRF check.
	if (/^\/(join|invite)\//.test(event.url.pathname)) {
		response.headers.set('referrer-policy', 'same-origin');
		response.headers.set('cache-control', 'no-store');
		response.headers.set('x-robots-tag', PUBLIC_HEADERS['x-robots-tag']);
	}
	// The consent screen cannot be framed, whatever renders it (page, failed action, error page).
	if (event.route.id === '/(app)/oauth/authorize') {
		response.headers.set('x-frame-options', 'DENY');
		response.headers.set('content-security-policy', "frame-ancestors 'none'");
	}
	return response;
};
