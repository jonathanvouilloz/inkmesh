import { expect, test, type Page } from '@playwright/test';

test.use({ locale: 'en-US' });

const section = (page: Page) => page.locator('section#digest');
const hint = (page: Page) => page.getByRole('link', { name: 'Get these changes by email once a day' });

async function setDigest(page: Page, on: boolean) {
	await page.goto('/account', { waitUntil: 'networkidle' });
	await section(page).getByRole('checkbox').setChecked(on);
	await section(page).getByRole('button', { name: 'Save' }).click();
	await expect(section(page).getByRole('status')).toHaveText('Digest setting saved');
}

// The owner's digest is shared state: leave it off.
test.afterEach(async ({ page }) => setDigest(page, false));

test('turn the daily digest on and off', async ({ page }) => {
	await page.goto('/account', { waitUntil: 'networkidle' });
	await expect(section(page).getByRole('heading', { name: 'Daily digest' })).toBeVisible();
	const box = section(page).getByLabel(
		'Email me a summary of what changed in my workspaces, every day at 08:00 UTC'
	);
	await expect(box).not.toBeChecked();
	await box.check();
	await section(page).getByRole('button', { name: 'Save' }).click();
	await expect(section(page).getByRole('status')).toHaveText('Digest setting saved');
	await page.reload();
	await expect(box).toBeChecked();
	await page.goto('/inbox');
	await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
	await expect(hint(page)).toHaveCount(0);

	await setDigest(page, false);
	await page.goto('/inbox');
	await expect(hint(page)).toHaveAttribute('href', '/account#digest');
});
