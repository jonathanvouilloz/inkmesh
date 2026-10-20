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
	},
	{
		id: '002-agents',
		sql: `
CREATE TABLE oauth_clients (client_id TEXT PRIMARY KEY, name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL /* JSON array */, created_at TEXT NOT NULL);
CREATE TABLE agents (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  name TEXT NOT NULL, oauth_client_id TEXT REFERENCES oauth_clients ON DELETE SET NULL,
  created_at TEXT NOT NULL, last_used_at TEXT);
CREATE TABLE agent_tokens (token_hash TEXT PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bearer','access','refresh')), resource TEXT,
  expires_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE oauth_codes (code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents ON DELETE CASCADE, redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL, resource TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id INTEGER REFERENCES users ON DELETE SET NULL, author TEXT NOT NULL, agent TEXT,
  type TEXT NOT NULL CHECK (type IN ('create','update','move','delete')),
  path TEXT NOT NULL, from_path TEXT, commit_hash TEXT, at TEXT NOT NULL);
CREATE INDEX events_workspace ON events (workspace, id);
CREATE TABLE editing_sessions (workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE, path TEXT NOT NULL,
  user_id INTEGER NOT NULL, author TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (workspace, path));
`
		},
	{
		id: '003-collaboration',
		sql: `
-- The M4 CHECK on events.type cannot be altered: rebuild, keeping ids and the AUTOINCREMENT sequence.
CREATE TABLE events_new (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id INTEGER REFERENCES users ON DELETE SET NULL, author TEXT NOT NULL, agent TEXT,
  type TEXT NOT NULL CHECK (type IN ('create','update','move','delete','comment','join')),
  path TEXT NOT NULL, from_path TEXT, commit_hash TEXT, at TEXT NOT NULL);
INSERT INTO events_new SELECT * FROM events;
-- sqlite_sequence has no unique key, so INSERT OR REPLACE would add a second row: delete, then insert.
DELETE FROM sqlite_sequence WHERE name = 'events_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'events_new', seq FROM sqlite_sequence WHERE name = 'events';
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;
CREATE INDEX events_workspace ON events (workspace, id);

CREATE TABLE public_links (id INTEGER PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL,
  workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  path TEXT /* null = whole workspace */,
  signup_role TEXT CHECK (signup_role IN ('reader','editor')) /* null = sign-up off */,
  created_by INTEGER REFERENCES users ON DELETE SET NULL, created_at TEXT NOT NULL);
CREATE TABLE inbox_cursors (user_id INTEGER PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  last_read INTEGER NOT NULL);
CREATE VIRTUAL TABLE search_index USING fts5(workspace UNINDEXED, path UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2');
`
	},
	{
		id: '004-link-hint',
		// The token's last 4 characters, so an owner can tell which row a URL is; null for older links.
		sql: 'ALTER TABLE public_links ADD COLUMN hint TEXT;'
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
