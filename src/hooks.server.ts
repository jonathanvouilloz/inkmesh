import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { assertGit } from '#lib/core/git.ts';

export const init: ServerInit = assertGit;

export const handle: Handle = ({ event, resolve }) => {
	const locale = event.request.headers.get('accept-language')?.startsWith('fr') ? 'fr' : 'en';
	event.locals.locale = locale;
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
};
