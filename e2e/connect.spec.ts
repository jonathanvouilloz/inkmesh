import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('create a token, use it, revoke it', async ({ page }) => {
	await page.goto('/demo');
	await page.getByRole('link', { name: 'Connect an agent' }).click();
	await expect(page).toHaveURL('/demo/-/connect');
	await page.getByRole('radio', { name: 'Script or HTTP API' }).check();
	await page.getByRole('textbox', { name: 'Agent name' }).fill('e2e-script');
	await page.getByRole('button', { name: 'Create token' }).click();

	const token = await page.getByLabel('Token', { exact: true }).inputValue();
	expect(token).toMatch(/^ink_[\w-]{43}$/);
	await expect(page.getByText('Copy it now: it will not be shown again.')).toBeVisible();
	await expect(page.getByLabel('Drop a report')).toHaveValue(
		/^curl -X PUT .*http:\/\/localhost:4173\/api\/v1\/workspaces\/demo\/documents\/reports\/report\.md$/
	);

	const put = () =>
		page.request.put('/api/v1/workspaces/demo/documents/reports/e2e.md', {
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/markdown' },
			data: '# Report\n'
		});
	expect((await put()).status()).toBe(201);

	// The page reloads its list every 5 seconds while an agent has not connected yet.
	const row = page.getByRole('row').filter({ hasText: 'e2e-script' });
	await expect(row).not.toContainText('Not connected yet', { timeout: 10_000 });
	await expect(row.locator('time')).toHaveCount(2);

	await row.getByRole('button', { name: 'Revoke' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('Revoke e2e-script? It loses access at once.');
	await dialog.getByRole('button', { name: 'Revoke' }).click();
	await expect(row).toHaveCount(0);
	expect((await put()).status()).toBe(401);
});

test('the Claude Code recipe holds the server URL', async ({ page }) => {
	await page.goto('/demo/-/connect');
	await page.getByRole('radio', { name: 'Claude Code' }).check();
	await expect(page.locator('textarea').first()).toHaveValue(
		'claude mcp add --transport http --scope user inkmesh http://localhost:4173/mcp'
	);
});
