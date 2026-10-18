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
		const hash = await gitCommit(dir, { paths: ['a.md'], message: 'add a', author });
		expect(hash).toMatch(/^[0-9a-f]{40}$/);

		const log = await gitLog(dir, 'a.md', 5);
		expect(log).toHaveLength(1);
		expect(log[0].name).toBe('Jon via test');

		expect(await gitCommit(dir, { paths: ['a.md'], message: 'again', author })).toBe('');
	});
});
