import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspace, removeMember } from './access.ts';
import { createUser, type User } from './accounts.ts';
import { closeDb, db } from './db.ts';
import { appendEvent } from './events.ts';
import { inbox, markRead, unreadCount } from './inbox.ts';

let dir: string;
let jon: User;
let ann: User;
beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-inbox-'));
	process.env.INKMESH_DATA = dir;
	jon = await createUser({
		email: 'jon@example.ch',
		name: 'Jon',
		password: 'long enough 1'
	});
	ann = await createUser({
		email: 'ann@example.ch',
		name: 'Ann',
		password: 'long enough 1'
	});
	await createWorkspace('demo', 'Demo', jon);
	await createWorkspace('other', 'Other', ann);
	db().prepare("INSERT INTO memberships (workspace, user_id, role) VALUES ('demo', ?, 'editor')").run(ann.id);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(dir, { recursive: true, force: true });
});

const lastId = () => (db().prepare('SELECT max(id) AS id FROM events').get() as { id: number }).id;

describe('inbox', () => {
	it('starts at the present', () => {
		appendEvent('demo', ann, { type: 'create', path: 'old.md' });
		expect(inbox(jon.id).map((e) => [e.path, e.unread])).toEqual([['old.md', false]]);
		expect(unreadCount(jon.id)).toBe(0);
		appendEvent('demo', ann, { type: 'update', path: 'old.md' });
		expect(unreadCount(jon.id)).toBe(1);
		expect(inbox(jon.id)[0]).toMatchObject({
			type: 'update',
			author: 'Ann',
			workspace: 'demo',
			workspaceName: 'Demo',
			unread: true
		});
	});

	it("shows others' events in my workspaces only", () => {
		unreadCount(jon.id);
		appendEvent('other', ann, { type: 'create', path: 'secret.md' });
		appendEvent('demo', jon, { type: 'create', path: 'mine.md' });
		appendEvent('demo', ann, { type: 'create', path: 'hers.md' });
		expect(inbox(jon.id).map((e) => e.path)).toEqual(['hers.md']);
		expect(unreadCount(jon.id)).toBe(1);
	});

	it("includes my agents' work", () => {
		unreadCount(jon.id);
		appendEvent('demo', { ...jon, agent: 'bot' }, { type: 'create', path: 'bot.md' });
		expect(inbox(jon.id).map((e) => [e.path, e.agent, e.unread])).toEqual([['bot.md', 'bot', true]]);
		expect(unreadCount(jon.id)).toBe(1);
	});

	it('marking read never goes back', () => {
		unreadCount(jon.id);
		appendEvent('demo', ann, { type: 'create', path: 'a.md' });
		appendEvent('demo', ann, { type: 'create', path: 'b.md' });
		const id = lastId();
		markRead(jon.id, id);
		markRead(jon.id, id - 1);
		expect(unreadCount(jon.id)).toBe(0);
		markRead(jon.id, id + 1000);
		appendEvent('demo', ann, { type: 'create', path: 'c.md' });
		expect(unreadCount(jon.id)).toBe(1);
	});

	it('marking read works before any cursor exists', () => {
		appendEvent('demo', ann, { type: 'create', path: 'a.md' });
		appendEvent('demo', ann, { type: 'create', path: 'b.md' });
		markRead(jon.id, lastId());
		const row = db().prepare('SELECT last_read FROM inbox_cursors WHERE user_id = ?').get(jon.id);
		expect(row).toEqual({ last_read: lastId() });
		expect(unreadCount(jon.id)).toBe(0);
	});

	it('caps the count at 100', () => {
		unreadCount(jon.id);
		for (let i = 0; i < 150; i++) appendEvent('demo', ann, { type: 'create', path: `${i}.md` });
		expect(unreadCount(jon.id)).toBe(100);
		expect(inbox(jon.id)).toHaveLength(50);
		expect(inbox(jon.id)[0].path).toBe('149.md');
	});

	it('clamps the limit to 1..50', () => {
		unreadCount(jon.id);
		for (let i = 0; i < 60; i++) appendEvent('demo', ann, { type: 'create', path: `${i}.md` });
		expect(inbox(jon.id, -1)).toHaveLength(1);
		expect(inbox(jon.id, 0)).toHaveLength(1);
		expect(inbox(jon.id, 1000)).toHaveLength(50);
	});

	it('leaving a workspace hides its events', async () => {
		await createWorkspace('team', 'Team', ann);
		db().prepare("INSERT INTO memberships (workspace, user_id, role) VALUES ('team', ?, 'reader')").run(jon.id);
		appendEvent('team', ann, { type: 'create', path: 't.md' });
		expect(inbox(jon.id).map((e) => e.path)).toEqual(['t.md']);
		removeMember('team', jon.id, ann);
		expect(inbox(jon.id)).toEqual([]);
	});

	it('a deleted user takes the cursor along', () => {
		unreadCount(jon.id);
		db().prepare('DELETE FROM users WHERE id = ?').run(jon.id);
		expect(db().prepare('SELECT count(*) AS n FROM inbox_cursors').get()).toEqual({ n: 0 });
	});
});
