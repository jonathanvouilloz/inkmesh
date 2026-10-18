import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import {
	createDocument,
	ensureWorkspace,
	history,
	listTree,
	readDocument,
	writeDocument
} from './documents.ts';
import { Conflict, InvalidPath } from './paths.ts';

const actor: Actor = { id: 1, name: 'Jon' };
const agent: Actor = { id: 1, name: 'Jon', agent: 'claude-code' };
const doc = 'rapports/réunion été.md';

let data: string;
beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-docs-'));
	process.env.INKMESH_DATA = data;
	await ensureWorkspace('demo');
	await createDocument('demo', doc, actor);
});
afterEach(() => {
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

describe('documents', () => {
	it('lists the tree with the title from the first heading', async () => {
		expect(await listTree('demo')).toEqual([
			{
				name: 'rapports',
				path: 'rapports',
				kind: 'folder',
				children: [
					{
						name: 'réunion été.md',
						path: doc,
						kind: 'doc',
						title: 'réunion été'
					}
				]
			}
		]);
	});

	it('sorts folders first, numeric order, skips dotfiles, non-md and empty folders', async () => {
		const root = workspaceDir('demo');
		for (const f of ['b10.md', 'b2.md', '.hidden.md', 'notes.txt', 'a/.x/y.md', 'empty/z.txt']) {
			fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
			fs.writeFileSync(path.join(root, f), 'no heading\n');
		}
		const tree = await listTree('demo');
		expect(tree.map((n) => n.path)).toEqual(['rapports', 'b2.md', 'b10.md']);
		expect(tree[1].title).toBe('b2');
	});

	it('reads a document with its hash', async () => {
		const read = await readDocument('demo', doc);
		expect(read.body).toBe('# réunion été\n');
		expect(read.frontmatter).toBe('');
		expect(read.hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('writes with the right hash and records the actor and agent in history', async () => {
		const { hash } = await readDocument('demo', doc);
		const res = await writeDocument('demo', doc, '# réunion été\n\nHello\n', {
			expectedHash: hash,
			actor: agent
		});
		expect(res.hash).not.toBe(hash);
		expect(res.commit).toMatch(/^[0-9a-f]{40}$/);
		const log = await history('demo', doc);
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
		const { hash } = await readDocument('demo', doc);
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
		const { hash } = await readDocument('demo', doc);
		fs.rmSync(path.join(workspaceDir('demo'), doc));
		await expect(writeDocument('demo', doc, 'x\n', { expectedHash: hash, actor })).rejects.toThrow(
			Conflict
		);
	});

	it('serialises concurrent writes so only one wins on the same hash', async () => {
		const { hash } = await readDocument('demo', doc);
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
		await expect(readDocument('demo', '../x.md')).rejects.toThrow(InvalidPath);
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
		const notes = (await listTree('demo')).find((n) => n.path === 'notes');
		expect(notes?.children?.some((n) => n.path === 'notes/a.md' && n.kind === 'doc')).toBe(true);
	});

	it('does not commit an identical body', async () => {
		const { hash } = await readDocument('demo', doc);
		const res = await writeDocument('demo', doc, '# réunion été\n', {
			expectedHash: hash,
			actor
		});
		expect(res).toEqual({ hash, commit: '' });
		expect(await history('demo', doc)).toHaveLength(1);
	});

	it('reads and writes only .md documents that are not dot-files', async () => {
		fs.writeFileSync(path.join(workspaceDir('demo'), '.gitignore'), 'x\n');
		await expect(readDocument('demo', '.gitignore')).rejects.toThrow(InvalidPath);
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
			const { hash } = await readDocument('demo', name);
			await writeDocument('demo', name, '# changed\n', { expectedHash: hash, actor });
			expect(show()).toBe(`${name}\n`);
			expect((await history('demo', name)).map((e) => e.message)).toEqual([
				`Update ${name}`,
				`Create ${name}`
			]);
		}
	});

	it('restores the file when the commit fails', async () => {
		const lock = path.join(workspaceDir('demo'), '.git/index.lock');
		const file = path.join(workspaceDir('demo'), doc);
		const before = fs.readFileSync(file, 'utf8');
		const { hash } = await readDocument('demo', doc);
		fs.writeFileSync(lock, '');
		await expect(
			writeDocument('demo', doc, '# changed\n', { expectedHash: hash, actor })
		).rejects.toThrow();
		expect(fs.readFileSync(file, 'utf8')).toBe(before);
		await expect(createDocument('demo', 'new.md', actor)).rejects.toThrow();
		expect(fs.existsSync(path.join(workspaceDir('demo'), 'new.md'))).toBe(false);
		fs.rmSync(lock);
		// No false conflict afterwards: the original hash still writes.
		await writeDocument('demo', doc, '# changed\n', { expectedHash: hash, actor });
		expect(fs.readdirSync(path.dirname(file))).toEqual(['réunion été.md']); // no temporary file left
	});
});
