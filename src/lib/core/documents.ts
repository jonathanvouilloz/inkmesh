import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { assertRole } from './access.ts';
import { commitAuthor, type Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { gitCommit, gitInit, gitLog } from './git.ts';
import { patchMarkdown, splitFrontmatter } from './markdown.ts';
import {
	assertFolderName,
	Conflict,
	InvalidContent,
	InvalidPath,
	resolveInside
} from './paths.ts';

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

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

const sha256 = (source: string) => createHash('sha256').update(source).digest('hex');
const isMissing = (err: unknown) => (err as { code?: unknown }).code === 'ENOENT';

// One write at a time per workspace, so the hash check and the write (and git's index) never interleave.
// shortcut: in-process lock only, assumes a single server process; upgrade to a file lock if we ever run several
const locks = new Map<string, Promise<unknown>>();
function serialised<T>(slug: string, fn: () => Promise<T>): Promise<T> {
	const next = (locks.get(slug) ?? Promise.resolve()).then(fn, fn);
	locks.set(
		slug,
		next.catch(() => {})
	);
	return next;
}

/** A document is a .md file whose name is not a dot-file, inside valid folders: listTree shows nothing else. */
function documentFile(root: string, path: string): string {
	const file = resolveInside(root, path);
	const parent = dirname(relative(root, file));
	if (parent !== '.') assertFolderName(parent);
	const name = basename(file).slice(0, -3);
	if (!file.endsWith('.md') || !name || name.startsWith('.')) throw new InvalidPath(path);
	return file;
}

/** Writes through a temporary file, so a crash never leaves half a document; `exclusive` fails with EEXIST. */
async function writeAtomic(file: string, text: string | Uint8Array, exclusive = false): Promise<void> {
	const tmp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
	try {
		await fs.writeFile(tmp, text, { flag: 'wx' });
		await (exclusive ? fs.link(tmp, file) : fs.rename(tmp, file));
	} finally {
		await fs.rm(tmp, { force: true });
	}
}

export async function ensureWorkspace(slug: string): Promise<void> {
	const root = workspaceDir(slug);
	await fs.mkdir(root, { recursive: true });
	if (!(await fs.stat(join(root, '.git')).catch(() => null))) await gitInit(root);
}

export async function listTree(slug: string, actor: Actor): Promise<TreeNode[]> {
	assertRole(slug, actor, 'reader');
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
				const title = /^# +(.+?)\s*$/m.exec(body)?.[1] ?? entry.name.slice(0, -3);
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
	const source = await fs.readFile(documentFile(workspaceDir(slug), path), 'utf8');
	return { path, source, ...splitFrontmatter(source), hash: sha256(source) };
}

// shortcut: one commit per autosave; commit-per-editing-session (PRD item 5) lands with sessions in milestone 2
export async function writeDocument(
	slug: string,
	path: string,
	body: string,
	opts: { expectedHash: string; actor: Actor }
): Promise<{ hash: string; commit: string }> {
	assertRole(slug, opts.actor, 'editor');
	const root = workspaceDir(slug);
	const file = documentFile(root, path);
	return serialised(slug, async () => {
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
		if (next === source) return { hash: opts.expectedHash, commit: '' };
		await writeAtomic(file, next);
		let commit: string;
		try {
			commit = await gitCommit(root, {
				paths: [path],
				message: `Update ${path}`,
				author: commitAuthor(opts.actor)
			});
		} catch (err) {
			await writeAtomic(file, source); // or the next save sees a changed hash: a false conflict
			throw err;
		}
		return { hash: sha256(next), commit };
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
		try {
			await gitCommit(root, {
				paths: [rel],
				message: `Create ${rel}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await fs.unlink(file); // or the document exists without a commit and cannot be created again
			throw err;
		}
		return rel;
	});
}

/** Brings an uploaded Markdown file in byte for byte; replaces an existing document only with `overwrite`. */
export async function importDocument(
	slug: string,
	path: string,
	bytes: Uint8Array,
	opts: { actor: Actor; overwrite?: boolean }
): Promise<{ path: string; replaced: boolean }> {
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
		let old: Buffer | undefined;
		try {
			old = await fs.readFile(file);
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EISDIR')
				throw new Conflict(`${rel} is a folder`);
			if (!isMissing(err)) throw err;
		}
		if (old && !opts.overwrite) throw new Conflict(`${rel} already exists`);
		await fs.mkdir(dirname(file), { recursive: true });
		try {
			await writeAtomic(file, bytes, !old);
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EEXIST')
				throw new Conflict(`${rel} already exists`);
			throw err;
		}
		try {
			await gitCommit(root, {
				paths: [rel],
				message: `${old ? 'Replace' : 'Import'} ${rel}`,
				author: commitAuthor(opts.actor)
			});
		} catch (err) {
			await (old ? writeAtomic(file, old) : fs.unlink(file));
			throw err;
		}
		return { path: rel, replaced: !!old };
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
		await fs.mkdir(dirname(dest), { recursive: true });
		await fs.rename(src, dest);
		try {
			await gitCommit(root, {
				paths: [relFrom, relTo],
				message: `Move ${relFrom} to ${relTo}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await fs.rename(dest, src);
			throw err;
		}
		return relTo;
	});
}

export async function history(slug: string, path: string, actor: Actor): Promise<HistoryEntry[]> {
	assertRole(slug, actor, 'reader');
	const root = workspaceDir(slug);
	resolveInside(root, path);
	return (await gitLog(root, path, 20)).map(({ name, ...entry }) => {
		const at = name.indexOf(' via ');
		return at < 0
			? { ...entry, name }
			: { ...entry, name: name.slice(0, at), agent: name.slice(at + 5) };
	});
}
