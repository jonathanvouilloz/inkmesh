import { expect, test } from '@playwright/test';

// Only touches e2e-search/: other specs count the seeded documents' history.
test.use({ locale: 'en-US' });

test('search from the header', async ({ page }) => {
	await page.goto('/demo');
	const rail = page.locator('#rail');
	await rail.getByText('New document', { exact: true }).click();
	await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill('e2e-search/quokka.md');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByTestId('file-strip').getByText('e2e-search/quokka.md', { exact: true })).toBeVisible();

	const box = page.getByRole('search').getByLabel('Search this workspace');
	await box.fill('quokk');
	await box.press('Enter');
	await expect(page).toHaveURL('/demo/-/search?q=quokk');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for quokk');
	const hit = page.getByRole('main').getByRole('listitem').filter({ hasText: 'e2e-search/quokka.md' });
	await expect(hit.locator('mark')).toHaveText('quokka');

	await hit.getByRole('link', { name: 'quokka' }).click();
	await expect(page).toHaveURL('/demo/e2e-search/quokka.md');
});

test('a query that finds nothing says so', async ({ page }) => {
	await page.goto('/demo/-/search?q=zzyzxnothing');
	await expect(page.getByText('No document contains zzyzxnothing.')).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the results page offers its own search box', async ({ page }) => {
		await page.goto('/demo/-/search?q=zzyzxnothing');
		const box = page.getByRole('main').getByRole('searchbox', { name: 'Search this workspace' });
		await expect(box).toHaveValue('zzyzxnothing');
		await expect(box).toHaveAttribute('placeholder', 'Search');
		await box.fill('quokka');
		await page.getByRole('main').getByRole('button', { name: 'Search' }).click();
		await expect(page).toHaveURL('/demo/-/search?q=quokka');
	});
});
