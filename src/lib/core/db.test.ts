import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { closeDb, db, MIGRATIONS } from './db.ts';
import { appendEvent } from './events.ts';

const TABLES = [
	'agent_tokens',
	'agents',
	'editing_sessions',
	'events',
	'inbox_cursors',
	'invitations',
	'memberships',
	'migrations',
	'oauth_clients',
	'oauth_codes',
	'public_links',
	'search_index',
	'search_index_config',
	'search_index_content',
	'search_index_data',
	'search_index_docsize',
	'search_index_idx',
	'sessions',
	'sqlite_sequence',
	'users',
	'workspaces'
];

const dirs: string[] = [];
beforeEach(() => {
	process.env.INKMESH_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-db-'));
	dirs.push(process.env.INKMESH_DATA);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('db', () => {
	it('creates the schema once', () => {
		const names = () =>
			db()
				.prepare("select name from sqlite_master where type='table' order by name")
				.all()
				.map((r) => r.name);
		expect(names()).toEqual(TABLES);
		closeDb();
		expect(names()).toEqual(TABLES); // second open: no error, no duplicate
		expect(db().prepare('select count(*) as n from migrations').get()).toEqual({ n: 3 });
	});

	it('enforces foreign keys and roles', () => {
		expect(() => db().prepare("insert into memberships values ('nope', 1, 'owner')").run()).toThrow(
			/FOREIGN KEY/
		);
		db().prepare("insert into workspaces values ('w', 'W', '2026-01-01T00:00:00.000Z')").run();
		db()
			.prepare(
				"insert into users (email, name, password_hash, created_at) values ('a@b.c', 'A', 'x', '2026-01-01T00:00:00.000Z')"
			)
			.run();
		expect(() => db().prepare("insert into memberships values ('w', 1, 'god')").run()).toThrow(
			/CHECK/
		);
	});

	it('opens one database per data directory', () => {
		const first = db();
		expect(db()).toBe(db());
		process.env.INKMESH_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-db2-'));
		dirs.push(process.env.INKMESH_DATA);
		expect(db()).not.toBe(first);
	});

	// An M4 database: migrations 001 and 002 only, with events, some deleted.
	const m4 = (ids: number[], deleted: number[]) => {
		const file = new DatabaseSync(path.join(process.env.INKMESH_DATA!, 'inkmesh.db'));
		file.exec('CREATE TABLE migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
		for (const m of MIGRATIONS.slice(0, 2)) {
			file.exec(m.sql);
			file.prepare('INSERT INTO migrations VALUES (?, ?)').run(m.id, '2026-01-01T00:00:00.000Z');
		}
		file.exec("INSERT INTO workspaces VALUES ('w', 'W', '2026-01-01T00:00:00.000Z')");
		for (const id of ids)
			file
				.prepare("INSERT INTO events (id, workspace, author, type, path, at) VALUES (?, 'w', 'Ann', 'create', ?, 'x')")
				.run(id, `${id}.md`);
		for (const id of deleted) file.prepare('DELETE FROM events WHERE id = ?').run(id);
		file.close();
	};
	const actor = { id: null, name: 'Ann' } as never;
	const lastId = () => (db().prepare('SELECT max(id) AS id FROM events').get() as { id: number }).id;

	it('keeps event ids across the rebuild', () => {
		m4([1, 2, 3, 4, 5], [4, 5]);
		expect(db().prepare('SELECT id, path FROM events ORDER BY id').all()).toEqual(
			[1, 2, 3].map((id) => ({ id, path: `${id}.md` }))
		);
		appendEvent('w', actor, { type: 'comment', path: 'a.md', commit: 'abc' });
		expect(lastId()).toBe(6);
		expect(() => appendEvent('w', actor, { type: 'nope' as never, path: 'a.md' })).toThrow(/CHECK/);
	});
});
