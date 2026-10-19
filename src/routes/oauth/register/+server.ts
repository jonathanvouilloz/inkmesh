import { loginAllowed, loginFailed } from '#lib/core/accounts.ts';
import { OAuthError, registerClient } from '#lib/core/oauth.ts';
import { InvalidContent } from '#lib/core/paths.ts';
import { readBody } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

const MAX_BODY = 16 * 1024;
// Anthropic's connector egress IPs are shared by every Claude user of the instance.
const MAX_REGISTRATIONS = 100;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Every registration counts, not only failures: each one adds a row.
	const key = 'register|' + getClientAddress();
	if (!loginAllowed(key, MAX_REGISTRATIONS)) return Response.json({ error: 'too_many_requests' }, { status: 429 });
	loginFailed(key);
	let meta: unknown;
	try {
		meta = JSON.parse(new TextDecoder().decode(await readBody(request, MAX_BODY)));
	} catch (err) {
		const tooLarge = err instanceof InvalidContent;
		return Response.json(
			{
				error: 'invalid_client_metadata',
				error_description: tooLarge ? 'the body is larger than 16 KiB' : 'the body must be JSON'
			},
			{ status: tooLarge ? 413 : 400 }
		);
	}
	try {
		const client = registerClient(meta);
		return Response.json(
			{
				client_id: client.clientId,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				client_name: client.name,
				redirect_uris: client.redirectUris,
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none'
			},
			{ status: 201 }
		);
	} catch (err) {
		if (!(err instanceof OAuthError)) throw err;
		return Response.json({ error: err.code, error_description: err.message }, { status: 400 });
	}
};
