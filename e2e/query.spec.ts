import { expect, test, type Page } from '@playwright/test';

// Only touches e2e-query/ and the public links it creates, all removed after each test (share.spec counts the links).
test.use({ locale: 'en-US' });

const origin = { origin: 'http://localhost:4173' };
const hydrated = { waitUntil: 'networkidle' } as const;
const list = (page: Page) => page.locator('section > ul a');
const files = [
	['a.md', '---\ndate: 2026-01-05\nstatus: draft\ntags: [q3, ops]\n---\n# Alpha\n'],
	['b.md', '---\ndate: 2026-03-01\nstatus: done\ntags: [q3]\n---\n# Beta\n'],
	['c.md', '---\ndate: 2026-02-10\nstatus: draft\n---\n# Gamma\n']
];

test.beforeEach(async ({ page }) => {
	await page.goto('/demo', hydrated);
	await page.getByRole('main').getByText('New folder', { exact: true }).click();
	await page.getByLabel('Folder name').fill('e2e-query');
	await page.getByRole('main').getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-query$/);
	await page.waitForLoadState('networkidle');
	await page.locator('input[type="file"]').setInputFiles(
		files.map(([name, text]) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) }))
	);
	await expect(page.getByText('3 imported')).toBeVisible();
});

test.afterEach(async ({ page }) => {
	const res = await page.request.post('/demo?/delete', { headers: origin, form: { path: 'e2e-query' } });
	expect(res.ok()).toBe(true);
	await page.goto('/demo/members#public-links', hydrated);
	const buttons = page.getByRole('table', { name: 'Public links' }).getByRole('button', { name: /^Revoke/ });
	for (let left = await buttons.count(); left > 0; left--) {
		await buttons.first().click();
		await page.getByRole('dialog', { name: 'Revoke' }).getByRole('button', { name: 'Revoke' }).click();
		await expect(buttons).toHaveCount(left - 1);
	}
});

test('sort and filter by URL', async ({ page }) => {
	await page.goto('/demo/e2e-query?sort=date&order=desc');
	await expect(list(page)).toHaveText(['Beta', 'Gamma', 'Alpha']);
	// Sorting by a field shows its value in place of the file name.
	await expect(page.locator('section > ul .file')).toHaveText(['2026-03-01', '2026-02-10', '2026-01-05']);
	await page.goto('/demo/e2e-query?status=draft&sort=date');
	await expect(list(page)).toHaveText(['Alpha', 'Gamma']);
	await expect(page.getByText('Showing documents where status is draft.')).toBeVisible();
	await page.goto('/demo/e2e-query?status=nothing');
	await expect(page.getByText('No document matches.')).toBeVisible();
});

test('filter with the form and keyboard', async ({ page }) => {
	await page.goto('/demo/e2e-query', hydrated);
	const sort = page.getByLabel('Sort by');
	while (!(await sort.evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab');
	await sort.selectOption('date');
	await page.getByLabel('Add a filter').selectOption('tags');
	await page.getByLabel('Value').fill('q3');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/demo\/e2e-query\?sort=date&tags=q3$/);
	await expect(list(page)).toHaveText(['Alpha', 'Beta']);
	await expect(page.getByLabel('Value')).toHaveValue('');

	await page.getByRole('link', { name: 'Clear filters' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-query\?sort=date$/);
	await expect(list(page)).toHaveText(['Alpha', 'Gamma', 'Beta']);
});

test('the shared URL shows the same list', async ({ page, context }) => {
	await page.goto('/demo/e2e-query?tags=q3&sort=date&order=desc');
	await expect(list(page)).toHaveText(['Beta', 'Alpha']);
	const other = await context.newPage();
	await other.goto(page.url());
	await expect(list(other)).toHaveText(['Beta', 'Alpha']);
	await other.close();
});

test('fits a phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/demo/e2e-query?status=draft&sort=date');
	await expect(list(page)).toHaveText(['Alpha', 'Gamma']);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('a public workspace link filters too', async ({ page, browser }) => {
	await page.goto('/demo/members#public-links', hydrated);
	await page.getByLabel('Covers').selectOption({ label: 'Whole workspace' });
	await page.getByRole('combobox', { name: 'Sign-up', exact: true }).selectOption({ label: 'Off' });
	await page.getByRole('button', { name: 'Create public link' }).click();
	const field = page.getByRole('textbox', { name: 'Public link', exact: true });
	await expect(field).toHaveValue(/^http:\/\/localhost:4173\/s\/[\w-]{43}$/);
	const url = await field.inputValue();

	const visitor = await browser.newContext({ locale: 'en-US', storageState: { cookies: [], origins: [] } });
	const view = await visitor.newPage();
	await view.goto(`${url}/e2e-query?status=done`);
	await expect(list(view)).toHaveText(['Beta']);
	// No JavaScript on public pages: the form submits as a plain GET and the server redirects.
	await view.getByLabel('Add a filter').selectOption('status');
	await view.getByLabel('Value').fill('draft');
	await view.getByRole('button', { name: 'Apply' }).click();
	await expect(view).toHaveURL(`${url}/e2e-query?status=draft`);
	await expect(list(view)).toHaveText(['Alpha', 'Gamma']);
	await visitor.close();
});
