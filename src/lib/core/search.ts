import fs from 'node:fs/promises';
import { basename, join } from 'node:path';
import { assertRole } from './access.ts';
import type { Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { db, transaction } from './db.ts';
import { documentPaths, readText, titleOf } from './documents.ts';
import { splitFrontmatter } from './markdown.ts';

export type SearchHit = { path: string; title: string; snippet: string };

const MAX_TERMS = 10;
const MAX_RESULTS = 20;

/** Every term quoted and made a prefix, so no FTS5 syntax gets through; null when nothing is left. */
export function ftsQuery(text: string): string | null {
	const terms = text
		.split(/\s+/)
		.map((t) => t.replaceAll('"', ''))
		.filter(Boolean) // an empty `""*` is an FTS5 error
		.slice(0, MAX_TERMS);
	return terms.length ? terms.map((t) => `"${t}"*`).join(' ') : null;
}

/** The documents at `paths` (files) under `root` as index rows; non-UTF-8 files are skipped. */
async function rows(root: string, paths: string[]) {
	const found: Array<{ path: string; title: string; body: string }> = [];
	for (const path of paths) {
		const text = (await readText(join(root, path)))?.text;
		if (text !== undefined)
			found.push({ path, title: titleOf(splitFrontmatter(text).body, basename(path)), body: text });
	}
	return found;
}

function insert(slug: string, docs: Awaited<ReturnType<typeof rows>>): void {
	const stmt = db().prepare('INSERT INTO search_index (workspace, path, title, body) VALUES (?, ?, ?, ?)');
	for (const d of docs) stmt.run(slug, d.path, d.title, d.body);
}

/** Reindexes each path: a document, every document of a folder, or nothing once it is gone. Never throws. */
export async function syncIndex(slug: string, paths: string[]): Promise<void> {
	const root = workspaceDir(slug);
	for (const path of paths) {
		try {
			const stat = await fs.lstat(join(root, path)).catch(() => null);
			const files = stat?.isDirectory()
				? await documentPaths(root, path)
				: stat?.isFile() && path.endsWith('.md')
					? [path]
					: [];
			const docs = await rows(root, files);
			transaction(() => {
				// Prefix comparison, not LIKE: `_` and `%` are legal in names.
				db()
					.prepare(
						`DELETE FROM search_index WHERE workspace = ?
						 AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/')`
					)
					.run(slug, path, path, path);
				insert(slug, docs);
			});
		} catch (err) {
			console.error(`search index: ${slug}/${path} not updated`, err);
		}
	}
}

/** Indexes every document of every workspace from disk, for files changed outside core; returns the count. */
export async function rebuildIndex(): Promise<number> {
	try {
		db().exec('DELETE FROM search_index');
	} catch (err) {
		console.error('search index: not rebuilt', err); // a cache fault must not stop the server from starting
		return 0;
	}
	let count = 0;
	const slugs = db().prepare('SELECT slug FROM workspaces').all() as Array<{ slug: string }>;
	for (const { slug } of slugs) {
		const root = workspaceDir(slug);
		if (!(await fs.stat(root).catch(() => null))?.isDirectory()) continue;
		try {
			const docs = await rows(root, await documentPaths(root));
			transaction(() => insert(slug, docs));
			count += docs.length;
		} catch (err) {
			console.error(`search index: ${slug} not rebuilt`, err);
		}
	}
	return count;
}

export function search(slug: string, query: string, actor: Actor): SearchHit[] {
	assertRole(slug, actor, 'reader');
	const match = ftsQuery(query);
	if (!match) return [];
	return db()
		.prepare(
			`SELECT path, title, snippet(search_index, 3, char(2), char(3), '…', 12) AS snippet
			 FROM search_index WHERE search_index MATCH ? AND workspace = ? ORDER BY rank LIMIT ${MAX_RESULTS}`
		)
		.all(match, slug)
		.map((r) => ({ ...r }) as SearchHit);
}
