import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US' });

const MAIL = './.data-e2e/mail';

/** The sign-in link of the newest email to `to`, quoted-printable soft breaks removed. */
function newestLink(to: string): string | null {
	if (!fs.existsSync(MAIL)) return null;
	for (const name of fs.readdirSync(MAIL).sort().reverse()) {
		const raw = fs.readFileSync(path.join(MAIL, name), 'utf8').replace(/=\r?\n/g, '').replace(/=3D/g, '=');
		if (!raw.split(/\r?\n/).includes(`To: ${to}`)) continue;
		return /http:\/\/localhost:4173\/login\/link\/[A-Za-z0-9_-]{43}/.exec(raw)?.[0] ?? null;
	}
	return null;
}

test('sign in with an emailed link', async ({ page }) => {
	const before = newestLink('owner@inkmesh.local');
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: 'Email me a sign-in link instead' }).click();
	await page.getByLabel('Email').fill('owner@inkmesh.local');
	await page.getByRole('button', { name: 'Email me a link' }).click();
	await expect(page.getByRole('status')).toContainText('owner@inkmesh.local');
	let link: string | null = null;
	await expect.poll(() => (link = newestLink('owner@inkmesh.local'))).not.toBe(before);
	// A typo is not a dead end: the sent page leads back to the form.
	await page.getByRole('link', { name: 'Use another address' }).click();
	await expect(page.getByRole('button', { name: 'Email me a link' })).toBeVisible();
	await page.goto(link!);
	await expect(page.getByText('Continue as owner@inkmesh.local.')).toBeVisible();
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('banner').getByText('Owner', { exact: true })).toBeVisible();
	await page.goto(link!);
	await expect(page.getByRole('heading')).toHaveText('This sign-in link has expired or was already used');
});
