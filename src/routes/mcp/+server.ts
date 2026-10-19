import { apiResponse, requireAgent, type ApiError } from '#lib/server/agent-api.ts';
import { mcpHandler } from '#lib/server/mcp.ts';
import type { RequestHandler } from './$types';

const handler: RequestHandler = (event) => {
	const { request, url } = event;
	// RFC 9728 §5.1: the challenge points the client to the protected resource metadata.
	const challenge = (err: ApiError): HeadersInit => {
		if (err.status !== 401) return {};
		const invalid = request.headers.has('authorization') ? ', error="invalid_token"' : '';
		const metadata = `${url.origin}/.well-known/oauth-protected-resource/mcp`;
		return { 'www-authenticate': `Bearer resource_metadata="${metadata}"${invalid}` };
	};
	return apiResponse(async () => {
		const { actor, agentId, expiresAt } = requireAgent(event, url.origin + '/mcp');
		const authInfo = { token: 'redacted', clientId: String(agentId), scopes: [], expiresAt, extra: { actor } };
		return mcpHandler.fetch(request, { authInfo });
	}, challenge);
};

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
