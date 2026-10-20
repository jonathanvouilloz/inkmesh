import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspace, Forbidden, roleOf } from './access.ts';
import { createUser, hashPassword, hashToken } from './accounts.ts';
import type { Actor } from './actor.ts';
import { addComment } from './comments.ts';
import { workspaceDir } from './data.ts';
import { closeDb, db } from './db.ts';
import { listTree } from './documents.ts';
import { Conflict, InvalidPath } from './paths.ts';
import {
	createPublicLink,
	joinByLink,
	joinByLinkAsNewUser,
	publicLinks,
	revokePublicLink,
	setSignupRole,
	sharedDocument,
	sharedFolderFields,
	sharedFile,
	sharedScope,
	sharedTree
} from './publicLinks.ts';
import { clearSessionTimers } from './sessions.ts';

const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADElEQVR4nGP4x8AAAAL+AP8oJgQeAAAAAElFTkSuQmCC',
	'base64'
);

let data: string;
let jon: Actor;
let ed: Actor;
const put = (slug: string, rel: string, bytes: string | Buffer) => {
	const file = path.join(workspaceDir(slug), rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, bytes);
};
const member = (slug: string, a: Actor, role: string) =>
	db().prepare('INSERT INTO memberships (workspace, user_id, role) VALUES (?, ?, ?)').run(slug, a.id, role);

beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-links-'));
	process.env.INKMESH_DATA = data;
	const u = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	jon = { id: u.id, name: 'Jon' };
	const e = await createUser({ email: 'ed@b.c', name: 'Ed', password: 'long enough 1' });
	ed = { id: e.id, name: 'Ed' };
	await createWorkspace('demo', 'Demo', jon);
	await createWorkspace('other', 'Other', jon);
	member('demo', ed, 'editor');
	put('demo', 'notes/a.md', '# A\n\n![p](pic.png) ![q](../img/b.png)\n');
	put('demo', 'notes/b.md', '# B\n');
	put('demo', 'notes/pic.png', png);
	put('demo', 'img/b.png', png);
	put('demo', 'notes/c.png', png);
	put('other', 'x.md', '# X\n');
	await addComment('demo', 'notes/a.md', 'secret remark', jon);
});
afterEach(() => {
	clearSessionTimers();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const refused = (p: Promise<unknown>) =>
	expect(p.then(() => 'resolved', (err) => err instanceof Forbidden || err instanceof InvalidPath)).resolves.toBe(true);

describe('public links', () => {
	it('a document link reveals nothing outside its document', async () => {
		const t = await createPublicLink('demo', 'notes/a.md', null, jon);
		const reads = () => [
			sharedDocument(t, 'notes/a.md'),
			sharedFile(t, 'notes/a.md'),
			sharedFile(t, 'notes/pic.png'),
			sharedFile(t, 'img/b.png')
		];
		expect(sharedScope(t)).toEqual({ workspace: { slug: 'demo', name: 'Demo' }, path: 'notes/a.md', signupRole: null });
		const doc = await sharedDocument(t, 'notes/a.md');
		expect(doc.path).toBe('notes/a.md');
		expect(doc.source).toContain('![p](pic.png)');
		expect(await sharedFile(t, 'notes/a.md')).toEqual({ kind: 'doc', source: doc.source });
		expect(await sharedFile(t, 'notes/pic.png')).toEqual({ kind: 'image', bytes: png, type: 'png' });
		expect(await sharedFile(t, 'img/b.png')).toMatchObject({ kind: 'image', type: 'png' });

		await expect(sharedDocument(t, 'notes/b.md')).rejects.toBeInstanceOf(Forbidden);
		await expect(sharedDocument(t, 'x.md')).rejects.toBeInstanceOf(Forbidden);
		await expect(sharedTree(t)).rejects.toBeInstanceOf(Forbidden);
		for (const p of ['notes/c.png', 'notes/b.md', '../other/x.md', '.inkmesh/comments/notes/a.md', '.git/config'])
			await refused(sharedFile(t, p));
		// Other spellings of the shared path are refused too: the scope is the exact path.
		for (const p of ['./notes/a.md', 'NOTES/a.md', 'notes/A.md', 'notes//a.md', 'notes/../notes/a.md']) {
			await refused(sharedDocument(t, p));
			await refused(sharedFile(t, p));
		}

		revokePublicLink('demo', publicLinks('demo', jon)[0].id, jon);
		expect(sharedScope(t)).toBeNull();
		for (const p of [...reads(), sharedTree(t)]) await expect(p).rejects.toBeInstanceOf(Forbidden);
	});

	it('a workspace link reads that workspace only', async () => {
		const t = await createPublicLink('demo', null, null, jon);
		expect(await sharedTree(t)).toEqual(await listTree('demo', jon));
		expect(await sharedFile(t, 'notes/c.png')).toMatchObject({ kind: 'image', type: 'png' });
		expect((await sharedDocument(t, 'notes/b.md')).source).toBe('# B\n');
		await expect(sharedFile(t, '.inkmesh/comments/notes/a.md')).rejects.toBeInstanceOf(InvalidPath);
		await expect(sharedDocument(t, '.inkmesh/comments/notes/a.md')).rejects.toBeInstanceOf(InvalidPath);
		await expect(sharedFile(t, '.git/config')).rejects.toBeInstanceOf(InvalidPath);
		await expect(sharedFile(t, '../other/x.md')).rejects.toBeInstanceOf(InvalidPath);
		await expect(sharedScope('unknown')).toBeNull();
		await expect(sharedTree('unknown')).rejects.toBeInstanceOf(Forbidden);
	});

	it("shared folder fields follow the link's scope", async () => {
		const t = await createPublicLink('demo', null, null, jon);
		expect(await sharedFolderFields(t, 'notes')).toEqual({ 'notes/a.md': {}, 'notes/b.md': {} });
		const d = await createPublicLink('demo', 'notes/a.md', null, jon);
		await expect(sharedFolderFields(d, 'notes')).rejects.toBeInstanceOf(Forbidden);
		revokePublicLink('demo', publicLinks('demo', jon).find((l) => l.path === null)!.id, jon);
		await expect(sharedFolderFields(t, 'notes')).rejects.toBeInstanceOf(Forbidden);
	});

	it('stores only the token hash', async () => {
		const t = await createPublicLink('demo', null, 'reader', jon);
		expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(db().prepare('SELECT token_hash FROM public_links').get()).toEqual({ token_hash: hashToken(t) });
		// Only its last 4 characters, so an owner can tell which row a leaked URL is.
		expect(publicLinks('demo', jon)[0].hint).toBe(t.slice(-4));
		const tables = db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
		for (const { name } of tables)
			expect(JSON.stringify(db().prepare(`SELECT * FROM "${name}"`).all())).not.toContain(t);
	});

	it('only owners manage links', async () => {
		const t = await createPublicLink('other', null, null, jon);
		const [{ id }] = publicLinks('other', jon);
		await expect(createPublicLink('demo', null, null, ed)).rejects.toBeInstanceOf(Forbidden);
		expect(() => publicLinks('demo', ed)).toThrow(Forbidden);
		expect(() => setSignupRole('demo', id, 'editor', ed)).toThrow(Forbidden);
		expect(() => revokePublicLink('demo', id, ed)).toThrow(Forbidden);
		// An owner of demo acting on another workspace's id through demo changes nothing.
		setSignupRole('demo', id, 'editor', jon);
		revokePublicLink('demo', id, jon);
		expect(sharedScope(t)?.signupRole).toBeNull();
		expect(publicLinks('other', jon)).toEqual([
			{ id, path: null, signupRole: null, createdBy: 'Jon', createdAt: expect.any(String), hint: expect.any(String) }
		]);
	});

	it('a link to a missing document is refused', async () => {
		await expect(createPublicLink('demo', 'notes/zz.md', null, jon)).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(createPublicLink('demo', '.inkmesh/comments/notes/a.md', null, jon)).rejects.toBeInstanceOf(
			InvalidPath
		);
		expect(publicLinks('demo', jon)).toEqual([]);
	});

	it('joining needs sign-up on', async () => {
		const t = await createPublicLink('demo', 'notes/a.md', null, jon);
		const passwordHash = await hashPassword('long enough 1');
		const input = { email: 'dan@b.c', name: 'Dan', passwordHash };
		expect(() => joinByLinkAsNewUser(t, input)).toThrow(Conflict);
		expect(() => joinByLinkAsNewUser('unknown', input)).toThrow(Conflict);
		const [{ id }] = publicLinks('demo', jon);
		setSignupRole('demo', id, 'reader', jon);
		const { user, workspace, path: p } = joinByLinkAsNewUser(t, input);
		expect(workspace).toEqual({ slug: 'demo', name: 'Demo' });
		expect(p).toBe('notes/a.md');
		expect(roleOf('demo', user.id)).toBe('reader');
		expect(db().prepare("SELECT user_id, author, path FROM events WHERE type = 'join'").all()).toEqual([
			{ user_id: user.id, author: 'Dan', path: '' }
		]);
		setSignupRole('demo', id, null, jon);
		const eve = await createUser({ email: 'eve@b.c', name: 'Eve', password: 'long enough 1' });
		expect(() => joinByLink(t, eve.id)).toThrow(Conflict);
		expect(roleOf('demo', eve.id)).toBeNull();
	});

	it('join raises a role and never lowers it', async () => {
		const reader = await createPublicLink('demo', null, 'reader', jon);
		const editor = await createPublicLink('demo', null, 'editor', jon);
		expect(joinByLink(reader, ed.id)).toEqual({ workspace: { slug: 'demo', name: 'Demo' }, path: null });
		expect(roleOf('demo', ed.id)).toBe('editor');
		const r = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
		member('demo', { id: r.id, name: 'R' }, 'reader');
		joinByLink(editor, r.id);
		expect(roleOf('demo', r.id)).toBe('editor');
	});
});
