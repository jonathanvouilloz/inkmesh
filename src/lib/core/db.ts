import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./data.ts";

// Forward-only: append new entries, never edit an applied one.
export const MIGRATIONS: readonly { id: string; sql: string }[] = [
  {
    id: "001-accounts",
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
`,
  },
];

const handles = new Map<string, DatabaseSync>();

export function db(): DatabaseSync {
  const file = path.join(dataDir(), "inkmesh.db");
  let handle = handles.get(file);
  if (handle) return handle;
  fs.mkdirSync(dataDir(), { recursive: true });
  handle = new DatabaseSync(file);
  handle.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  handle.exec(
    "CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    handle
      .prepare("SELECT id FROM migrations")
      .all()
      .map((r) => r.id),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    handle.exec("BEGIN");
    try {
      handle.exec(m.sql);
      handle
        .prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)")
        .run(m.id, new Date().toISOString());
      handle.exec("COMMIT");
    } catch (err) {
      handle.exec("ROLLBACK");
      handle.close();
      throw err;
    }
  }
  handles.set(file, handle);
  return handle;
}

export function closeDb(): void {
  for (const handle of handles.values()) handle.close();
  handles.clear();
}
