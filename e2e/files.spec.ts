import { expect, test, type Locator, type Page } from '@playwright/test';

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
	await page.keyboard.type('b.MD');
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

// A drop from the computer: Playwright cannot drag real files, so the page builds the DataTransfer.
async function dropFiles(page: Page, target: Locator, files: [name: string, content: string][]) {
	const dataTransfer = await page.evaluateHandle((files) => {
		const data = new DataTransfer();
		for (const [name, content] of files) data.items.add(new File([content], name, { type: 'text/markdown' }));
		return data;
	}, files);
	for (const type of ['dragenter', 'dragover', 'drop']) await target.dispatchEvent(type, { dataTransfer });
}
// Drops and the picker only work once the page has hydrated, which load alone does not wait for.
const hydrated = { waitUntil: 'networkidle' } as const;
const folderInTree = (page: Page, name: string) => rail(page).getByRole('link', { name, exact: true });

test('imports dropped files into the hovered folder', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	await dropFiles(page, folderInTree(page, 'e2e-files'), [['dropped.md', '# Dropped\n\nfirst\n']]);
	await expect(page.getByText('1 imported')).toBeVisible();
	await rail(page).getByRole('link', { name: 'Dropped' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files\/dropped\.md$/);
	await expect(page.locator('.milkdown p')).toHaveText('first');
});

test('asks before replacing', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	const dialog = page.getByRole('dialog');
	// Events bubble up, so a drop on the heading reaches the folder view around it.
	const folderView = page.getByRole('main').getByRole('heading', { name: 'e2e-files' });
	await dropFiles(page, folderView, [['dropped.md', '# Dropped\n\nsecond\n']]);
	await expect(dialog.getByRole('heading', { name: 'These documents already exist' })).toBeVisible();
	await expect(dialog.getByRole('listitem')).toHaveText(['dropped.md']);
	await dialog.getByRole('button', { name: 'Keep existing' }).click();
	await expect(dialog).toBeHidden();
	await rail(page).getByRole('link', { name: 'Dropped' }).click();
	await expect(page.locator('.milkdown p')).toHaveText('first');

	await page.goto('/demo/e2e-files', hydrated);
	await dropFiles(page, folderView, [['dropped.md', '# Dropped\n\nsecond\n']]);
	await dialog.getByRole('button', { name: 'Replace' }).click();
	await expect(page.getByText('1 imported')).toBeVisible();
	await rail(page).getByRole('link', { name: 'Dropped' }).click();
	await expect(page.locator('.milkdown p')).toHaveText('second');
	await expect(page.getByRole('complementary').getByRole('listitem').first()).toContainText(
		'Replace e2e-files/dropped.md'
	);
});

test('replacing the open document shows the new text', async ({ page }) => {
	await page.goto('/demo/e2e-files/dropped.md', hydrated);
	await expect(page.locator('.milkdown p')).toHaveText('second');
	await dropFiles(page, folderInTree(page, 'e2e-files'), [['dropped.md', '# Dropped\n\nthird\n']]);
	await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
	await expect(page.locator('.milkdown p')).toHaveText('third');
	await expect(page).toHaveURL(/\/demo\/e2e-files\/dropped\.md$/);
});

test('an edit typed during a replace is kept as a conflict', async ({ page }) => {
	await page.goto('/demo/e2e-files/dropped.md', hydrated);
	await dropFiles(page, folderInTree(page, 'e2e-files'), [['dropped.md', '# Dropped\n\nfourth\n']]);
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route(
		(url) => url.search === '?/import',
		async (route) => {
			await held;
			await route.continue();
		}
	);
	await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
	await page.locator('.milkdown p').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' typed');
	await page.waitForTimeout(300); // Milkdown's change debounce
	release();
	await expect(page.getByText('1 imported')).toBeVisible();
	await expect(strip(page).getByRole('status')).toHaveText(
		'This file changed on disk since you opened it. Reload to see the new version.'
	);
	await expect(page.locator('.milkdown p')).toHaveText('third typed');
});

test('a failed import says so', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	await page.route(
		(url) => url.search === '?/import',
		(route) => route.abort()
	);
	await dropFiles(page, folderInTree(page, 'e2e-files'), [['lost.md', '# Lost\n']]);
	await expect(page.getByText('Import failed. Nothing was imported.')).toBeVisible();
});

test('a file dropped on the editor does not open in the tab', async ({ page }) => {
	await page.goto('/demo/e2e-files/dropped.md', hydrated);
	const cancelled = await page.locator('.milkdown').evaluate((editor) => {
		const data = new DataTransfer();
		data.items.add(new File(['# Away\n'], 'away.md', { type: 'text/markdown' }));
		return ['dragover', 'drop'].map(
			(type) => !editor.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }))
		);
	});
	expect(cancelled).toEqual([true, true]);
	await expect(page).toHaveURL(/\/demo\/e2e-files\/dropped\.md$/);
});

test('reports a refused file', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	await dropFiles(page, folderInTree(page, 'e2e-files'), [['photo.png', 'not markdown']]);
	await expect(page.getByRole('status').filter({ hasText: 'photo.png' })).toHaveText(
		'photo.png: only .md files can be imported'
	);
});

test('drags a document onto a folder', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	await page.getByRole('main').getByText('New folder', { exact: true }).click();
	await page.getByLabel('Folder name').fill('sub');
	await page.getByRole('main').getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-files\/sub$/);
	await newDocument(page, 'e2e-files/drag.md');
	await rail(page).getByRole('link', { name: 'drag', exact: true }).dragTo(folderInTree(page, 'sub'));
	await expect(rail(page).getByRole('link', { name: 'drag', exact: true })).toHaveAttribute(
		'href',
		'/demo/e2e-files/sub/drag.md'
	);
	await expect(page).toHaveURL(/\/demo\/e2e-files\/sub\/drag\.md$/);
});

test('an unsaved edit blocks a drag-move', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	await newDocument(page, 'e2e-files/held.md');
	await page.route(
		(url) => url.search === '?/save',
		(route) => route.abort()
	);
	await page.locator('.milkdown h1').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' lost');
	await page.waitForTimeout(300); // Milkdown's change debounce
	await rail(page).getByRole('link', { name: 'held', exact: true }).dragTo(folderInTree(page, 'sub'));
	await expect(page.getByRole('status').filter({ hasText: 'not saved yet' })).toHaveText(
		'Your last change is not saved yet. Resolve it before renaming, moving or deleting.'
	);
	await expect(page).toHaveURL(/\/demo\/e2e-files\/held\.md$/);
});

test('the file picker imports too', async ({ page }) => {
	await page.goto('/demo/e2e-files', hydrated);
	await page.locator('input[type="file"]').setInputFiles({
		name: 'picked.md',
		mimeType: 'text/markdown',
		buffer: Buffer.from('# Picked\n')
	});
	await expect(page.getByText('1 imported')).toBeVisible();
	await expect(rail(page).getByRole('link', { name: 'Picked' })).toHaveAttribute(
		'href',
		'/demo/e2e-files/picked.md'
	);
});
