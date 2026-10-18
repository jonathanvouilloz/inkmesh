import { expect, test, type Page } from '@playwright/test';

const strip = (page: Page) => page.getByTestId('file-strip');

test.describe('English', () => {
	test.use({ locale: 'en-US' });

	test('the document page shows strip, editor and right rail', async ({ page }) => {
		await page.goto('/demo/examples/kitchen-sink.md');
		const path = strip(page).getByText('examples/kitchen-sink.md', { exact: true });
		await expect(path).toBeVisible();
		expect(await path.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Fragment Mono');
		await expect(page.locator('.milkdown h1')).toHaveText('Weekly agent report');

		const details = page.getByRole('complementary');
		await expect(details.getByRole('heading', { name: 'File' })).toBeVisible();
		await expect(details.getByText('title', { exact: true })).toBeVisible();
		await expect(details.getByText('Weekly agent report', { exact: true })).toBeVisible();
		await expect(details.getByRole('heading', { name: 'History' })).toBeVisible();
		const rows = details.getByRole('listitem');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText('Seed demo workspace');

		const toggle = strip(page).getByRole('button', { name: 'Raw' });
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		const raw = page.locator('textarea');
		await expect(raw).toBeVisible();
		// The body keeps the blank line that follows the frontmatter on disk.
		expect(await raw.inputValue()).toMatch(/^\n?# /);
		await expect(page.locator('.milkdown')).toHaveCount(0);

		await toggle.click();
		await expect(raw).toBeHidden();
		await expect(page.locator('.milkdown h1')).toHaveText('Weekly agent report');
		await expect(page.locator('.milkdown')).toContainText('reporting agent');
	});

	test('the active document is current in the tree', async ({ page }) => {
		await page.goto('/demo/project/prd.md');
		await expect(page.getByRole('navigation').locator('a[aria-current="page"]')).toHaveAttribute(
			'href',
			'/demo/project/prd.md'
		);
	});

	test('a path with an accent opens and is current in the tree', async ({ page }) => {
		const response = await page.goto('/demo/notes/%C3%A9t%C3%A9.md');
		if (response?.status() === 404) {
			await page.goto('/demo');
			await page.getByText('New document', { exact: true }).click();
			await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill('notes/été.md');
			await page.getByRole('button', { name: 'Create' }).click();
		}
		await expect(strip(page).getByText('notes/été.md', { exact: true })).toBeVisible();
		await expect(page.locator('.milkdown h1')).toHaveText('été');
		await expect(page.getByRole('navigation').locator('a[aria-current="page"]')).toHaveText('été');
	});

	test('a missing document is a 404', async ({ page }) => {
		expect((await page.goto('/demo/examples/nope.md'))?.status()).toBe(404);
		expect((await page.goto('/demo/examples'))?.status()).toBe(404);
		expect((await page.goto('/demo/examples/kitchen-sink.md/x'))?.status()).toBe(404);
	});
});

test.describe('French', () => {
	test.use({ locale: 'fr-FR' });

	test('the document page speaks French', async ({ page }) => {
		await page.goto('/demo/examples/kitchen-sink.md');
		await expect(strip(page).getByRole('button', { name: 'Brut' })).toBeVisible();
		const details = page.getByRole('complementary');
		await expect(details.getByRole('heading', { name: 'Fichier' })).toBeVisible();
		await expect(details.getByRole('heading', { name: 'Historique' })).toBeVisible();
	});
});

test.describe('Mobile', () => {
	test.use({ locale: 'en-US', viewport: { width: 390, height: 844 } });

	test('the strip stays one line and the details open as a sheet', async ({ page }) => {
		await page.goto('/demo/examples/kitchen-sink.md');
		expect((await strip(page).boundingBox())?.height).toBe(36);
		const details = page.getByRole('complementary');
		await expect(details).toBeHidden();
		await strip(page).getByRole('button', { name: 'Details' }).click();
		await expect(details).toBeInViewport();
		await expect(details.getByRole('heading', { name: 'History' })).toBeVisible();
		await strip(page).getByRole('button', { name: 'Details' }).click();
		await expect(details).toBeHidden();
	});
});
