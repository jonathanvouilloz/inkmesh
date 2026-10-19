import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspace, Forbidden } from './access.ts';
import { createUser } from './accounts.ts';
import type { Actor } from './actor.ts';
import {
	addComment,
	appendComment,
	listComments,
	MAX_COMMENT_CHARS,
	parseComments,
	resolveComment,
	setResolved
} from './comments.ts';
import { workspaceDir } from './data.ts';
import { closeDb, db } from './db.ts';
import { createDocument } from './documents.ts';
import { changes } from './events.ts';
import { InvalidContent } from './paths.ts';
import { clearSessionTimers } from './sessions.ts';

const example = `## Ann Keller · 2026-10-19T14:22:33.120Z

The Q3 row is missing from the second table.

## Jon via claude · 2026-10-19T15:01:02.004Z · resolved

Added Q3 from \`reports/q3.md\`.
`;
const now = new Date('2026-10-19T10:00:00.000Z');

describe('comment grammar', () => {
	it('parses the spec example', () => {
		const comments = parseComments(example);
		expect(comments).toHaveLength(2);
		expect(comments[0]).toEqual({
			id: '2026-10-19T14:22:33.120Z',
			author: 'Ann Keller',
			at: '2026-10-19T14:22:33.120Z',
			resolved: false,
			body: 'The Q3 row is missing from the second table.'
		});
		expect(comments[1]).toMatchObject({
			author: 'Jon via claude',
			resolved: true,
			body: 'Added Q3 from `reports/q3.md`.'
		});
	});

	it('keeps a preamble and odd headings as text', () => {
		const source = '# Notes\n\n## Not a comment\n\n## Ann · 2026-10-19T10:00:00Z\n\nHi\n## bad heading\nmore';
		const comments = parseComments(source);
		expect(comments).toHaveLength(1);
		expect(comments[0]).toMatchObject({ author: 'Ann', body: 'Hi\n## bad heading\nmore' });
	});

	it('appends without touching earlier bytes', () => {
		const { source, comment } = appendComment(example, 'Eve', '  Looks good\r\n  ', now);
		expect(source.startsWith(example)).toBe(true);
		expect(source.slice(example.length)).toBe(`\n## Eve · ${now.toISOString()}\n\nLooks good\n`);
		expect(comment).toEqual({ id: now.toISOString(), author: 'Eve', at: now.toISOString(), resolved: false, body: 'Looks good' });
		const bare = appendComment('# no newline', 'Eve', 'x', now).source;
		expect(bare.startsWith('# no newline\n\n## Eve')).toBe(true);
		expect(appendComment('', 'Eve', 'x', now).source).toBe(`\n## Eve · ${now.toISOString()}\n\nx\n`);
	});

	it('escapes a body line that looks like a heading', () => {
		const { source } = appendComment('', 'Ann', 'x\n## Eve · 2026-01-01T00:00:00Z', now);
		const comments = parseComments(source);
		expect(comments).toHaveLength(1);
		expect(comments[0].body).toBe('x\n\\## Eve · 2026-01-01T00:00:00Z');
	});

	it('gives each comment a unique id', () => {
		const first = appendComment('', 'Ann', 'a', now);
		const second = appendComment(first.source, 'Ann', 'b', now);
		expect(Date.parse(second.comment.id) - Date.parse(first.comment.id)).toBe(1);
		expect(parseComments(second.source).map((c) => c.id)).toEqual([first.comment.id, second.comment.id]);
	});

	it('resolve and reopen change one line', () => {
		const id = '2026-10-19T14:22:33.120Z';
		const resolved = setResolved(example, id, true);
		const before = example.split('\n');
		const after = resolved.split('\n');
		expect(after).toHaveLength(before.length);
		const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
		expect(changed).toEqual([0]);
		expect(after[0]).toBe(`## Ann Keller · ${id} · resolved`);
		expect(parseComments(resolved)[0].resolved).toBe(true);
		expect(setResolved(resolved, id, false)).toBe(example);
		expect(setResolved(example, id, false)).toBe(example);
		expect(() => setResolved(example, '2000-01-01T00:00:00.000Z', true)).toThrow(
			expect.objectContaining({ code: 'ENOENT' })
		);
	});

	it('refuses empty and oversized bodies', () => {
		expect(() => appendComment('', 'Ann', ' \r\n\n ', now)).toThrow(new InvalidContent('empty'));
		expect(() => appendComment('', 'Ann', 'x'.repeat(MAX_COMMENT_CHARS + 1), now)).toThrow(
			new InvalidContent('too-large')
		);
		expect(appendComment('', 'Ann', 'x'.repeat(MAX_COMMENT_CHARS), now).comment.body).toHaveLength(
			MAX_COMMENT_CHARS
		);
	});
});

