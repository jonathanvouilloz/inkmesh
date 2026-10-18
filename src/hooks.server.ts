import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = ({ event, resolve }) => {
	event.locals.locale = event.request.headers.get('accept-language')?.startsWith('fr') ? 'fr' : 'en';
	return resolve(event);
};
