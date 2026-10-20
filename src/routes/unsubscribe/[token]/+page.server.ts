import { error } from '@sveltejs/kit';
import { stopDigest, unsubscribeUser } from '#lib/core/digest.ts';
import type { Actions, PageServerLoad } from './$types';

// The GET only reads: mail scanners open the link without stopping anything. No session: the token alone acts.
export const load: PageServerLoad = ({ params }) => ({ valid: unsubscribeUser(params.token) !== null });

export const actions: Actions = {
	default: ({ params }) => {
		if (!stopDigest(params.token)) error(404);
		return { done: true as const };
	}
};
