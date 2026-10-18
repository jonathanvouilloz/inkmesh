import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('anonymous visitors are sent to login and come back', async ({ page }) => {
	await page.goto('/demo');
	await expect(page).toHaveURL(/\/login\?next=%2Fdemo$/);
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByLabel('Password').fill('inkmesh-dev');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/demo$/);
});

test('a wrong password stays on the form with one generic message', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect');
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByLabel('Email')).toHaveValue('owner@inkmesh.local');
});

test('logout returns to login', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByLabel('Password').fill('inkmesh-dev');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$/);
	await page.getByRole('banner').getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/demo');
	await expect(page).toHaveURL(/\/login\?next=%2Fdemo$/);
	// A GET on /logout only bounces home, which sends the anonymous visitor to login.
	await page.goto('/logout');
	await expect(page).toHaveURL(/\/login\?next=%2F$/);
});
