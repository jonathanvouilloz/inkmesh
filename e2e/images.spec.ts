import { expect, test, type Page } from '@playwright/test';

// Only touches e2e-images/ and what is created in it: other specs count the seeded documents' history.
const rail = (page: Page) => page.locator('#rail');
const strip = (page: Page) => page.getByTestId('file-strip');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function newDocument(page: Page, path: string) {
	await page.goto('/demo');
	await rail(page).getByText('New document', { exact: true }).click();
	await page.getByLabel('Path of the new document, e.g. notes/idea.md').fill(path);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(strip(page).getByText(path, { exact: true })).toBeVisible();
	await expect(page.locator('.ProseMirror')).toBeVisible();
}

// A paste event as the browser fires it for a copied file.
async function paste(page: Page, name: string, type: string, base64: string) {
	await page.locator('.ProseMirror').click();
	await page.locator('.ProseMirror').evaluate(
		(editor, { name, type, base64 }) => {
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			const clipboardData = new DataTransfer();
			clipboardData.items.add(new File([bytes], name, { type }));
			editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
		},
		{ name, type, base64 }
	);
}

test.use({ locale: 'en-US' });

test('paste an image into the editor', async ({ page }) => {
	await newDocument(page, 'e2e-images/report.md');
	await paste(page, 'image.png', 'image/png', png);
	await expect(page.locator('.ProseMirror img:not(.ProseMirror-separator)')).toHaveCount(1);
	await expect(strip(page).getByRole('status')).toHaveText('Saved', { timeout: 5000 });

	await page.reload();
	const img = page.locator('.ProseMirror img:not(.ProseMirror-separator)');
	await expect(img).toHaveAttribute('src', /report-[0-9a-f]{8}\.png$/);
	await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

	await strip(page).getByRole('button', { name: 'Raw' }).click();
	await expect(page.getByLabel('Raw Markdown')).toHaveValue(/!\[image\]\(report-[0-9a-f]{8}\.png\)/);
});

test('a refused image is announced', async ({ page }) => {
	await newDocument(page, 'e2e-images/refused.md');
	await paste(page, 'x.svg', 'image/svg+xml', btoa('<svg xmlns="http://www.w3.org/2000/svg"/>'));
	await expect(strip(page).getByRole('status')).toHaveText(
		'Image not added: only PNG, JPEG, GIF and WebP images'
	);
	await expect(page.locator('.ProseMirror img:not(.ProseMirror-separator)')).toHaveCount(0);
	await expect(page.locator('.ProseMirror')).not.toContainText('Upload in progress');
});
