import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, dirname, join, posix, relative } from 'node:path';
import { assertRole } from './access.ts';
import { commitAuthor, type Actor } from './actor.ts';
import { commentPath } from './comments.ts';
import { workspaceDir } from './data.ts';
import { db } from './db.ts';
import { appendEvent } from './events.ts';
import { gitCommit, gitDeletions, gitInit, gitLog, gitShow } from './git.ts';
import { serialised } from './lock.ts';
import { patchMarkdown, rewriteUrls, splitFrontmatter } from './markdown.ts';
import {
	assertFolderName,
	Conflict,
	InvalidContent,
	InvalidPath,
	resolveInside
} from './paths.ts';
import { syncIndex } from './search.ts';
import { flushSessions, openSession } from './sessions.ts';

export type TreeNode = {
	name: string;
	path: string;
	kind: 'folder' | 'doc';
	title?: string;
	modified?: string;
	children?: TreeNode[];
};
export type HistoryEntry = {
	hash: string;
	name: string;
	agent?: string;
	date: string;
	message: string;
};
export type DeletedDocument = { path: string; commit: string; name: string; agent?: string; date: string };

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

const sha256 = (source: string | Uint8Array) => createHash('sha256').update(source).digest('hex');
const isMissing = (err: unknown) => (err as { code?: unknown }).code === 'ENOENT';
const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { code: 'ENOENT' });
const COMMIT = /^[0-9a-f]{7,40}$/;

/** A document is a .md file whose name is not a dot-file, inside valid folders: listTree shows nothing else. */
export function documentFile(root: string, path: string): string {
	const file = resolveInside(root, path);
	const parent = dirname(relative(root, file));
	if (parent !== '.') assertFolderName(parent);
	const name = basename(file).slice(0, -3);
	if (!file.endsWith('.md') || !name || name.startsWith('.')) throw new InvalidPath(path);
	return file;
}

/** Writes through a temporary file, so a crash never leaves half a document; `exclusive` fails with EEXIST. */
export async function writeAtomic(file: string, text: string | Uint8Array, exclusive = false): Promise<void> {
	const tmp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
	try {
		await fs.writeFile(tmp, text, { flag: 'wx' });
		await (exclusive ? fs.link(tmp, file) : fs.rename(tmp, file));
	} finally {
		await fs.rm(tmp, { force: true });
	}
}

