import fs from 'node:fs';
import path from 'node:path';

export class InvalidPath extends Error {}
export class Conflict extends Error {}
/** An imported file that is not a document: `message` is 'too-large' or 'not-utf8'. */
export class InvalidContent extends Error {}
/** Core's "not found": routes answer 404 for an ENOENT code. */
export const notFound = (what: string) => Object.assign(new Error(`${what} not found`), { code: 'ENOENT' });

const HIDDEN = new Set(['.git', '.inkmesh']);

/**
 * Resolve `rel` inside `root`, or throw InvalidPath if it could reach outside or into hidden folders;
 * `inkmesh` allows `.inkmesh` as the first segment only (comment threads, trash).
 */
export function resolveInside(root: string, rel: string, opts?: { inkmesh?: boolean }): string {
	const segments = rel.split(/[/\\]/);
	if (
		!rel ||
		rel.includes('\0') ||
		path.isAbsolute(rel) ||
		segments.some((s, i) => s === '..' || (HIDDEN.has(s) && !(opts?.inkmesh && i === 0 && s === '.inkmesh')))
	)
		throw new InvalidPath(rel);
	const abs = path.resolve(root, rel);
	if (abs === path.resolve(root)) throw new InvalidPath(rel);

	// Symlinks: the nearest existing entry (lstat, so dangling links count) must sit at its own path
	// under the real root, so no link anywhere on the way, even one that stays inside (cfg.md -> .git/config).
	let existing = abs;
	try {
		while (!fs.lstatSync(existing, { throwIfNoEntry: false })) existing = path.dirname(existing);
	} catch {
		throw new InvalidPath(rel); // ENOTDIR (a file used as a folder), ENAMETOOLONG
	}
	let real: string;
	try {
		real = fs.realpathSync(existing);
	} catch {
		throw new InvalidPath(rel); // dangling or looping link
	}
	if (real !== path.join(fs.realpathSync(root), path.relative(root, existing)))
		throw new InvalidPath(rel);
	return abs;
}

/** No folder segment ends in .md or an image extension or starts with a dot, so such a path is never a folder. */
export function assertFolderName(rel: string): void {
	if (rel.split(/[/\\]/).some((s) => s.startsWith('.') || /\.(md|png|jpe?g|gif|webp)$/i.test(s)))
		throw new InvalidPath(rel);
}
