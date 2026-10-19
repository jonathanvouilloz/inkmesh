import { assertRole } from './access.ts';
import type { Actor } from './actor.ts';
import { db } from './db.ts';

export type EventType = 'create' | 'update' | 'move' | 'delete';
export type WorkspaceEvent = {
	id: number;
	type: EventType;
	path: string;
	from?: string;
	author: string;
	agent?: string;
	commit?: string;
	at: string;
};

const LATEST = 50;
const PAGE = 200;

// No role check: core calls this after its own.
export function appendEvent(
	slug: string,
	actor: Actor,
	e: { type: EventType; path: string; from?: string; commit?: string }
): void {
	db()
		.prepare(
			'INSERT INTO events (workspace, user_id, author, agent, type, path, from_path, commit_hash, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run(
			slug,
			actor.id,
			actor.name,
			actor.agent ?? null,
			e.type,
			e.path,
			e.from ?? null,
			e.commit || null, // '' (no commit) is stored as null
			new Date().toISOString()
		);
}

type Row = {
	id: number;
	type: EventType;
	path: string;
	from_path: string | null;
	author: string;
	agent: string | null;
	commit_hash: string | null;
	at: string;
};

export function changes(
	slug: string,
	actor: Actor,
	since?: number
): { events: WorkspaceEvent[]; cursor: number; more: boolean } {
	if (since !== undefined && !(Number.isInteger(since) && since >= 0)) throw new RangeError('bad cursor');
	assertRole(slug, actor, 'reader');
	// IS, not =, so events of a deleted user (user_id null) are not filtered out.
	const mine = 'workspace = ? AND NOT (user_id IS ? AND agent IS ?)';
	const args = [slug, actor.id, actor.agent ?? null];
	const columns = 'id, type, path, from_path, author, agent, commit_hash, at';
	let rows: Row[];
	let more = false;
	if (since === undefined) {
		rows = (
			db()
				.prepare(`SELECT ${columns} FROM events WHERE ${mine} ORDER BY id DESC LIMIT ${LATEST}`)
				.all(...args) as Row[]
		).reverse();
	} else {
		rows = db()
			.prepare(`SELECT ${columns} FROM events WHERE ${mine} AND id > ? ORDER BY id LIMIT ${PAGE + 1}`)
			.all(...args, since) as Row[];
		more = rows.length > PAGE;
		rows = rows.slice(0, PAGE);
	}
	const last = rows.at(-1)?.id;
	const cursor =
		last ??
		(db().prepare('SELECT max(id) AS id FROM events WHERE workspace = ?').get(slug) as { id: number | null }).id ??
		0;
	return {
		events: rows.map((r) => ({
			id: r.id,
			type: r.type,
			path: r.path,
			...(r.from_path !== null && { from: r.from_path }),
			author: r.author,
			...(r.agent !== null && { agent: r.agent }),
			...(r.commit_hash !== null && { commit: r.commit_hash }),
			at: r.at
		})),
		cursor,
		more
	};
}
