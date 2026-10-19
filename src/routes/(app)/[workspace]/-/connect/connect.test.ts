import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, type User } from '#lib/core/accounts.ts';
import { agentsOf, createAgent } from '#lib/core/agents.ts';
import { closeDb } from '#lib/core/db.ts';
import { actions, load } from './+page.server.ts';

let data: string;
let owner: User;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-connect-'));
	process.env.INKMESH_DATA = data;
	owner = await createUser({ email: 'owner@example.com', name: 'Owner', password: 'long-enough-1' });
	await createWorkspace('demo', 'Demo', owner);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const locals = (user: User) => ({ user, actor: { id: user.id, name: user.name }, locale: 'en' });
const url = new URL('http://localhost/demo/-/connect');

// The action's answer: what it returns (a result or failure) or throws (an error).
async function act(name: keyof typeof actions, fields: Record<string, string>, user = owner) {
	const event = {
		params: { workspace: 'demo' },
		request: new Request(url, { method: 'POST', body: new URLSearchParams(fields) }),
		locals: locals(user),
		url
	};
	try {
		return await actions[name]!(event as never);
	} catch (err) {
		return err;
	}
}

const page = (user = owner) =>
	load({ params: { workspace: 'demo' }, locals: locals(user), url, parent: async () => ({}) } as never);

it('create returns the token once', async () => {
	const result = (await act('create', { name: 'script', kind: 'script' })) as { token: string; kind: string };
	expect(result.token).toMatch(/^ink_/);
	expect(result.kind).toBe('script');
	const loaded = await page();
	expect(loaded).toMatchObject({
		agents: [{ name: 'script', oauth: false, lastUsedAt: null }],
		mcpUrl: 'http://localhost/mcp',
		apiUrl: 'http://localhost/api/v1'
	});
	expect(JSON.stringify(loaded)).not.toContain(result.token);
});

it('a reader can create an agent', async () => {
	const reader = await createUser({ email: 'reader@example.com', name: 'Reader', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'reader', owner), reader.id);
	const result = (await act('create', { name: 'bot', kind: 'mcp' }, reader)) as { token: string };
	expect(result.token).toMatch(/^ink_/);
	expect(agentsOf(reader.id).map((a) => a.name)).toEqual(['bot']);
});

it('rename and revoke act on my agents only', async () => {
	const other = await createUser({ email: 'other@example.com', name: 'Other', password: 'long-enough-1' });
	acceptInvitation(createInvitation('demo', 'reader', owner), other.id);
	const theirs = createAgent(other.id, 'theirs').agent;
	const mine = createAgent(owner.id, 'mine').agent;

	expect(await act('rename', { id: String(theirs.id), name: 'stolen' })).toMatchObject({ status: 403 });
	expect(await act('revoke', { id: String(theirs.id) })).toMatchObject({ status: 403 });
	expect(agentsOf(other.id).map((a) => a.name)).toEqual(['theirs']);

	await act('rename', { id: String(mine.id), name: 'renamed' });
	expect(agentsOf(owner.id).map((a) => a.name)).toEqual(['renamed']);
	await act('revoke', { id: String(mine.id) });
	expect(agentsOf(owner.id)).toEqual([]);
});

it('bad names are refused', async () => {
	expect(await act('create', { name: '<b>', kind: 'script' })).toMatchObject({
		status: 400,
		data: { nameError: 'connect.nameBad', name: '<b>' }
	});
	const mine = createAgent(owner.id, 'mine').agent;
	expect(await act('rename', { id: String(mine.id), name: ' ' })).toMatchObject({
		status: 400,
		data: { renameError: 'connect.nameBad' }
	});
	expect(await act('create', { name: 'Mine', kind: 'script' })).toMatchObject({
		status: 400,
		data: { nameError: 'connect.nameTaken', name: 'Mine' }
	});
	const other = createAgent(owner.id, 'other').agent;
	expect(await act('rename', { id: String(other.id), name: 'MINE' })).toMatchObject({
		status: 400,
		data: { renameError: 'connect.nameTaken' }
	});
	expect(agentsOf(owner.id).map((a) => a.name)).toEqual(['other', 'mine']);
});
