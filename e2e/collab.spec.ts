import { execFileSync } from 'node:child_process';
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
	await comments.getByText('1 resolved').click();
	const resolved = comments.locator('details').getByRole('listitem');
	await expect(resolved).toContainText('The second table needs a total.');

	await resolved.getByRole('button', { name: 'Reopen' }).click();
	await expect(comments.getByText('1 resolved')).toHaveCount(0);
	await expect(comments.getByRole('listitem')).toContainText('The second table needs a total.');
	await expect(comments.getByRole('button', { name: 'Resolve' })).toBeVisible();
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
