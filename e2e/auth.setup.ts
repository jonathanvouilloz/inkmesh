import { expect, test as setup } from '@playwright/test';

// Logs in once through the form; the chromium project reuses the session cookie.
setup('log in as the seeded owner', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByLabel('Password').fill('inkmesh-dev');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$/);
	await page.context().storageState({ path: '.data-e2e/owner.json' });
});
