import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspace, Forbidden } from "./access.ts";
import { createUser } from "./accounts.ts";
import type { Actor } from "./actor.ts";
import { workspaceDir } from "./data.ts";
import { closeDb, db } from "./db.ts";
import { createDocument } from "./documents.ts";
import { MAX_IMAGE_BYTES, readImage, saveImage } from "./images.ts";
import { InvalidContent } from "./paths.ts";
import { clearSessionTimers } from "./sessions.ts";

// 1×1 images made with ffmpeg (GIF: the classic transparent pixel).
const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const png = b64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADElEQVR4nGP4x8AAAAL+AP8oJgQeAAAAAElFTkSuQmCC",
);
const jpeg = b64(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABgEBAAAAAAAAAAAAAAAAAAAACBABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAEAAQMBIgACEQADEQD/2gAMAwEAAhEDEQA/AIsAfx/f/9k=",
);
const gif = b64("R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==");
const webp = b64(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAgA0JaACdLoB+AADsAD+8Oj3/yC5YXXI1/8gP+QH/ID/+PIAAAA=",
);
const text = (s: string) => new TextEncoder().encode(s);

let jon: Actor;
let reader: Actor;
let data: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: workspaceDir("demo"), encoding: "utf8" });
const files = () =>
  fs.readdirSync(path.join(workspaceDir("demo"), "notes")).sort();

beforeEach(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), "inkmesh-images-"));
  process.env.INKMESH_DATA = data;
  const u = await createUser({
    email: "jon@b.c",
    name: "Jon",
    password: "long enough 1",
  });
  jon = { id: u.id, name: "Jon" };
  await createWorkspace("demo", "Demo", jon);
  const r = await createUser({
    email: "r@b.c",
    name: "R",
    password: "long enough 1",
  });
  db()
    .prepare("insert into memberships values ('demo', ?, 'reader')")
    .run(r.id);
  reader = { id: r.id, name: "R" };
  await createDocument("demo", "notes/report.md", jon);
});
afterEach(() => {
  clearSessionTimers();
  closeDb();
  delete process.env.INKMESH_DATA;
  fs.rmSync(data, { recursive: true, force: true });
});

describe("images", () => {
  it("refuses anything that is not a real image", async () => {
    const before = git("rev-list", "--count", "HEAD");
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const uploads: Array<[string, Uint8Array]> = [
      ["x.png", text("<html><script>alert(1)</script></html>")],
      ["x.svg", svg],
      ["x.png", svg],
      ["x.gif", png],
      ["x", png],
      ["x.png", new Uint8Array()],
    ];
    for (const [name, bytes] of uploads)
      await expect(
        saveImage("demo", "notes/report.md", name, bytes, jon),
      ).rejects.toThrow(new InvalidContent("not-image"));
    expect(files()).toEqual(["report.md"]);
    expect(git("rev-list", "--count", "HEAD")).toBe(before);

    const notes = path.join(workspaceDir("demo"), "notes");
    fs.writeFileSync(
      path.join(notes, "evil.png"),
      "<html><script>alert(1)</script></html>",
    );
    fs.writeFileSync(path.join(notes, "x.webp"), png);
    for (const p of ["notes/evil.png", "notes/x.webp", "notes/report.md"])
      await expect(readImage("demo", p, jon)).rejects.toMatchObject({
        code: "ENOENT",
      });
  });

  it("stores each format next to its document", async () => {
    const uploads: Array<[string, Uint8Array, string]> = [
      ["shot.png", png, "png"],
      ["photo [1].jpeg", jpeg, "jpg"],
      ["anim.GIF", gif, "gif"],
      ["pic.webp", webp, "webp"],
    ];
    for (const [name, bytes, ext] of uploads) {
      const saved = await saveImage(
        "demo",
        "notes/report.md",
        name,
        bytes,
        jon,
      );
      expect(saved.path).toMatch(
        new RegExp(`^notes/report-[0-9a-f]{8}\\.${ext}$`),
      );
      expect(saved.src).toBe(saved.path.slice("notes/".length));
      expect(saved.alt).toBe(
        name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, ""),
      );
      expect(await readImage("demo", saved.path, jon)).toEqual({
        bytes: Buffer.from(bytes),
        type: ext === "jpg" ? "jpeg" : ext,
      });
    }
    expect(git("log", "-1", "--format=%s|%an")).toMatch(
      /^Add image notes\/report-[0-9a-f]{8}\.webp\|Jon\n$/,
    );
  });

  it("encodes the image src like a relocated link", async () => {
    await createDocument("demo", "notes/a (b)#?.md", jon);
    const { src } = await saveImage(
      "demo",
      "notes/a (b)#?.md",
      "x.png",
      png,
      jon,
    );
    expect(src).toMatch(/^a%20%28b%29%23%3F-[0-9a-f]{8}\.png$/);
  });

  it("two pastes never collide", async () => {
    const a = await saveImage("demo", "notes/report.md", "x.png", png, jon);
    const b = await saveImage("demo", "notes/report.md", "x.png", png, jon);
    expect(a.path).not.toBe(b.path);
    expect(files()).toHaveLength(3);
  });

  it("caps the size", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(png);
    await expect(
      saveImage("demo", "notes/report.md", "x.png", big, jon),
    ).rejects.toThrow(new InvalidContent("too-large"));
  });

  it("needs the document and an editor", async () => {
    await expect(
      saveImage("demo", "notes/missing.md", "x.png", png, jon),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      saveImage("demo", "notes/report.md", "x.png", png, reader),
    ).rejects.toThrow(Forbidden);
    const { path: p } = await saveImage(
      "demo",
      "notes/report.md",
      "x.png",
      png,
      jon,
    );
    expect((await readImage("demo", p, reader)).type).toBe("png");
  });
});
