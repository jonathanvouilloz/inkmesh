import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptInvitation, createInvitation, createWorkspace } from '#lib/core/access.ts';
import { createUser, loginSucceeded, type User } from '#lib/core/accounts.ts';
import { createAgent } from '#lib/core/agents.ts';
import { closeDb } from '#lib/core/db.ts';
import { createDocument, history, importDocument } from '#lib/core/documents.ts';
import { exchangeCode, issueCode, registerClient } from '#lib/core/oauth.ts';
import { clearSessionTimers } from '#lib/core/sessions.ts';
import { POST } from '../../routes/mcp/+server.ts';

const IP = '1.2.3.4';
const ORIGIN = 'http://localhost';
let data: string;
let jon: User;
let owner: User;
let jonToken: string;
let annToken: string;

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-mcp-'));
	process.env.INKMESH_DATA = data;
	jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	const ann = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
	owner = await createUser({ email: 'own@b.c', name: 'Owner', password: 'long enough 1' });
	await createWorkspace('demo', 'Demo', owner);
	acceptInvitation(createInvitation('demo', 'editor', owner), jon.id);
	acceptInvitation(createInvitation('demo', 'reader', owner), ann.id);
	await createDocument('demo', 'a.md', owner);
	jonToken = createAgent(jon.id, 'claude').token;
	annToken = createAgent(ann.id, 'reader-bot').token;
});
afterEach(() => {
	loginSucceeded('bearer|' + IP);
	clearSessionTimers();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

let id = 0;
async function post(token: string | null, method: string, params: unknown = {}) {
	const url = new URL('/mcp', ORIGIN);
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		accept: 'application/json, text/event-stream'
	};
	if (token) headers.authorization = `Bearer ${token}`;
	const body = JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params });
	const request = new Request(url, { method: 'POST', headers, body });
	return POST({ request, url, params: {}, getClientAddress: () => IP } as never);
}
async function rpc(token: string, method: string, params: unknown = {}) {
	const res = await post(token, method, params);
	const text = await res.text();
	const json = res.headers.get('content-type')?.includes('text/event-stream')
		? text.split('\n').find((line) => line.startsWith('data:'))!.slice(5)
		: text;
	return JSON.parse(json);
}
async function tool(token: string, name: string, args: Record<string, unknown>) {
	const { result } = await rpc(token, 'tools/call', { name, arguments: args });
	return { isError: result.isError === true, body: JSON.parse(result.content[0].text) };
}

it('401 with the resource metadata pointer', async () => {
	const res = await post(null, 'tools/list');
	expect(res.status).toBe(401);
	expect(res.headers.get('www-authenticate')).toBe(
		`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
	);
	expect((await res.json()).error.code).toBe('unauthorized');
	const bad = await post('ink_nope', 'tools/list');
	expect(bad.status).toBe(401);
	expect(bad.headers.get('www-authenticate')).toBe(
		`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`
	);
});

it('lists the nine tools', async () => {
	const { result } = await rpc(jonToken, 'tools/list');
	const names = result.tools.map((t: { name: string }) => t.name).sort();
	expect(names).toEqual([
		'changes',
		'create_document',
		'delete',
		'list_tree',
		'list_workspaces',
		'move',
		'read_document',
		'replace_document',
		'update_document'
	]);
	const read = result.tools.find((t: { name: string }) => t.name === 'read_document');
	expect(read.annotations.readOnlyHint).toBe(true);
	for (const t of result.tools) expect(t.annotations.openWorldHint).toBe(false);
	const create = result.tools.find((t: { name: string }) => t.name === 'create_document');
	expect(create.annotations.destructiveHint).toBe(false);
});

it('reads and updates with a hash', async () => {
	const read = await tool(jonToken, 'read_document', { workspace: 'demo', path: 'a.md' });
	expect(read.isError).toBe(false);
	const { hash } = read.body;
	expect(hash).toMatch(/\S/);
	const update = await tool(jonToken, 'update_document', {
		workspace: 'demo',
		path: 'a.md',
		content: '# A\n\nNew.\n',
		expected_hash: hash
	});
	expect(update.isError).toBe(false);
	expect(update.body.hash).not.toBe(hash);
	const [last] = await history('demo', 'a.md', owner);
	expect(last).toMatchObject({ message: 'Update a.md', name: 'Jon', agent: 'claude' });
	const stale = await tool(jonToken, 'update_document', {
		workspace: 'demo',
		path: 'a.md',
		content: 'Again.\n',
		expected_hash: hash
	});
	expect(stale.isError).toBe(true);
	expect(stale.body.error.code).toBe('conflict');
	expect(stale.body.error.currentHash).toBe(update.body.hash);
});

it('refuses content that is not well-formed', async () => {
	const res = await tool(jonToken, 'create_document', { workspace: 'demo', path: 'b.md', content: 'x\ud800y' });
	expect(res.isError).toBe(true);
	expect(res.body.error.code).toBe('bad_request');
	const tree = await tool(jonToken, 'list_tree', { workspace: 'demo' });
	expect(JSON.stringify(tree.body)).not.toContain('b.md');
});

it("a reader's agent cannot write", async () => {
	const res = await tool(annToken, 'create_document', { workspace: 'demo', path: 'b.md', content: 'B\n' });
	expect(res.isError).toBe(true);
	expect(res.body.error.code).toBe('forbidden');
});

it('an access token for another resource is refused', async () => {
	const verifier = 'a-verifier-of-enough-length-to-be-realistic-0123456789';
	const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
	const { clientId } = registerClient({ redirect_uris: [redirectUri], client_name: 'Claude' });
	const accessToken = (resource: string) => {
		const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
		const code = issueCode({ clientId, redirectUri, codeChallenge, resource, userId: jon.id, agentName: 'Claude web' });
		return exchangeCode({ code, clientId, redirectUri, codeVerifier: verifier }).access_token;
	};
	expect((await post(accessToken('https://elsewhere.test/mcp'), 'tools/list')).status).toBe(401);
	expect((await post(accessToken(`${ORIGIN}/mcp`), 'tools/list')).status).toBe(200);
});

it("changes reports the agent's human", async () => {
	await importDocument('demo', 'b.md', new TextEncoder().encode('# B\n'), { actor: jon });
	const { body } = await tool(jonToken, 'changes', { workspace: 'demo' });
	expect(body.events.at(-1)).toMatchObject({ type: 'create', path: 'b.md', author: 'Jon' });
	expect(body.events.at(-1).agent).toBeUndefined();
});
