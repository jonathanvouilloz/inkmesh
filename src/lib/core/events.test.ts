import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspace, Forbidden } from './access.ts';
import { createUser, type User } from './accounts.ts';
import { closeDb, db } from './db.ts';
import { appendEvent, changes } from './events.ts';

let dir: string;
let jon: User;
let ann: User;
beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-events-'));
	process.env.INKMESH_DATA = dir;
	jon = await createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
	ann = await createUser({ email: 'ann@example.ch', name: 'Ann', password: 'long enough 1' });
	await createWorkspace('demo', 'Demo', jon);
	db().prepare("INSERT INTO memberships (workspace, user_id, role) VALUES ('demo', ?, 'editor')").run(ann.id);
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(dir, { recursive: true, force: true });
});

const many = (n: number) => {
	for (let i = 0; i < n; i++) appendEvent('demo', ann, { type: 'create', path: `${i}.md` });
};

describe('events', () => {
	it('appends and lists in order', () => {
		appendEvent('demo', ann, { type: 'create', path: 'a.md', commit: 'abc' });
		appendEvent('demo', ann, { type: 'move', path: 'b.md', from: 'a.md', commit: '' });
		appendEvent('demo', ann, { type: 'delete', path: 'b.md' });
		const { events, cursor, more } = changes('demo', jon);
		expect(events.map((e) => e.type)).toEqual(['create', 'move', 'delete']);
		expect(events[0]).toEqual({
			id: events[0].id,
			type: 'create',
			path: 'a.md',
			author: 'Ann',
			commit: 'abc',
			at: expect.stringMatching(/Z$/)
		});
		expect(events[1]).toEqual({
			id: events[1].id,
			type: 'move',
			path: 'b.md',
			from: 'a.md',
			author: 'Ann',
			at: events[1].at
		});
		expect(cursor).toBe(events[2].id);
		expect(more).toBe(false);
	});

	it("hides my own events but not my agent's from me, and the reverse", () => {
		const bot = { ...jon, agent: 'bot' };
		appendEvent('demo', jon, { type: 'create', path: 'mine.md' });
		appendEvent('demo', bot, { type: 'create', path: 'bot.md' });
		expect(changes('demo', jon).events.map((e) => [e.path, e.author, e.agent])).toEqual([
			['bot.md', 'Jon', 'bot']
		]);
		expect(changes('demo', bot).events.map((e) => e.path)).toEqual(['mine.md']);
	});

	it('pages after a cursor', () => {
		many(205);
		const first = changes('demo', jon, 0);
		expect(first.events).toHaveLength(200);
		expect(first.more).toBe(true);
		const second = changes('demo', jon, first.cursor);
		expect(second.events).toHaveLength(5);
		expect(second.more).toBe(false);
		expect(second.events[0].id).toBe(first.cursor + 1);
	});

	it('without a cursor returns the 50 latest', () => {
		many(60);
		const { events } = changes('demo', jon);
		expect(events.map((e) => e.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 11));
	});

	it('cursor stays put when nothing is new', () => {
		many(3);
		const c = changes('demo', jon).cursor;
		expect(changes('demo', jon, c)).toEqual({ events: [], cursor: c, more: false });
		expect(changes('demo', ann, 0)).toEqual({ events: [], cursor: c, more: false });
	});

	it('a stranger is Forbidden', async () => {
		const eve = await createUser({ email: 'eve@example.ch', name: 'Eve', password: 'long enough 1' });
		expect(() => changes('demo', eve)).toThrow(Forbidden);
	});

	it('rejects a bad cursor', () => {
		expect(() => changes('demo', jon, -1)).toThrow(RangeError);
		expect(() => changes('demo', jon, 1.5)).toThrow(RangeError);
	});
});
