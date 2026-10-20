import { expect, test, type Page } from '@playwright/test';

// Only touches e2e-share/ and the links it creates, all revoked at the end.
test.use({ locale: 'en-US' });

const doc = 'e2e-share/field-notes-from-the-long-north-road.md';
const section = (page: Page) => page.getByRole('table', { name: 'Public links' });

test('an owner creates, changes and revokes public links', async ({ page }) => {
	await page.goto('/demo');
	await page.locator('#rail').getByText('New document', { exact: true }).click();
	await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill(doc);
	await page.getByRole('button', { name: 'Create' }).click();
	const strip = page.getByTestId('file-strip');
	await expect(strip.getByText(doc, { exact: true })).toBeVisible();

	// The document's menu preselects it on the members page.
	await strip.getByText('Actions', { exact: true }).click();
	await strip.getByRole('link', { name: 'Public link…' }).click();
	await expect(page).toHaveURL(/\/demo\/members\?share=.+#public-links$/);
	await expect(page.getByLabel('Covers')).toHaveValue(doc);
	await page.getByRole('button', { name: 'Create public link' }).click();
	const url = page.getByRole('textbox', { name: 'Public link', exact: true });
	await expect(url).toHaveValue(/^http:\/\/localhost:4173\/s\/[\w-]{43}$/);
	await expect(url).toBeFocused();
	await expect(page.getByText('This link will not be shown again: copy it now.')).toBeVisible();
	const token = (await url.inputValue()).split('/').pop()!;

	await page.getByLabel('Covers').selectOption({ label: 'Whole workspace' });
	await page.getByRole('combobox', { name: 'Sign-up', exact: true }).selectOption({ label: 'As editor' });
	await page.getByRole('button', { name: 'Create public link' }).click();
	await expect(url).not.toHaveValue(new RegExp(token));
	await expect(section(page).getByRole('row')).toHaveCount(3);

	// Once created, a token is never shown again.
	await page.goto('/demo/members');
	expect(await page.content()).not.toContain(token);
	const docRow = section(page).getByRole('row').filter({ hasText: doc });
	const wsRow = section(page).getByRole('row').filter({ hasText: 'Whole workspace' });
	await expect(wsRow.getByRole('combobox')).toHaveValue('editor');
	await expect(docRow.getByRole('combobox')).toHaveValue('');

	await docRow.getByRole('combobox').selectOption('reader');
	await docRow.getByRole('button', { name: 'Save' }).click();
	await page.reload();
	await expect(docRow.getByRole('combobox')).toHaveValue('reader');

	// Cancelling the dialog keeps the link; confirming removes it.
	await docRow.getByRole('button', { name: /^Revoke/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Revoke' });
	// The dialog names the link: its scope and the end of its token, as its URL ends.
	await expect(dialog).toContainText(`Revoke the link “${doc}\u00a0…\u2060${token.slice(-4)}”? Visitors lose access at once.`);
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(docRow.getByRole('button', { name: /^Revoke/ })).toBeFocused();
	await expect(section(page).getByRole('row')).toHaveCount(3);
	for (const row of [docRow, wsRow]) {
		await row.getByRole('button', { name: /^Revoke/ }).click();
		await dialog.getByRole('button', { name: 'Revoke' }).click();
		await expect(row).toHaveCount(0);
	}
	await expect(page.getByText('No public link.')).toBeVisible();
});
