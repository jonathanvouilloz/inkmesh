import type { RequestHandler } from './$types';

// Every unknown /api path stops here, so none reaches the cookie-authenticated [workspace] routes.
export const fallback: RequestHandler = () =>
	Response.json({ error: { code: 'not_found', message: 'not found' } }, { status: 404 });
