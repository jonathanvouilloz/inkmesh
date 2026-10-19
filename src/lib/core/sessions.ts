import { commitAuthor, type Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { db } from './db.ts';
import { appendEvent } from './events.ts';
import { gitCommit } from './git.ts';
import { serialised } from './lock.ts';

export const IDLE_MS = 60_000;

type Row = { path: string; user_id: number; author: string };

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const key = (slug: string, path: string) => `${slug}\0${path}`;

/** Called inside the workspace lock after an editor write: the session lives in SQLite, its idle timer in memory. */
export function openSession(slug: string, path: string, actor: Actor): void {
	db()
		.prepare(
			`INSERT INTO editing_sessions (workspace, path, user_id, author, updated_at) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (workspace, path) DO UPDATE SET user_id = excluded.user_id, author = excluded.author, updated_at = excluded.updated_at`
		)
		.run(slug, path, actor.id, actor.name, new Date().toISOString());
	const k = key(slug, path);
	clearTimeout(timers.get(k));
	const timer = setTimeout(() => {
		// A save queued ahead of this callback may have re-armed the timer: then the session is not idle.
		serialised(slug, async () => {
			if (timers.get(k) === timer) await commitSession(slug, path);
		}).catch((err) =>
			console.error(`session ${slug}/${path}: idle commit failed`, err)
		);
	}, IDLE_MS);
	timer.unref();
	timers.set(k, timer);
}

/** Must run inside the workspace lock; returns the commit hash, '' when there was nothing to commit. */
async function commitSession(slug: string, path: string): Promise<string> {
	const row = db()
		.prepare('SELECT path, user_id, author FROM editing_sessions WHERE workspace = ? AND path = ?')
		.get(slug, path) as Row | undefined;
	if (!row) return '';
	const author = { id: row.user_id, name: row.author };
	// A failure throws before the row is deleted, so the session is retried at the next flush or start.
	const commit = await gitCommit(workspaceDir(slug), {
		paths: [path],
		message: `Update ${path}`,
		author: commitAuthor(author)
	});
	db().prepare('DELETE FROM editing_sessions WHERE workspace = ? AND path = ?').run(slug, path);
	clearTimeout(timers.get(key(slug, path)));
	timers.delete(key(slug, path));
	if (commit) appendEvent(slug, author, { type: 'update', path, commit });
	return commit;
}

/** Called inside the workspace lock: commits the matching sessions, except the writer's own when a human continues it. */
export async function flushSessions(
	slug: string,
	match: (path: string) => boolean,
	writer?: Actor
): Promise<void> {
	const rows = db()
		.prepare('SELECT path, user_id, author FROM editing_sessions WHERE workspace = ?')
		.all(slug) as Row[];
	for (const row of rows) {
		if (!match(row.path)) continue;
		if (writer && !writer.agent && row.user_id === writer.id) continue;
		await commitSession(slug, row.path);
	}
}

/** The editor leaves the document: commits the session when it is the caller's. */
export async function endSession(slug: string, path: string, actor: Actor): Promise<void> {
	await serialised(slug, async () => {
		const owner = db()
			.prepare('SELECT user_id FROM editing_sessions WHERE workspace = ? AND path = ?')
			.get(slug, path) as { user_id: number } | undefined;
		if (owner?.user_id === actor.id) await commitSession(slug, path);
	});
}

/** For tests: no timer may fire against a data folder already removed. */
export function clearSessionTimers(): void {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
}

/** Commits every open session (at start and at shutdown); a failure is logged and the session kept. */
export async function commitAllSessions(): Promise<number> {
	const rows = db().prepare('SELECT workspace, path FROM editing_sessions').all() as Array<{
		workspace: string;
		path: string;
	}>;
	let made = 0;
	for (const { workspace, path } of rows) {
		try {
			if (await serialised(workspace, () => commitSession(workspace, path))) made++;
		} catch (err) {
			console.error(`session ${workspace}/${path}: commit failed`, err);
		}
	}
	return made;
}
