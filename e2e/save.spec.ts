import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(process.env.INKMESH_DATA || '.data', 'workspaces/demo');
const file = path.join(root, 'examples/kitchen-sink.md');
const fixture = fs.readFileSync('tests/fixtures/kitchen-sink.md', 'utf8');
const fences = (source: string) => source.match(/^```[^\n]*\n[\s\S]*?^```$/gm);
const status = (page: Page) => page.getByTestId('file-strip').getByRole('status');

async function typeAtEndOfFirstParagraph(page: Page, text: string) {
	// Crepe's contenteditable exposes no role or label for a paragraph, so a CSS locator is the only handle.
	await page.locator('.milkdown p').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type(text);
}

test.use({ locale: 'en-US' });

test('an edit autosaves, commits and keeps the code blocks byte-identical', async ({ page }) => {
	await page.goto('/demo/examples/kitchen-sink.md');
	await typeAtEndOfFirstParagraph(page, ' edited');
	await expect(status(page)).toHaveText('Saved', { timeout: 5000 });
	// The History block refreshes after a save, without a reload.
	const latest = page.getByRole('complementary').getByRole('listitem').first();
	await expect(latest).toContainText(/now|seconds? ago/);

	const saved = fs.readFileSync(file, 'utf8');
	expect(saved).toContain(' edited');
	expect(fences(fixture)?.length).toBeGreaterThan(0);
	expect(fences(saved)).toEqual(fences(fixture));
	const log = execFileSync('git', ['-C', root, 'log', '-1', '--format=%an%n%s'], { encoding: 'utf8' });
	expect(log.trim()).toBe('Owner\nUpdate examples/kitchen-sink.md');

	// A hash change must keep the same autosave, with the hash returned by the last save.
	await page.evaluate(() => {
		location.hash = '#x';
	});
	await page.keyboard.type('!');
	await expect(status(page)).toHaveText('', { timeout: 1000 });
	await expect(status(page)).toHaveText('Saved', { timeout: 5000 });
	expect(fs.readFileSync(file, 'utf8')).toContain(' edited!');
});

test('a file changed on disk is a conflict and is not overwritten', async ({ page }) => {
	await page.goto('/demo/examples/kitchen-sink.md');
	await expect(page.locator('.milkdown p').first()).toBeVisible();
	const onDisk = fs.readFileSync(file, 'utf8') + '\nChanged on disk.\n';
	fs.writeFileSync(file, onDisk);
	try {
		await typeAtEndOfFirstParagraph(page, ' again');
		await expect(status(page)).toHaveText(
			'This file changed on disk since you opened it. Reload to see the new version.',
			{ timeout: 5000 }
		);
		expect(fs.readFileSync(file, 'utf8')).toBe(onDisk);
	} finally {
		// Back to the committed version, so later runs start from a clean working tree.
		execFileSync('git', ['-C', root, 'checkout', '--', 'examples/kitchen-sink.md']);
	}
});
