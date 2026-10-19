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
	deletePath,
	importDocument,
	movePath,
	readDocument,
	writeDocument
} from './documents.ts';
import { rebuildIndex, search } from './search.ts';
import { clearSessionTimers } from './sessions.ts';

describe('search', () => {
	let data: string;
	let jon: Actor;
	let stranger: Actor;
	const paths = (q: string, ws = 'demo') => search(ws, q, jon).map((h) => h.path);
	const put = (rel: string, text: string | Uint8Array, ws = 'demo') => {
		const file = path.join(workspaceDir(ws), rel);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, text);
	};
	const imported = (rel: string, text: string) =>
		importDocument('demo', rel, new TextEncoder().encode(text), { actor: jon });

	beforeEach(async () => {
		data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-search-'));
		process.env.INKMESH_DATA = data;
		const j = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
		await createWorkspace('demo', 'Demo', j);
		jon = { id: j.id, name: 'Jon' };
		const s = await createUser({ email: 'sam@b.c', name: 'Sam', password: 'long enough 1' });
		stranger = { id: s.id, name: 'Sam' };
	});
	afterEach(() => {
		clearSessionTimers();
		closeDb();
		delete process.env.INKMESH_DATA;
		fs.rmSync(data, { recursive: true, force: true });
	});

	it('finds a word with or without accents', async () => {
		await imported('cafe.md', '# Menu\n\nLe café est prêt\n');
		expect(paths('cafe')).toEqual(['cafe.md']);
		expect(paths('CAFÉ')).toEqual(['cafe.md']);
	});

	it('matches a prefix and needs every term', async () => {
		await imported('r.md', 'The quarterly report\n');
		expect(paths('rep')).toEqual(['r.md']);
		expect(paths('report zebra')).toEqual([]);
	});

	it('marks the match in the snippet', async () => {
		await imported('cafe.md', 'Le café est prêt\n');
		const [hit] = search('demo', 'cafe', jon);
		expect(hit).toMatchObject({ path: 'cafe.md', title: 'cafe' });
		expect(hit.snippet).toContain('\u0002café\u0003');
	});

	it('follows every write', async () => {
		await createDocument('demo', 'notes/kiwi.md', jon);
		expect(paths('kiwi')).toEqual(['notes/kiwi.md']);

		const doc = await readDocument('demo', 'notes/kiwi.md', jon);
		await writeDocument('demo', 'notes/kiwi.md', '# kiwi\n\nalpha\n', { expectedHash: doc.hash, actor: jon });
		expect(paths('alpha')).toEqual(['notes/kiwi.md']);
		const next = await readDocument('demo', 'notes/kiwi.md', jon);
		await writeDocument('demo', 'notes/kiwi.md', '# kiwi\n\nbeta\n', { expectedHash: next.hash, actor: jon });
		expect(paths('beta')).toEqual(['notes/kiwi.md']);
		expect(paths('alpha')).toEqual([]);

		await imported('notes/mango.md', 'mango\n');
		expect(paths('mango')).toEqual(['notes/mango.md']);

		await movePath('demo', 'notes', 'fruit', jon);
		expect(paths('kiwi')).toEqual(['fruit/kiwi.md']);
		expect(paths('mango')).toEqual(['fruit/mango.md']);

		await deletePath('demo', 'fruit', jon);
		expect(paths('kiwi')).toEqual([]);
		expect(paths('mango')).toEqual([]);
	});

	it('stays inside the workspace and needs a role', async () => {
		await createWorkspace('other', 'Other', jon);
		await imported('a.md', 'papaya\n');
		await importDocument('other', 'b.md', new TextEncoder().encode('papaya\n'), { actor: jon });
		expect(paths('papaya')).toEqual(['a.md']);
		expect(() => search('demo', 'papaya', stranger)).toThrow(Forbidden);
	});

	it('tolerates search syntax in the query', async () => {
		await imported('a.md', 'x a b col\n');
		for (const q of ['"', '-x', 'a OR', '*', '(', 'NEAR(a b)', 'col:x', '""', '" "', '-'])
			expect(Array.isArray(search('demo', q, jon)), q).toBe(true);
	});

	it('ignores an empty query', async () => {
		await imported('a.md', 'anything\n');
		expect(search('demo', '', jon)).toEqual([]);
		expect(search('demo', '  ', jon)).toEqual([]);
	});

	it('rebuilds from disk', async () => {
		await imported('a.md', 'one\n');
		put('sub/b.md', '# Banana\n\nyellow\n');
		expect(paths('yellow')).toEqual([]);
		expect(await rebuildIndex()).toBe(2);
		expect(search('demo', 'yellow', jon)).toEqual([
			expect.objectContaining({ path: 'sub/b.md', title: 'Banana' })
		]);
		expect(paths('one')).toEqual(['a.md']);
	});

	it('skips non-UTF-8 files', async () => {
		put('bin.md', new Uint8Array([0xff, 0xfe, 0x41]));
		await expect(rebuildIndex()).resolves.toBe(0);
		expect(db().prepare('SELECT count(*) AS n FROM search_index').get()).toEqual({ n: 0 });
	});
});
