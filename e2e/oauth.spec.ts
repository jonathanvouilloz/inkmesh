import { expect, test } from '@playwright/test';

test('well-known routes resolve on the built app', async ({ request }) => {
	const res = await request.get('/.well-known/oauth-authorization-server');
	expect(res.status()).toBe(200);
	expect((await res.json()).issuer).toBe('http://localhost:4173');
	const resource = await request.get('/.well-known/oauth-protected-resource/mcp');
	expect((await resource.json()).resource).toBe('http://localhost:4173/mcp');
});
