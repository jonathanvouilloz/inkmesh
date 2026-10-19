import { expect, test, type Page } from '@playwright/test';

// Only touches e2e-files/ and what is created in it: later specs count the seeded documents' history.
const rail = (page: Page) => page.locator('#rail');
const strip = (page: Page) => page.getByTestId('file-strip');

async function newDocument(page: Page, path: string) {
	await rail(page).getByText('New document', { exact: true }).click();
	await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill(path);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(strip(page).getByText(path, { exact: true })).toBeVisible();
}

// Opens the strip's Actions menu and the named item with the keyboard only.
async function action(page: Page, item: string) {
	await strip(page).getByText('Actions', { exact: true }).focus();
	await page.keyboard.press('Enter');
	const target = strip(page).getByRole('button', { name: item });
	while (!(await target.evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab');
	await page.keyboard.press('Enter');
}

test.use({ locale: 'en-US' });

test('a folder opens as a list', async ({ page }) => {
	await page.goto('/demo');
	await expect(page.getByRole('main').getByRole('heading', { name: 'Demo' })).toBeVisible();
	await page.getByRole('main').getByText('New folder', { exact: true }).click();
	await page.getByLabel('Folder name').fill('e2e-files');
	await page.getByRole('main').getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files$/);
	await expect(page.getByRole('main').getByRole('heading', { name: 'e2e-files' })).toBeVisible();
	await expect(
		page.getByText('This folder is empty. Drop .md files here or import them.')
	).toBeVisible();
	await expect(rail(page).getByRole('link', { name: 'e2e-files' })).toHaveAttribute(
		'href',
		'/demo/e2e-files'
	);

	await page.goto('/demo');
	await rail(page).getByRole('link', { name: 'e2e-files' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files$/);
});

test('rename and move with the keyboard', async ({ page }) => {
	await page.goto('/demo/e2e-files');
	await newDocument(page, 'e2e-files/a.md');

	await action(page, 'Rename');
	const name = page.getByLabel('New name');
	await expect(name).toBeFocused();
	await expect(name).toHaveValue('a.md');
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('b');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/demo\/e2e-files\/b\.md$/);
	await expect(strip(page).getByText('e2e-files/b.md', { exact: true })).toBeVisible();

	await action(page, 'Move to…');
	const select = page.getByRole('dialog').getByRole('combobox');
	await expect(select).toBeFocused();
	await page.keyboard.press('Home');
	await expect(select).toHaveValue('b.md');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/demo\/b\.md$/);
	await expect(rail(page).locator('a[aria-current="page"]')).toHaveAttribute('href', '/demo/b.md');

	// Back into the test folder, so the workspace root keeps only the seeded documents.
	await action(page, 'Move to…');
	await page.getByRole('dialog').getByRole('combobox').selectOption('e2e-files/b.md');
	await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files\/b\.md$/);
	await expect(page.getByRole('dialog')).toBeHidden();
});

test('delete asks first', async ({ page }) => {
	await page.goto('/demo/e2e-files');
	await newDocument(page, 'e2e-files/gone.md');
	await action(page, 'Delete');
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('Delete gone.md? It stays in the history.');
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(strip(page).getByText('Actions', { exact: true })).toBeFocused();

	await action(page, 'Delete');
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files\/gone\.md$/);

	await action(page, 'Delete');
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files$/);
	await expect(rail(page).getByRole('link', { name: 'gone' })).toHaveCount(0);
	// b.md, renamed from a.md, keeps the title of its first heading.
	await expect(page.getByRole('main').getByRole('link', { name: 'a', exact: true })).toBeVisible();
});

test('rename keeps an edit typed just before', async ({ page }) => {
	await page.goto('/demo/e2e-files');
	await newDocument(page, 'e2e-files/edit.md');
	await page.locator('.milkdown h1').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' quickly');
	// Milkdown reports a change 200ms after the last keystroke; the 2s autosave has not run yet.
	await page.waitForTimeout(300);
	await expect(strip(page).getByRole('status')).toHaveText('');
	await action(page, 'Rename');
	await page.getByLabel('New name').fill('edited');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/demo\/e2e-files\/edited\.md$/);
	await expect(page.locator('.milkdown h1')).toHaveText('edit quickly');
});

test('an unsaved edit blocks a rename', async ({ page }) => {
	await page.goto('/demo/e2e-files');
	await newDocument(page, 'e2e-files/stuck.md');
	await page.route(
		(url) => url.search === '?/save',
		(route) => route.abort()
	);
	await page.locator('.milkdown h1').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' lost');
	await page.waitForTimeout(300); // Milkdown's change debounce
	await action(page, 'Rename');
	await page.getByLabel('New name').fill('moved');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
		'Your last change is not saved yet. Resolve it before renaming, moving or deleting.'
	);
	await expect(page).toHaveURL(/\/demo\/e2e-files\/stuck\.md$/);
});
