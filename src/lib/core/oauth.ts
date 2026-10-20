import { createHash, randomUUID } from 'node:crypto';
import { hashToken, newToken, UNSAFE_NAME } from './accounts.ts';
import { agentName, assertNameFree, newAgentToken } from './agents.ts';
import { db, transaction } from './db.ts';

type OAuthErrorCode =
	| 'invalid_request'
	| 'invalid_client'
	| 'invalid_grant'
	| 'unsupported_grant_type'
	| 'invalid_target'
	| 'invalid_redirect_uri'
	| 'invalid_client_metadata';

export class OAuthError extends Error {
	constructor(
		public code: OAuthErrorCode,
		message: string
	) {
		super(message);
	}
}

export type OAuthClient = { clientId: string; name: string; redirectUris: string[] };
export type TokenResponse = { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string };

const MAX_URIS = 5;
const MAX_URI = 512;
const MAX_CLIENT_NAME = 100;
const STALE_CLIENT_MS = 24 * 3600_000;
const CODE_MS = 60_000;
const ACCESS_S = 3600;
const REFRESH_MS = 30 * 24 * 3600_000;

const iso = (ms: number) => new Date(ms).toISOString();

function loopback(uri: string): URL | null {
	try {
		const url = new URL(uri);
		return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') ? url : null;
	} catch {
		return null;
	}
}

function redirectUriValid(uri: unknown): boolean {
	if (typeof uri !== 'string' || uri.length > MAX_URI || uri.includes('#')) return false;
	if (loopback(uri)) return true;
	try {
		return new URL(uri).protocol === 'https:';
	} catch {
		return false;
	}
}

export function registerClient(meta: unknown): OAuthClient {
	if (!meta || typeof meta !== 'object') throw new OAuthError('invalid_client_metadata', 'metadata must be an object');
	const { redirect_uris: uris, client_name } = meta as Record<string, unknown>;
	// The name prefills the agent name at consent, so one agentName() would refuse falls back to the default.
	const name = client_name == null || UNSAFE_NAME.test(String(client_name)) ? 'MCP client' : client_name;
	if (!Array.isArray(uris) || uris.length < 1 || uris.length > MAX_URIS || !uris.every(redirectUriValid))
		throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be 1 to 5 https or loopback http URIs');
	if (typeof name !== 'string' || !name.trim() || name.length > MAX_CLIENT_NAME)
		throw new OAuthError('invalid_client_metadata', 'client_name must be 1 to 100 characters');
	const client: OAuthClient = { clientId: randomUUID(), name: name.trim(), redirectUris: uris };
	const now = Date.now();
	transaction(() => {
		db()
			.prepare(
				'DELETE FROM oauth_clients WHERE created_at < ? AND client_id NOT IN (SELECT oauth_client_id FROM agents WHERE oauth_client_id IS NOT NULL)'
			)
			.run(iso(now - STALE_CLIENT_MS));
		db()
			.prepare('INSERT INTO oauth_clients (client_id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)')
			.run(client.clientId, client.name, JSON.stringify(uris), iso(now));
	});
	return client;
}

export function oauthClient(clientId: string): OAuthClient | null {
	const row = db().prepare('SELECT name, redirect_uris FROM oauth_clients WHERE client_id = ?').get(clientId) as
		| { name: string; redirect_uris: string }
		| undefined;
	return row ? { clientId, name: row.name, redirectUris: JSON.parse(row.redirect_uris) } : null;
}

// RFC 8252 §7.3: native clients pick a loopback port per session.
export function redirectAllowed(client: OAuthClient, uri: string): boolean {
	if (uri.includes('#')) return false;
	if (client.redirectUris.includes(uri)) return true;
	const asked = loopback(uri);
	return (
		!!asked &&
		client.redirectUris.some((registered) => {
			const url = loopback(registered);
			return !!url && url.hostname === asked.hostname && url.pathname === asked.pathname && url.search === asked.search;
		})
	);
}

