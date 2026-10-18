import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

test.use({ locale: 'en-US' });
// The tests share the link and the reader's session; one worker runs them in order.
test.describe.configure({ mode: 'serial' });

let editorLink = '';
let reader: BrowserContext;

// A visitor with no cookie; the config's owner storageState would otherwise apply.
const fresh = (browser: Browser) =>
	browser.newContext({ locale: 'en-US', storageState: { cookies: [], origins: [] } });

async function newLink(page: Page, role: string): Promise<string> {
	await page.goto('/demo/members');
	await page.getByLabel('Role of the new link').selectOption({ label: role });
	await page.getByRole('button', { name: 'Create link' }).click();
	const link = page.getByLabel('Invitation link');
	await expect(link).toHaveAttribute('readonly', '');
	await expect(page.getByText('This link will not be shown again')).toBeVisible();
	return link.inputValue();
}

async function signUp(context: BrowserContext, link: string, name: string, email: string) {
	const page = await context.newPage();
	await page.goto(link);
	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('ten chars ok');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/demo$/);
	return page;
}

test('an owner invites an editor who signs up and edits', async ({ page, browser }) => {
	editorLink = await newLink(page, 'Editor');
	expect(editorLink).toMatch(/^http:\/\/localhost:4173\/invite\/[\w-]{43}$/);
	await expect(page.getByRole('table', { name: 'Pending invitations' }).getByRole('row')).toHaveCount(2);

	const invitee = await fresh(browser);
	const visit = await invitee.newPage();
	await visit.goto(editorLink);
	await expect(visit.getByRole('heading', { name: 'Join Demo as editor' })).toBeVisible();
	// The token lives in the URL only.
	expect(await visit.content()).not.toContain(editorLink.split('/').pop()!);
	await visit.close();

	const nina = await signUp(invitee, editorLink, 'Nina', 'nina@example.ch');
	await nina.goto('/demo/project/prd.md');
	await expect(nina.locator('.milkdown .ProseMirror')).toHaveAttribute('contenteditable', 'true');
	await expect(nina.getByText('You can read this document; editing needs the editor role')).toBeHidden();
	await invitee.close();

	await page.reload();
	const row = page.getByRole('row').filter({ hasText: 'nina@example.ch' });
	await expect(row.getByRole('combobox')).toHaveValue('editor');
	await expect(page.getByRole('table', { name: 'Pending invitations' })).toHaveCount(0);
});

test('the last owner cannot be demoted', async ({ page }) => {
	await page.goto('/demo/members');
	const row = page.getByRole('row').filter({ hasText: 'owner@inkmesh.local' });
	await row.getByRole('combobox').selectOption('reader');
	await row.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('A workspace keeps at least one owner')).toBeVisible();
	await expect(page.getByRole('row').filter({ hasText: 'owner@inkmesh.local' }).getByRole('combobox')).toHaveValue(
		'owner'
	);
	// The only owner cannot remove themselves either, so the button is not offered.
	await expect(row.getByRole('button', { name: 'Remove' })).toHaveCount(0);
});

test('a used link is no longer valid', async ({ browser }) => {
	const context = await fresh(browser);
	const page = await context.newPage();
	await page.goto(editorLink);
	await expect(page.getByRole('heading', { name: 'This invitation is no longer valid' })).toBeVisible();
	await expect(page.getByLabel('Password')).toHaveCount(0);
	await context.close();
});

test('an existing email is sent to sign in and back', async ({ page, browser }) => {
	const link = await newLink(page, 'Reader');
	const context = await fresh(browser);
	const visit = await context.newPage();
	await visit.goto(link);
	await visit.getByLabel('Name').fill('Nina again');
	await visit.getByLabel('Email').fill('nina@example.ch');
	await visit.getByLabel('Password').fill('ten chars ok');
	await visit.getByRole('button', { name: 'Create account' }).click();
	await expect(visit.getByText('You already have an account, sign in to accept')).toBeVisible();
	await visit.getByRole('link', { name: 'Sign in' }).click();
	await expect(visit).toHaveURL(/\/login\?next=%2Finvite%2F/);
	await visit.getByLabel('Email').fill('nina@example.ch');
	await visit.getByLabel('Password').fill('ten chars ok');
	await visit.getByRole('button', { name: 'Sign in' }).click();
	await visit.getByRole('button', { name: 'Join Demo as reader' }).click();
	await expect(visit).toHaveURL(/\/demo$/);
	await context.close();
	// Joining never lowers a role: Nina stays an editor.
	await page.goto('/demo/members');
	await expect(page.getByRole('row').filter({ hasText: 'nina@example.ch' }).getByRole('combobox')).toHaveValue('editor');
});

test('a reader sees no Members link and gets 403 on /demo/members', async ({ page, browser }) => {
	const link = await newLink(page, 'Reader');
	reader = await fresh(browser);
	const ruth = await signUp(reader, link, 'Ruth', 'ruth@example.ch');
	await ruth.getByRole('banner').getByText('Ruth', { exact: true }).click();
	await expect(ruth.getByRole('banner').getByRole('link', { name: 'Account' })).toBeVisible();
	await expect(ruth.getByRole('link', { name: 'Members' })).toHaveCount(0);
	const response = await ruth.goto('/demo/members');
	expect(response?.status()).toBe(403);
	await expect(ruth.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
});

test('a reader reads without editing', async () => {
	const page = await reader.newPage();
	await page.goto('/demo/project/prd.md');
	await expect(page.getByText('You can read this document; editing needs the editor role')).toBeVisible();
	await expect(page.locator('.milkdown .ProseMirror')).toHaveAttribute('contenteditable', 'false');
	await page.getByRole('button', { name: 'Raw' }).click();
	await expect(page.locator('textarea')).toHaveAttribute('readonly', '');
	await expect(page.locator('#rail').getByText('New document', { exact: true })).toHaveCount(0);
});

test('a non-admin cannot create a workspace', async () => {
	const response = await reader.request.post('/?/create', {
		form: { name: 'X', slug: 'x' },
		headers: { origin: 'http://localhost:4173' }
	});
	expect(response.status()).toBe(403);
	await reader.close();
});
