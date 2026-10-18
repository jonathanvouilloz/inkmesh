import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gitCommit, gitInit, gitLog } from './git.ts';

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

	it('returns an empty log on a repository with no commits', async () => {
		await gitInit(dir);
		expect(await gitLog(dir, 'a.md', 5)).toEqual([]);
	});
});
