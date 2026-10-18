import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir } from './data.ts';

// Forward-only: append new entries, never edit an applied one.
export const MIGRATIONS: readonly { id: string; sql: string }[] = [
	{
		id: '001-accounts',
		sql: `
CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE workspaces (slug TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE memberships (workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','reader')), PRIMARY KEY (workspace, user_id));
CREATE TABLE invitations (token_hash TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','reader')),
  created_by INTEGER NOT NULL REFERENCES users, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  used_by INTEGER REFERENCES users, used_at TEXT);
`
	}
];

const handles = new Map<string, DatabaseSync>();

export function db(): DatabaseSync {
	const file = path.join(dataDir(), 'inkmesh.db');
	let handle = handles.get(file);
	if (handle) return handle;
	fs.mkdirSync(dataDir(), { recursive: true });
	handle = new DatabaseSync(file);
	try {
		handle.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
		handle.exec('CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
		const applied = handle.prepare('SELECT 1 FROM migrations WHERE id = ?');
		for (const m of MIGRATIONS) {
			// IMMEDIATE takes the write lock first, so another process (init hook, CLI) cannot apply it twice.
			handle.exec('BEGIN IMMEDIATE');
			try {
				if (!applied.get(m.id)) {
					handle.exec(m.sql);
					handle
						.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)')
						.run(m.id, new Date().toISOString());
				}
				handle.exec('COMMIT');
			} catch (err) {
				handle.exec('ROLLBACK');
				throw err;
			}
		}
	} catch (err) {
		handle.close();
		throw err;
	}
	handles.set(file, handle);
	return handle;
}

// IMMEDIATE takes the write lock first, so a check and the write that depends on it cannot interleave.
export function transaction<T>(fn: () => T): T {
	db().exec('BEGIN IMMEDIATE');
	try {
		const result = fn();
		db().exec('COMMIT');
		return result;
	} catch (err) {
		db().exec('ROLLBACK');
		throw err;
	}
}

export function closeDb(): void {
	try {
		for (const handle of handles.values()) handle.close();
	} finally {
		handles.clear();
	}
}
