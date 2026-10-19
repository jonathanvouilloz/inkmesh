import { expect, test } from '@playwright/test';

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
	await expect(page.getByRole('alert')).toHaveText('Use 1 to 40 characters, without < or >');
	await expect(page.getByLabel('Name of this agent')).toHaveValue('<b>');
	await expect(page.getByRole('heading', { name: 'Claude wants to act as you' })).toBeVisible();
	const consent = await context.request.get('/oauth/authorize?' + query);
	expect(consent.headers()['x-frame-options']).toBe('DENY');
	expect(consent.headers()['content-security-policy']).toBe("frame-ancestors 'none'");
	query.set('redirect_uri', 'https://evil.example/cb');
	const invalid = await context.request.get('/oauth/authorize?' + query, { maxRedirects: 0 });
	expect(invalid.status()).toBe(400);
	expect(await invalid.text()).toContain('This connection request is not valid.');
	await context.close();
});
