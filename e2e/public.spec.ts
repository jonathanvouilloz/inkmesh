import { expect, test, type Browser, type Page } from '@playwright/test';

// Only touches e2e-public/ and the links it creates, all revoked after each test (share.spec counts the rows).
test.use({ locale: 'en-US' });

const doc = 'e2e-public/report.md';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const strip = (page: Page) => page.getByTestId('file-strip');
const links = (page: Page) => page.getByRole('table', { name: 'Public links' });
const stranger = (browser: Browser) =>
	browser.newContext({ locale: 'en-US', storageState: { cookies: [], origins: [] } });

async function newDocument(page: Page, path: string) {
	await page.goto('/demo');
	await page.locator('#rail').getByText('New document', { exact: true }).click();
	await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill(path);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(strip(page).getByText(path, { exact: true })).toBeVisible();
}

async function newLink(page: Page, covers: string, signup: string) {
	await page.goto('/demo/members#public-links');
	await page.getByLabel('Covers').selectOption({ label: covers });
	await page.getByRole('combobox', { name: 'Sign-up', exact: true }).selectOption({ label: signup });
	await page.getByRole('button', { name: 'Create public link' }).click();
	const url = page.getByRole('textbox', { name: 'Public links' });
	await expect(url).toHaveValue(/^http:\/\/localhost:4173\/s\/[\w-]{43}$/);
	return url.inputValue();
}

// Runs even when a test fails, so a stray link never reaches share.spec.
test.afterEach(async ({ page }) => {
	await page.goto('/demo/members#public-links', { waitUntil: 'networkidle' });
	const buttons = links(page).getByRole('button', { name: /^Revoke/ });
	for (let left = await buttons.count(); left > 0; left--) {
		await buttons.first().click();
		await page.getByRole('dialog', { name: 'Revoke' }).getByRole('button', { name: 'Revoke' }).click();
		await expect(buttons).toHaveCount(left - 1);
	}
});

async function revoke(page: Page, covers: string) {
	await page.goto('/demo/members#public-links');
	const row = links(page).getByRole('row').filter({ hasText: covers });
	await row.getByRole('button', { name: /^Revoke/ }).click();
	await page.getByRole('dialog', { name: 'Revoke' }).getByRole('button', { name: 'Revoke' }).click();
	await expect(row).toHaveCount(0);
}

test('a document link shows one document to a stranger', async ({ page, browser }) => {
	await newDocument(page, 'e2e-public/sibling.md');
	await newDocument(page, doc);
	const upload = await page.request.post('/demo/-/images', {
		headers: { origin: 'http://localhost:4173' },
		multipart: { doc, file: { name: 'chart.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') } }
	});
	expect(upload.status()).toBe(201);
	const { src } = await upload.json();
	await strip(page).getByRole('button', { name: 'Raw' }).click();
	await page
		.getByRole('textbox', { name: 'Raw Markdown' })
		.fill(`# Public report\n\n![chart](${src})\n\n<script>alert(1)</script>\n`);
	await expect(strip(page).getByRole('status')).toHaveText('Saved', { timeout: 5000 });

	const url = await newLink(page, doc, 'Off');
	const visitor = await stranger(browser);
	const view = await visitor.newPage();
	const response = await view.goto(url);
	expect(view.url()).toBe(`${url}/${doc}`);
	expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
	expect(response?.headers()['set-cookie']).toBeUndefined();
	await expect(view.getByRole('heading', { name: 'Public report' })).toBeVisible();
	const img = view.getByRole('img', { name: 'chart' });
	await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
	expect(await view.content()).not.toContain('<script');
	await expect(view.getByRole('link', { name: 'Join' })).toHaveCount(0);
	expect((await view.goto(`${url}/e2e-public/sibling.md`))?.status()).toBe(404);
	expect((await view.goto(`${url}/e2e-public`))?.status()).toBe(404);
	expect((await visitor.cookies()).length).toBe(0);

	await revoke(page, doc);
	expect((await view.goto(`${url}/${doc}`))?.status()).toBe(404);
	expect((await view.goto(`${url}/e2e-public/${src}`))?.status()).toBe(404);
	await visitor.close();
});

test('a workspace link lets a visitor browse and join', async ({ page, browser }) => {
	const url = await newLink(page, 'Whole workspace', 'As reader');
	const visitor = await stranger(browser);
	const view = await visitor.newPage();
	await view.goto(url);
	await view.getByRole('link', { name: 'e2e-public', exact: true }).click();
	await expect(view.getByRole('heading', { name: 'e2e-public', exact: true })).toBeVisible();
	await view.getByRole('link', { name: 'Public report' }).click();
	await expect(view.getByRole('heading', { name: 'Public report' })).toBeVisible();
	await expect(view.getByRole('navigation', { name: 'Folders' }).getByRole('link', { name: 'e2e-public' })).toBeVisible();

	await view.getByRole('link', { name: 'Join' }).click();
	await expect(view.getByRole('heading', { name: 'Join Demo' })).toBeVisible();
	await view.getByLabel('Name').fill('Pia');
	await view.getByLabel('Email').fill('pia@example.ch');
	await view.getByLabel('Password').fill('ten chars ok');
	await view.getByRole('button', { name: 'Create account' }).click();
	await expect(view).toHaveURL(/\/demo$/);
	await view.goto('/demo/' + doc);
	await expect(view.getByText('You can read this document; editing needs the editor role')).toBeVisible();
	await expect(view.locator('.milkdown .ProseMirror')).toHaveAttribute('contenteditable', 'false');
	await visitor.close();
});
