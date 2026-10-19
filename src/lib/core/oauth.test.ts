import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser, hashToken, type User } from './accounts.ts';
import { agentsOf, authenticateToken, revokeAgent } from './agents.ts';
import { closeDb, db } from './db.ts';
import {
	exchangeCode,
	issueCode,
	OAuthError,
	oauthClient,
	redirectAllowed,
	refreshTokens,
	registerClient
} from './oauth.ts';

const MCP = 'https://ink.test/mcp';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'a-verifier-of-enough-length-to-be-realistic-0123456789';
const challenge = (v: string) => createHash('sha256').update(v).digest('base64url');

let data: string;
let jon: User;
beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-oauth-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

function oauthCode(code: () => unknown): string | undefined {
	try {
		code();
	} catch (err) {
		if (err instanceof OAuthError) return err.code;
		throw err;
	}
}

function consent(clientId: string, agentName = 'Claude') {
	const codeChallenge = challenge(VERIFIER);
	return issueCode({ clientId, redirectUri: CALLBACK, codeChallenge, resource: MCP, userId: jon.id, agentName });
}

describe('oauth', () => {
	it('registers public clients and refuses bad redirect URIs', () => {
		const client = registerClient({
			redirect_uris: [CALLBACK, 'http://localhost:3118/callback'],
			token_endpoint_auth_method: 'client_secret_basic'
		});
		expect(client.clientId).toMatch(/^[0-9a-f-]{36}$/);
		expect(client).toMatchObject({ name: 'MCP client', redirectUris: [CALLBACK, 'http://localhost:3118/callback'] });
		expect(oauthClient(client.clientId)).toEqual(client);
		expect(oauthClient('nope')).toBeNull();
		expect(registerClient({ redirect_uris: [CALLBACK], client_name: 'Claude' }).name).toBe('Claude');
		const bad = [
			['http://example.com/cb'],
			['javascript:alert(1)'],
			['https://a/b#f'],
			Array.from({ length: 6 }, (_, i) => `https://a/${i}`),
			['https://a/' + 'x'.repeat(503)],
			'https://a/b',
			[],
			[42]
		];
		for (const redirect_uris of bad)
			expect(['invalid_redirect_uri', 'invalid_client_metadata']).toContain(
				oauthCode(() => registerClient({ redirect_uris }))
			);
		expect(oauthCode(() => registerClient(null))).toBe('invalid_client_metadata');
		expect(registerClient({ redirect_uris: [CALLBACK], client_name: null }).name).toBe('MCP client');
		expect(registerClient({ redirect_uris: [CALLBACK], client_name: '<b>Evil</b>' }).name).toBe('MCP client');
		expect(registerClient({ redirect_uris: [CALLBACK], client_name: 'a\nb' }).name).toBe('MCP client');
		expect(oauthCode(() => registerClient({ redirect_uris: [CALLBACK], client_name: 'x'.repeat(101) }))).toBe('invalid_client_metadata');
	});

	it('matches loopback redirects on any port', () => {
		const client = registerClient({ redirect_uris: ['http://localhost:3118/callback', CALLBACK] });
		expect(redirectAllowed(client, 'http://localhost:3118/callback')).toBe(true);
		expect(redirectAllowed(client, 'http://localhost:4000/callback')).toBe(true);
		expect(redirectAllowed(client, CALLBACK)).toBe(true);
		expect(redirectAllowed(client, 'http://localhost:4000/other')).toBe(false);
		expect(redirectAllowed(client, 'http://127.0.0.1:4000/callback')).toBe(false);
		expect(redirectAllowed(client, 'https://localhost:3118/callback')).toBe(false);
		expect(redirectAllowed(client, 'https://claude.ai:8443/api/mcp/auth_callback')).toBe(false);
		expect(redirectAllowed(client, 'not a url')).toBe(false);
		expect(redirectAllowed(client, 'http://localhost:4000/callback#x')).toBe(false);
		expect(redirectAllowed(client, CALLBACK + '#x')).toBe(false);
	});

	it('prunes stale unused clients', () => {
		const stale = registerClient({ redirect_uris: [CALLBACK] });
		const used = registerClient({ redirect_uris: [CALLBACK] });
		consent(used.clientId);
		const old = new Date(Date.now() - 25 * 3600_000).toISOString();
		db().prepare('UPDATE oauth_clients SET created_at = ?').run(old);
		registerClient({ redirect_uris: [CALLBACK] });
		expect(oauthClient(stale.clientId)).toBeNull();
		expect(oauthClient(used.clientId)).not.toBeNull();
	});

	it('a code works once and only with its verifier', () => {
		const client = registerClient({ redirect_uris: [CALLBACK] });
		const { clientId } = client;
		const exchange = (code: string, over: Partial<Parameters<typeof exchangeCode>[0]> = {}) =>
			exchangeCode({ code, clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER, ...over });

		const code = consent(clientId);
		expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(db().prepare('SELECT code_hash FROM oauth_codes').all()).toEqual([{ code_hash: hashToken(code) }]);
		const tokens = exchange(code, { resource: MCP });
		expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
		expect(tokens.access_token).toMatch(/^ink_/);
		expect(tokens.refresh_token).toMatch(/^ink_/);
		expect(oauthCode(() => exchange(code))).toBe('invalid_grant');

		const wrong = consent(clientId);
		expect(oauthCode(() => exchange(wrong, { codeVerifier: 'wrong' }))).toBe('invalid_grant');
		expect(oauthCode(() => exchange(wrong))).toBe('invalid_grant');
		for (const codeVerifier of [42 as unknown as string, 'short', VERIFIER + '!']) {
			const malformed = consent(clientId);
			expect(oauthCode(() => exchange(malformed, { codeVerifier }))).toBe('invalid_grant');
			expect(oauthCode(() => exchange(malformed))).toBe('invalid_grant');
		}

		expect(oauthCode(() => exchange(consent(clientId), { redirectUri: 'https://claude.ai/other' }))).toBe('invalid_grant');
		const other = registerClient({ redirect_uris: [CALLBACK] });
		expect(oauthCode(() => exchange(consent(clientId), { clientId: other.clientId }))).toBe('invalid_grant');
		expect(oauthCode(() => exchange(consent(clientId), { resource: 'https://evil.test/mcp' }))).toBe('invalid_grant');

		const late = consent(clientId);
		db().prepare('UPDATE oauth_codes SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
		expect(oauthCode(() => exchange(late))).toBe('invalid_grant');
		expect(db().prepare('SELECT COUNT(*) AS n FROM oauth_codes').get()).toEqual({ n: 0 });
	});

	it('the access token works on the MCP resource only', () => {
		const { clientId } = registerClient({ redirect_uris: [CALLBACK] });
		const code = consent(clientId, 'My Claude');
		const { access_token, refresh_token } = exchangeCode({ code, clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER });
		expect(authenticateToken(access_token, MCP)?.actor).toEqual({ id: jon.id, name: 'Jon', agent: 'My Claude' });
		expect(authenticateToken(access_token, null)).toBeNull();
		expect(authenticateToken(refresh_token, MCP)).toBeNull();
	});

	it('refresh rotates', () => {
		const { clientId } = registerClient({ redirect_uris: [CALLBACK] });
		const first = exchangeCode({ code: consent(clientId), clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER });
		const second = refreshTokens({ refreshToken: first.refresh_token, clientId, resource: MCP });
		expect(second.refresh_token).not.toBe(first.refresh_token);
		expect(authenticateToken(second.access_token, MCP)?.actor.agent).toBe('Claude');
		expect(oauthCode(() => refreshTokens({ refreshToken: first.refresh_token, clientId }))).toBe('invalid_grant');
		const other = registerClient({ redirect_uris: [CALLBACK] });
		expect(oauthCode(() => refreshTokens({ refreshToken: second.refresh_token, clientId: other.clientId }))).toBe('invalid_grant');
		const evil = 'https://evil.test/mcp';
		expect(oauthCode(() => refreshTokens({ refreshToken: second.refresh_token, clientId, resource: evil }))).toBe(
			'invalid_grant'
		);
		expect(oauthCode(() => refreshTokens({ refreshToken: second.access_token, clientId }))).toBe('invalid_grant');
		refreshTokens({ refreshToken: second.refresh_token, clientId });
		expect(oauthCode(() => refreshTokens({ refreshToken: second.refresh_token, clientId }))).toBe('invalid_grant');

		const third = exchangeCode({ code: consent(clientId), clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER });
		db().prepare("UPDATE agent_tokens SET expires_at = ? WHERE kind = 'refresh'").run(new Date(Date.now() - 1000).toISOString());
		expect(oauthCode(() => refreshTokens({ refreshToken: third.refresh_token, clientId }))).toBe('invalid_grant');
	});

	it('a revoked agent cannot refresh', () => {
		const { clientId } = registerClient({ redirect_uris: [CALLBACK] });
		const tokens = exchangeCode({ code: consent(clientId), clientId, redirectUri: CALLBACK, codeVerifier: VERIFIER });
		revokeAgent(jon.id, agentsOf(jon.id)[0].id);
		expect(oauthCode(() => refreshTokens({ refreshToken: tokens.refresh_token, clientId }))).toBe('invalid_grant');
		expect(authenticateToken(tokens.access_token, MCP)).toBeNull();
	});

	it('consent again reuses and renames the agent', () => {
		const { clientId } = registerClient({ redirect_uris: [CALLBACK] });
		consent(clientId, 'First');
		consent(clientId, 'Second');
		expect(agentsOf(jon.id)).toMatchObject([{ name: 'Second', oauth: true }]);
	});
});
