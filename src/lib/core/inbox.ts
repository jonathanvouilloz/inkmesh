import { db } from './db.ts';
import { eventFromRow, type WorkspaceEvent } from './events.ts';

export type InboxItem = WorkspaceEvent & {
	workspace: string;
	workspaceName: string;
	unread: boolean;
};

// A new cursor starts at the present: older events are listed but not unread.
const START = 'INSERT OR IGNORE INTO inbox_cursors VALUES (?, (SELECT coalesce(max(id), 0) FROM events))';
// IS, not =, so events of a deleted user (user_id null) stay visible; my agents' events count as others'.
const MINE = `FROM events e JOIN memberships m ON m.workspace = e.workspace AND m.user_id = ?
	JOIN workspaces w ON w.slug = e.workspace WHERE NOT (e.user_id IS ? AND e.agent IS NULL)`;
const LAST_READ = '(SELECT last_read FROM inbox_cursors WHERE user_id = ?)';

export function inbox(userId: number, limit = 50): InboxItem[] {
	db().prepare(START).run(userId);
	const rows = db()
		.prepare(`SELECT e.*, w.name AS workspace_name, e.id > ${LAST_READ} AS unread ${MINE} ORDER BY e.id DESC LIMIT ?`)
		.all(userId, userId, userId, limit) as Record<string, unknown>[];
	return rows.map((r) => ({
		...eventFromRow(r),
		workspace: r.workspace as string,
		workspaceName: r.workspace_name as string,
		unread: r.unread === 1
	}));
}

export function unreadCount(userId: number): number {
	db().prepare(START).run(userId);
	const row = db()
		.prepare(`SELECT count(*) AS n FROM (SELECT 1 ${MINE} AND e.id > ${LAST_READ} LIMIT 100)`)
		.get(userId, userId, userId) as { n: number };
	return row.n;
}

export function markRead(userId: number, upTo: number): void {
	db().prepare(START).run(userId);
	db()
		.prepare(
			'UPDATE inbox_cursors SET last_read = max(last_read, min(?, (SELECT coalesce(max(id), 0) FROM events))) WHERE user_id = ?'
		)
		.run(upTo, userId);
}
