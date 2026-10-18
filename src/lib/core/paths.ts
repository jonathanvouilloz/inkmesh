import fs from 'node:fs';
import path from 'node:path';

export class InvalidPath extends Error {}
export class Conflict extends Error {}

const HIDDEN = new Set(['.git', '.inkmesh']);

/** Resolve `rel` inside `root`, or throw InvalidPath if it could reach outside or into hidden folders. */
export function resolveInside(root: string, rel: string): string {
	if (!rel || path.isAbsolute(rel) || rel.split(/[/\\]/).includes('..')) throw new InvalidPath(rel);
	const abs = path.resolve(root, rel);
	const inner = path.relative(root, abs);
	if (!inner || HIDDEN.has(inner.split(path.sep)[0])) throw new InvalidPath(rel);

	// Symlinks: the nearest existing ancestor must really live inside the root.
	let existing = abs;
	while (!fs.existsSync(existing)) existing = path.dirname(existing);
	const realRoot = fs.realpathSync(root);
	const real = fs.realpathSync(existing);
	if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new InvalidPath(rel);
	return abs;
}
