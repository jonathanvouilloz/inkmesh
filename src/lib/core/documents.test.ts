import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspace, Forbidden } from './access.ts';
import { createUser } from './accounts.ts';
import type { Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { closeDb, db } from './db.ts';
import {
	createDocument,
	createFolder,
	history,
	importDocument,
	listTree,
	MAX_DOCUMENT_BYTES,
	movePath,
	readDocument,
	writeDocument
} from './documents.ts';
import { Conflict, InvalidContent, InvalidPath } from './paths.ts';

let actor: Actor;
let agent: Actor;
const doc = 'rapports/réunion été.md';

let data: string;
beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-docs-'));
	process.env.INKMESH_DATA = data;
	const jon = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	await createWorkspace('demo', 'Demo', jon);
	actor = { id: jon.id, name: 'Jon' };
	agent = { ...actor, agent: 'claude-code' };
	await createDocument('demo', doc, actor);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

describe('documents', () => {
	it('lists the tree with the title from the first heading', async () => {
		expect(await listTree('demo', actor)).toEqual([
			{
				name: 'rapports',
				path: 'rapports',
				kind: 'folder',
				children: [
					{
						name: 'réunion été.md',
						path: doc,
						kind: 'doc',
						title: 'réunion été',
						modified: expect.any(String)
					}
				]
			}
		]);
	});

	it('sorts folders first, numeric order, skips dotfiles and non-md files', async () => {
		const root = workspaceDir('demo');
		for (const f of ['b10.md', 'b2.md', '.hidden.md', 'notes.txt', 'a/.x/y.md', 'empty/z.txt']) {
			fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
			fs.writeFileSync(path.join(root, f), 'no heading\n');
		}
		const tree = await listTree('demo', actor);
		expect(tree.map((n) => n.path)).toEqual(['a', 'empty', 'rapports', 'b2.md', 'b10.md']);
		expect(tree[3].title).toBe('b2');
	});

	it('lists empty folders', async () => {
		expect(await createFolder('demo', 'a/b', actor)).toBe('a/b');
		expect(await listTree('demo', actor)).toContainEqual({
			name: 'a',
			path: 'a',
			kind: 'folder',
			children: [{ name: 'b', path: 'a/b', kind: 'folder', children: [] }]
		});
	});

	it('gives documents a modification time', async () => {
		const [rapports] = await listTree('demo', actor);
		expect(rapports.children?.[0].modified).toMatch(/^\d{4}-\d\d-\d\dT/);
	});

	it('refuses bad folder names', async () => {
		for (const p of ['x.md', 'X.MD', 'x.md/', 'a.md/b', 'a/.hidden', '../out'])
			await expect(createFolder('demo', p, actor)).rejects.toThrow(InvalidPath);
		await expect(createFolder('demo', 'rapports', actor)).rejects.toThrow(Conflict);
		await expect(createFolder('demo', doc, actor)).rejects.toThrow(InvalidPath);
	});

	it('readers cannot create folders', async () => {
		const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
		db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
		await expect(createFolder('demo', 'a', { id: reader.id, name: 'R' })).rejects.toThrow(
			Forbidden
		);
	});

	it('reads a document with its hash', async () => {
		const read = await readDocument('demo', doc, actor);
		expect(read.body).toBe('# réunion été\n');
		expect(read.frontmatter).toBe('');
		expect(read.hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('writes with the right hash and records the actor and agent in history', async () => {
		const { hash } = await readDocument('demo', doc, actor);
		const res = await writeDocument('demo', doc, '# réunion été\n\nHello\n', {
			expectedHash: hash,
			actor: agent
		});
		expect(res.hash).not.toBe(hash);
		expect(res.commit).toMatch(/^[0-9a-f]{40}$/);
		const log = await history('demo', doc, actor);
		expect(log).toHaveLength(2);
		expect(log[0]).toMatchObject({
			name: 'Jon',
			agent: 'claude-code',
			message: `Update ${doc}`
		});
		expect(log[1]).toMatchObject({ name: 'Jon', message: `Create ${doc}` });
		expect(log[1].agent).toBeUndefined();
	});

	it('keeps frontmatter and CRLF on write', async () => {
		const file = path.join(workspaceDir('demo'), doc);
		fs.writeFileSync(file, '---\r\ntitle: x\r\n---\r\n# A\r\n\r\nB\r\n');
		const { hash } = await readDocument('demo', doc, actor);
		await writeDocument('demo', doc, '# A\n\nC\n', {
			expectedHash: hash,
			actor
		});
		expect(fs.readFileSync(file, 'utf8')).toBe('---\r\ntitle: x\r\n---\r\n# A\r\n\r\nC\r\n');
	});

	it('throws Conflict on a stale hash', async () => {
		await expect(
			writeDocument('demo', doc, 'x\n', { expectedHash: 'stale', actor })
		).rejects.toThrow(Conflict);
	});

	it('throws Conflict when the file was deleted', async () => {
		const { hash } = await readDocument('demo', doc, actor);
		fs.rmSync(path.join(workspaceDir('demo'), doc));
		await expect(writeDocument('demo', doc, 'x\n', { expectedHash: hash, actor })).rejects.toThrow(
			Conflict
		);
	});

	it('serialises concurrent writes so only one wins on the same hash', async () => {
		const { hash } = await readDocument('demo', doc, actor);
		const results = await Promise.allSettled([
			writeDocument('demo', doc, 'one\n', { expectedHash: hash, actor }),
			writeDocument('demo', doc, 'two\n', { expectedHash: hash, actor })
		]);
		expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
		expect(results.find((r) => r.status === 'rejected')?.reason).toBeInstanceOf(Conflict);
	});

	it('throws Conflict when creating an existing document', async () => {
		await expect(createDocument('demo', doc, actor)).rejects.toThrow(Conflict);
	});

	it('rejects paths outside the workspace', async () => {
		await expect(readDocument('demo', '../x.md', actor)).rejects.toThrow(InvalidPath);
	});

	it('rejects (not throws) invalid paths on write and create', async () => {
		await expect(
			writeDocument('demo', '../x.md', 'x\n', { expectedHash: 'h', actor })
		).rejects.toThrow(InvalidPath);
		await expect(createDocument('demo', '../x.md', actor)).rejects.toThrow(InvalidPath);
	});

	it('only creates .md documents', async () => {
		await expect(createDocument('demo', 'notes/', actor)).rejects.toThrow(InvalidPath);
		await expect(createDocument('demo', 'notes/idea.txt', actor)).rejects.toThrow(InvalidPath);
	});

	it('rejects a document name that is empty or a dot-file', async () => {
		for (const p of ['.md', 'notes/.md', 'notes/.hidden.md'])
			await expect(createDocument('demo', p, actor)).rejects.toThrow(InvalidPath);
	});

	it('returns the normalised path of a created document', async () => {
		expect(await createDocument('demo', './notes//a.md', actor)).toBe('notes/a.md');
		const notes = (await listTree('demo', actor)).find((n) => n.path === 'notes');
		expect(notes?.children?.some((n) => n.path === 'notes/a.md' && n.kind === 'doc')).toBe(true);
	});

	it('does not commit an identical body', async () => {
		const { hash } = await readDocument('demo', doc, actor);
		const res = await writeDocument('demo', doc, '# réunion été\n', {
			expectedHash: hash,
			actor
		});
		expect(res).toEqual({ hash, commit: '' });
		expect(await history('demo', doc, actor)).toHaveLength(1);
	});

	it('reads and writes only .md documents that are not dot-files', async () => {
		fs.writeFileSync(path.join(workspaceDir('demo'), '.gitignore'), 'x\n');
		await expect(readDocument('demo', '.gitignore', actor)).rejects.toThrow(InvalidPath);
		await expect(
			writeDocument('demo', '.gitignore', 'y\n', { expectedHash: 'h', actor })
		).rejects.toThrow(InvalidPath);
	});

	it('treats document names as literal git paths, not patterns', async () => {
		const root = workspaceDir('demo');
		const show = () =>
			execFileSync('git', ['-C', root, 'show', '--name-only', '--format='], { encoding: 'utf8' });
		// An untracked a.md that the pattern [a].md would match.
		fs.writeFileSync(path.join(root, 'a.md'), '# a\n');
		for (const name of ['[a].md', ':x.md']) {
			await createDocument('demo', name, actor);
			expect(show()).toBe(`${name}\n`);
			const { hash } = await readDocument('demo', name, actor);
			await writeDocument('demo', name, '# changed\n', { expectedHash: hash, actor });
			expect(show()).toBe(`${name}\n`);
			expect((await history('demo', name, actor)).map((e) => e.message)).toEqual([
				`Update ${name}`,
				`Create ${name}`
			]);
		}
	});

	it('imports bytes verbatim', async () => {
		const source = '---\r\ntitle: x\r\n---\r\n# Notes\r\n\r\nété\r\n';
		const res = await importDocument('demo', 'notes/x.md', new TextEncoder().encode(source), {
			actor
		});
		expect(res).toEqual({ path: 'notes/x.md', replaced: false });
		expect((await readDocument('demo', 'notes/x.md', actor)).source).toBe(source);
		const log = await history('demo', 'notes/x.md', actor);
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ name: 'Jon', message: 'Import notes/x.md' });
	});

	it('replaces only with overwrite and keeps history', async () => {
		const enc = new TextEncoder();
		await importDocument('demo', 'x.md', enc.encode('# one\n'), { actor });
		await expect(importDocument('demo', 'x.md', enc.encode('# two\n'), { actor })).rejects.toThrow(
			Conflict
		);
		expect((await readDocument('demo', 'x.md', actor)).source).toBe('# one\n');
		const res = await importDocument('demo', 'x.md', enc.encode('# two\n'), {
			actor,
			overwrite: true
		});
		expect(res).toEqual({ path: 'x.md', replaced: true });
		expect((await readDocument('demo', 'x.md', actor)).source).toBe('# two\n');
		expect((await history('demo', 'x.md', actor)).map((e) => e.message)).toEqual([
			'Replace x.md',
			'Import x.md'
		]);
	});

	it('rejects oversize and non-UTF-8', async () => {
		const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1).fill(0x61);
		await expect(importDocument('demo', 'big.md', big, { actor })).rejects.toThrow(
			new InvalidContent('too-large')
		);
		await expect(importDocument('demo', 'big.md', big, { actor })).rejects.toBeInstanceOf(
			InvalidContent
		);
		const bad = Uint8Array.of(0xff, 0xfe, 0x00);
		await expect(importDocument('demo', 'bad.md', bad, { actor })).rejects.toThrow(
			new InvalidContent('not-utf8')
		);
		await expect(importDocument('demo', 'bad.md', bad, { actor })).rejects.toBeInstanceOf(
			InvalidContent
		);
		expect(fs.readdirSync(workspaceDir('demo')).sort()).toEqual(['.git', 'rapports']);
	});

	it('refuses document paths under a .md or dot folder', async () => {
		const bytes = Uint8Array.of(0x61);
		for (const p of ['a.md/x.md', 'a.md/b/x.md', '.x/y.md']) {
			await expect(createDocument('demo', p, actor)).rejects.toThrow(InvalidPath);
			await expect(importDocument('demo', p, bytes, { actor })).rejects.toThrow(InvalidPath);
		}
		expect(fs.readdirSync(workspaceDir('demo')).sort()).toEqual(['.git', 'rapports']);
	});

	it('refuses to import over a folder', async () => {
		fs.mkdirSync(path.join(workspaceDir('demo'), 'dir.md'));
		await expect(
			importDocument('demo', 'dir.md', Uint8Array.of(0x61), { actor, overwrite: true })
		).rejects.toThrow(Conflict);
	});

	it('readers cannot import', async () => {
		const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
		db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
		await expect(
			importDocument('demo', 'x.md', Uint8Array.of(0x61), { actor: { id: reader.id, name: 'R' } })
		).rejects.toBeInstanceOf(Forbidden);
	});

	it('restores the file when the commit fails', async () => {
		const lock = path.join(workspaceDir('demo'), '.git/index.lock');
		const file = path.join(workspaceDir('demo'), doc);
		const before = fs.readFileSync(file, 'utf8');
		const { hash } = await readDocument('demo', doc, actor);
		fs.writeFileSync(lock, '');
		await expect(
			writeDocument('demo', doc, '# changed\n', { expectedHash: hash, actor })
		).rejects.toThrow();
		expect(fs.readFileSync(file, 'utf8')).toBe(before);
		await expect(createDocument('demo', 'new.md', actor)).rejects.toThrow();
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'new.md'))).toBe(false);
		const bytes = new TextEncoder().encode('# imported\n');
		await expect(importDocument('demo', 'new.md', bytes, { actor })).rejects.toThrow();
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'new.md'))).toBe(false);
		await expect(importDocument('demo', doc, bytes, { actor, overwrite: true })).rejects.toThrow();
		expect(fs.readFileSync(file, 'utf8')).toBe(before);
		fs.rmSync(lock);
		// No false conflict afterwards: the original hash still writes.
		await writeDocument('demo', doc, '# changed\n', { expectedHash: hash, actor });
		expect(fs.readdirSync(path.dirname(file))).toEqual(['réunion été.md']); // no temporary file left
	});

	it('moves a document and keeps its history', async () => {
		expect(await movePath('demo', doc, 'archive/vieux.md', actor)).toBe('archive/vieux.md');
		const root = workspaceDir('demo');
		expect(fs.existsSync(path.join(root, doc))).toBe(false);
		expect((await readDocument('demo', 'archive/vieux.md', actor)).source).toBe('# réunion été\n');
		const log = execFileSync('git', ['log', '--follow', '--format=%s', '--', 'archive/vieux.md'], {
			cwd: root,
			encoding: 'utf8'
		});
		expect(log.trim().split('\n')).toEqual([`Move ${doc} to archive/vieux.md`, `Create ${doc}`]);
		expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe('');
	});

	it('renames a folder with its documents', async () => {
		await createDocument('demo', 'rapports/sub/b.md', actor);
		expect(await movePath('demo', 'rapports', 'notes/2026', actor)).toBe('notes/2026');
		const tree = await listTree('demo', actor);
		expect(tree.map((n) => n.path)).toEqual(['notes']);
		expect(tree[0].children!.map((n) => n.path)).toEqual(['notes/2026']);
		await readDocument('demo', 'notes/2026/réunion été.md', actor);
		await readDocument('demo', 'notes/2026/sub/b.md', actor);
		expect((await history('demo', 'notes/2026/sub/b.md', actor))[0].message).toBe(
			'Move rapports to notes/2026'
		);
	});

	it('refuses to move a folder into itself', async () => {
		const before = await listTree('demo', actor);
		await expect(movePath('demo', 'rapports', 'rapports', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', 'rapports', 'rapports/b', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', 'rapports', './rapports/b/', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', doc, doc, actor)).rejects.toThrow(InvalidPath);
		expect(await listTree('demo', actor)).toEqual(before);
	});

	it('refuses invalid targets and sources', async () => {
		await expect(movePath('demo', doc, 'x.txt', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', doc, 'a.md/x.md', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', 'rapports', 'r.md', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', 'rapports', '.r', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', '.git', 'g', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', 'missing.md', 'x.md', actor)).rejects.toMatchObject({
			code: 'ENOENT'
		});
	});

	it('refuses to overwrite', async () => {
		await createDocument('demo', 'other.md', actor);
		await expect(movePath('demo', 'other.md', doc, actor)).rejects.toThrow(Conflict);
		await createFolder('demo', 'x', actor);
		await expect(movePath('demo', 'rapports', 'x', actor)).rejects.toThrow(Conflict);
		expect((await readDocument('demo', 'other.md', actor)).source).toBe('# other\n');
		expect((await readDocument('demo', doc, actor)).source).toBe('# réunion été\n');
	});

	it('a write after a move is a conflict', async () => {
		const { hash } = await readDocument('demo', doc, actor);
		await movePath('demo', doc, 'moved.md', actor);
		await expect(
			writeDocument('demo', doc, '# late\n', { expectedHash: hash, actor })
		).rejects.toThrow(Conflict);
		expect(fs.existsSync(path.join(workspaceDir('demo'), doc))).toBe(false);
	});

	it('moves an empty folder', async () => {
		const root = workspaceDir('demo');
		const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
		const before = head();
		await createFolder('demo', 'vide', actor);
		await expect(movePath('demo', 'vide', 'plein/vide', actor)).resolves.toBe('plein/vide');
		expect(fs.statSync(path.join(root, 'plein/vide')).isDirectory()).toBe(true);
		expect(head()).toBe(before);
	});

	it('moves a folder holding an empty subfolder and a document', async () => {
		await createFolder('demo', 'rapports/vide', actor);
		await movePath('demo', 'rapports', 'r2', actor);
		const root = workspaceDir('demo');
		expect(fs.statSync(path.join(root, 'r2/vide')).isDirectory()).toBe(true);
		await readDocument('demo', 'r2/réunion été.md', actor);
		expect(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })).toBe('');
	});

	it('renames back when the move commit fails', async () => {
		const lock = path.join(workspaceDir('demo'), '.git/index.lock');
		fs.writeFileSync(lock, '');
		await expect(movePath('demo', doc, 'x.md', actor)).rejects.toThrow();
		await expect(movePath('demo', 'rapports', 'r2', actor)).rejects.toThrow();
		fs.rmSync(lock);
		await readDocument('demo', doc, actor);
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'x.md'))).toBe(false);
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'r2'))).toBe(false);
	});

	it('readers cannot move', async () => {
		const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
		db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
		await expect(
			movePath('demo', doc, 'x.md', { id: reader.id, name: 'R' })
		).rejects.toBeInstanceOf(Forbidden);
	});

	it('a reader cannot write and a stranger cannot read', async () => {
		const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
		db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
		const r = { id: reader.id, name: 'R' };
		await expect(listTree('demo', r)).resolves.toBeTruthy();
		await expect(createDocument('demo', 'x.md', r)).rejects.toBeInstanceOf(Forbidden);
		await expect(writeDocument('demo', doc, 'x', { expectedHash: 'h', actor: r })).rejects.toBeInstanceOf(Forbidden);
		await expect(readDocument('demo', doc, { id: 999, name: 'S' })).rejects.toThrow('not a member');
	});
});