export function issueCode(input: {
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	resource: string;
	userId: number;
	agentName: string;
}): string {
	const name = agentName(input.agentName);
	const code = newToken();
	const now = Date.now();
	transaction(() => {
		db().prepare('DELETE FROM oauth_codes WHERE expires_at <= ?').run(iso(now));
		const agent = db()
			.prepare('SELECT id FROM agents WHERE user_id = ? AND oauth_client_id = ?')
			.get(input.userId, input.clientId) as { id: number } | undefined;
		let agentId = agent?.id;
		assertNameFree(input.userId, name, agentId ?? null);
		if (agentId) db().prepare('UPDATE agents SET name = ? WHERE id = ?').run(name, agentId);
		else
			agentId = Number(
				db()
					.prepare('INSERT INTO agents (user_id, name, oauth_client_id, created_at) VALUES (?, ?, ?, ?)')
					.run(input.userId, name, input.clientId, iso(now)).lastInsertRowid
			);
		db()
			.prepare(
				'INSERT INTO oauth_codes (code_hash, client_id, agent_id, redirect_uri, code_challenge, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.run(
				hashToken(code),
				input.clientId,
				agentId,
				input.redirectUri,
				input.codeChallenge,
				input.resource,
				iso(now + CODE_MS)
			);
	});
	return code;
}

function issuePair(agentId: number, resource: string): TokenResponse {
	const now = Date.now();
	const access = newAgentToken();
	const refresh = newAgentToken();
	db().prepare('DELETE FROM agent_tokens WHERE expires_at <= ?').run(iso(now));
	const insert = db().prepare(
		'INSERT INTO agent_tokens (token_hash, agent_id, kind, resource, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	);
	insert.run(hashToken(access), agentId, 'access', resource, iso(now + ACCESS_S * 1000), iso(now));
	insert.run(hashToken(refresh), agentId, 'refresh', resource, iso(now + REFRESH_MS), iso(now));
	return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_S, refresh_token: refresh };
}

type CodeRow = {
	client_id: string;
	agent_id: number;
	redirect_uri: string;
	code_challenge: string;
	resource: string;
	expires_at: string;
};

export function exchangeCode(input: {
	code: string;
	clientId: string;
	redirectUri: string;
	codeVerifier: string;
	resource?: string;
}): TokenResponse {
	const { codeVerifier } = input;
	// RFC 7636 §4.1; a malformed verifier still burns the code below.
	const valid = typeof codeVerifier === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier);
	const challenge = valid ? createHash('sha256').update(codeVerifier).digest('base64url') : null;
	// Returning instead of throwing keeps the delete committed: a failed attempt burns the code too.
	const tokens = transaction(() => {
		const row = db()
			.prepare('DELETE FROM oauth_codes WHERE code_hash = ? RETURNING *')
			.get(hashToken(input.code)) as CodeRow | undefined;
		if (
			!row ||
			row.expires_at <= iso(Date.now()) ||
			row.client_id !== input.clientId ||
			row.redirect_uri !== input.redirectUri ||
			(input.resource !== undefined && input.resource !== row.resource) ||
			challenge !== row.code_challenge
		)
			return null;
		return issuePair(row.agent_id, row.resource);
	});
	if (!tokens) throw new OAuthError('invalid_grant', 'invalid, expired or used code');
	return tokens;
}

// shortcut: no reuse detection of rotated-out refresh tokens (RFC 9700 §4.14.2), upgrade when tombstones are worth it.
export function refreshTokens(input: { refreshToken: string; clientId: string; resource?: string }): TokenResponse {
	return transaction(() => {
		const tokenHash = hashToken(input.refreshToken);
		const row = db()
			.prepare(
				`SELECT t.agent_id, t.resource FROM agent_tokens t JOIN agents a ON a.id = t.agent_id
WHERE t.token_hash = ? AND t.kind = 'refresh' AND t.expires_at > ? AND a.oauth_client_id = ?`
			)
			.get(tokenHash, iso(Date.now()), input.clientId) as { agent_id: number; resource: string } | undefined;
		if (!row || (input.resource !== undefined && input.resource !== row.resource))
			throw new OAuthError('invalid_grant', 'invalid or expired refresh token');
		db().prepare('DELETE FROM agent_tokens WHERE token_hash = ?').run(tokenHash);
		return issuePair(row.agent_id, row.resource);
	});
}
