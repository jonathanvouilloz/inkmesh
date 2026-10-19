/** RFC 9728 protected resource metadata for `<origin>/mcp`. */
export const protectedResource = (origin: string) => ({
	resource: `${origin}/mcp`,
	authorization_servers: [origin],
	bearer_methods_supported: ['header'],
	resource_name: 'inkmesh'
});

/** RFC 8414 authorisation server metadata; no `scopes_supported`, as there are no scopes. */
export const authorizationServer = (origin: string) => ({
	issuer: origin,
	authorization_endpoint: `${origin}/oauth/authorize`,
	token_endpoint: `${origin}/oauth/token`,
	registration_endpoint: `${origin}/oauth/register`,
	response_types_supported: ['code'],
	grant_types_supported: ['authorization_code', 'refresh_token'],
	code_challenge_methods_supported: ['S256'],
	token_endpoint_auth_methods_supported: ['none'],
	authorization_response_iss_parameter_supported: true
});

export const jsonDocument = (body: object): Response =>
	new Response(JSON.stringify(body), {
		headers: {
			'content-type': 'application/json',
			'access-control-allow-origin': '*',
			'cache-control': 'max-age=3600'
		}
	});
