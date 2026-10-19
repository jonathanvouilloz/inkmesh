import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Forbidden } from './access.ts';
import { createUser, hashToken, updateName, type User } from './accounts.ts';
import {
	agentName,
	agentsOf,
	authenticateToken,
	createAgent,
	newAgentToken,
	renameAgent,
	revokeAgent
} from './agents.ts';
import { closeDb, db } from './db.ts';

let data: string;
let jon: User;
beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-agents-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

function accessToken(agentId: number, resource: string, expiresAt: Date): string {
	const token = newAgentToken();
	db()
		.prepare(
			"INSERT INTO agent_tokens (token_hash, agent_id, kind, resource, expires_at, created_at) VALUES (?, ?, 'access', ?, ?, ?)"
		)
		.run(hashToken(token), agentId, resource, expiresAt.toISOString(), new Date().toISOString());
	return token;
}

const lastUsed = (id: number) =>
	(db().prepare('SELECT last_used_at FROM agents WHERE id = ?').get(id) as { last_used_at: string | null })
		.last_used_at;

describe('agents', () => {
	it('issues a prefixed token and stores only its hash', () => {
		const { agent, token } = createAgent(jon.id, 'reporter');
		expect(token).toMatch(/^ink_[A-Za-z0-9_-]{43}$/);
		expect(agent).toMatchObject({ name: 'reporter', oauth: false, lastUsedAt: null });
		const rows = db().prepare('SELECT token_hash, kind FROM agent_tokens').all();
		expect(rows).toEqual([{ token_hash: hashToken(token), kind: 'bearer' }]);
		closeDb();
		const raw = fs.readFileSync(path.join(data, 'inkmesh.db'));
		expect(raw.includes(token)).toBe(false);
		expect(raw.includes(token.slice(4))).toBe(false);
	});

	it("authenticates as the user under the agent's name", () => {
		const { agent, token } = createAgent(jon.id, 'reporter');
		expect(authenticateToken(token, null)).toEqual({
			actor: { id: jon.id, name: 'Jon', agent: 'reporter' },
			agentId: agent.id
		});
		updateName(jon.id, 'Jonathan');
		renameAgent(jon.id, agent.id, 'writer');
		expect(authenticateToken(token, null)?.actor).toEqual({ id: jon.id, name: 'Jonathan', agent: 'writer' });
		expect(agentsOf(jon.id).map((a) => a.name)).toEqual(['writer']);
	});

	it('refuses unknown, unprefixed and access-for-another-resource tokens', () => {
		const { agent, token } = createAgent(jon.id, 'reporter');
		expect(authenticateToken(newAgentToken(), null)).toBeNull();
		expect(authenticateToken(token.slice(4), null)).toBeNull();
		db().prepare('INSERT INTO agent_tokens VALUES (?, ?, ?, NULL, NULL, ?)').run(
			hashToken('raw'),
			agent.id,
			'bearer',
			new Date().toISOString()
		);
		expect(authenticateToken('raw', null)).toBeNull();
		const expires = new Date(Date.now() + 3600_000);
		const t = accessToken(agent.id, 'https://x/mcp', expires);
		expect(authenticateToken(t, null)).toBeNull();
		expect(authenticateToken(t, 'https://y/mcp')).toBeNull();
		expect(authenticateToken(t, 'https://x/mcp')).toEqual({
			actor: { id: jon.id, name: 'Jon', agent: 'reporter' },
			agentId: agent.id,
			expiresAt: Math.floor(expires.getTime() / 1000)
		});
		const expired = accessToken(agent.id, 'https://x/mcp', new Date(Date.now() - 1000));
		expect(authenticateToken(expired, 'https://x/mcp')).toBeNull();
		// A bearer token is valid on /mcp as well.
		expect(authenticateToken(token, 'https://x/mcp')?.agentId).toBe(agent.id);
	});

	it('validates agent names', () => {
		for (const bad of ['', ' ', 'a'.repeat(41), 'a<b', 'a>b', 'a\nb', 'a\x7fb'])
			expect(() => agentName(bad)).toThrow(RangeError);
		expect(agentName('  Claude Code ')).toBe('Claude Code');
		expect(agentName('a'.repeat(40))).toBe('a'.repeat(40));
		expect(() => createAgent(jon.id, '')).toThrow(RangeError);
		expect(agentsOf(jon.id)).toEqual([]);
	});

	it('records last use at most once a minute', () => {
		const { agent, token } = createAgent(jon.id, 'reporter');
		authenticateToken(token, null);
		const first = lastUsed(agent.id);
		expect(first).not.toBeNull();
		authenticateToken(token, null);
		expect(lastUsed(agent.id)).toBe(first);
		const old = new Date(Date.now() - 120_000).toISOString();
		db().prepare('UPDATE agents SET last_used_at = ? WHERE id = ?').run(old, agent.id);
		authenticateToken(token, null);
		expect(lastUsed(agent.id)! > old).toBe(true);
		expect(agentsOf(jon.id)[0].lastUsedAt).toBe(lastUsed(agent.id));
	});

	it('revoking an agent kills its tokens', () => {
		const { agent, token } = createAgent(jon.id, 'reporter');
		const access = accessToken(agent.id, 'https://x/mcp', new Date(Date.now() + 3600_000));
		revokeAgent(jon.id, agent.id);
		expect(db().prepare('SELECT * FROM agent_tokens').all()).toEqual([]);
		expect(authenticateToken(token, null)).toBeNull();
		expect(authenticateToken(access, 'https://x/mcp')).toBeNull();
		expect(agentsOf(jon.id)).toEqual([]);
	});

	it('only the owner renames or revokes', async () => {
		const ann = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
		const { agent, token } = createAgent(jon.id, 'reporter');
		expect(() => renameAgent(ann.id, agent.id, 'mine')).toThrow(Forbidden);
		expect(() => revokeAgent(ann.id, agent.id)).toThrow(Forbidden);
		expect(() => revokeAgent(jon.id, agent.id + 1)).toThrow(Forbidden);
		expect(authenticateToken(token, null)?.actor.agent).toBe('reporter');
	});

	it('lists agents newest first', () => {
		createAgent(jon.id, 'one');
		createAgent(jon.id, 'two');
		expect(agentsOf(jon.id).map((a) => a.name)).toEqual(['two', 'one']);
	});

	it('a deleted user takes their agents along', () => {
		const { token } = createAgent(jon.id, 'reporter');
		db().prepare('DELETE FROM users WHERE id = ?').run(jon.id);
		expect(db().prepare('SELECT count(*) AS n FROM agents').get()).toEqual({ n: 0 });
		expect(db().prepare('SELECT count(*) AS n FROM agent_tokens').get()).toEqual({ n: 0 });
		expect(authenticateToken(token, null)).toBeNull();
	});
});
