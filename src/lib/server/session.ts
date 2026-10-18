import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { createSession } from '#lib/core/accounts.ts';

export function startSession(cookies: Cookies, userId: number): void {
	cookies.set('inkmesh_session', createSession(userId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 60 * 60 * 24 * 30
	});
}
