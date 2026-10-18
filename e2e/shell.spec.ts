import { expect, test } from '@playwright/test';

test.describe('English', () => {
	test.use({ locale: 'en-US' });

	test('the shell lists the seeded tree', async ({ page }) => {
		await page.goto('/demo');
		const rail = page.getByRole('navigation');
		await expect(rail.getByText('project', { exact: true })).toBeVisible();
		await expect(rail.getByText('examples', { exact: true })).toBeVisible();
		await expect(page.getByText('New document', { exact: true })).toBeVisible();
		await expect(page.getByRole('main').getByText('Pick a document in the tree')).toBeVisible();
	});

	test('a bad path shows an error under the input', async ({ page }) => {
		await page.goto('/demo');
		await page.getByText('New document', { exact: true }).click();
		await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill('../escape.md');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByText('Enter a path ending in .md, without ..')).toBeVisible();
	});

	test('an unknown workspace is a 404', async ({ page }) => {
		const response = await page.goto('/nope');
		expect(response?.status()).toBe(404);
	});

	test('the root redirects to the demo workspace', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/demo$/);
	});
});

test.describe('French', () => {
	test.use({ locale: 'fr-FR' });

	test('the shell speaks French', async ({ page }) => {
		await page.goto('/demo');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(page.getByText('Nouveau document', { exact: true })).toBeVisible();
		await expect(
			page.getByRole('main').getByText("Choisissez un document dans l'arborescence")
		).toBeVisible();
	});
});

test.describe('Mobile', () => {
	test.use({ locale: 'en-US', viewport: { width: 390, height: 844 } });

	test('the rail is a drawer behind the open button', async ({ page }) => {
		await page.goto('/demo');
		const rail = page.getByRole('navigation');
		await expect(rail).toBeHidden();
		await page.getByRole('button', { name: 'Open navigation' }).click();
		await expect(rail).toBeInViewport();
		await expect(rail).toBeFocused();
		await expect(rail.getByText('project', { exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(rail).toBeHidden();
		await page.getByRole('button', { name: 'Open navigation' }).click();
		await page.mouse.click(380, 400); // the backdrop, right of the 240px rail
		await expect(rail).toBeHidden();
	});
});
