import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = ({ event, resolve }) => {
	const locale = event.request.headers.get('accept-language')?.startsWith('fr') ? 'fr' : 'en';
	event.locals.locale = locale;
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
};
