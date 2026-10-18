import { redirect } from '@sveltejs/kit';

// shortcut: the root opens the seeded demo workspace until the home page lists the user's workspaces.
export const load = () => redirect(307, '/demo');
