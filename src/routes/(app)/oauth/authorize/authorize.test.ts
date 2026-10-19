import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createUser, type User } from '#lib/core/accounts.ts';
import { authenticateToken } from '#lib/core/agents.ts';
import { closeDb } from '#lib/core/db.ts';
import { exchangeCode, registerClient, type OAuthClient } from '#lib/core/oauth.ts';
import { actions, load, _validateRequest } from './+page.server.ts';

const ORIGIN = 'http://localhost';
const CALLBACK = 'https://client.test/callback';
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
let data: string;
let jon: User;
let client: OAuthClient;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-authorize-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	client = registerClient({ redirect_uris: [CALLBACK, 'http://localhost:1/callback'], client_name: 'Claude' });
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const query = (extra: Record<string, string> = {}) =>
	new URLSearchParams({
		response_type: 'code',
		client_id: client.clientId,
		redirect_uri: CALLBACK,
		code_challenge: CHALLENGE,
		code_challenge_method: 'S256',
		state: 's1',
		...extra
	});

// The action's answer: what it returns (a failure) or throws (a redirect or an error).
async function settle(fn: () => unknown): Promise<unknown> {
	try {
		return await fn();
	} catch (err) {
		return err;
	}
}

function post(name: 'allow' | 'deny', params: URLSearchParams, fields: Record<string, string> = {}) {
	const url = new URL(`/oauth/authorize?${params}&/${name}`, ORIGIN);
	const request = new Request(url, { method: 'POST', body: new URLSearchParams(fields) });
	return settle(() => actions[name]({ request, url, locals: { user: jon } } as never));
}

it('never redirects to an unregistered URI', () => {
	expect(_validateRequest(query({ client_id: 'nope' }), ORIGIN)).toEqual({ page: 'invalid' });
	expect(_validateRequest(query({ redirect_uri: 'https://evil.example/cb' }), ORIGIN)).toEqual({ page: 'invalid' });
	expect(_validateRequest(query({ redirect_uri: CALLBACK + '#x' }), ORIGIN)).toEqual({ page: 'invalid' });
	const params = query();
	params.delete('redirect_uri');
	expect(_validateRequest(params, ORIGIN)).toEqual({ page: 'invalid' });
});

it('redirects protocol errors with state and iss', () => {
	const errorOf = (params: URLSearchParams) => {
		const result = _validateRequest(params, ORIGIN);
		if (!('redirect' in result)) throw new Error('expected a redirect');
		const url = new URL(result.redirect);
		expect(url.origin + url.pathname).toBe(CALLBACK);
		expect(url.searchParams.get('state')).toBe('s1');
		expect(url.searchParams.get('iss')).toBe(ORIGIN);
		return url.searchParams.get('error');
	};
	const missing = query();
	missing.delete('code_challenge');
	expect(errorOf(missing)).toBe('invalid_request');
	expect(errorOf(query({ code_challenge_method: 'plain' }))).toBe('invalid_request');
	expect(errorOf(query({ response_type: 'token' }))).toBe('unsupported_response_type');
	expect(errorOf(query({ resource: 'https://other/mcp' }))).toBe('invalid_target');
	expect(_validateRequest(query({ resource: ORIGIN + '/mcp' }), ORIGIN)).toMatchObject({ resource: ORIGIN + '/mcp' });
	expect(_validateRequest(query(), ORIGIN)).toMatchObject({ redirectUri: CALLBACK, state: 's1', codeChallenge: CHALLENGE });
});

it('allow issues a code for the named agent', async () => {
	expect(await post('allow', query(), { name: '<b>' })).toMatchObject({
		status: 400,
		data: { nameError: true }
	});
	const res = await post('allow', query(), { name: '  My Claude ' });
	if (!isRedirect(res)) throw res;
	expect(res.status).toBe(303);
	const url = new URL(res.location);
	expect(url.origin + url.pathname).toBe(CALLBACK);
	expect(url.searchParams.get('state')).toBe('s1');
	expect(url.searchParams.get('iss')).toBe(ORIGIN);
	const tokens = exchangeCode({
		code: url.searchParams.get('code')!,
		clientId: client.clientId,
		redirectUri: CALLBACK,
		codeVerifier: VERIFIER
	});
	expect(authenticateToken(tokens.access_token, ORIGIN + '/mcp')?.actor).toMatchObject({ id: jon.id, agent: 'My Claude' });
	// An unknown client must not reach issueCode's foreign key.
	expect(isHttpError(await post('allow', query({ client_id: 'nope' }), { name: 'x' }), 400)).toBe(true);
});

it('deny returns access_denied', async () => {
	const res = await post('deny', query());
	if (!isRedirect(res)) throw res;
	expect(res.status).toBe(303);
	const url = new URL(res.location);
	expect(url.searchParams.get('error')).toBe('access_denied');
	expect(url.searchParams.get('state')).toBe('s1');
	expect(url.searchParams.get('iss')).toBe(ORIGIN);
	expect(url.searchParams.get('code')).toBeNull();
});

it('loopback redirects are flagged', async () => {
	const run = async (redirectUri: string) => {
		const headers: Record<string, string> = {};
		const url = new URL('/oauth/authorize?' + query({ redirect_uri: redirectUri }), ORIGIN);
		const result = await load({
			url,
			parent: async () => ({ user: jon, workspaces: [] }),
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
		} as never);
		expect(headers).toEqual({ 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" });
		return result as { loopback: boolean; redirectHost: string; suggestedName: string; clientName: string };
	};
	expect(await run('http://localhost:3118/callback')).toMatchObject({ loopback: true, redirectHost: 'localhost:3118' });
	client = registerClient({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'C'.repeat(60) + ' ' });
	const remote = await run('https://claude.ai/api/mcp/auth_callback');
	expect(remote).toMatchObject({ loopback: false, redirectHost: 'claude.ai', clientName: 'C'.repeat(60) });
	expect(remote.suggestedName).toBe('C'.repeat(40));
});
