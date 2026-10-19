import { Forbidden } from './access.ts';
import { hashToken, newToken } from './accounts.ts';
import type { Actor } from './actor.ts';
import { db, transaction } from './db.ts';

export type Agent = { id: number; name: string; oauth: boolean; createdAt: string; lastUsedAt: string | null };
export type AgentAuth = { actor: Actor; agentId: number; expiresAt?: number /* epoch seconds */ };

const MAX_NAME = 40;
const LAST_USE_MS = 60_000;

export const newAgentToken = (): string => 'ink_' + newToken();

export const UNSAFE_NAME = /[<>\x00-\x1f\x7f]/;

// The name lands in the git author `Jon via <name>`.
export function agentName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > MAX_NAME || UNSAFE_NAME.test(trimmed)) throw new RangeError('invalid agent name');
	return trimmed;
}

export class NameTaken extends RangeError {
	constructor() {
		super('agent name taken');
	}
}

// Events tell a user's agents apart by name, so two of them never share one (case aside).
export function assertNameFree(userId: number, name: string, exceptId: number | null = null): void {
	const names = db().prepare('SELECT name FROM agents WHERE user_id = ? AND id IS NOT ?').all(userId, exceptId) as {
		name: string;
	}[];
	if (names.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new NameTaken();
}

export function createAgent(userId: number, name: string): { agent: Agent; token: string } {
	const clean = agentName(name);
	const token = newAgentToken();
	const createdAt = new Date().toISOString();
	const id = transaction(() => {
		assertNameFree(userId, clean);
		const { lastInsertRowid } = db()
			.prepare('INSERT INTO agents (user_id, name, created_at) VALUES (?, ?, ?)')
			.run(userId, clean, createdAt);
		db()
			.prepare("INSERT INTO agent_tokens (token_hash, agent_id, kind, created_at) VALUES (?, ?, 'bearer', ?)")
			.run(hashToken(token), lastInsertRowid, createdAt);
		return Number(lastInsertRowid);
	});
	return { agent: { id, name: clean, oauth: false, createdAt, lastUsedAt: null }, token };
}

type Row = { id: number; name: string; oauth: number; created_at: string; last_used_at: string | null };

export function agentsOf(userId: number): Agent[] {
	return (
		db()
			.prepare(
				'SELECT id, name, oauth_client_id IS NOT NULL AS oauth, created_at, last_used_at FROM agents WHERE user_id = ? ORDER BY id DESC'
			)
			.all(userId) as Row[]
	).map((r) => ({
		id: r.id,
		name: r.name,
		oauth: r.oauth === 1,
		createdAt: r.created_at,
		lastUsedAt: r.last_used_at
	}));
}

export function renameAgent(userId: number, id: number, name: string): void {
	const clean = agentName(name);
	assertNameFree(userId, clean, id);
	const { changes } = db().prepare('UPDATE agents SET name = ? WHERE id = ? AND user_id = ?').run(clean, id, userId);
	if (!changes) throw new Forbidden('not your agent');
}

// Tokens and codes cascade, so every credential of the agent dies with the row.
export function revokeAgent(userId: number, id: number): void {
	const { changes } = db().prepare('DELETE FROM agents WHERE id = ? AND user_id = ?').run(id, userId);
	if (!changes) throw new Forbidden('not your agent');
}

type AuthRow = {
	agent_id: number;
	agent: string;
	user_id: number;
	user: string;
	expires_at: string | null;
	last_used_at: string | null;
};

export function authenticateToken(token: string, resource: string | null): AgentAuth | null {
	if (!token.startsWith('ink_')) return null;
	const now = new Date();
	const row = db()
		.prepare(
			`SELECT a.id AS agent_id, a.name AS agent, u.id AS user_id, u.name AS user, t.expires_at, a.last_used_at
FROM agent_tokens t JOIN agents a ON a.id = t.agent_id JOIN users u ON u.id = a.user_id
WHERE t.token_hash = ? AND (t.kind = 'bearer' OR (t.kind = 'access' AND t.resource = ? AND t.expires_at > ?))`
		)
		.get(hashToken(token), resource, now.toISOString()) as AuthRow | undefined;
	if (!row) return null;
	if (!row.last_used_at || now.getTime() - Date.parse(row.last_used_at) > LAST_USE_MS)
		db().prepare('UPDATE agents SET last_used_at = ? WHERE id = ?').run(now.toISOString(), row.agent_id);
	const auth: AgentAuth = { actor: { id: row.user_id, name: row.user, agent: row.agent }, agentId: row.agent_id };
	if (row.expires_at) auth.expiresAt = Math.floor(Date.parse(row.expires_at) / 1000);
	return auth;
}
