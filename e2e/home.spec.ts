import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

test('home lists my workspaces with my role', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const row = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Demo' });
	await expect(row.getByRole('link', { name: 'Demo' })).toHaveAttribute('href', '/demo');
	await expect(row.getByText('Owner', { exact: true })).toBeVisible();
	await expect(row.getByText('demo', { exact: true })).toBeVisible();
});

test('an admin creates a workspace and lands in it', async ({ page }) => {
	await page.goto('/');
	await page.getByText('New workspace', { exact: true }).click();
	await page.getByLabel('Name').fill('Side Project');
	await expect(page.getByLabel('Slug')).toHaveValue('side-project');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/side-project$/);
	await expect(
		page.getByRole('main').getByText('This folder is empty. Drop .md files here or import them.')
	).toBeVisible();
	// The switcher now lists both workspaces, the new one current.
	await page.getByRole('banner').getByText('Side Project', { exact: true }).click();
	await expect(page.getByRole('banner').getByRole('link', { name: /Demo/ })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('banner').getByRole('link', { name: /Demo/ })).toBeHidden();
});

test('the switcher leads an admin to the open create form', async ({ page }) => {
	await page.goto('/demo');
	const header = page.getByRole('banner');
	await header.getByText('Demo', { exact: true }).click();
	await header.getByRole('link', { name: 'New workspace' }).click();
	await expect(page).toHaveURL(/\/\?new$/);
	await expect(page.getByLabel('Name')).toBeFocused();
	await expect(page.getByLabel('Slug')).toBeVisible();
});

test('a bad slug is refused inline', async ({ page }) => {
	await page.goto('/');
	await page.getByText('New workspace', { exact: true }).click();
	await page.getByLabel('Name').fill('Équipe');
	await expect(page.getByLabel('Slug')).toHaveValue('equipe');
	await page.getByLabel('Slug').fill('Bad Slug');
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByText('Lowercase letters, digits and dashes only, 2 to 40 characters')).toBeVisible();
	await expect(page.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
});

test('the rail links to members, the user menu to account, the wordmark home', async ({ page }) => {
	await page.goto('/demo');
	const members = page.locator('#rail').getByRole('link', { name: 'Members' });
	await expect(members).toHaveAttribute('href', '/demo/members');
	await members.click();
	await expect(members).toHaveAttribute('aria-current', 'page');
	const header = page.getByRole('banner');
	await header.getByText('Owner', { exact: true }).click();
	await expect(header.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
	await page.keyboard.press('Escape');
	await expect(header.getByRole('link', { name: 'Account' })).toBeHidden();
	await header.getByRole('link', { name: 'inkmesh' }).click();
	await expect(page).toHaveURL(/\/$/);
});
