import { redirect } from '@sveltejs/kit';
import { deleteSession } from '#lib/core/accounts.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		const token = cookies.get('inkmesh_session');
		if (token) deleteSession(token);
		cookies.delete('inkmesh_session', { path: '/' });
		redirect(303, '/login');
	}
};