describe('comment threads', () => {
	let data: string;
	let jon: Actor;
	let ann: Actor;
	beforeEach(async () => {
		data = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-comments-'));
		process.env.INKMESH_DATA = data;
		const j = await createUser({ email: 'jon@b.c', name: 'Jon', password: 'long enough 1' });
		await createWorkspace('demo', 'Demo', j);
		jon = { id: j.id, name: 'Jon' };
		const a = await createUser({ email: 'ann@b.c', name: 'Ann', password: 'long enough 1' });
		db().prepare("insert into memberships values ('demo', ?, 'reader')").run(a.id);
		ann = { id: a.id, name: 'Ann' };
		await createDocument('demo', 'notes/a.md', jon);
	});
	afterEach(() => {
		clearSessionTimers();
		closeDb();
		delete process.env.INKMESH_DATA;
		fs.rmSync(data, { recursive: true, force: true });
	});
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: workspaceDir('demo'), encoding: 'utf8' });

	it("a reader comments and the agent's name is kept", async () => {
		const comment = await addComment('demo', 'notes/a.md', 'Hello', ann);
		expect(comment).toMatchObject({ author: 'Ann', body: 'Hello', resolved: false });
		expect(fs.existsSync(path.join(workspaceDir('demo'), '.inkmesh/comments/notes/a.md'))).toBe(true);
		expect(git('log', '-1', '--format=%s|%an')).toBe('Comment on notes/a.md|Ann\n');

		const second = await addComment('demo', 'notes/a.md', 'Done', { ...jon, agent: 'claude' });
		expect(second.author).toBe('Jon via claude');
		expect(git('log', '-1', '--format=%an')).toBe('Jon via claude\n');
		expect((await listComments('demo', 'notes/a.md', ann)).map((c) => c.body)).toEqual(['Hello', 'Done']);
		expect(git('status', '--porcelain')).toBe('');

		const events = changes('demo', jon).events.filter((e) => e.type === 'comment');
		// Jon's agent is another author for Jon, so both comments show.
		expect(events).toEqual([
			expect.objectContaining({ path: 'notes/a.md', author: 'Ann', commit: expect.any(String) }),
			expect.objectContaining({ path: 'notes/a.md', author: 'Jon', agent: 'claude' })
		]);

		await resolveComment('demo', 'notes/a.md', comment.id, true, ann);
		expect(git('log', '-1', '--format=%s|%an')).toBe('Resolve comment on notes/a.md|Ann\n');
		const head = git('rev-parse', 'HEAD');
		await resolveComment('demo', 'notes/a.md', comment.id, true, ann);
		expect(git('rev-parse', 'HEAD')).toBe(head);
		await resolveComment('demo', 'notes/a.md', comment.id, false, ann);
		expect(git('log', '-1', '--format=%s')).toBe('Reopen comment on notes/a.md\n');
		expect(changes('demo', jon).events.filter((e) => e.type === 'comment')).toHaveLength(2);
		await expect(
			resolveComment('demo', 'notes/a.md', '2000-01-01T00:00:00.000Z', true, ann)
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('a missing document has no thread', async () => {
		await expect(listComments('demo', 'nope.md', ann)).rejects.toMatchObject({ code: 'ENOENT' });
		await expect(addComment('demo', 'nope.md', 'x', ann)).rejects.toMatchObject({ code: 'ENOENT' });
		expect(fs.existsSync(path.join(workspaceDir('demo'), '.inkmesh/comments'))).toBe(false);
		expect(await listComments('demo', 'notes/a.md', ann)).toEqual([]);
	});

	it('a stranger is Forbidden', async () => {
		const s = await createUser({ email: 's@b.c', name: 'S', password: 'long enough 1' });
		const stranger = { id: s.id, name: 'S' };
		await expect(listComments('demo', 'notes/a.md', stranger)).rejects.toThrow(Forbidden);
		await expect(addComment('demo', 'notes/a.md', 'x', stranger)).rejects.toThrow(Forbidden);
		await expect(resolveComment('demo', 'notes/a.md', 'x', true, stranger)).rejects.toThrow(Forbidden);
	});
});
