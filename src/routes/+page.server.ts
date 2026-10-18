import { redirect } from '@sveltejs/kit';

// shortcut: single workspace, see (app)/[workspace]/+layout.server.ts
export const load = () => redirect(307, '/demo');
