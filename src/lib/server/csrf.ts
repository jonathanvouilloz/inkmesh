// SvelteKit's origin check (turned off in vite.config.ts) without the cookie-free agent endpoints.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// The form types SvelteKit 3.1 guards, its own binary form type included.
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/x-sveltekit-formdata'];
const AGENT_PATH = /^\/(api\/|mcp(\/|$)|oauth\/(token|register)$)/;

export function crossSiteForbidden(request: Request, url: URL): boolean {
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	return (
		MUTATING.has(request.method) &&
		(!type || FORM_TYPES.includes(type)) &&
		request.headers.get('origin') !== url.origin &&
		!AGENT_PATH.test(url.pathname)
	);
}
