import fs from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { assertRole } from './access.ts';
import { commitAuthor, type Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { documentFile, writeAtomic } from './documents.ts';
import { appendEvent } from './events.ts';
import { gitCommit } from './git.ts';
import { serialised } from './lock.ts';
import { InvalidContent, resolveInside } from './paths.ts';

/** One `## ` section of a thread file; `id === at`. */
export type Comment = { id: string; author: string; at: string; resolved: boolean; body: string };

export const MAX_COMMENT_CHARS = 10_000;

const HEADING = /^## (.+) · (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z)( · resolved)?[ \t]*\r?$/;
const blank = (line: string) => /^[ \t]*\r?$/.test(line);
const noSuchComment = () => Object.assign(new Error('no such comment'), { code: 'ENOENT' });

/** The thread file of a document, relative to the workspace. */
export function commentPath(docPath: string): string {
	return `.inkmesh/comments/${docPath}`;
}

export function parseComments(source: string): Comment[] {
	const comments: Array<Comment & { lines: string[] }> = [];
	for (const line of source.split('\n')) {
		const m = HEADING.exec(line);
		if (m) comments.push({ id: m[2], author: m[1], at: m[2], resolved: !!m[3], body: '', lines: [] });
		else comments.at(-1)?.lines.push(line); // before the first heading: preamble, ignored
	}
	return comments.map(({ lines, ...c }) => {
		while (lines.length && blank(lines[0])) lines.shift();
		while (lines.length && blank(lines.at(-1)!)) lines.pop();
		return { ...c, body: lines.join('\n') };
	});
}

export function appendComment(
	source: string,
	author: string,
	body: string,
	now: Date
): { source: string; comment: Comment } {
	const text = body.replace(/\r\n/g, '\n').trim();
	if (!text) throw new InvalidContent('empty');
	if (text.length > MAX_COMMENT_CHARS) throw new InvalidContent('too-large');
	// A body line must never read as another comment's heading.
	const escaped = text
		.split('\n')
		.map((line) => (HEADING.test(line) ? `\\${line}` : line))
		.join('\n');
	const taken = new Set(parseComments(source).map((c) => c.id));
	let t = now.getTime();
	while (taken.has(new Date(t).toISOString())) t++;
	const at = new Date(t).toISOString();
	const head = source && !source.endsWith('\n') ? `${source}\n` : source;
	return {
		source: `${head}\n## ${author} · ${at}\n\n${escaped}\n`,
		comment: { id: at, author, at, resolved: false, body: escaped }
	};
}

/** Adds or removes ` · resolved` on the first heading with that id; every other byte is kept. */
export function setResolved(source: string, id: string, resolved: boolean): string {
	const lines = source.split('\n');
	const i = lines.findIndex((line) => HEADING.exec(line)?.[2] === id);
	if (i < 0) throw noSuchComment();
	const m = HEADING.exec(lines[i])!;
	const prefix = `## ${m[1]} · ${m[2]}`;
	const rest = lines[i].slice(prefix.length + (m[3]?.length ?? 0)); // trailing spaces, \r
	lines[i] = prefix + (resolved ? ' · resolved' : '') + rest;
	return lines.join('\n');
}

/** The document's workspace-relative path and its thread file; the document must exist (ENOENT passes through). */
async function thread(root: string, path: string): Promise<{ rel: string; file: string }> {
	const doc = documentFile(root, path);
	await fs.stat(doc);
	const rel = relative(root, doc);
	return { rel, file: resolveInside(root, commentPath(rel), { inkmesh: true }) };
}

const readThread = (file: string) =>
	fs.readFile(file).catch((err) => {
		if ((err as { code?: unknown }).code === 'ENOENT') return undefined;
		throw err;
	});

export async function listComments(slug: string, path: string, actor: Actor): Promise<Comment[]> {
	assertRole(slug, actor, 'reader');
	const { file } = await thread(workspaceDir(slug), path);
	const bytes = await readThread(file);
	return bytes ? parseComments(bytes.toString('utf8')) : [];
}

export async function addComment(slug: string, path: string, body: string, actor: Actor): Promise<Comment> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	return serialised(slug, async () => {
		const { rel, file } = await thread(root, path);
		const old = await readThread(file);
		const author = commitAuthor(actor);
		const { source, comment } = appendComment(old?.toString('utf8') ?? '', author.name, body, new Date());
		await fs.mkdir(dirname(file), { recursive: true });
		await writeAtomic(file, source);
		let commit: string;
		try {
			commit = await gitCommit(root, { paths: [commentPath(rel)], message: `Comment on ${rel}`, author });
		} catch (err) {
			await (old ? writeAtomic(file, old) : fs.rm(file, { force: true }));
			throw err;
		}
		appendEvent(slug, actor, { type: 'comment', path: rel, commit });
		return comment;
	});
}

export async function resolveComment(
	slug: string,
	path: string,
	id: string,
	resolved: boolean,
	actor: Actor
): Promise<void> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	return serialised(slug, async () => {
		const { rel, file } = await thread(root, path);
		const old = await readThread(file);
		if (!old) throw noSuchComment();
		const source = old.toString('utf8');
		const next = setResolved(source, id, resolved);
		if (next === source) return;
		await writeAtomic(file, next);
		try {
			await gitCommit(root, {
				paths: [commentPath(rel)],
				message: `${resolved ? 'Resolve' : 'Reopen'} comment on ${rel}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await writeAtomic(file, old);
			throw err;
		}
	});
}
