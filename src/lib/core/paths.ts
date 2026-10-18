import fs from 'node:fs';
import path from 'node:path';

export class InvalidPath extends Error {}
export class Conflict extends Error {}

const HIDDEN = new Set(['.git', '.inkmesh']);

/** Resolve `rel` inside `root`, or throw InvalidPath if it could reach outside or into hidden folders. */
export function resolveInside(root: string, rel: string): string {
	const segments = rel.split(/[/\\]/);
	if (
		!rel ||
		rel.includes('\0') ||
		path.isAbsolute(rel) ||
		segments.some((s) => s === '..' || HIDDEN.has(s))
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
