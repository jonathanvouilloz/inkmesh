import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace, Forbidden } from './access.ts';
import { createUser } from './accounts.ts';
import type { Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { closeDb, db } from './db.ts';
import {
	createDocument,
	createFolder,
	deletedDocuments,
	deletePath,
	history,
	importDocument,
	linksTo,
	listTree,
	MAX_DOCUMENT_BYTES,
	movePath,
	readDocument,
	readVersion,
	relocate,
	restoreDeleted,
	restoreVersion,
	writeDocument
} from './documents.ts';
import { addComment, listComments } from './comments.ts';
import { changes } from './events.ts';
import { Conflict, InvalidContent, InvalidPath } from './paths.ts';
import { createPublicLink, sharedDocument } from './publicLinks.ts';
import { search } from './search.ts';
import { clearSessionTimers, commitAllSessions } from './sessions.ts';

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
	clearSessionTimers();
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

	it('refuses image-like folder names', async () => {
		await expect(createFolder('demo', 'shots.PNG', actor)).rejects.toThrow(InvalidPath);
		await expect(movePath('demo', 'rapports', 'a.webp', actor)).rejects.toThrow(InvalidPath);
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
			actor
		});
		expect(res.hash).not.toBe(hash);
		expect(await commitAllSessions()).toBe(1);
		// The editor is human only; an agent writes through importDocument.
		await importDocument('demo', doc, new TextEncoder().encode('# réunion été\n\nBye\n'), {
			actor: agent,
			expectedHash: res.hash
		});
		const log = await history('demo', doc, actor);
		expect(log).toHaveLength(3);
		expect(log[0]).toMatchObject({
			name: 'Jon',
			agent: 'claude-code',
			message: `Update ${doc}`
		});
		expect(log[1]).toMatchObject({ name: 'Jon', message: `Update ${doc}` });
		expect(log[1].agent).toBeUndefined();
		expect(log[2]).toMatchObject({ name: 'Jon', message: `Create ${doc}` });
		expect(log[2].agent).toBeUndefined();
	});

	it('refuses an agent in the editor write', async () => {
		const { hash } = await readDocument('demo', doc, actor);
		await expect(writeDocument('demo', doc, 'x\n', { expectedHash: hash, actor: agent })).rejects.toThrow();
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
		expect(res).toEqual({ hash });
		expect(await commitAllSessions()).toBe(0);
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
			await commitAllSessions();
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
		expect(res).toEqual({ path: 'notes/x.md', replaced: false, hash: expect.any(String) });
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
		expect(res).toEqual({ path: 'x.md', replaced: true, hash: expect.any(String) });
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

	it('relocates relative URLs only', () => {
		const a = { from: 'a.md', to: 'z/a.md' };
		expect(relocate('../a.md', 'x/y.md', 'x/y.md', a)).toBe('../z/a.md');
		expect(relocate('a%20b.md#h', 'y.md', 'y.md', { from: 'a b.md', to: 'z/a b.md' })).toBe(
			'z/a%20b.md#h'
		);
		expect(relocate('d/a.md?v=1', 'y.md', 'y.md', { from: 'd', to: 'e/f' })).toBe('e/f/a.md?v=1');
		expect(relocate('a.md', 'y.md', 'y.md', { from: 'a.md', to: 'z (1)/a#?.md' })).toBe(
			'z%20%281%29/a%23%3F.md'
		);
		expect(relocate('a.md', 'y.md', 'y.md', { from: 'a.md', to: 'a:b.md' })).toBe('a%3Ab.md');
		expect(relocate('b.md', 'y.md', 'y.md', a)).toBe(null);
		for (const url of ['https://x/a.md', '/a.md', '#top', 'mailto:a@b.c'])
			expect(relocate(url, 'y.md', 'y.md', a)).toBe(null);
	});

	const write = (rel: string, text: string) => {
		const file = path.join(workspaceDir('demo'), rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, text);
	};
	const read = (rel: string) => fs.readFileSync(path.join(workspaceDir('demo'), rel), 'utf8');
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: workspaceDir('demo'), encoding: 'utf8' });

	it('links follow a moved document', async () => {
		write('a.md', '# a\n');
		write('notes/b.md', '---\nx: ../a.md\n---\nSee [a](../a.md "A") and [top](#x).\n');
		await importDocument('demo', 'c.md', new TextEncoder().encode('[r]: a.md\n'), { actor });
		await movePath('demo', 'a.md', 'archive/a.md', actor);
		expect(read('notes/b.md')).toBe(
			'---\nx: ../a.md\n---\nSee [a](../archive/a.md "A") and [top](#x).\n'
		);
		expect(read('c.md')).toBe('[r]: archive/a.md\n');
		expect(git('show', '--name-only', '--format=%s', 'HEAD').trim().split('\n')).toEqual([
			'Move a.md to archive/a.md',
			'',
			'archive/a.md',
			'c.md',
			'notes/b.md'
		]);
		expect(git('status', '--porcelain')).toBe('');
	});

	it('keeps a leading BOM when a link is rewritten', async () => {
		write('a.md', '# a\n');
		write('b.md', '\uFEFF# B\n\n[a](a.md)\n');
		await movePath('demo', 'a.md', 'z/a.md', actor);
		expect(read('b.md')).toBe('\uFEFF# B\n\n[a](z/a.md)\n');
		write('c.md', '\uFEFF# T\n\n[r]: z/a.md\n');
		expect(await linksTo('demo', 'z/a.md', actor)).toEqual(['b.md', 'c.md']);
		await movePath('demo', 'z/a.md', 'a.md', actor);
		expect(read('c.md')).toBe('\uFEFF# T\n\n[r]: a.md\n');
	});

	it('a moved document keeps its own links', async () => {
		write('x/doc.md', '![p](p.png) [me](doc.md#h) [b](../b.md) [m](mailto:a@b.c)\n');
		await movePath('demo', 'x/doc.md', 'y/doc.md', actor);
		expect(read('y/doc.md')).toBe(
			'![p](../x/p.png) [me](doc.md#h) [b](../b.md) [m](mailto:a@b.c)\n'
		);
		await movePath('demo', 'y/doc.md', 'y/renamed.md', actor);
		expect(read('y/renamed.md')).toBe(
			'![p](../x/p.png) [me](renamed.md#h) [b](../b.md) [m](mailto:a@b.c)\n'
		);
	});

	it('links inside a moved folder stay as they are', async () => {
		const text = '[s](sub/b.md) ![i](./img.png) [o](../out.md)\n';
		write('rapports/a.md', text);
		write('rapports/sub/b.md', '[a](../a.md)\n');
		await movePath('demo', 'rapports', 'deep/r', actor);
		expect(read('deep/r/a.md')).toBe(text.replace('../out.md', '../../out.md'));
		expect(read('deep/r/sub/b.md')).toBe('[a](../a.md)\n');
	});

	it('moves a folder holding an empty subfolder and a document linked from outside', async () => {
		await createFolder('demo', 'rapports/vide', actor);
		const link = '[r](rapports/r%C3%A9union%20%C3%A9t%C3%A9.md)\n';
		await importDocument('demo', 'idx.md', new TextEncoder().encode(link), { actor });
		await movePath('demo', 'rapports', 'r2', actor);
		expect(read('idx.md')).toBe('[r](r2/r%C3%A9union%20%C3%A9t%C3%A9.md)\n');
		expect(fs.statSync(path.join(workspaceDir('demo'), 'r2/vide')).isDirectory()).toBe(true);
		expect(git('status', '--porcelain')).toBe('');
	});

	it('moves an empty folder a document links to', async () => {
		await createFolder('demo', 'vide', actor);
		await importDocument('demo', 'idx.md', new TextEncoder().encode('[v](vide/)\n'), { actor });
		await movePath('demo', 'vide', 'v2', actor);
		expect(read('idx.md')).toBe('[v](v2/)\n');
		expect(git('show', '--name-only', '--format=%s', 'HEAD').trim().split('\n')).toEqual([
			'Move vide to v2',
			'',
			'idx.md'
		]);
		expect(git('status', '--porcelain')).toBe('');
	});

	it('restores rewritten links when the move commit fails', async () => {
		write('b.md', '[d](rapports/x.md)\n');
		fs.writeFileSync(path.join(workspaceDir('demo'), '.git/index.lock'), '');
		await expect(movePath('demo', 'rapports', 'r2', actor)).rejects.toThrow();
		expect(read('b.md')).toBe('[d](rapports/x.md)\n');
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'r2'))).toBe(false);
	});

	it('linksTo lists only outside documents', async () => {
		write('rapports/in.md', '[d](../rapports/x.md)\n');
		write('out.md', '[d](rapports/x.md)\n');
		write('notes/o.md', '[d](../rapports)\n');
		write('notes/n.md', '[d](rapports/x.md) [e](https://x/rapports)\n');
		write('escaped.md', '[d](rapports/x\\_y.md)\n'); // movePath cannot rewrite it, so not announced
		expect((await linksTo('demo', 'rapports', actor)).sort()).toEqual(['notes/o.md', 'out.md']);
		expect((await linksTo('demo', 'rapports/x.md', actor)).sort()).toEqual([
			'out.md',
			'rapports/in.md'
		]);
	});

	it('restores what it can and reports the commit error when a rollback step fails', async () => {
		write('b.md', '[d](rapports/x.md)\n');
		write('c.md', '[d](rapports/y.md)\n');
		fs.writeFileSync(path.join(workspaceDir('demo'), '.git/index.lock'), '');
		const rename = fs.promises.rename;
		let renames = 0;
		// The first rename is the move itself; fail the first restore (a writeAtomic rename).
		vi.spyOn(fs.promises, 'rename').mockImplementation(async (a, b) => {
			if (++renames === 4) throw new Error('disk gone');
			return rename(a, b);
		});
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(movePath('demo', 'rapports', 'r2', actor)).rejects.toThrow(/index\.lock/);
			expect(logged).toHaveBeenCalledOnce();
		} finally {
			vi.restoreAllMocks();
		}
		const texts = [read('b.md'), read('c.md')];
		expect(texts.filter((t) => t.includes('(rapports/'))).toHaveLength(1); // the other restore failed
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'rapports'))).toBe(true);
	});

	it('deletes a document and keeps it in history', async () => {
		const root = workspaceDir('demo');
		const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		await deletePath('demo', doc, actor);
		expect(fs.existsSync(path.join(root, doc))).toBe(false);
		expect(git('show', `HEAD~1:${doc}`)).toBe('# réunion été\n');
		expect(git('log', '-1', '--format=%s').trim()).toBe(`Delete ${doc}`);
		expect(git('status', '--porcelain')).toBe('');
	});

	it('deletes a folder with everything in it', async () => {
		const root = workspaceDir('demo');
		await createDocument('demo', 'rapports/sub/b.md', actor);
		fs.writeFileSync(path.join(root, 'rapports/sub/image.png'), 'png');
		await deletePath('demo', 'rapports', actor);
		expect(fs.existsSync(path.join(root, 'rapports'))).toBe(false);
		expect(fs.readdirSync(path.join(root, '.inkmesh')).filter((f) => f.startsWith('trash-'))).toEqual([]);
		const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		expect(git('log', '-1', '--format=%s').trim()).toBe('Delete rapports');
		expect(git('ls-files', 'rapports')).toBe('');
		expect(git('status', '--porcelain', 'rapports')).toBe('');
	});

	it('puts things back when the delete commit fails', async () => {
		const root = workspaceDir('demo');
		await createDocument('demo', 'rapports/b.md', actor);
		const lock = path.join(root, '.git/index.lock');
		fs.writeFileSync(lock, '');
		await expect(deletePath('demo', doc, actor)).rejects.toThrow(/index\.lock/);
		await expect(deletePath('demo', 'rapports', actor)).rejects.toThrow(/index\.lock/);
		fs.rmSync(lock);
		expect((await readDocument('demo', doc, actor)).source).toBe('# réunion été\n');
		expect((await readDocument('demo', 'rapports/b.md', actor)).source).toBe('# b\n');
		expect(fs.readdirSync(path.join(root, '.inkmesh')).filter((f) => f.startsWith('trash-'))).toEqual([]);
	});

	it('a missing path cannot be deleted', async () => {
		await expect(deletePath('demo', 'nope.md', actor)).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('deletes an untracked document', async () => {
		const root = workspaceDir('demo');
		const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
		const before = head();
		fs.writeFileSync(path.join(root, 'loose.md'), '# loose\n');
		await deletePath('demo', 'loose.md', actor);
		expect(fs.existsSync(path.join(root, 'loose.md'))).toBe(false);
		expect(head()).toBe(before);
	});

	it('comments move and leave with their document', async () => {
		const root = workspaceDir('demo');
		const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		await createDocument('demo', 'f/a.md', actor);
		await addComment('demo', 'f/a.md', 'Looks good', actor);
		await movePath('demo', 'f/a.md', 'g/b.md', actor);
		expect((await listComments('demo', 'g/b.md', actor)).map((c) => c.body)).toEqual(['Looks good']);
		expect(fs.existsSync(path.join(root, '.inkmesh/comments/f/a.md'))).toBe(false);
		expect(git('log', '-1', '--format=%s').trim()).toBe('Move f/a.md to g/b.md');
		expect(git('show', '--name-status', '--no-renames', '--format=', 'HEAD').trim().split('\n').sort()).toEqual([
			'A\t.inkmesh/comments/g/b.md',
			'A\tg/b.md',
			'D\t.inkmesh/comments/f/a.md',
			'D\tf/a.md'
		]);
		await movePath('demo', 'g', 'h', actor);
		expect((await listComments('demo', 'h/b.md', actor)).map((c) => c.body)).toEqual(['Looks good']);
		expect(fs.existsSync(path.join(root, '.inkmesh/comments/g'))).toBe(false);
		await deletePath('demo', 'h', actor);
		expect(fs.existsSync(path.join(root, '.inkmesh/comments/h'))).toBe(false);
		expect(git('log', '-1', '--format=%s').trim()).toBe('Delete h');
		expect(git('show', '--name-status', '--format=', 'HEAD').trim().split('\n').sort()).toEqual([
			'D\t.inkmesh/comments/h/b.md',
			'D\th/b.md'
		]);
		expect(fs.readdirSync(path.join(root, '.inkmesh')).filter((f) => f.startsWith('trash-'))).toEqual([]);
		expect(git('status', '--porcelain')).toBe('');
	});

	it('a failed move keeps the thread in place', async () => {
		const root = workspaceDir('demo');
		await addComment('demo', doc, 'Stay', actor);
		fs.writeFileSync(path.join(root, '.git/index.lock'), '');
		await expect(movePath('demo', doc, 'x.md', actor)).rejects.toThrow(/index\.lock/);
		await expect(movePath('demo', 'rapports', 'r2', actor)).rejects.toThrow(/index\.lock/);
		await expect(deletePath('demo', doc, actor)).rejects.toThrow(/index\.lock/);
		expect(fs.existsSync(path.join(root, '.inkmesh/comments', doc))).toBe(true);
		expect(fs.existsSync(path.join(root, '.inkmesh/comments/x.md'))).toBe(false);
		expect(fs.existsSync(path.join(root, '.inkmesh/comments/r2'))).toBe(false);
		expect(fs.readdirSync(path.join(root, '.inkmesh')).filter((f) => f.startsWith('trash-'))).toEqual([]);
		fs.rmSync(path.join(root, '.git/index.lock'));
		expect((await listComments('demo', doc, actor)).map((c) => c.body)).toEqual(['Stay']);
	});

	it('a public link follows its document', async () => {
		await createDocument('demo', 'f/a.md', actor);
		await createDocument('demo', 'f_x.md', actor);
		const t = await createPublicLink('demo', 'f/a.md', null, actor);
		const u = await createPublicLink('demo', 'f_x.md', null, actor);
		await movePath('demo', 'f', 'g', actor);
		expect((await sharedDocument(t, 'g/a.md')).source).toBe('# a\n');
		expect((await sharedDocument(u, 'f_x.md')).source).toBe('# f_x\n');
	});

	it('a new document at a deleted path is not shown by the old link', async () => {
		const enc = (s: string) => new TextEncoder().encode(s);
		const linked = async (p: string) => {
			await createDocument('demo', p, actor);
			const t = await createPublicLink('demo', p, null, actor);
			await deletePath('demo', p, actor);
			return t;
		};
		const created = await linked('c.md');
		await createDocument('demo', 'c.md', actor);
		const imported = await linked('i.md');
		await importDocument('demo', 'i.md', enc('# new\n'), { actor });
		const moved = await linked('m.md');
		await createDocument('demo', 'y.md', actor);
		await movePath('demo', 'y.md', 'm.md', actor);
		for (const [t, p] of [[created, 'c.md'], [imported, 'i.md'], [moved, 'm.md']])
			await expect(sharedDocument(t, p)).rejects.toBeTruthy();
		expect(db().prepare('SELECT count(*) AS n FROM public_links').get()).toEqual({ n: 0 });
	});

	it('readers cannot delete', async () => {
		const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
		db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
		await expect(deletePath('demo', doc, { id: reader.id, name: 'R' })).rejects.toBeInstanceOf(Forbidden);
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

	describe('events', () => {
		let ann: Actor;
		let since: number;
		beforeEach(async () => {
			const user = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
			db().prepare("insert into memberships values ('demo', ?, 'editor')").run(user.id);
			ann = { id: user.id, name: 'Ann' };
			since = changes('demo', ann).cursor;
		});

		it('every write leaves one event', async () => {
			const enc = new TextEncoder();
			await createDocument('demo', 'a.md', actor);
			await importDocument('demo', 'b.md', enc.encode('# b\n'), { actor });
			await importDocument('demo', 'b.md', enc.encode('# b2\n'), { actor, overwrite: true });
			await movePath('demo', 'b.md', 'c.md', actor);
			await deletePath('demo', 'a.md', actor);
			const { events } = changes('demo', ann, since);
			expect(events.map((e) => [e.type, e.path, e.from])).toEqual([
				['create', 'a.md', undefined],
				['create', 'b.md', undefined],
				['update', 'b.md', undefined],
				['move', 'c.md', 'b.md'],
				['delete', 'a.md', undefined]
			]);
			for (const e of events) expect(e.commit).toMatch(/^[0-9a-f]{40}$/);
		});

		it('an empty folder moved leaves an event without a commit', async () => {
			await createFolder('demo', 'empty', actor);
			await movePath('demo', 'empty', 'moved', actor);
			const { events } = changes('demo', ann, since);
			expect(events).toEqual([expect.objectContaining({ type: 'move', path: 'moved', from: 'empty' })]);
			expect(events[0].commit).toBeUndefined();
		});

		it('a failed commit leaves no event', async () => {
			const lock = path.join(workspaceDir('demo'), '.git/index.lock');
			fs.writeFileSync(lock, '');
			await expect(createDocument('demo', 'new.md', actor)).rejects.toThrow();
			fs.rmSync(lock);
			expect(changes('demo', ann, since).events).toEqual([]);
		});
	});

	it('imports over a known hash only', async () => {
		const enc = new TextEncoder();
		await importDocument('demo', 'b.md', enc.encode('# b\n'), { actor });
		const { hash } = await readDocument('demo', 'b.md', actor);
		const res = await importDocument('demo', 'b.md', enc.encode('# b2\n'), { actor, expectedHash: hash });
		expect(res).toMatchObject({ path: 'b.md', replaced: true });
		expect((await history('demo', 'b.md', actor))[0].message).toBe('Update b.md');
		await expect(
			importDocument('demo', 'b.md', enc.encode('# b3\n'), { actor, expectedHash: hash })
		).rejects.toThrow(Conflict);
		expect((await readDocument('demo', 'b.md', actor)).source).toBe('# b2\n');
		await expect(
			importDocument('demo', 'nope.md', enc.encode('# n\n'), { actor, expectedHash: hash })
		).rejects.toMatchObject({ code: 'ENOENT' });
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'nope.md'))).toBe(false);
	});

	it('returns the stored hash', async () => {
		const res = await importDocument('demo', 'h.md', new TextEncoder().encode('\uFEFF# été\r\n'), { actor });
		expect(res.hash).toBe((await readDocument('demo', 'h.md', actor)).hash);
	});

	describe('restore', () => {
		let ann: Actor;
		const enc = new TextEncoder();
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: workspaceDir('demo'), encoding: 'utf8' }).trim();
		const write = async (p: string, body: string, who: Actor) =>
			writeDocument('demo', p, body, { expectedHash: (await readDocument('demo', p, who)).hash, actor: who });
		beforeEach(async () => {
			const user = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
			db().prepare("insert into memberships values ('demo', ?, 'editor')").run(user.id);
			ann = { id: user.id, name: 'Ann' };
			await importDocument('demo', 'a.md', enc.encode('# a\n\nzanzibar\n'), { actor });
		});
		const first = async () => (await history('demo', 'a.md', actor)).at(-1)!.hash;

		it('reads an old version', async () => {
			const v1 = await first();
			await importDocument('demo', 'a.md', enc.encode('# a\n\nnew\n'), { actor, overwrite: true });
			expect(await readVersion('demo', 'a.md', v1, actor)).toEqual({
				path: 'a.md',
				source: '# a\n\nzanzibar\n',
				commit: v1
			});
			expect((await readVersion('demo', 'a.md', v1.slice(0, 7), actor)).source).toBe('# a\n\nzanzibar\n');
			await expect(readVersion('demo', 'a.md', 'f'.repeat(40), actor)).rejects.toMatchObject({ code: 'ENOENT' });
			await expect(readVersion('demo', 'nope.md', v1, actor)).rejects.toMatchObject({ code: 'ENOENT' });
		});

		it('restores a version as a new commit', async () => {
			const v1 = await first();
			await importDocument('demo', 'a.md', enc.encode('# a\n\nnew\n'), { actor, overwrite: true });
			const since = changes('demo', ann).cursor;
			const { commit } = await restoreVersion('demo', 'a.md', v1, ann);
			expect(commit).toMatch(/^[0-9a-f]{40}$/);
			expect(git('log', '-1', '--format=%an %s')).toBe(`Ann Restore a.md to ${v1.slice(0, 7)}`);
			expect((await readDocument('demo', 'a.md', actor)).source).toBe('# a\n\nzanzibar\n');
			expect(changes('demo', actor, since).events.map((e) => [e.type, e.path, e.commit])).toEqual([
				['update', 'a.md', commit]
			]);
			expect(search('demo', 'zanzibar', actor).map((h) => h.path)).toEqual(['a.md']);
		});

		it('restoring the same text makes no commit', async () => {
			const head = git('rev-parse', 'HEAD');
			expect(await restoreVersion('demo', 'a.md', await first(), ann)).toEqual({ commit: '' });
			expect(git('rev-parse', 'HEAD')).toBe(head);
		});

		it('restore commits the open session first', async () => {
			const v1 = await first();
			await write('a.md', 'J', actor);
			await restoreVersion('demo', 'a.md', v1, ann);
			const log = await history('demo', 'a.md', actor);
			expect(log.slice(0, 2).map((e) => [e.name, e.message])).toEqual([
				['Ann', `Restore a.md to ${v1.slice(0, 7)}`],
				['Jon', 'Update a.md']
			]);
			expect(git('show', `${log[1].hash}:a.md`)).toContain('J');
			expect((await readDocument('demo', 'a.md', actor)).source).toBe('# a\n\nzanzibar\n');
		});

		it("restore commits the restorer's own open session first", async () => {
			const v1 = await first();
			await write('a.md', 'Mine', ann);
			await restoreVersion('demo', 'a.md', v1, ann);
			const log = await history('demo', 'a.md', actor);
			expect(log.slice(0, 2).map((e) => [e.name, e.message])).toEqual([
				['Ann', `Restore a.md to ${v1.slice(0, 7)}`],
				['Ann', 'Update a.md']
			]);
			expect(git('show', `${log[1].hash}:a.md`)).toContain('Mine');
			expect(await commitAllSessions()).toBe(0);
		});

		it('refuses a bad commit id', async () => {
			for (const bad of ['HEAD', 'abc', '../x', 'a'.repeat(41), '-p', 'ABCDEF1']) {
				await expect(readVersion('demo', 'a.md', bad, actor)).rejects.toBeInstanceOf(InvalidPath);
				await expect(restoreVersion('demo', 'a.md', bad, ann)).rejects.toBeInstanceOf(InvalidPath);
			}
			await expect(restoreVersion('demo', 'a.md', 'f'.repeat(40), ann)).rejects.toMatchObject({ code: 'ENOENT' });
		});

		it('lists deleted documents', async () => {
			await createDocument('demo', 'f/b.md', actor);
			await createDocument('demo', 'c.md', actor);
			await addComment('demo', 'a.md', 'Note', actor);
			await deletePath('demo', 'a.md', actor);
			await deletePath('demo', 'f', agent);
			await movePath('demo', 'c.md', 'd.md', actor);
			const list = await deletedDocuments('demo', ann);
			expect(list.map((d) => d.path)).toEqual(['f/b.md', 'a.md']);
			expect(list[0]).toMatchObject({ name: 'Jon', agent: 'claude-code', commit: git('rev-parse', 'HEAD~1') });
			expect(list[1]).toMatchObject({ name: 'Jon', date: expect.any(String) });
			expect(list[1].agent).toBeUndefined();
			await restoreDeleted('demo', 'a.md', ann);
			expect((await deletedDocuments('demo', ann)).map((d) => d.path)).toEqual(['f/b.md']);
		});

		it('lists only deleted documents that can be restored', async () => {
			const root = workspaceDir('demo');
			fs.mkdirSync(path.join(root, 'x.md'));
			for (const p of ['.hidden.md', 'x.md/b.md', '.dot/c.md']) {
				fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
				fs.writeFileSync(path.join(root, p), '# x\n');
			}
			git('add', '-A');
			git('-c', 'user.name=X', '-c', 'user.email=x@y', 'commit', '-qm', 'outside');
			git('rm', '-rq', '.hidden.md', 'x.md', '.dot');
			git('-c', 'user.name=X', '-c', 'user.email=x@y', 'commit', '-qm', 'gone');
			await deletePath('demo', 'a.md', actor);
			expect((await deletedDocuments('demo', ann)).map((d) => d.path)).toEqual(['a.md']);
		});

		it('restores a deleted document with its comments', async () => {
			await addComment('demo', 'a.md', 'Looks good', actor);
			const token = await createPublicLink('demo', 'a.md', null, actor);
			await deletePath('demo', 'a.md', actor);
			await expect(sharedDocument(token, 'a.md')).rejects.toBeTruthy();
			const since = changes('demo', actor).cursor;
			const { commit } = await restoreDeleted('demo', 'a.md', ann);
			expect((await readDocument('demo', 'a.md', actor)).source).toBe('# a\n\nzanzibar\n');
			expect((await listComments('demo', 'a.md', actor)).map((c) => c.body)).toEqual(['Looks good']);
			expect(git('log', '-1', '--format=%H %an %s')).toBe(`${commit} Ann Restore a.md`);
			expect(git('show', '--name-status', '--format=', 'HEAD').split('\n').sort()).toEqual([
				'A\t.inkmesh/comments/a.md',
				'A\ta.md'
			]);
			expect(changes('demo', actor, since).events.map((e) => [e.type, e.path, e.commit])).toEqual([
				['create', 'a.md', commit]
			]);
			expect(search('demo', 'zanzibar', actor).map((h) => h.path)).toEqual(['a.md']);
			expect((await sharedDocument(token, 'a.md')).source).toBe('# a\n\nzanzibar\n');
			expect(git('status', '--porcelain')).toBe('');
		});

		it('restores a deleted document from a deleted folder', async () => {
			await createDocument('demo', 'f/g/b.md', actor);
			await deletePath('demo', 'f', actor);
			await restoreDeleted('demo', 'f/g/b.md', ann);
			expect((await readDocument('demo', 'f/g/b.md', actor)).source).toBe('# b\n');
		});

		it('refuses to restore over an existing path', async () => {
			await deletePath('demo', 'a.md', actor);
			await createDocument('demo', 'a.md', actor);
			await expect(restoreDeleted('demo', 'a.md', ann)).rejects.toBeInstanceOf(Conflict);
			await expect(restoreDeleted('demo', 'never.md', ann)).rejects.toMatchObject({ code: 'ENOENT' });
		});

		it('puts things back when the restore commit fails', async () => {
			const v1 = await first();
			await importDocument('demo', 'a.md', enc.encode('# a\n\nnew\n'), { actor, overwrite: true });
			await addComment('demo', 'a.md', 'Note', actor);
			await createDocument('demo', 'b.md', actor);
			await deletePath('demo', 'b.md', actor);
			const root = workspaceDir('demo');
			fs.writeFileSync(path.join(root, '.git/index.lock'), '');
			await expect(restoreVersion('demo', 'a.md', v1, ann)).rejects.toThrow(/index\.lock/);
			await expect(restoreDeleted('demo', 'b.md', ann)).rejects.toThrow(/index\.lock/);
			fs.rmSync(path.join(root, '.git/index.lock'));
			expect((await readDocument('demo', 'a.md', actor)).source).toBe('# a\n\nnew\n');
			expect(fs.existsSync(path.join(root, 'b.md'))).toBe(false);
		});

		it('readers cannot restore', async () => {
			const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
			db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
			const r = { id: reader.id, name: 'R' };
			const v1 = await first();
			await expect(readVersion('demo', 'a.md', v1, r)).resolves.toBeTruthy();
			await expect(deletedDocuments('demo', r)).resolves.toEqual([]);
			await expect(restoreVersion('demo', 'a.md', v1, r)).rejects.toBeInstanceOf(Forbidden);
			await deletePath('demo', 'a.md', actor);
			await expect(restoreDeleted('demo', 'a.md', r)).rejects.toBeInstanceOf(Forbidden);
		});
	});
});
