import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace } from './access.ts';
import { createUser } from './accounts.ts';
import type { Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { closeDb, db } from './db.ts';
import { deletePath, importDocument, movePath, readDocument, writeDocument } from './documents.ts';
import { changes } from './events.ts';
import { Conflict } from './paths.ts';
import { clearSessionTimers, commitAllSessions, endSession } from './sessions.ts';

let data: string;
let jon: Actor;
let ann: Actor;
beforeEach(async () => {
	data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-sessions-'));
	process.env.INKMESH_DATA = data;
	const j = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
	const a = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
	jon = { id: j.id, name: 'Jon' };
	ann = { id: a.id, name: 'Ann' };
	await createWorkspace('demo', 'Demo', jon);
	db().prepare("INSERT INTO memberships VALUES ('demo', ?, 'editor')").run(ann.id);
	await importDocument('demo', 'a.md', new TextEncoder().encode('# a\n'), { actor: jon });
});
afterEach(() => {
	clearSessionTimers();
	vi.useRealTimers();
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(data, { recursive: true, force: true });
});

const git = (...args: string[]) =>
	execFileSync('git', args, { cwd: workspaceDir('demo'), encoding: 'utf8' }).trim();
const commits = () => Number(git('rev-list', '--count', 'HEAD'));
const rows = () => db().prepare('SELECT * FROM editing_sessions').all() as Array<{ path: string; author: string }>;
const updates = () => changes('demo', ann).events.filter((e) => e.type === 'update');
async function write(actor: Actor, body: string, p = 'a.md') {
	const { hash } = await readDocument('demo', p, actor);
	return writeDocument('demo', p, body, { expectedHash: hash, actor });
}

describe('editing sessions', () => {
	it('autosaves do not commit', async () => {
		const before = commits();
		await write(jon, '# a\n\none\n');
		await write(jon, '# a\n\ntwo\n');
		await write(jon, '# a\n\nthree\n');
		expect(commits()).toBe(before);
		expect(fs.readFileSync(path.join(workspaceDir('demo'), 'a.md'), 'utf8')).toBe('# a\n\nthree\n');
		expect(rows()).toHaveLength(1);
	});

	it('commits once after a minute idle', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const before = commits();
		await write(jon, '# a\n\none\n');
		vi.advanceTimersByTime(59_000);
		await write(jon, '# a\n\ntwo\n');
		vi.advanceTimersByTime(59_000);
		expect(commits()).toBe(before);
		vi.advanceTimersByTime(1_000);
		await vi.waitFor(() => expect(commits()).toBe(before + 1));
		expect(git('log', '-1', '--format=%s|%an')).toBe('Update a.md|Jon');
		expect(git('show', 'HEAD:a.md')).toBe('# a\n\ntwo');
		expect(rows()).toEqual([]);
		expect(updates()).toHaveLength(1);
	});

	it('a save queued before the idle timer fires keeps the session open', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const before = commits();
		await write(jon, '# a\n\none\n');
		const { hash } = await readDocument('demo', 'a.md', jon);
		const saving = writeDocument('demo', 'a.md', '# a\n\ntwo\n', { expectedHash: hash, actor: jon });
		vi.advanceTimersByTime(60_000); // fires while the save holds the lock; the save re-arms the timer
		await saving;
		await endSession('demo', 'a.md', ann); // no-op that waits for the queued timer callback
		expect(commits()).toBe(before);
		expect(rows()).toHaveLength(1);
		vi.advanceTimersByTime(60_000);
		await vi.waitFor(() => expect(commits()).toBe(before + 1));
	});

	it('a refused move commits no session', async () => {
		await importDocument('demo', 'b.md', new TextEncoder().encode('# b\n'), { actor: jon });
		const before = commits();
		await write(jon, '# a\n\nopen\n');
		await expect(movePath('demo', 'a.md', 'b.md', jon)).rejects.toThrow(Conflict);
		expect(commits()).toBe(before);
		expect(rows()).toHaveLength(1);
	});

	it('leaving commits my session only', async () => {
		const before = commits();
		await write(jon, '# a\n\nmine\n');
		await endSession('demo', 'a.md', ann);
		expect(commits()).toBe(before);
		await endSession('demo', 'a.md', jon);
		expect(commits()).toBe(before + 1);
		expect(git('log', '-1', '--format=%an')).toBe('Jon');
	});

	it('commits the open session before another author writes', async () => {
		await write(jon, '# a\n\nby jon\n');
		await importDocument('demo', 'a.md', new TextEncoder().encode('# a\n\nby bot\n'), {
			actor: { ...jon, agent: 'bot' },
			overwrite: true
		});
		expect(git('log', '-2', '--format=%s|%an').split('\n')).toEqual([
			'Replace a.md|Jon via bot',
			'Update a.md|Jon'
		]);
		expect(git('show', 'HEAD~1:a.md')).toBe('# a\n\nby jon');
		expect(rows()).toEqual([]);
		expect(updates().slice(-2)).toEqual([
			expect.objectContaining({ author: 'Jon', commit: git('rev-parse', 'HEAD~1') }),
			expect.objectContaining({ author: 'Jon', agent: 'bot', commit: git('rev-parse', 'HEAD') })
		]);
		expect(updates().at(-2)!.agent).toBeUndefined();
	});

	it("a replace commits the writer's own open session first", async () => {
		await write(jon, '# a\n\nby jon\n');
		await importDocument('demo', 'a.md', new TextEncoder().encode('# a\n\nreplaced\n'), { actor: jon, overwrite: true });
		expect(git('log', '-2', '--format=%s|%an').split('\n')).toEqual(['Replace a.md|Jon', 'Update a.md|Jon']);
		expect(git('show', 'HEAD~1:a.md')).toBe('# a\n\nby jon');
		expect(rows()).toEqual([]);
	});

	it('another human takes over the file', async () => {
		const before = commits();
		await write(jon, '# a\n\nby jon\n');
		await write(ann, '# a\n\nby ann\n');
		expect(commits()).toBe(before + 1);
		expect(git('log', '-1', '--format=%s|%an')).toBe('Update a.md|Jon');
		expect(rows()).toEqual([expect.objectContaining({ path: 'a.md', author: 'Ann' })]);
	});

	it('my own next save continues my session', async () => {
		const before = commits();
		await write(jon, '# a\n\none\n');
		expect(commits()).toBe(before);
		await write(jon, '# a\n\ntwo\n');
		expect(commits()).toBe(before);
		expect(rows()).toHaveLength(1);
	});

	it('delete and move flush first', async () => {
		const enc = new TextEncoder();
		await importDocument('demo', 'f/a.md', enc.encode('# f\n'), { actor: jon });
		await write(jon, '# f\n\nedited\n', 'f/a.md');
		await deletePath('demo', 'f', jon);
		expect(git('log', '--all', '--format=%s', '--', 'f/a.md').split('\n').slice(0, 2)).toEqual([
			'Delete f',
			'Update f/a.md'
		]);
		await importDocument('demo', 'g/a.md', enc.encode('# g\n'), { actor: jon });
		await write(jon, '# g\n\nedited\n', 'g/a.md');
		await movePath('demo', 'g', 'h', jon);
		expect(git('log', '--all', '--format=%s', '--', 'g/a.md').split('\n').slice(0, 2)).toEqual([
			'Move g to h',
			'Update g/a.md'
		]);
		expect(rows()).toEqual([]);
	});

	it('recovers sessions after a restart', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		await write(jon, '# a\n\nunsaved\n');
		closeDb();
		vi.clearAllTimers();
		db();
		expect(await commitAllSessions()).toBe(1);
		expect(git('log', '-1', '--format=%s|%an')).toBe('Update a.md|Jon');
		expect(git('show', 'HEAD:a.md')).toBe('# a\n\nunsaved');
		expect(rows()).toEqual([]);
	});

	it('a failed commit keeps the session', async () => {
		await write(jon, '# a\n\nkept\n');
		const lock = path.join(workspaceDir('demo'), '.git/index.lock');
		fs.writeFileSync(lock, '');
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await commitAllSessions()).toBe(0);
		expect(err).toHaveBeenCalled();
		err.mockRestore();
		expect(rows()).toHaveLength(1);
		fs.rmSync(lock);
		expect(await commitAllSessions()).toBe(1);
		expect(rows()).toEqual([]);
	});

	it('a reverted edit leaves no commit', async () => {
		const before = commits();
		await write(jon, '# a\n\nB\n');
		await write(jon, '# a\n');
		expect(await commitAllSessions()).toBe(0);
		expect(commits()).toBe(before);
		expect(rows()).toEqual([]);
		expect(updates()).toEqual([]);
	});
});
