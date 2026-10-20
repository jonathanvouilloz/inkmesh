import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

test('well-known routes resolve on the built app', async ({ request }) => {
	const res = await request.get('/.well-known/oauth-authorization-server');
	expect(res.status()).toBe(200);
	expect((await res.json()).issuer).toBe('http://localhost:4173');
	const resource = await request.get('/.well-known/oauth-protected-resource/mcp');
	expect((await resource.json()).resource).toBe('http://localhost:4173/mcp');
});

test('a logged-out visitor signs in and lands on the consent screen', async ({ browser, request }) => {
	const res = await request.post('/oauth/register', {
		data: { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' }
	});
	const { client_id } = await res.json();
	const query = new URLSearchParams({
		response_type: 'code',
		client_id,
		redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
		code_challenge: 'c'.repeat(43),
		code_challenge_method: 'S256',
		state: 's1'
	});
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/oauth/authorize?' + query);
	await expect(page).toHaveURL(/\/login\?next=/);
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByLabel('Password').fill('inkmesh-dev');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/oauth/authorize?' + query);
	await expect(page.getByRole('heading', { name: 'Claude wants to act as you' })).toBeVisible();
	await expect(page.getByText('claude.ai', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Name of this agent')).toHaveValue('Claude');
	// A refused name keeps the visitor on the consent screen, not on the invalid-request page.
	await page.getByLabel('Name of this agent').fill('<b>');
	await page.getByRole('button', { name: 'Allow' }).click();
	await expect(page.getByRole('alert')).toHaveText('1 to 40 characters, without < or >');
	await expect(page.getByLabel('Name of this agent')).toHaveValue('<b>');
	await expect(page.getByRole('heading', { name: 'Claude wants to act as you' })).toBeVisible();
	const consent = await context.request.get('/oauth/authorize?' + query);
	expect(consent.headers()['x-frame-options']).toBe('DENY');
	expect(consent.headers()['content-security-policy']).toBe("frame-ancestors 'none'");
	// SvelteKit routes on the decoded path: an encoded one reaches the same page and needs the same headers.
	const encoded = await context.request.get('/oauth/%61uthorize?' + query);
	expect(encoded.status()).toBe(200);
	expect(encoded.headers()['x-frame-options']).toBe('DENY');
	expect(encoded.headers()['content-security-policy']).toBe("frame-ancestors 'none'");
	query.set('redirect_uri', 'https://evil.example/cb');
	const invalid = await context.request.get('/oauth/authorize?' + query, { maxRedirects: 0 });
	expect(invalid.status()).toBe(400);
	expect(await invalid.text()).toContain('This connection request is not valid.');
	await context.close();
});

test('the whole OAuth flow ends in a tool call', async ({ page, request }) => {
	const redirectUri = 'http://localhost:9/callback';
	const resource = 'http://localhost:4173/mcp';
	const registered = await request.post('/oauth/register', {
		data: { redirect_uris: [redirectUri], client_name: 'E2E client' }
	});
	expect(registered.status()).toBe(201);
	const { client_id } = await registered.json();
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const query = new URLSearchParams({
		response_type: 'code',
		client_id,
		redirect_uri: redirectUri,
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state: 'e2e-state',
		resource
	});
	// Nothing listens on port 9: answer the redirect in the browser so the navigation ends cleanly.
	await page.route('http://localhost:9/**', (route) => route.fulfill({ body: 'ok' }));
	// Hydration rewrites the prefilled name, which would move the caret mid-fill: wait for it.
	await page.goto('/oauth/authorize?' + query, { waitUntil: 'networkidle' });
	await page.getByLabel('Name of this agent').fill('e2e-oauth');
	const [callback] = await Promise.all([
		page.waitForRequest(/localhost:9\/callback/),
		page.getByRole('button', { name: 'Allow' }).click()
	]);
	const answer = new URL(callback.url()).searchParams;
	expect(answer.get('state')).toBe('e2e-state');
	expect(answer.get('iss')).toBe('http://localhost:4173');
	const code = answer.get('code')!;
	expect(code).toBeTruthy();

	const exchanged = await request.post('/oauth/token', {
		form: { grant_type: 'authorization_code', code, client_id, redirect_uri: redirectUri, code_verifier: verifier, resource }
	});
	expect(exchanged.status()).toBe(200);
	const tokens = await exchanged.json();
	expect(tokens.token_type).toBe('Bearer');

	const workspaces = await callTool(request, tokens.access_token, 'list_workspaces', {});
	expect(workspaces).toContain('"demo"');
	await callTool(request, tokens.access_token, 'create_document', {
		workspace: 'demo',
		path: 'e2e-oauth/note.md',
		content: '# Note\n'
	});
	await page.goto('/demo/e2e-oauth/note.md');
	const rows = page.getByRole('complementary').getByRole('listitem');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Owner via e2e-oauth');

	const refreshed = await request.post('/oauth/token', {
		form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id }
	});
	expect(refreshed.status()).toBe(200);
	const next = await refreshed.json();
	expect(next.access_token).not.toBe(tokens.access_token);
	expect(next.refresh_token).not.toBe(tokens.refresh_token);
	const replayed = await request.post('/oauth/token', {
		form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id }
	});
	expect(replayed.status()).toBe(400);
	expect((await replayed.json()).error).toBe('invalid_grant');
});

let rpcId = 0;
// Returns the tool's text result; the MCP endpoint may answer in JSON or as one server-sent event.
async function callTool(request: APIRequestContext, token: string, name: string, args: object): Promise<string> {
	const res = await request.post('/mcp', {
		headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream' },
		data: { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }
	});
	expect(res.status()).toBe(200);
	const text = await res.text();
	const json = res.headers()['content-type']?.includes('text/event-stream')
		? text.split('\n').find((line) => line.startsWith('data:'))!.slice(5)
		: text;
	const { result } = JSON.parse(json);
	expect(result.isError).toBeFalsy();
	return result.content[0].text;
}

test('a name typed on the consent screen before it hydrates survives hydration', async ({ page, request }) => {
	const redirectUri = 'http://localhost:9/callback';
	const registered = await request.post('/oauth/register', {
		data: { redirect_uris: [redirectUri], client_name: 'Slow client' }
	});
	const { client_id } = await registered.json();
	const query = new URLSearchParams({
		response_type: 'code',
		client_id,
		redirect_uri: redirectUri,
		code_challenge: 'c'.repeat(43),
		code_challenge_method: 'S256',
		state: 's'
	});
	// Hold the client scripts, as a slow network would, so the typing lands on the server-rendered form.
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await held;
		await route.continue();
	});
	await page.goto('/oauth/authorize?' + query, { waitUntil: 'commit' });
	const name = page.getByLabel('Name of this agent');
	await expect(name).toHaveValue('Slow client');
	await name.fill('typed early');
	release();
	await page.waitForLoadState('networkidle');
	await expect(name).toHaveValue('typed early');
	// The hint below the field follows the name the visitor typed.
	await expect(page.getByText(/via typed early/)).toBeVisible();
});