/** Every document's workspace-relative path, skipping dot entries and symlinks like listTree. */
export async function documentPaths(root: string, rel = ''): Promise<string[]> {
	const paths: string[] = [];
	for (const entry of await fs.readdir(join(root, rel), { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const p = rel ? `${rel}/${entry.name}` : entry.name;
		if (entry.isDirectory()) paths.push(...(await documentPaths(root, p)));
		else if (entry.isFile() && entry.name.endsWith('.md')) paths.push(p);
	}
	return paths;
}

/** Reads a document's text, or null when it is not UTF-8 (copied in by an agent): never rewrite such bytes. */
export async function readText(file: string): Promise<{ bytes: Buffer; text: string } | null> {
	const bytes = await fs.readFile(file);
	try {
		return { bytes, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
	} catch {
		return null;
	}
}

/** A document's title: its first `# ` heading, else the file name without `.md`. */
export function titleOf(body: string, fileName: string): string {
	return /^# +(.+?)\s*$/m.exec(body)?.[1] ?? fileName.slice(0, -3);
}

const under = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

/** A relative URL's path, query or fragment, and the workspace path it points to from `doc`. */
export function target(url: string, doc: string): { path: string; suffix: string; resolved: string } | null {
	if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return null;
	const cut = url.search(/[?#]/);
	const suffix = cut < 0 ? '' : url.slice(cut);
	let path: string;
	try {
		path = decodeURIComponent(cut < 0 ? url : url.slice(0, cut));
	} catch {
		return null; // a malformed escape: not a link we can follow
	}
	if (!path) return null;
	return { path, suffix, resolved: posix.join(posix.dirname(doc), path) };
}

/** A relative path as a Markdown URL: `(` `)` would end a bare destination early, `:` could read as a scheme. */
export function encodeUrlPath(rel: string): string {
	const hex = (c: string) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
	return encodeURI(rel).replace(/[?#():]/g, hex);
}

/** The URL that `url`, written in `oldDoc`, becomes in `newDoc` once `moved.from` is at `moved.to`; null when it needs no change. */
export function relocate(
	url: string,
	oldDoc: string,
	newDoc: string,
	moved: { from: string; to: string }
): string | null {
	const t = target(url, oldDoc);
	if (!t) return null;
	const resolved = under(t.resolved, moved.from)
		? moved.to + t.resolved.slice(moved.from.length)
		: t.resolved;
	// Still pointing at the same place from the new location: keep the bytes as written.
	if (posix.join(posix.dirname(newDoc), t.path) === resolved) return null;
	let rel = posix.relative(posix.dirname(newDoc), resolved) || '.';
	if (resolved.endsWith('/')) rel += '/';
	const next = encodeUrlPath(rel) + t.suffix;
	return next === url ? null : next;
}

/** The documents outside `path` holding a relative link or image that points to `path` or under it. */
export async function linksTo(slug: string, path: string, actor: Actor): Promise<string[]> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	const rel = relative(root, resolveInside(root, path));
	const found: string[] = [];
	for (const doc of await documentPaths(root)) {
		if (under(doc, rel)) continue;
		const text = (await readText(join(root, doc)))?.text;
		// Counted through rewriteUrls, so a link it cannot rewrite (escapes, entities) is not announced.
		const marked = (url: string) => {
			const t = target(url, doc);
			return t && under(t.resolved.replace(/\/$/, ''), rel) ? `${url}#` : null;
		};
		if (text && rewriteUrls(text, marked) !== text) found.push(doc);
	}
	return found;
}

export async function ensureWorkspace(slug: string): Promise<void> {
	const root = workspaceDir(slug);
	await fs.mkdir(root, { recursive: true });
	if (!(await fs.stat(join(root, '.git')).catch(() => null))) await gitInit(root);
}

export async function listTree(slug: string, actor: Actor): Promise<TreeNode[]> {
	assertRole(slug, actor, 'reader');
	return walkTree(slug);
}

// Core-internal, no role check: callers check (listTree) or hold a link's scope (publicLinks).
export async function walkTree(slug: string): Promise<TreeNode[]> {
	const root = workspaceDir(slug);
	async function walk(rel: string): Promise<TreeNode[]> {
		const entries = await fs.readdir(join(root, rel), { withFileTypes: true });
		const folders: TreeNode[] = [];
		const docs: TreeNode[] = [];
		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;
			const p = rel ? `${rel}/${entry.name}` : entry.name;
			// Dirent types come from lstat, so symlinks are neither and are skipped.
			if (entry.isDirectory()) {
				folders.push({ name: entry.name, path: p, kind: 'folder', children: await walk(p) });
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				const { body } = splitFrontmatter(await fs.readFile(join(root, p), 'utf8'));
				const title = titleOf(body, entry.name);
				const modified = (await fs.stat(join(root, p))).mtime.toISOString();
				docs.push({ name: entry.name, path: p, kind: 'doc', title, modified });
			}
		}
		const byName = (a: TreeNode, b: TreeNode) =>
			a.name.localeCompare(b.name, undefined, { numeric: true });
		return [...folders.sort(byName), ...docs.sort(byName)];
	}
	return walk('');
}

export async function readDocument(
	slug: string,
	path: string,
	actor: Actor
): Promise<{
	path: string;
	source: string;
	frontmatter: string;
	body: string;
	hash: string;
}> {
	assertRole(slug, actor, 'reader');
	return readSource(slug, path);
}

// Core-internal, no role check: callers check (readDocument) or hold a link's scope (publicLinks).
export async function readSource(
	slug: string,
	path: string
): Promise<{ path: string; source: string; frontmatter: string; body: string; hash: string }> {
	const source = await fs.readFile(documentFile(workspaceDir(slug), path), 'utf8');
	return { path, source, ...splitFrontmatter(source), hash: sha256(source) };
}

/** The editor's autosave: writes without committing; the editing session commits later. */
export async function writeDocument(
	slug: string,
	path: string,
	body: string,
	opts: { expectedHash: string; actor: Actor }
): Promise<{ hash: string }> {
	// A session's author is a human name only; agents write through importDocument.
	if (opts.actor.agent) throw new Error('writeDocument is for the editor, not agents');
	assertRole(slug, opts.actor, 'editor');
	const root = workspaceDir(slug);
	const file = documentFile(root, path);
	const rel = relative(root, file);
	return serialised(slug, async () => {
		await flushSessions(slug, (p) => p === rel, opts.actor);
		let source: string;
		try {
			source = await fs.readFile(file, 'utf8');
		} catch (err) {
			if (isMissing(err)) throw new Conflict(`${path} no longer exists`);
			throw err;
		}
		if (sha256(source) !== opts.expectedHash)
			throw new Conflict(`${path} changed since it was read`);
		const old = splitFrontmatter(source);
		const next = old.frontmatter + patchMarkdown(old.body, body);
		if (next === source) return { hash: opts.expectedHash };
		await writeAtomic(file, next);
		openSession(slug, rel, opts.actor);
		await syncIndex(slug, [rel]);
		return { hash: sha256(next) };
	});
}

/** Creates the document and returns its normalised workspace-relative path. */
export async function createDocument(slug: string, path: string, actor: Actor): Promise<string> {
	assertRole(slug, actor, 'editor');
	const root = workspaceDir(slug);
	const file = documentFile(root, path);
	const name = basename(file).slice(0, -3);
	const rel = relative(root, file);
	return serialised(slug, async () => {
		await fs.mkdir(dirname(file), { recursive: true });
		try {
			await writeAtomic(file, `# ${name}\n`, true);
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EEXIST')
				throw new Conflict(`${rel} already exists`);
			throw err;
		}
		let commit: string;
		try {
			commit = await gitCommit(root, {
				paths: [rel],
				message: `Create ${rel}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await fs.unlink(file); // or the document exists without a commit and cannot be created again
			throw err;
		}
		appendEvent(slug, actor, { type: 'create', path: rel, commit });
		await syncIndex(slug, [rel]);
		return rel;
	});
}

/**
 * Brings an uploaded Markdown file in byte for byte; replaces an existing document only with `overwrite`,
 * or with `expectedHash`, which the existing document must match.
 */
export async function importDocument(
	slug: string,
	path: string,
	bytes: Uint8Array,
	opts: { actor: Actor; overwrite?: boolean; expectedHash?: string }
): Promise<{ path: string; replaced: boolean; hash: string }> {
	assertRole(slug, opts.actor, 'editor');
	const root = workspaceDir(slug);
	const file = documentFile(root, path);
	const rel = relative(root, file);
	if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new InvalidContent('too-large');
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new InvalidContent('not-utf8');
	}
	return serialised(slug, async () => {
		// A replace overwrites the file, so even the writer's own session is committed first.
		await flushSessions(slug, (p) => p === rel, opts.overwrite ? undefined : opts.actor);
		let old: Buffer | undefined;
		try {
			old = await fs.readFile(file);
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EISDIR')
				throw new Conflict(`${rel} is a folder`);
			if (!isMissing(err) || opts.expectedHash !== undefined) throw err;
		}
		if (opts.expectedHash !== undefined) {
			if (sha256(old!) !== opts.expectedHash) throw new Conflict(`${rel} changed since it was read`);
		} else if (old && !opts.overwrite) throw new Conflict(`${rel} already exists`);
		await fs.mkdir(dirname(file), { recursive: true });
		try {
			await writeAtomic(file, bytes, !old);
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EEXIST')
				throw new Conflict(`${rel} already exists`);
			throw err;
		}
		const verb = opts.expectedHash !== undefined ? 'Update' : old ? 'Replace' : 'Import';
		let commit: string;
		try {
			commit = await gitCommit(root, {
				paths: [rel],
				message: `${verb} ${rel}`,
				author: commitAuthor(opts.actor)
			});
		} catch (err) {
			await (old ? writeAtomic(file, old) : fs.unlink(file));
			throw err;
		}
		// Identical bytes leave no commit: nothing changed, so no event.
		if (commit) appendEvent(slug, opts.actor, { type: old ? 'update' : 'create', path: rel, commit });
		await syncIndex(slug, [rel]);
		return { path: rel, replaced: !!old, hash: sha256(bytes) };
	});
}

/** Creates the folder (and missing parents) and returns its normalised path; not committed, git does not track empty folders. */
export async function createFolder(slug: string, path: string, actor: Actor): Promise<string> {
	assertRole(slug, actor, 'editor');
	assertFolderName(path);
	const root = workspaceDir(slug);
	const dir = resolveInside(root, path);
	const rel = relative(root, dir);
	return serialised(slug, async () => {
		await fs.mkdir(dirname(dir), { recursive: true });
		try {
			await fs.mkdir(dir);
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EEXIST')
				throw new Conflict(`${rel} already exists`);
			throw err;
		}
		return rel;
	});
}

/** Moves or renames a document or a folder in one commit and returns the normalised target. */
export async function movePath(slug: string, from: string, to: string, actor: Actor): Promise<string> {
	assertRole(slug, actor, 'editor');
	const root = workspaceDir(slug);
	return serialised(slug, async () => {
		const isDoc = (await fs.stat(resolveInside(root, from))).isFile();
		let src: string, dest: string;
		if (isDoc) {
			src = documentFile(root, from);
			dest = documentFile(root, to);
		} else {
			src = resolveInside(root, from);
			assertFolderName(relative(root, src));
			dest = resolveInside(root, to);
			assertFolderName(relative(root, dest));
		}
		const relFrom = relative(root, src);
		const relTo = relative(root, dest);
		if (relTo === relFrom || relTo.startsWith(`${relFrom}/`)) throw new InvalidPath(to);
		if (await fs.lstat(dest).catch(() => null)) throw new Conflict(`${relTo} already exists`);
		// Every session: the move may rewrite links in any document, and a session must not keep an old path.
		await flushSessions(slug, () => true);
		await fs.mkdir(dirname(dest), { recursive: true });
		await fs.rename(src, dest);
		// The thread file (or folder of threads) moves in the same commit.
		const notesFrom = resolveInside(root, commentPath(relFrom), { inkmesh: true });
		const notesTo = resolveInside(root, commentPath(relTo), { inkmesh: true });
		let notesMoved = false;
		// Original bytes of every rewritten document, put back if the move fails.
		const rewritten: Array<{ rel: string; bytes: Buffer }> = [];
		let commit: string;
		try {
			if (await fs.lstat(notesFrom).catch(() => null)) {
				await fs.mkdir(dirname(notesTo), { recursive: true });
				await fs.rename(notesFrom, notesTo);
				notesMoved = true;
			}
			// shortcut: parses every document on each move, fine for a few thousand; upgrade to a link index if moves get slow
			for (const rel of await documentPaths(root)) {
				const doc = await readText(join(root, rel));
				if (!doc) continue;
				const old = under(rel, relTo) ? relFrom + rel.slice(relTo.length) : rel;
				const moved = { from: relFrom, to: relTo };
				const next = rewriteUrls(doc.text, (url) => relocate(url, old, rel, moved));
				if (next === doc.text) continue;
				rewritten.push({ rel, bytes: doc.bytes });
				await writeAtomic(join(root, rel), next);
			}
			commit = await gitCommit(root, {
				paths: [relFrom, relTo, commentPath(relFrom), commentPath(relTo), ...rewritten.map((r) => r.rel)],
				message: `Move ${relFrom} to ${relTo}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			// Best effort per step: the commit error is what the caller must see.
			const report = (what: string) => (e: unknown) => console.error(`move rollback: ${what}`, e);
			for (const { rel, bytes } of rewritten)
				await writeAtomic(join(root, rel), bytes).catch(report(`restore ${rel}`));
			await fs.rename(dest, src).catch(report(`rename ${relTo} back`));
			if (notesMoved) await fs.rename(notesTo, notesFrom).catch(report(`rename comments of ${relTo} back`));
			throw err;
		}
		// Prefix comparison, not LIKE: `_` and `%` are legal in names.
		db()
			.prepare(
				`UPDATE public_links SET path = ? || substr(path, length(?) + 1)
				 WHERE workspace = ? AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/')`
			)
			.run(relTo, relFrom, slug, relFrom, relFrom, relFrom);
		// Also for an empty folder, whose move git does not see: commit is ''.
		appendEvent(slug, actor, { type: 'move', path: relTo, from: relFrom, commit });
		await syncIndex(slug, [relFrom, relTo, ...rewritten.map((r) => r.rel)]);
		return relTo;
	});
}

export async function deletePath(slug: string, path: string, actor: Actor): Promise<void> {
	assertRole(slug, actor, 'editor');
	const root = workspaceDir(slug);
	return serialised(slug, async () => {
		const isDoc = (await fs.stat(resolveInside(root, path))).isFile();
		let target: string;
		if (isDoc) {
			target = documentFile(root, path);
		} else {
			target = resolveInside(root, path);
			assertFolderName(relative(root, target));
		}
		const rel = relative(root, target);
		await flushSessions(slug, (p) => under(p, rel));
		// Renamed aside rather than removed, so a failed commit can put it back intact.
		const trash = join(root, '.inkmesh', `trash-${randomBytes(6).toString('hex')}`);
		await fs.mkdir(dirname(trash), { recursive: true });
		await fs.rename(target, trash);
		const notes = resolveInside(root, commentPath(rel), { inkmesh: true });
		let notesMoved = false;
		let commit: string;
		try {
			if (await fs.lstat(notes).catch(() => null)) {
				await fs.rename(notes, `${trash}-comments`);
				notesMoved = true;
			}
			commit = await gitCommit(root, {
				paths: [rel, commentPath(rel)],
				message: `Delete ${rel}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await fs.rename(trash, target).catch((e) => console.error(`delete rollback: rename ${rel} back`, e));
			if (notesMoved)
				await fs
					.rename(`${trash}-comments`, notes)
					.catch((e) => console.error(`delete rollback: rename comments of ${rel} back`, e));
			throw err;
		}
		appendEvent(slug, actor, { type: 'delete', path: rel, commit });
		await syncIndex(slug, [rel]);
		// The commit holds the delete; a leftover trash entry is hidden and harmless.
		for (const entry of [trash, `${trash}-comments`])
			await fs
				.rm(entry, { recursive: true, force: true })
				.catch((e) => console.error(`delete: remove ${entry}`, e));
	});
}

/** A commit author as `name`, plus `agent` when an agent acted (`<name> via <agent>`, see commitAuthor). */
function splitAuthor(author: string): { name: string; agent?: string } {
	const at = author.indexOf(' via ');
	return at < 0 ? { name: author } : { name: author.slice(0, at), agent: author.slice(at + 5) };
}

export async function history(slug: string, path: string, actor: Actor): Promise<HistoryEntry[]> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	resolveInside(root, path);
	return (await gitLog(root, path, 20)).map(({ name, ...entry }) => ({ ...entry, ...splitAuthor(name) }));
}

/** The document's bytes at `commit`, a hex id (abbreviated or full); anything else is InvalidPath. */
async function versionBytes(root: string, rel: string, commit: string): Promise<Buffer> {
	if (!COMMIT.test(commit)) throw new InvalidPath(commit);
	const bytes = await gitShow(root, commit, rel);
	if (!bytes) throw notFound(`${rel} at ${commit}`);
	return bytes;
}

export async function readVersion(
	slug: string,
	path: string,
	commit: string,
	actor: Actor
): Promise<{ path: string; source: string; commit: string }> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	const rel = relative(root, documentFile(root, path));
	const source = (await versionBytes(root, rel, commit)).toString('utf8');
	return { path: rel, source, commit };
}

/** Writes the document as it was at `commit`, as a new commit; `commit: ''` when that is the current text. */
export async function restoreVersion(
	slug: string,
	path: string,
	commit: string,
	actor: Actor
): Promise<{ commit: string }> {
	assertRole(slug, actor, 'editor');
	if (!COMMIT.test(commit)) throw new InvalidPath(commit);
	const root = workspaceDir(slug);
	const file = documentFile(root, path);
	const rel = relative(root, file);
	return serialised(slug, async () => {
		// The restore overwrites the file, so every open session, the restorer's too, is committed first.
		await flushSessions(slug, (p) => p === rel);
		const bytes = await versionBytes(root, rel, commit);
		const current = await fs.readFile(file);
		if (current.equals(bytes)) return { commit: '' };
		await writeAtomic(file, bytes);
		let restored: string;
		try {
			restored = await gitCommit(root, {
				paths: [rel],
				message: `Restore ${rel} to ${commit.slice(0, 7)}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await writeAtomic(file, current);
			throw err;
		}
		if (restored) appendEvent(slug, actor, { type: 'update', path: rel, commit: restored });
		await syncIndex(slug, [rel]);
		return { commit: restored };
	});
}

/** Documents deleted in the latest 200 delete commits that do not exist now, newest first. */
export async function deletedDocuments(slug: string, actor: Actor): Promise<DeletedDocument[]> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	const seen = new Set<string>();
	const list: DeletedDocument[] = [];
	for (const { commit, name, date, paths } of await gitDeletions(root, 200)) {
		for (const path of paths) {
			if (!path.endsWith('.md') || path.startsWith('.inkmesh/') || seen.has(path)) continue;
			seen.add(path);
			if (await fs.lstat(join(root, path)).catch(() => null)) continue;
			list.push({ path, commit, ...splitAuthor(name), date });
		}
	}
	return list;
}

/** Brings a deleted document back, with its comment thread, from the commit before its deletion. */
export async function restoreDeleted(slug: string, path: string, actor: Actor): Promise<{ commit: string }> {
	assertRole(slug, actor, 'editor');
	const root = workspaceDir(slug);
	const file = documentFile(root, path);
	const rel = relative(root, file);
	const notesRel = commentPath(rel);
	const notesFile = resolveInside(root, notesRel, { inkmesh: true });
	return serialised(slug, async () => {
		if (await fs.lstat(file).catch(() => null)) throw new Conflict(`${rel} already exists`);
		const deletion = (await gitDeletions(root, 200)).find((d) => d.paths.includes(rel));
		if (!deletion) throw notFound(`deleted ${rel}`);
		const bytes = await gitShow(root, `${deletion.commit}^`, rel);
		if (!bytes) throw notFound(`deleted ${rel}`);
		const notes = await gitShow(root, `${deletion.commit}^`, notesRel);
		// A thread already there (written outside core) is kept rather than overwritten.
		const writeNotes = notes && !(await fs.lstat(notesFile).catch(() => null));
		let commit: string;
		try {
			await fs.mkdir(dirname(file), { recursive: true });
			await writeAtomic(file, bytes, true);
			if (writeNotes) {
				await fs.mkdir(dirname(notesFile), { recursive: true });
				await writeAtomic(notesFile, notes);
			}
			commit = await gitCommit(root, {
				paths: [rel, notesRel],
				message: `Restore ${rel}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			const report = (what: string) => (e: unknown) => console.error(`restore rollback: ${what}`, e);
			await fs.rm(file, { force: true }).catch(report(`remove ${rel}`));
			if (writeNotes) await fs.rm(notesFile, { force: true }).catch(report(`remove comments of ${rel}`));
			throw err;
		}
		appendEvent(slug, actor, { type: 'create', path: rel, commit });
		await syncIndex(slug, [rel]);
		return { commit };
	});
}
