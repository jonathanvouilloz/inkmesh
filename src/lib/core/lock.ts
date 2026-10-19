// One write at a time per workspace, so the hash check and the write (and git's index) never interleave.
// shortcut: in-process lock only, assumes a single server process; upgrade to a file lock if we ever run several
const locks = new Map<string, Promise<unknown>>();
export function serialised<T>(slug: string, fn: () => Promise<T>): Promise<T> {
	const next = (locks.get(slug) ?? Promise.resolve()).then(fn, fn);
	locks.set(
		slug,
		next.catch(() => {})
	);
	return next;
}
