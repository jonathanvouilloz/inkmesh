import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Only touches e2e-collab/ and what is created in it: other specs count the seeded documents' history.
const root = path.resolve(process.env.INKMESH_DATA!, 'workspaces/demo');
const rail = (page: Page) => page.locator('#rail');
const strip = (page: Page) => page.getByTestId('file-strip');
const history = (page: Page) => page.getByRole('complementary').getByRole('listitem');

async function newDocument(page: Page, path: string) {
	await page.goto('/demo');
	await rail(page).getByText('New document', { exact: true }).click();
	await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill(path);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(strip(page).getByText(path, { exact: true })).toBeVisible();
}

test.use({ locale: 'en-US' });

test('comment, resolve and reopen', async ({ page }) => {
	await newDocument(page, 'e2e-collab/comments.md');
	const comments = page.getByRole('region', { name: 'Comments' });
	await expect(comments.getByText('No comments yet.')).toBeVisible();

	await comments.getByRole('button', { name: 'Comment' }).click();
	await expect(comments.getByRole('alert')).toHaveText('Write something first.');

	await comments.getByLabel('Add a comment').fill('The **second** table needs a total.');
	await comments.getByRole('button', { name: 'Comment' }).click();
	const open = comments.getByRole('listitem');
	await expect(open).toHaveCount(1);
	await expect(open).toContainText('Owner');
	await expect(open.locator('strong')).toHaveText('second');
	await expect(comments.getByLabel('Add a comment')).toHaveValue('');
	await expect(comments.getByRole('alert')).toHaveCount(0);

	await open.getByRole('button', { name: 'Resolve' }).click();
	await expect(comments.getByText('No comments yet.')).toBeVisible();
	// The clicked button left the list; focus is not lost to the page.
	await expect(comments.getByRole('heading', { name: 'Comments' })).toBeFocused();
	await comments.getByText('1 resolved').click();
	const resolved = comments.locator('details').getByRole('listitem');
	await expect(resolved).toContainText('The second table needs a total.');

	await resolved.getByRole('button', { name: 'Reopen' }).click();
	await expect(comments.getByText('1 resolved')).toHaveCount(0);
	await expect(comments.getByRole('listitem')).toContainText('The second table needs a total.');
	await expect(comments.getByRole('button', { name: 'Resolve' })).toBeVisible();
});

test('a hand-edited thread with two comments sharing an id still loads', async ({ page }) => {
	const doc = 'e2e-collab/twins.md';
	await newDocument(page, doc);
	const heading = '## Ann · 2026-01-02T03:04:05.000Z';
	const thread = path.join(root, '.inkmesh/comments', doc);
	fs.mkdirSync(path.dirname(thread), { recursive: true });
	fs.writeFileSync(thread, `${heading}\n\nFirst\n\n${heading}\n\nSecond\n`);
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(err.message));
	await page.goto(`/demo/${doc}`, { waitUntil: 'networkidle' });
	const comments = page.getByRole('region', { name: 'Comments' });
	await expect(comments.getByRole('listitem')).toHaveText([/First/, /Second/]);
	await comments.getByLabel('Add a comment').fill('Third');
	await comments.getByRole('button', { name: 'Comment' }).click();
	await expect(comments.getByRole('listitem')).toHaveCount(3);
	expect(errors).toEqual([]);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a refused comment shows why and keeps its text', async ({ page }) => {
		await page.goto('/demo/e2e-collab/comments.md');
		const comments = page.getByRole('region', { name: 'Comments' });
		const long = 'x'.repeat(10_001);
		await comments.getByLabel('Add a comment').fill(long);
		await comments.getByRole('button', { name: 'Comment' }).click();
		await expect(comments.getByRole('alert')).toHaveText('Use at most 10,000 characters.');
		await expect(comments.getByLabel('Add a comment')).toHaveValue(long);
	});
});

test('restore an earlier version', async ({ page }) => {
	const doc = 'e2e-collab/restore.md';
	await newDocument(page, doc);
	await page.locator('.milkdown h1').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' edited');
	await expect(strip(page).getByRole('status')).toHaveText('Saved', { timeout: 5000 });

	// Leaving commits the editing session; come back once it is in the history.
	await page.goto('/demo');
	await expect
		.poll(() => execFileSync('git', ['-C', root, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim())
		.toBe(`Update ${doc}`);
	await page.goto(`/demo/${doc}`);
	await expect(history(page)).toHaveCount(2);

	await history(page).nth(1).getByRole('link', { name: `Create ${doc}` }).click();
	await expect(page).toHaveURL(/\?v=[0-9a-f]{40}$/);
	await expect(page.getByRole('heading', { name: 'restore', exact: true })).toBeVisible();
	await expect(page.locator('.milkdown')).toHaveCount(0);
	await expect(strip(page)).toContainText(/Version [0-9a-f]{7}/);
	await expect(page.getByText(/^Version of .+ by Owner$/)).toBeVisible();

	await page.getByRole('button', { name: 'Restore this version' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('Restore this version? The current text stays in the history.');
	await dialog.getByRole('button', { name: 'Restore this version' }).click();

	await expect(page).toHaveURL(new RegExp(`/demo/${doc}$`));
	await expect(page.locator('.milkdown h1')).toHaveText('restore');
	await expect(history(page).first()).toContainText(/^Owner.*Restore e2e-collab\/restore\.md to [0-9a-f]{7}$/);
});

test('restore a deleted document', async ({ page }) => {
	// Not gone.md: files.spec checks that no tree link named gone remains after its own delete.
	const doc = 'e2e-collab/trashed.md';
	await newDocument(page, doc);
	await strip(page).getByText('Actions', { exact: true }).click();
	await strip(page).getByRole('button', { name: 'Delete' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/demo\/e2e-collab$/);
	await expect(rail(page).getByRole('link', { name: 'trashed' })).toHaveCount(0);

	await rail(page).getByRole('link', { name: 'Deleted documents' }).click();
	await expect(page.getByRole('heading', { name: 'Deleted documents' })).toBeVisible();
	// Every column has a header, the action column a visually hidden one.
	await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(1);
	const row = page.getByRole('row').filter({ hasText: doc });
	await expect(row).toContainText('Owner');
	await row.getByRole('button', { name: 'Restore' }).click();

	await expect(page).toHaveURL(new RegExp(`/demo/${doc}$`));
	await expect(strip(page).getByText(doc, { exact: true })).toBeVisible();
	await expect(rail(page).getByRole('link', { name: 'trashed' })).toBeVisible();
});
