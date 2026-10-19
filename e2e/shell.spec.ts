import { expect, test } from '@playwright/test';

test.describe('English', () => {
	test.use({ locale: 'en-US' });

	test('the shell lists the seeded tree', async ({ page }) => {
		await page.goto('/demo');
		const rail = page.locator('#rail');
		await expect(rail.getByText('project', { exact: true })).toBeVisible();
		await expect(rail.getByText('examples', { exact: true })).toBeVisible();
		await expect(rail.getByText('New document', { exact: true })).toBeVisible();
		await expect(page.getByRole('main').getByRole('heading', { name: 'Demo' })).toBeVisible();
		await expect(page.getByRole('main').getByRole('link', { name: 'project' })).toHaveAttribute(
			'href',
			'/demo/project'
		);
	});

	test('a tree folder folds with its own button, apart from its link', async ({ page }) => {
		await page.goto('/demo', { waitUntil: 'networkidle' });
		const rail = page.locator('#rail');
		const fold = rail.getByRole('button', { name: 'project', exact: true });
		await expect(fold).toHaveAttribute('aria-expanded', 'true');
		await expect(rail.locator('summary a, button a')).toHaveCount(0);
		await fold.focus();
		await page.keyboard.press('Enter');
		await expect(fold).toHaveAttribute('aria-expanded', 'false');
		await expect(rail.getByRole('link', { name: 'PRD — inkmesh' })).toHaveCount(0);
		await page.keyboard.press('Tab');
		await expect(rail.getByRole('link', { name: 'project', exact: true })).toBeFocused();
	});

	test('a bad path shows an error under the input', async ({ page }) => {
		await page.goto('/demo');
		await page.locator('#rail').getByText('New document', { exact: true }).click();
		await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill('../escape.md');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByText('Enter a path ending in .md, without ..')).toBeVisible();
	});

	test('an existing path says so and keeps the input', async ({ page }) => {
		await page.goto('/demo');
		await page.locator('#rail').getByText('New document', { exact: true }).click();
		const input = page.getByLabel('Path of the new document, e.g. notes/idea.md');
		await input.fill('project/prd.md');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByText('A document with this path already exists')).toBeVisible();
		await expect(input).toHaveValue('project/prd.md');
	});

	test('a missing document shows the error page inside the shell', async ({ page }) => {
		await page.goto('/demo/nope.md');
		await expect(page.getByRole('heading', { name: 'This document does not exist' })).toBeVisible();
		await expect(page.locator('#rail')).toBeVisible();
		await page.getByRole('link', { name: 'Back to the workspace' }).click();
		await expect(page).toHaveURL(/\/demo$/);
	});

	test('an unknown workspace is a 404', async ({ page }) => {
		const response = await page.goto('/nope');
		expect(response?.status()).toBe(404);
	});
});

test.describe('French', () => {
	test.use({ locale: 'fr-FR' });

	test('the shell speaks French', async ({ page }) => {
		await page.goto('/demo');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await expect(
			page.locator('#rail').getByText('Nouveau document', { exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('main').getByText('Nouveau dossier', { exact: true })
		).toBeVisible();
	});
});

test.describe('Mobile', () => {
	test.use({ locale: 'en-US', viewport: { width: 390, height: 844 } });

	test('the rail is a drawer behind the open button', async ({ page }) => {
		await page.goto('/demo');
		const rail = page.locator('#rail');
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
