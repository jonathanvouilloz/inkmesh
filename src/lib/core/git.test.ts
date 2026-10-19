import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitCommit, gitDeletions, gitInit, gitLog, gitShow } from './git.ts';

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-git-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const author = { name: 'Jon via test', email: 'user-1@inkmesh.local' };

describe('git helpers', () => {
	it('commits a file, logs it, and skips an empty commit', async () => {
		await gitInit(dir);
		fs.writeFileSync(path.join(dir, 'a.md'), '# A\n');
		const hash = await gitCommit(dir, {
			paths: ['a.md'],
			message: 'add a',
			author
		});
		expect(hash).toMatch(/^[0-9a-f]{40}$/);

		const log = await gitLog(dir, 'a.md', 5);
		expect(log).toHaveLength(1);
		expect(log[0].name).toBe('Jon via test');

		expect(await gitCommit(dir, { paths: ['a.md'], message: 'again', author })).toBe('');
	});

	it('commits only the given paths', async () => {
		await gitInit(dir);
		fs.writeFileSync(path.join(dir, 'a.md'), 'a\n');
		fs.writeFileSync(path.join(dir, 'b.md'), 'b\n');
		expect(await gitCommit(dir, { paths: [], message: 'none', author })).toBe('');
		await gitCommit(dir, { paths: ['a.md'], message: 'add a', author });
		const files = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
			cwd: dir,
			encoding: 'utf8'
		});
		expect(files.trim()).toBe('a.md');
	});

	it('ignores paths git does not know', async () => {
		await gitInit(dir);
		fs.mkdirSync(path.join(dir, 'empty-folder'));
		expect(
			await gitCommit(dir, { paths: ['gone.md', 'empty-folder'], message: 'none', author })
		).toBe('');

		fs.writeFileSync(path.join(dir, 'a.md'), 'a\n');
		await gitCommit(dir, { paths: ['a.md'], message: 'add a', author });
		fs.renameSync(path.join(dir, 'a.md'), path.join(dir, 'b.md'));
		const hash = await gitCommit(dir, {
			paths: ['a.md', 'b.md', 'never.md'],
			message: 'Move a.md to b.md',
			author
		});
		expect(hash).toMatch(/^[0-9a-f]{40}$/);
		// --no-renames: git would otherwise fold the pair into one R line.
		const status = execFileSync(
			'git',
			['show', '--name-status', '--no-renames', '--format=', 'HEAD'],
			{ cwd: dir, encoding: 'utf8' }
		);
		expect(status.trim().split('\n').sort()).toEqual(['A\tb.md', 'D\ta.md']);
	});

	it('unstages its paths when the commit fails', async () => {
		await gitInit(dir);
		fs.writeFileSync(path.join(dir, 'a.md'), 'a\n');
		const hook = path.join(dir, '.git/hooks/pre-commit');
		fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
		await expect(gitCommit(dir, { paths: ['a.md'], message: 'add a', author })).rejects.toThrow();
		const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
		expect(status).toBe('?? a.md\n');
	});

	it('returns an empty log on a repository with no commits', async () => {
		await gitInit(dir);
		expect(await gitLog(dir, 'a.md', 5)).toEqual([]);
	});

	it('shows a file at a revision as bytes', async () => {
		await gitInit(dir);
		const bytes = Buffer.from([0x23, 0x20, 0xff, 0x0d, 0x0a]);
		fs.writeFileSync(path.join(dir, 'a.md'), bytes);
		const hash = await gitCommit(dir, { paths: ['a.md'], message: 'add a', author });
		fs.writeFileSync(path.join(dir, 'a.md'), 'new\n');
		await gitCommit(dir, { paths: ['a.md'], message: 'edit a', author });
		expect(await gitShow(dir, hash, 'a.md')).toEqual(bytes);
		expect(await gitShow(dir, hash, 'b.md')).toBeNull();
		expect(await gitShow(dir, 'f'.repeat(40), 'a.md')).toBeNull();
	});

	it('lists deletions without renames', async () => {
		await gitInit(dir);
		expect(await gitDeletions(dir, 10)).toEqual([]);
		for (const f of ['a b.md', 'été.md', 'c.md']) fs.writeFileSync(path.join(dir, f), `# ${f}\n`);
		await gitCommit(dir, { paths: ['a b.md', 'été.md', 'c.md'], message: 'add', author });
		fs.rmSync(path.join(dir, 'a b.md'));
		const first = await gitCommit(dir, { paths: ['a b.md'], message: 'del', author });
		fs.rmSync(path.join(dir, 'été.md'));
		fs.renameSync(path.join(dir, 'c.md'), path.join(dir, 'd.md'));
		const second = await gitCommit(dir, { paths: ['été.md', 'c.md', 'd.md'], message: 'del move', author });
		const list = await gitDeletions(dir, 10);
		expect(list).toEqual([
			{ commit: second, name: 'Jon via test', date: expect.any(String), paths: ['été.md'] },
			{ commit: first, name: 'Jon via test', date: expect.any(String), paths: ['a b.md'] }
		]);
		expect(list.flatMap((e) => e.paths)).toEqual(['été.md', 'a b.md']);
	});
});
