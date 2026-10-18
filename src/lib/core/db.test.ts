import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "./db.ts";

const dirs: string[] = [];
beforeEach(() => {
  process.env.INKMESH_DATA = fs.mkdtempSync(
    path.join(os.tmpdir(), "inkmesh-db-"),
  );
  dirs.push(process.env.INKMESH_DATA);
});
afterEach(() => {
  closeDb();
  delete process.env.INKMESH_DATA;
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("db", () => {
  it("creates the schema once", () => {
    const names = () =>
      db()
        .prepare(
          "select name from sqlite_master where type='table' order by name",
        )
        .all()
        .map((r) => r.name);
    expect(names()).toEqual([
      "invitations",
      "memberships",
      "migrations",
      "sessions",
      "users",
      "workspaces",
    ]);
    closeDb();
    expect(names()).toEqual([
      "invitations",
      "memberships",
      "migrations",
      "sessions",
      "users",
      "workspaces",
    ]); // second open: no error, no duplicate
    expect(db().prepare("select count(*) as n from migrations").get()).toEqual({
      n: 1,
    });
  });

  it("enforces foreign keys and roles", () => {
    expect(() =>
      db().prepare("insert into memberships values ('nope', 1, 'owner')").run(),
    ).toThrow(/FOREIGN KEY/);
    db()
      .prepare(
        "insert into workspaces values ('w', 'W', '2026-01-01T00:00:00.000Z')",
      )
      .run();
    db()
      .prepare(
        "insert into users (email, name, password_hash, created_at) values ('a@b.c', 'A', 'x', '2026-01-01T00:00:00.000Z')",
      )
      .run();
    expect(() =>
      db().prepare("insert into memberships values ('w', 1, 'god')").run(),
    ).toThrow(/CHECK/);
  });

  it("opens one database per data directory", () => {
    const first = db();
    process.env.INKMESH_DATA = fs.mkdtempSync(
      path.join(os.tmpdir(), "inkmesh-db2-"),
    );
    dirs.push(process.env.INKMESH_DATA);
    expect(db()).not.toBe(first);
  });
});
