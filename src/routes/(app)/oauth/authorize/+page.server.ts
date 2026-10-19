import { error, fail, redirect } from '@sveltejs/kit';
import { agentName } from '#lib/core/agents.ts';
import { issueCode, oauthClient, redirectAllowed, type OAuthClient } from '#lib/core/oauth.ts';
import type { Actions, PageServerLoad } from './$types';

type Valid = { client: OAuthClient; redirectUri: string; state: string | null; codeChallenge: string; resource: string };

// RFC 9207: every authorisation response names its issuer. Only built from a redirect_uri the client
// registered (_validateRequest checks it first), hence the external redirects below.
function answer(redirectUri: string, state: string | null, origin: string, fields: Record<string, string>): string {
	const params = new URLSearchParams(fields);
	if (state !== null) params.set('state', state);
	params.set('iss', origin);
	return redirectUri + (redirectUri.includes('?') ? '&' : '?') + params;
}

export function _validateRequest(params: URLSearchParams, origin: string): Valid | { page: 'invalid' } | { redirect: string } {
	const client = oauthClient(params.get('client_id') ?? '');
	const redirectUri = params.get('redirect_uri');
	if (!client || !redirectUri || !redirectAllowed(client, redirectUri)) return { page: 'invalid' };
	const state = params.get('state');
	const refuse = (code: string) => ({ redirect: answer(redirectUri, state, origin, { error: code }) });
	if (params.get('response_type') !== 'code') return refuse('unsupported_response_type');
	const codeChallenge = params.get('code_challenge');
	// An S256 challenge is base64url(sha256), 43 characters.
	if (!codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || params.get('code_challenge_method') !== 'S256')
		return refuse('invalid_request');
	const resource = params.get('resource') ?? origin + '/mcp';
	if (resource !== origin + '/mcp') return refuse('invalid_target');
	return { client, redirectUri, state, codeChallenge, resource };
}

function validOrThrow(params: URLSearchParams, origin: string, status: 302 | 303): Valid {
	const result = _validateRequest(params, origin);
	if ('page' in result) error(400, 'invalid');
	if ('redirect' in result) redirect(status, result.redirect, { external: true });
	return result;
}

export const load: PageServerLoad = async ({ url, parent, setHeaders }) => {
	await parent(); // the (app) layout sends anonymous visitors to /login first
	setHeaders({ 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
	const { client, redirectUri } = validOrThrow(url.searchParams, url.origin, 302);
	const target = new URL(redirectUri);
	return {
		clientName: client.name,
		redirectHost: target.host,
		loopback: target.protocol === 'http:',
		// Client names go up to 100 characters, agent names to 40.
		suggestedName: client.name.slice(0, 40).trim(),
		// Without the action key ("/allow") a failed action leaves in the URL.
		params: Object.fromEntries([...url.searchParams].filter(([key]) => !key.startsWith('/')))
	};
};

export const actions: Actions = {
	// Actions run before the (app) layout, so each one checks the session itself. The forms post to
	// the consent URL itself, so the page load re-runs on the same query when an action fails.
	allow: async ({ request, locals, url }) => {
		if (!locals.user) error(401);
		const valid = validOrThrow(url.searchParams, url.origin, 303);
		const field = (await request.formData()).get('name');
		const typed = typeof field === 'string' ? field : '';
		let name: string;
		try {
			name = agentName(typed);
		} catch {
			return fail(400, { nameError: true, name: typed });
		}
		const code = issueCode({
			clientId: valid.client.clientId,
			redirectUri: valid.redirectUri,
			codeChallenge: valid.codeChallenge,
			resource: valid.resource,
			userId: locals.user.id,
			agentName: name
		});
		redirect(303, answer(valid.redirectUri, valid.state, url.origin, { code }), { external: true });
	},
	deny: async ({ locals, url }) => {
		if (!locals.user) error(401);
		const valid = validOrThrow(url.searchParams, url.origin, 303);
		redirect(303, answer(valid.redirectUri, valid.state, url.origin, { error: 'access_denied' }), {
			external: true
		});
	}
};
