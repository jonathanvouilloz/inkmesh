import { redirect } from '@sveltejs/kit';
import { workspacesOf } from '#lib/core/access.ts';
import { unreadCount } from '#lib/core/inbox.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, '/login?next=' + encodeURIComponent(url.pathname + url.search));
	return { user: locals.user, workspaces: workspacesOf(locals.user.id), unread: unreadCount(locals.user.id) };
};
