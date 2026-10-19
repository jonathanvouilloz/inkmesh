import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const root = path.resolve(process.env.INKMESH_DATA!, 'workspaces/demo');
const commits = (file: string) =>
	execFileSync('git', ['-C', root, 'log', '--format=%an', '--', file], { encoding: 'utf8' })
		.trim()
		.split('\n');
const status = (page: Page) => page.getByTestId('file-strip').getByRole('status');
const history = (page: Page) => page.getByRole('complementary').getByRole('listitem');

test.use({ locale: 'en-US' });

test('one commit per editing session', async ({ page }) => {
	await page.goto('/demo/project/architecture.md');
	const count = await history(page).count();
	const before = commits('project/architecture.md');
	// Crepe's contenteditable exposes no role or label for a paragraph, so a CSS locator is the only handle.
	await page.locator('.milkdown p').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type(' one');
	await expect(status(page)).toHaveText('Saved', { timeout: 5000 });
	await page.waitForTimeout(3000);
	await page.keyboard.type(' two');
	await expect(status(page)).toHaveText('Saved', { timeout: 5000 });
	// Two saves, no commit: neither the History block nor the git log has grown.
	await expect(history(page)).toHaveCount(count);
	expect(commits('project/architecture.md')).toEqual(before);

	const rail = page.locator('#rail');
	await rail.getByRole('link', { name: 'PRD — inkmesh' }).click();
	await expect(page).toHaveURL(/prd\.md$/);
	// The leave request runs after the navigation: wait for its commit before coming back.
	await expect.poll(() => commits('project/architecture.md')).toEqual(['Owner', ...before]);
	await rail.getByRole('link', { name: 'Architecture — inkmesh' }).click();
	await expect(history(page)).toHaveCount(count + 1);
	await expect(history(page).first()).toContainText('Owner');
});

test('closing the tab ends the session with a beacon', async ({ page }) => {
	await page.goto('/demo/project/prd.md');
	const before = commits('project/prd.md');
	await page.locator('.milkdown p').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type(' beacon');
	await expect(status(page)).toHaveText('Saved', { timeout: 5000 });
	expect(commits('project/prd.md')).toEqual(before);
	// The beacon has no x-sveltekit-action header and must still reach the action past the origin check.
	await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
	await expect.poll(() => commits('project/prd.md')).toEqual(['Owner', ...before]);
});
