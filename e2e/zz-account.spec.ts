import { expect, test, type Page } from '@playwright/test';

// Named zz- so it runs last: changing the password kills every owner session, including owner.json's.
test.use({ locale: 'en-US' });
test.describe.configure({ mode: 'serial' });

const banner = (page: Page) => page.getByRole('banner');
// The digest section has its own Save.
const saveName = (page: Page) => page.locator('form[action="?/rename"]').getByRole('button', { name: 'Save' });

async function changePassword(page: Page, current: string, next: string) {
	await page.getByLabel('Current password').fill(current);
	await page.getByLabel('New password').fill(next);
	await page.getByRole('button', { name: 'Change password' }).click();
}

test('the owner renames themselves and the header follows', async ({ page }) => {
	await page.goto('/');
	await banner(page).getByText('Owner', { exact: true }).click();
	await banner(page).getByRole('link', { name: 'Account' }).click();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
	await expect(page.getByText('Changes already made keep your previous name.')).toBeVisible();

	await page.getByLabel('Display name').fill('Owner 2');
	await saveName(page).click();
	await expect(page.getByRole('status')).toHaveText('Name saved');
	await expect(banner(page).getByText('Owner 2')).toBeVisible();

	await page.getByLabel('Display name').fill('   ');
	await saveName(page).click();
	await expect(page.getByRole('alert')).toHaveText('Enter a name of 1 to 80 characters.');

	// Restore for anything that reads the owner's name later.
	await page.getByLabel('Display name').fill('Owner');
	await saveName(page).click();
	await expect(banner(page).getByText('Owner', { exact: true })).toBeVisible();
});

test('a wrong current password or a short new one is refused', async ({ page }) => {
	await page.goto('/account');
	await changePassword(page, 'not-the-password', 'a brand new one');
	await expect(page.getByRole('alert')).toHaveText('The current password is incorrect.');
	await expect(page.getByLabel('Current password')).toHaveAttribute('aria-describedby', 'password-error');
	await changePassword(page, 'inkmesh-dev', 'short');
	await expect(page.getByRole('alert')).toHaveText('The new password needs at least 10 characters.');
});

test('a new password keeps this session and works at the next login', async ({ page }) => {
	await page.goto('/account');
	await changePassword(page, 'inkmesh-dev', 'a brand new one');
	await expect(page.getByRole('status')).toHaveText('Password changed');
	// Every session died with the change; this one was reissued.
	await page.goto('/account');
	await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();

	await banner(page).getByText('Owner', { exact: true }).click();
	await banner(page).getByRole('button', { name: 'Log out' }).click();
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByLabel('Password').fill('inkmesh-dev');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
	await page.getByLabel('Password').fill('a brand new one');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$/);

	// Restore so login.spec (anonymous project) still signs in with the seed password.
	await page.goto('/account');
	await changePassword(page, 'a brand new one', 'inkmesh-dev');
	await expect(page.getByRole('status')).toHaveText('Password changed');
});
