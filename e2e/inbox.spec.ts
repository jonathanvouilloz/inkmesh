import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test("the inbox counts an agent's drop", async ({ page }) => {
	// Earlier specs leave unread lines: start from an empty count.
	await page.goto('/inbox');
	const markRead = page.getByRole('button', { name: 'Mark all as read' });
	if (await markRead.isVisible()) await markRead.click();
	const link = page.getByRole('banner').getByRole('link', { name: /^Inbox/ });
	await expect(link).toHaveText('Inbox');

	await page.goto('/demo/-/connect');
	await page.getByRole('radio', { name: 'Script or HTTP API' }).check();
	await page.getByRole('textbox', { name: 'Agent name' }).fill('e2e-inbox');
	await page.getByRole('button', { name: 'Create token' }).click();
	const token = await page.getByLabel('Token', { exact: true }).inputValue();
	const put = await page.request.put('/api/v1/workspaces/demo/documents/e2e-inbox/report.md', {
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/markdown' },
		data: '# Report\n'
	});
	expect(put.status()).toBe(201);

	await page.reload();
	await expect(link).toHaveText('Inbox 1');
	await expect(link).toHaveAccessibleName('Inbox, 1 unread');
	await link.click();
	await expect(page).toHaveURL('/inbox');
	const line = page.getByRole('listitem').filter({ hasText: 'e2e-inbox/report.md' });
	await expect(line).toContainText('Owner created e2e-inbox/report.md via e2e-inbox');
	await expect(line).toContainText('New');
	await expect(line.getByRole('link', { name: 'e2e-inbox/report.md' })).toHaveAttribute(
		'href',
		'/demo/e2e-inbox/report.md'
	);

	await page.getByRole('button', { name: 'Mark all as read' }).click();
	await expect(link).toHaveText('Inbox');
	await expect(line).not.toContainText('New');
	await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
});
