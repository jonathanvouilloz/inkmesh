import { loginAllowed, loginFailed } from '#lib/core/accounts.ts';
import { exchangeCode, OAuthError, refreshTokens } from '#lib/core/oauth.ts';
import type { RequestHandler } from './$types';

// Anthropic's connector egress IPs are shared by every Claude user of the instance.
const MAX_FAILURES = 50;

const answer = (body: object, status = 200) =>
	Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	try {
		const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
		if (type !== 'application/x-www-form-urlencoded')
			throw new OAuthError('invalid_request', 'the body must be application/x-www-form-urlencoded');
		const form = await request.formData().catch(() => {
			throw new OAuthError('invalid_request', 'the body is not valid form data');
		});
		const field = (name: string) => {
			const value = form.get(name);
			if (typeof value !== 'string' || !value) throw new OAuthError('invalid_request', `${name} is required`);
			return value;
		};
		const resource = form.get('resource')?.toString();
		// RFC 8707: this server only issues tokens for its own MCP endpoint.
		if (resource !== undefined && resource !== url.origin + '/mcp')
			throw new OAuthError('invalid_target', `resource must be ${url.origin}/mcp`);
		const grant = field('grant_type');
		if (grant === 'authorization_code')
			return answer(
				exchangeCode({
					code: field('code'),
					clientId: field('client_id'),
					redirectUri: field('redirect_uri'),
					codeVerifier: field('code_verifier'),
					resource
				})
			);
		if (grant === 'refresh_token')
			return answer(refreshTokens({ refreshToken: field('refresh_token'), clientId: field('client_id'), resource }));
		throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
	} catch (err) {
		if (!(err instanceof OAuthError)) throw err;
		// Checked after the grant: failures from a shared IP must not lock out valid codes and refreshes.
		const key = 'token|' + getClientAddress();
		if (!loginAllowed(key, MAX_FAILURES)) return answer({ error: 'too_many_requests' }, 429);
		loginFailed(key);
		return answer({ error: err.code, error_description: err.message }, 400);
	}
};
