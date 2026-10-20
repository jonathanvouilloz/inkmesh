import { error } from '@sveltejs/kit';
import { digestOn } from '#lib/core/digest.ts';
import { inbox, markRead } from '#lib/core/inbox.ts';
import { mailEnabled } from '#lib/core/mail.ts';
import type { Actions, PageServerLoad } from './$types';

// Always the session's user, never an id from the request.
export const load: PageServerLoad = async ({ locals, parent }) => {
	await parent(); // the layout's sign-in redirect comes first
	return { items: inbox(locals.user!.id), digestHint: mailEnabled() && !digestOn(locals.user!.id) };
};

export const actions: Actions = {
	read: async ({ request, locals }) => {
		if (!locals.user) error(401);
		const upTo = (await request.formData()).get('upTo');
		if (typeof upTo !== 'string' || !/^\d+$/.test(upTo)) error(400);
		markRead(locals.user.id, Number(upTo));
		return {};
	}
};
