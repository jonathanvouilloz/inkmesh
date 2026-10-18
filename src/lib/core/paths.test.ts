import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidPath, resolveInside } from './paths.ts';

let root: string;
beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-paths-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('resolveInside', () => {
	it('returns the absolute path inside the root', () => {
		expect(resolveInside(root, 'a/b.md')).toBe(`${root}/a/b.md`);
	});

	for (const rel of [
		'../x.md',
		'/etc/passwd',
		'',
		'.git/config',
		'.inkmesh/comments/x.md',
		'notes/.git/x',
		'a\0b.md'
	]) {
		it(`rejects ${JSON.stringify(rel)}`, () => {
			expect(() => resolveInside(root, rel)).toThrow(InvalidPath);
		});
	}

	it('rejects a symlink that escapes the root', () => {
		fs.symlinkSync('/tmp', root + '/link');
		expect(() => resolveInside(root, 'link/x')).toThrow(InvalidPath);
	});

	it('rejects a dangling symlink', () => {
		const other = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-other-'));
		try {
			fs.symlinkSync(path.join(other, 'missing.md'), root + '/d.md');
			expect(() => resolveInside(root, 'd.md')).toThrow(InvalidPath);
		} finally {
			fs.rmSync(other, { recursive: true, force: true });
		}
	});
});
