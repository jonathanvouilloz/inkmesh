import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { commitAuthor, type Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { gitCommit, gitInit, gitLog } from './git.ts';
import { patchMarkdown, splitFrontmatter } from './markdown.ts';
import { Conflict, resolveInside } from './paths.ts';

export type TreeNode = {
	name: string;
	path: string;
	kind: 'folder' | 'doc';
	title?: string;
	children?: TreeNode[];
};
export type HistoryEntry = {
	hash: string;
	name: string;
	agent?: string;
	date: string;
	message: string;
};

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

export async function ensureWorkspace(slug: string): Promise<void> {
	const root = workspaceDir(slug);
	await fs.mkdir(root, { recursive: true });
	if (!(await fs.stat(join(root, '.git')).catch(() => null))) await gitInit(root);
}

export async function listTree(slug: string): Promise<TreeNode[]> {
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
				const children = await walk(p);
				if (children.length) folders.push({ name: entry.name, path: p, kind: 'folder', children });
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				const { body } = splitFrontmatter(await fs.readFile(join(root, p), 'utf8'));
				const title = /^# +(.+?)\s*$/m.exec(body)?.[1] ?? entry.name.slice(0, -3);
				docs.push({ name: entry.name, path: p, kind: 'doc', title });
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
	path: string
): Promise<{
	path: string;
	source: string;
	frontmatter: string;
	body: string;
	hash: string;
}> {
	const source = await fs.readFile(resolveInside(workspaceDir(slug), path), 'utf8');
	return { path, source, ...splitFrontmatter(source), hash: sha256(source) };
}

// shortcut: one commit per autosave; commit-per-editing-session (PRD item 5) lands with sessions in milestone 2
export function writeDocument(
	slug: string,
	path: string,
	body: string,
	opts: { expectedHash: string; actor: Actor }
): Promise<{ hash: string; commit: string }> {
	const root = workspaceDir(slug);
	const file = resolveInside(root, path);
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
		await fs.writeFile(file, next);
		const commit = await gitCommit(root, {
			paths: [path],
			message: `Update ${path}`,
			author: commitAuthor(opts.actor)
		});
		return { hash: sha256(next), commit };
	});
}

export function createDocument(slug: string, path: string, actor: Actor): Promise<void> {
	const root = workspaceDir(slug);
	const file = resolveInside(root, path);
	return serialised(slug, async () => {
		await fs.mkdir(dirname(file), { recursive: true });
		try {
			await fs.writeFile(file, `# ${basename(file, extname(file))}\n`, {
				flag: 'wx'
			});
		} catch (err) {
			if ((err as { code?: unknown }).code === 'EEXIST')
				throw new Conflict(`${path} already exists`);
			throw err;
		}
		await gitCommit(root, {
			paths: [path],
			message: `Create ${path}`,
			author: commitAuthor(actor)
		});
	});
}

export async function history(slug: string, path: string): Promise<HistoryEntry[]> {
	const root = workspaceDir(slug);
	resolveInside(root, path);
	return (await gitLog(root, path, 20)).map(({ name, ...entry }) => {
		const at = name.indexOf(' via ');
		return at < 0
			? { ...entry, name }
			: { ...entry, name: name.slice(0, at), agent: name.slice(at + 5) };
	});
}
