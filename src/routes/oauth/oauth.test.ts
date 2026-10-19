import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createUser, loginSucceeded, type User } from '#lib/core/accounts.ts';
import { closeDb } from '#lib/core/db.ts';
import { issueCode } from '#lib/core/oauth.ts';
import { GET as serverGET } from '../.well-known/oauth-authorization-server/+server.ts';
import { GET as resourceMcpGET } from '../.well-known/oauth-protected-resource/mcp/+server.ts';
import { GET as resourceGET } from '../.well-known/oauth-protected-resource/+server.ts';
import { POST as registerPOST } from './register/+server.ts';
import { POST as tokenPOST } from './token/+server.ts';

const IP = '1.2.3.4';
const CALLBACK = 'https://client.test/callback';
const VERIFIER = 'v'.repeat(43);
let data: string;
let jon: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-oauth-routes-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
});
afterEach(() => {
	loginSucceeded('register|' + IP);
	loginSucceeded('token|' + IP);
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

type Handler = (event: never) => Promise<Response> | Response;
function call(handler: Handler, target: string, init: RequestInit = {}) {
	const url = new URL(target, 'http://localhost');
	const event = { request: new Request(url, init), url, getClientAddress: () => IP };
	return handler(event as never);
}
const register = (body: unknown) =>
	call(registerPOST, '/oauth/register', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
const token = (fields: Record<string, string>) =>
	call(tokenPOST, '/oauth/token', { method: 'POST', body: new URLSearchParams(fields) });

it('serves both protected-resource documents and the server metadata', async () => {
	for (const handler of [resourceGET, resourceMcpGET]) {
		const res = await call(handler, '/.well-known/oauth-protected-resource/mcp');
		expect(res.status).toBe(200);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
		expect(res.headers.get('cache-control')).toBe('max-age=3600');
		expect(await res.json()).toEqual({
			resource: 'http://localhost/mcp',
			authorization_servers: ['http://localhost'],
			bearer_methods_supported: ['header'],
			resource_name: 'inkmesh'
		});
	}
	const res = await call(serverGET, '/.well-known/oauth-authorization-server');
	expect(res.headers.get('access-control-allow-origin')).toBe('*');
	expect(res.headers.get('content-type')).toBe('application/json');
	expect(await res.json()).toEqual({
		issuer: 'http://localhost',
		authorization_endpoint: 'http://localhost/oauth/authorize',
		token_endpoint: 'http://localhost/oauth/token',
		registration_endpoint: 'http://localhost/oauth/register',
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		authorization_response_iss_parameter_supported: true
	});
});

it('registers a client', async () => {
	const res = await register({
		redirect_uris: [CALLBACK],
		client_name: 'Claude',
		token_endpoint_auth_method: 'client_secret_post'
	});
	expect(res.status).toBe(201);
	const body = await res.json();
	expect(body).toMatchObject({
		client_name: 'Claude',
		redirect_uris: [CALLBACK],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'none'
	});
	expect(body.client_id).toMatch(/^[0-9a-f-]{36}$/);
	expect(typeof body.client_id_issued_at).toBe('number');
});

it('refuses bad registrations', async () => {
	const bad = await register({ redirect_uris: ['ftp://x'] });
	expect(bad.status).toBe(400);
	expect((await bad.json()).error).toBe('invalid_redirect_uri');
	expect((await register('not json')).status).toBe(400);
	expect((await register({ redirect_uris: [CALLBACK], pad: 'x'.repeat(17 * 1024) })).status).toBe(413);
	for (let i = 3; i < 100; i++) expect((await register({ redirect_uris: [CALLBACK] })).status).toBe(201);
	const res = await register({ redirect_uris: [CALLBACK] });
	expect(res.status).toBe(429);
	expect(await res.json()).toEqual({ error: 'too_many_requests' });
});

async function authorise() {
	const clientId: string = (await (await register({ redirect_uris: [CALLBACK] })).json()).client_id;
	const code = issueCode({
		clientId,
		redirectUri: CALLBACK,
		codeChallenge: createHash('sha256').update(VERIFIER).digest('base64url'),
		resource: 'http://localhost/mcp',
		userId: jon.id,
		agentName: 'Claude'
	});
	return { clientId, code };
}
const exchange = ({ clientId, code }: { clientId: string; code: string }) =>
	token({
		grant_type: 'authorization_code',
		code,
		redirect_uri: CALLBACK,
		client_id: clientId,
		code_verifier: VERIFIER,
		resource: 'http://localhost/mcp'
	});

it('exchanges a code and refreshes', async () => {
	const { clientId, code } = await authorise();
	const res = await exchange({ clientId, code });
	expect(res.status).toBe(200);
	expect(res.headers.get('cache-control')).toBe('no-store');
	const first = await res.json();
	expect(first).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
	expect(first.access_token).toMatch(/^ink_/);
	const refreshed = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: clientId });
	expect(refreshed.status).toBe(200);
	const second = await refreshed.json();
	expect(second.refresh_token).not.toBe(first.refresh_token);
	const reused = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: clientId });
	expect(reused.status).toBe(400);
	expect(reused.headers.get('cache-control')).toBe('no-store');
	expect(await reused.json()).toMatchObject({ error: 'invalid_grant' });
});

it('refuses a resource other than this server', async () => {
	const res = await token({ grant_type: 'refresh_token', refresh_token: 'x', client_id: 'y', resource: 'https://evil.test/mcp' });
	expect(res.status).toBe(400);
	expect((await res.json()).error).toBe('invalid_target');
});

it('refuses JSON at the token endpoint', async () => {
	const res = await call(tokenPOST, '/oauth/token', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ grant_type: 'refresh_token' })
	});
	expect(res.status).toBe(400);
	expect(res.headers.get('cache-control')).toBe('no-store');
	expect((await res.json()).error).toBe('invalid_request');
});

it('unknown grant type', async () => {
	const res = await token({ grant_type: 'password' });
	expect(res.status).toBe(400);
	expect((await res.json()).error).toBe('unsupported_grant_type');
});

it('throttles failed token requests only', async () => {
	const { clientId, code } = await authorise();
	const { refresh_token } = await (await exchange({ clientId, code })).json();
	for (let i = 0; i < 49; i++) expect((await token({ grant_type: 'password' })).status).toBe(400);
	// Two successes so far: had they counted, this refresh would already be refused.
	expect((await token({ grant_type: 'refresh_token', refresh_token, client_id: clientId })).status).toBe(200);
	expect((await token({ grant_type: 'password' })).status).toBe(400);
	const res = await token({ grant_type: 'password' });
	expect(res.status).toBe(429);
	expect(res.headers.get('cache-control')).toBe('no-store');
});
