# Milestone 5 — Collaboration: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members comment on documents (and agents read and add comments), find any document by a word, restore an old version or a deleted document, paste images into the editor, share a read-only public link to a document or a workspace (optionally letting visitors sign up), and see in an inbox what others changed since their last look.

**Architecture:** Five new `core` modules: `comments.ts` (thread files under `.inkmesh/comments/`), `search.ts` (FTS5 cache), `images.ts` (signature-checked image files), `publicLinks.ts` (tokens, scope checks, join by link), `inbox.ts` (per-user cursor over the M4 events). `documents.ts` gains restore functions and keeps comments, public links and the index in step with every write. One renderer, `renderHtml` in `markdown.ts` (remark → rehype → sanitize → HTML), serves public pages, the version view and comment bodies. Adapters stay thin: `agent-api.ts` `ops` and `mcp.ts` gain search and comments; routes add `/<ws>/-/search`, `/<ws>/-/history`, `/<ws>/-/images`, `/inbox`, `/s/<token>/…` (cookie-free, no JavaScript) and `/join/<token>`; a `reroute` hook serves images at their natural URL.

**Tech Stack:** SvelteKit 3.1 (adapter-node), Svelte 5 runes, Node 24 `node:sqlite` (FTS5) and `node:crypto`, git CLI, Milkdown Crepe with its upload plugin, `remark-rehype@^11.1.2`, `rehype-sanitize@^6.0.0`, `rehype-stringify@^10.0.1` (new), Vitest, Playwright.

**Spec:** `docs/plans/2026-10-19-m5-collaboration-spec.md` (data, comment grammar, images, search, public links, restore, inbox, API and MCP additions, security rules). Boundaries: `docs/project/architecture.md`. Conventions: `AGENTS.md`. Design: `DESIGN.md`.

## Global Constraints

- Only `src/lib/core/` touches disk, git or the database. Every `core` function takes an `actor` and calls `assertRole` first (`reader` for reads, comments and search; `editor` for writes, image upload and restore; `owner` for public links), except the `shared*` functions of `publicLinks.ts`, whose check is the link's scope. Routes map errors as in M3/M4 (`requireRole`, `toApiError`).
- Every `core` write runs inside `serialised(slug, …)`, flushes the editing sessions it touches (`flushSessions`), commits, appends at most one event, then calls `syncIndex` for the paths it changed. An index failure is logged, never thrown.
- `.inkmesh/` is reached only by `comments.ts` and the move, delete and restore code of `documents.ts`, through `resolveInside(root, rel, { inkmesh: true })`. Document functions still reject it.
- No raw HTML reaches a page: `{@html}` is used only on a string returned by `renderHtml`. Search snippets are split into text and `<mark>` parts, never inserted as HTML.
- Public routes (`/s/…`) never read or set the session cookie and carry the headers of the spec's Public links section; their pages set `csr = false`.
- Tokens (public links) are `newToken()`; only `hashToken(token)` is stored; a token is never logged.
- Dates are ISO 8601 UTC strings. Limits: comment 10 000 characters, image 5 MiB, search query 200 characters and 10 terms, 20 results, inbox 50 lines, unread count capped at 100.
- Core modules import each other with relative `.ts` paths; routes use `#lib/...`. Circular imports between `documents.ts` and `search.ts` / `comments.ts` are function-level only (no top-level use).
- Every visible string goes through `t(key, locale)` with `en` and `fr`; French uses « » and a non-breaking space before `:` `;` `?` `!`. Paths, hashes, timestamps, agent names and URLs use Fragment Mono.
- New runtime dependencies: `remark-rehype@^11.1.2`, `rehype-sanitize@^6.0.0`, `rehype-stringify@^10.0.1`; `@milkdown/kit@7.22.3` moves from transitive to direct (same version Crepe pins). Nothing else.
- Tests run on a temp `INKMESH_DATA` with `closeDb()` in `afterEach`; e2e on `.data-e2e`, new specs in their own folders (`e2e-collab/`, …), never touching seeded documents.
- Code, comments and commits in English; Conventional Commits; one change per commit; branch `m5-collaboration`.

## Review Focus

1. A document link must reveal nothing outside its document: no sibling, no tree, no image the document does not reference, no `.inkmesh` or `.git` path, nothing once revoked (Task 5 test `a document link reveals nothing outside its document`; Task 16 e2e `a document link shows one document to a stranger`).
2. Rendered Markdown must never execute: raw HTML, `javascript:`/`data:`/`vbscript:` URLs (in links, images, autolinks and definitions) and event-handler attributes come out inert (Task 3 test `renderHtml never emits active content`).
3. A file that is not a real PNG, JPEG, GIF or WebP must be refused on upload and on every serve, whatever its extension, including SVG and HTML renamed `.png` (Task 4 test `refuses anything that is not a real image`).
4. Comments must travel with their document: a move or rename carries the thread in the same commit, a delete removes it in the same commit, a restore brings it back (Task 6 test `comments move and leave with their document`; Task 8 test `restores a deleted document with its comments`).
5. Restoring a version while another human has uncommitted editor changes must first commit those changes under that human's name, then commit the restore; nothing is lost or misattributed (Task 8 test `restore commits the open session first`).

---

### Task 0: Dangerous link and image URLs in the editor (security, first)

A `javascript:` (or `data:`, `vbscript:`) URL in a document is clickable in the editor today, read-only mode included: one member can plant a link that runs script in another member's session.

**Files:**
- Modify: `src/lib/editor/config.ts` (or `Editor.svelte`, wherever Crepe's link and image rendering is configured)
- Test: `src/lib/editor/*.test.ts`, `e2e/document.spec.ts`

**Interfaces:**
- Produces: `safeUrl(url: string): boolean` in `src/lib/editor/config.ts` — true for relative URLs and `http:`, `https:`, `mailto:`; false for every other scheme (case-insensitive, after trimming and removing ASCII control characters and whitespace inside the scheme). The editor renders an unsafe link as plain text (no `href`) and an unsafe image without `src`; the Markdown source is never changed.

- [x] **Step 1: Write the failing tests**: `safeUrl` table (`javascript:alert(1)`, ` JaVaScRiPt:x`, `java\tscript:x`, `data:text/html,x`, `vbscript:x` → false; `https://a`, `/x`, `notes/a.md`, `#h`, `mailto:a@b.c` → true); e2e `a javascript link is not clickable` (a seeded document with `[x](javascript:alert(1))`: the rendered link has no `href`, and clicking it opens no dialog).
- [x] **Step 2: Run** — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** the unit tests and the full e2e suite — PASS; the round-trip fixtures still pass (the source is untouched).
- [x] **Step 5: Commit** `fix(editor): render links and images with unsafe URLs inert`.

### Task 1: Migration `003-collaboration` and the new event types

**Files:**
- Modify: `src/lib/core/db.ts` (append migration), `src/lib/core/db.test.ts`, `src/lib/core/events.ts`, `src/lib/core/events.test.ts`

**Interfaces:**
- Produces: migration `{ id: '003-collaboration', sql }` with the spec's Data section verbatim (events rebuild keeping ids and sequence, `public_links`, `inbox_cursors`, `search_index`).
- Changes in `events.ts`: `type EventType = 'create' | 'update' | 'move' | 'delete' | 'comment' | 'join'`; the row-to-`WorkspaceEvent` mapping is exported as `eventFromRow(row: Record<string, unknown>): WorkspaceEvent` (reused by `inbox.ts`).

- [x] **Step 1: Write the failing tests.** `db.test.ts` `creates the schema once`: the table list gains `inbox_cursors`, `public_links`, `search_index` and FTS5's shadow tables `search_index_config`, `search_index_content`, `search_index_data`, `search_index_docsize`, `search_index_idx`; `migrations` count 3. `keeps event ids across the rebuild`: build a database file by hand with `DatabaseSync`, run `MIGRATIONS[0]` and `[1]` and record them in `migrations`, insert five events and delete ids 4 and 5, close; `db()` applies `003`; rows 1–3 are intact, the next `appendEvent` gets id 6, `type='comment'` is accepted and `type='nope'` still fails the CHECK. `events.test.ts` `records comment and join events` (`appendEvent(…, { type: 'comment', path: 'a.md', commit })` and `{ type: 'join', path: '' }` come back through `changes` with those types).
- [x] **Step 2: Run** `npx vitest run src/lib/core/db.test.ts src/lib/core/events.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): collaboration migration and comment and join events`.

### Task 2: Comment threads in `core`

**Files:**
- Create: `src/lib/core/comments.ts`, `src/lib/core/comments.test.ts`
- Modify: `src/lib/core/paths.ts` (`resolveInside` option), `src/lib/core/paths.test.ts`, `src/lib/core/documents.ts` (export `documentFile`)

**Interfaces:**
- Changes: `resolveInside(root: string, rel: string, opts?: { inkmesh?: boolean }): string` — with `inkmesh: true`, `.inkmesh` is allowed as the first segment only; `.git` and `..` never; symlink rules unchanged.
- Produces in `comments.ts`:
  - `type Comment = { id: string; author: string; at: string; resolved: boolean; body: string }` (`id === at`)
  - `const MAX_COMMENT_CHARS = 10_000`
  - `commentPath(docPath: string): string` → `.inkmesh/comments/<docPath>`
  - `parseComments(source: string): Comment[]` — the spec's grammar (heading regex verbatim, preamble ignored, body trimmed of leading and trailing blank lines).
  - `appendComment(source: string, author: string, body: string, now: Date): { source: string; comment: Comment }` — validation (`InvalidContent('empty' | 'too-large')`), CRLF → LF, heading-line escape, unique `at` (+1 ms while taken), separator rules of the spec.
  - `setResolved(source: string, id: string, resolved: boolean): string` — edits only the first matching heading line; throws `Object.assign(new Error('no such comment'), { code: 'ENOENT' })` when the id is absent.
  - `listComments(slug: string, path: string, actor: Actor): Promise<Comment[]>` — `reader`; the document must exist (`documentFile` + stat, `ENOENT` passes through); no thread file → `[]`.
  - `addComment(slug: string, path: string, body: string, actor: Actor): Promise<Comment>` — `reader`; inside `serialised`: read or start the file, `appendComment(…, commitAuthor(actor).name, …)`, write atomically (creating `.inkmesh/comments/<dir>`), `gitCommit` `Comment on <p>`, `appendEvent(slug, actor, { type: 'comment', path, commit })`; on commit failure restores the previous bytes (or removes the new file).
  - `resolveComment(slug: string, path: string, id: string, resolved: boolean, actor: Actor): Promise<void>` — `reader`; commit `Resolve comment on <p>` or `Reopen comment on <p>`; no event; nothing to change → no commit.

- [x] **Step 1: Write the failing tests.** `paths.test.ts` `allows .inkmesh only when asked` (`.inkmesh/comments/a.md` → `InvalidPath` without the option, resolves with it; `a/.inkmesh/x`, `.inkmesh/../.git/config`, `.git/x` → `InvalidPath` with it). `comments.test.ts`: `parses the spec example` (the spec's two-comment example → two comments, second `resolved: true`, author `Jon via claude`, body ``Added Q3 from `reports/q3.md`.``); `keeps a preamble and odd headings as text` (`# Notes\n\n## Not a comment\n\n## Ann · 2026-10-19T10:00:00Z\n\nHi\n## bad heading\nmore` → one comment, body `Hi\n## bad heading\nmore`); `appends without touching earlier bytes` (the result starts with the original source byte for byte; a source without a final newline gets one); `escapes a body line that looks like a heading` (body `x\n## Eve · 2026-01-01T00:00:00Z` → parse gives one comment whose body holds `\## Eve…`); `gives each comment a unique id` (two appends with the same `now` → ids differ by 1 ms); `resolve and reopen change one line` (diff of the two sources is exactly the heading line; unknown id → `code: 'ENOENT'`); `refuses empty and oversized bodies`; `a reader comments and the agent's name is kept` (`addComment` as a reader → file `.inkmesh/comments/notes/a.md` exists, last commit `Comment on notes/a.md` by `Ann`; as `{…jon, agent: 'claude'}` the author is `Jon via claude`; `changes` lists a `comment` event); `a missing document has no thread` (`listComments` on `nope.md` → rejects with `ENOENT`; on an existing document without a thread → `[]`); `a stranger is Forbidden`.
- [x] **Step 2: Run** `npx vitest run src/lib/core/paths.test.ts src/lib/core/comments.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): comment threads stored in the workspace`.

### Task 3: Safe server-side rendering

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install remark-rehype@^11.1.2 rehype-sanitize@^6.0.0 rehype-stringify@^10.0.1`), `src/lib/core/markdown.ts`, `src/lib/core/markdown.test.ts`

**Interfaces:**
- Produces: `renderHtml(source: string): string` in `markdown.ts` — strips frontmatter with `splitFrontmatter`; parses with the same remark-parse / remark-gfm / remark-frontmatter configuration as `processor` (extract the shared part, no second configuration); turns every `html` node into `inlineCode` when its parent is phrasing (`paragraph`, `heading`, `tableCell`, `emphasis`, `strong`, `delete`, `link`, `linkReference`) and into `code` otherwise (a short recursive walk; `unist-util-visit` is not a direct dependency); then `remark-rehype` (no `allowDangerousHtml`), `rehype-sanitize` (default schema), `rehype-stringify`.
- Produces: `imageUrls(source: string): string[]` in `markdown.ts` — the URLs of `image` and `definition` nodes, in document order (Task 5 uses it for a document link's images).

- [x] **Step 1: Write the failing tests** in `markdown.test.ts`: `renderHtml never emits active content` — for each input, the output contains none of `<script`, `<iframe`, `<img src="x" onerror`, ` on` + letters + `=` inside a tag, `javascript:`, `vbscript:`, `data:` (case-insensitive): `<script>alert(1)</script>` (block), `a <img src=x onerror=alert(1)> b` (inline), `[x](javascript:alert(1))`, `[x](JaVaScRiPt:alert(1))`, `<javascript:alert(1)>` (autolink), `[x][r]\n\n[r]: javascript:alert(1)`, `![x](data:image/svg+xml;base64,PHN2Zz4=)`, `[x](vbscript:msgbox)`; and the block HTML case shows as escaped text (`&lt;script&gt;`). `renders the documents people write` — a GFM table → `<table>`, a task list → `<input type="checkbox" disabled`, `[b](b.md)` → `href="b.md"`, `![p](img/p.png)` → `src="img/p.png"`, `https://example.com` link kept, frontmatter absent from the output. `imageUrls lists images and definitions` (`![a](x.png) [l](y.md)\n\n[d]: z.png` → `['x.png', 'z.png']`).
- [x] **Step 2: Run** `npx vitest run src/lib/core/markdown.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; the round-trip fixtures still pass; `npm ls --omit=dev --all | wc -l` noted in the report.
- [x] **Step 5: Commit** `feat(core): sanitised HTML rendering of Markdown`.

### Task 4: Image files in `core`

**Files:**
- Create: `src/lib/core/images.ts`, `src/lib/core/images.test.ts`
- Modify: `src/lib/core/paths.ts` (`assertFolderName`), `src/lib/core/documents.test.ts`

**Interfaces:**
- Produces in `images.ts`:
  - `type ImageType = 'png' | 'jpeg' | 'gif' | 'webp'`; `const MAX_IMAGE_BYTES = 5 * 1024 * 1024`; `const CONTENT_TYPES: Record<ImageType, string>`
  - `imageType(bytes: Uint8Array): ImageType | null` — the spec's signatures.
  - `extensionType(name: string): ImageType | null` — `png`, `jpg`/`jpeg`, `gif`, `webp`, case-insensitive.
  - `saveImage(slug: string, docPath: string, fileName: string, bytes: Uint8Array, actor: Actor): Promise<{ path: string; src: string; alt: string }>` — `editor`; the document must exist (`ENOENT`); size (`InvalidContent('too-large')`) then `extensionType(fileName) === imageType(bytes)` and not null (`InvalidContent('not-image')`); inside `serialised`: name `<doc base>-<randomBytes(4) hex>.<png|jpg|gif|webp>` in the document's folder, exclusive `writeAtomic` (retry the name on `EEXIST`), `gitCommit` `Add image <p>`, unlink on commit failure. `src` = `encodeURI` of the file name with `(`, `)`, `#`, `?` percent-encoded (the M3 `relocate` rule); `alt` = `fileName` without its extension, `[`/`]` removed.
  - `readImageFile(slug: string, path: string): Promise<{ bytes: Buffer; type: ImageType }>` — core-internal, no role check (public links): `resolveInside`, parent through `assertFolderName`, name not a dot-file, extension and signature must agree, else `Object.assign(new Error('not an image'), { code: 'ENOENT' })`.
  - `readImage(slug: string, path: string, actor: Actor)` — `reader`, then `readImageFile`.
- Changes: `assertFolderName` also refuses a segment ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` (case-insensitive).

- [x] **Step 1: Write the failing tests** in `images.test.ts` (fixtures built in the test: a 1×1 PNG, JPEG, GIF and WebP as byte arrays): `refuses anything that is not a real image` — upload: HTML bytes named `x.png`, `<svg xmlns="http://www.w3.org/2000/svg"/>` named `x.svg` and `x.png`, PNG bytes named `x.gif`, PNG bytes named `x` (no extension), an empty file → `InvalidContent('not-image')`, nothing written, no commit; serve: HTML written with `fs` as `evil.png`, PNG bytes written as `x.webp`, a `.md` path → `readImage` rejects with `code: 'ENOENT'`. `stores each format next to its document` (four uploads to `notes/report.md` → paths match `^notes/report-[0-9a-f]{8}\.(png|jpg|gif|webp)$`, `x.jpeg` stored as `.jpg`, each `src` is the base name, `alt` is the original name without extension, last commit `Add image notes/report-….webp` by `Jon`); `two pastes never collide` (same bytes twice → two paths); `caps the size` (`MAX_IMAGE_BYTES + 1` → `too-large`); `needs the document and an editor` (missing document → `ENOENT`; reader → `Forbidden`; reader can `readImage`). `documents.test.ts` `refuses image-like folder names` (`createFolder('demo', 'shots.PNG', jon)` and a move to `a.webp` → `InvalidPath`).
- [x] **Step 2: Run** `npx vitest run src/lib/core/images.test.ts src/lib/core/documents.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): signature-checked images next to their document`.

### Task 5: Public links and join by link in `core`

**Files:**
- Create: `src/lib/core/publicLinks.ts`, `src/lib/core/publicLinks.test.ts`
- Modify: `src/lib/core/documents.ts` (unchecked readers), `src/lib/core/access.ts` (`grantRole`, `join` events, reserved slugs), `src/lib/core/access.test.ts`, `src/lib/core/accounts.ts` (`max` argument)

**Interfaces:**
- Changes in `documents.ts` (core-internal, no role check, one-line comment saying so): `readSource(slug: string, path: string)` (the body of today's `readDocument`) and `walkTree(slug: string): Promise<TreeNode[]>` (the body of `listTree`); `readDocument` and `listTree` become `assertRole` + these.
- Changes in `access.ts`: internal `grantRole(slug: string, userId: number, role: Role): void` (insert, or raise and never lower; extracted from `claim`); `acceptInvitation` and `acceptInvitationAsNewUser` append `appendEvent(slug, { id, name }, { type: 'join', path: '' })` after their transaction; `RESERVED` gains `'inbox'` and `'join'`.
- Changes in `accounts.ts`: `loginAllowed(key: string, max = MAX_FAILURES): boolean` (the counter stays `loginFailed`; one comment says it also counts plain hits for public routes).
- Produces in `publicLinks.ts`:
  - `type SignupRole = 'reader' | 'editor'`
  - `type PublicLink = { id: number; path: string | null; signupRole: SignupRole | null; createdBy: string | null; createdAt: string }`
  - `type SharedScope = { workspace: Workspace; path: string | null; signupRole: SignupRole | null }`
  - `createPublicLink(slug: string, path: string | null, signupRole: SignupRole | null, actor: Actor): Promise<string>` — `owner`; a document path must name an existing document (`documentFile` + stat); returns the token.
  - `publicLinks(slug: string, actor: Actor): PublicLink[]` — `owner`, oldest first. `setSignupRole(slug: string, id: number, role: SignupRole | null, actor: Actor): void` and `revokePublicLink(slug: string, id: number, actor: Actor): void` — `owner`, act on that workspace's rows only.
  - `sharedScope(token: string): SharedScope | null` — by hash.
  - `sharedTree(token: string): Promise<TreeNode[]>` — workspace link only.
  - `sharedDocument(token: string, path: string): Promise<{ path: string; source: string; frontmatter: string; body: string; hash: string }>` — a document link answers its own path only.
  - `sharedFile(token: string, path: string): Promise<{ kind: 'doc'; source: string } | { kind: 'image'; bytes: Buffer; type: ImageType }>` — `.md` → document rules; image → a workspace link reads any (`readImageFile`), a document link only a path in `referencedImages`.
  - Internal `referencedImages(docPath: string, source: string): Set<string>` — `imageUrls(source)` resolved against `dirname(docPath)` with the M3 `target()` rule (absolute URLs skipped), normalised.
  - Every refusal (unknown or revoked token, out of scope) throws `Forbidden('not a member')` so routes answer 404; `InvalidPath` passes through (also 404 at the route).
  - `joinByLink(token: string, userId: number): { workspace: Workspace; path: string | null }` and `joinByLinkAsNewUser(token: string, input: { email: string; name: string; passwordHash: string }): { user: User; workspace: Workspace; path: string | null }` — one transaction each; `Conflict` when the link is unknown or `signup_role` is null; `grantRole` with the link's role; then a `join` event.

- [x] **Step 1: Write the failing tests** in `publicLinks.test.ts` (`demo`: `notes/a.md` holding `![p](pic.png) ![q](../img/b.png)`, `notes/b.md`, real images `notes/pic.png`, `img/b.png`, `notes/c.png`; a comment on `notes/a.md`; workspace `other` with `x.md`): `a document link reveals nothing outside its document` — `sharedDocument(t, 'notes/a.md')` resolves; `notes/b.md`, `x.md` → `Forbidden`; `sharedTree(t)` → `Forbidden`; `sharedFile` of `notes/a.md` (doc), `notes/pic.png`, `img/b.png` (images) resolve; `notes/c.png`, `notes/b.md`, `../other/x.md`, `.inkmesh/comments/notes/a.md`, `.git/config` → `Forbidden` or `InvalidPath`; after `revokePublicLink`, `sharedScope(t)` is null and every call above rejects. `a workspace link reads that workspace only` (`sharedTree` equals `listTree` as owner; `notes/c.png` resolves; `.inkmesh/…` → `InvalidPath`). `stores only the token hash` (`/^[A-Za-z0-9_-]{43}$/`; the token appears nowhere in the database). `only owners manage links` (editor → `Forbidden` on create, list, set, revoke; an id from another workspace is untouched). `a link to a missing document is refused` (`ENOENT`). `joining needs sign-up on` (`signupRole` null → `Conflict`; set `reader` → `joinByLinkAsNewUser` creates the user as reader of `demo` and a `join` event by that user; `setSignupRole(…, null)` → the next join fails). `join raises a role and never lowers it` (an editor joining a reader link stays editor; a reader joining an editor link becomes editor). `access.test.ts`: `accepting an invitation appends a join event`; `inbox and join are reserved slugs`.
- [x] **Step 2: Run** `npx vitest run src/lib/core/publicLinks.test.ts src/lib/core/access.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): public links with scope checks and join by link`.

### Task 6: Comments and public links follow move and delete

**Files:**
- Modify: `src/lib/core/documents.ts` (`movePath`, `deletePath`), `src/lib/core/documents.test.ts`

**Interfaces:**
- Changes in `movePath`, inside its lock, after renaming the item: when `.inkmesh/comments/<from>` exists (file for a document, folder for a folder), rename it to `.inkmesh/comments/<to>` (creating parents) and add both paths to the commit's `paths`; on failure rename it back with the rest. After a successful commit: `UPDATE public_links SET path = ? || substr(path, length(?) + 1) WHERE workspace = ? AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/')` with `to`/`from` (prefix comparison, not `LIKE`: `_` and `%` are legal in names).
- Changes in `deletePath`: the comment file or folder moves into the same trash entry's sibling (`<trash>-comments`) and its path joins the commit; restored on failure; removed after success like the trash entry.

- [x] **Step 1: Write the failing tests:** `comments move and leave with their document` — comment on `f/a.md`; `movePath('f/a.md', 'g/b.md')` → `listComments('g/b.md')` has the comment, `.inkmesh/comments/f/a.md` is gone, `git show --name-status HEAD` lists the document and the comment file in the one `Move` commit; `movePath('g', 'h')` (folder) → thread at `h/b.md`; `deletePath('h')` → no `.inkmesh/comments/h`, the `Delete h` commit removes the comment file, no `trash-*` left. `a failed move keeps the thread in place` (`.git/index.lock` present → `movePath` rejects; the comment file is still at the old path). `a public link follows its document` (link to `f/a.md`; move `f` → `g` → `sharedDocument(t, 'g/a.md')` resolves; a link to `f_x.md` is untouched by a move of `f`).
- [x] **Step 2: Run** `npx vitest run src/lib/core/documents.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): comments and public links follow their document`.

### Task 7: Full-text search index

**Files:**
- Create: `src/lib/core/search.ts`, `src/lib/core/search.test.ts`
- Modify: `src/lib/core/documents.ts` (export `documentPaths` and `titleOf`; writers call `syncIndex`), `src/hooks.server.ts` (`init`)

**Interfaces:**
- Produces in `documents.ts`: `titleOf(body: string, fileName: string): string` (the `listTree` rule, now used by both); `documentPaths(root: string, rel?: string): Promise<string[]>` exported.
- Produces in `search.ts`:
  - `type SearchHit = { path: string; title: string; snippet: string }`
  - `ftsQuery(text: string): string | null` — the spec's query rule (exported for tests).
  - `syncIndex(slug: string, paths: string[]): Promise<void>` — for each path: delete rows of that path and under it (`path = ? OR substr(path, 1, length(?) + 1) = ? || '/'`); then index it when it is a `.md` file on disk, or every document under it when it is a folder; non-UTF-8 files skipped; errors logged, never thrown.
  - `rebuildIndex(): Promise<number>` — empties `search_index`, indexes every document of every `workspaces` row whose folder exists; returns the count.
  - `search(slug: string, query: string, actor: Actor): SearchHit[]` — `reader`; `ftsQuery` null → `[]`; `SELECT path, title, snippet(search_index, 3, char(2), char(3), '…', 12) … WHERE search_index MATCH ? AND workspace = ? ORDER BY rank LIMIT 20`.
- Changes: `writeDocument` (after the disk write), `createDocument`, `importDocument`, `movePath` (`[from, to, ...rewritten]`), `deletePath` (`[path]`) call `await syncIndex(slug, …)` inside their lock after success. `init` runs `await rebuildIndex()` after `commitAllSessions()` and logs the count.

- [x] **Step 1: Write the failing tests** in `search.test.ts`: `finds a word with or without accents` (`Le café est prêt` → `cafe`, `CAFÉ` find it); `matches a prefix and needs every term` (`rep` finds `report`; `report zebra` finds nothing when `zebra` is absent); `marks the match in the snippet` (snippet contains `\u0002café\u0003`); `follows every write` (create → found by title; `writeDocument` replacing `alpha` with `beta` → `beta` found, `alpha` not; `importDocument` → found; `movePath` → hit path is the new one only; `deletePath` of a folder → none of its documents found); `stays inside the workspace and needs a role` (same word in `other` → not in `demo`'s results; a non-member → `Forbidden`); `tolerates search syntax in the query` (`"`, `-x`, `a OR`, `*`, `(`, `NEAR(a b)`, `col:x` → no throw); `ignores an empty query` (`''`, `'  '` → `[]`); `rebuilds from disk` (a file written with `fs` is not found; after `rebuildIndex()` it is; the returned count equals the number of documents); `skips non-UTF-8 files` (`0xff 0xfe` file → rebuild does not throw, file not indexed).
- [x] **Step 2: Run** `npx vitest run src/lib/core/search.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): full-text search index kept in step with every write`.

### Task 8: History restore in `core`

**Files:**
- Modify: `src/lib/core/git.ts`, `src/lib/core/git.test.ts`, `src/lib/core/documents.ts`, `src/lib/core/documents.test.ts`

**Interfaces:**
- Produces in `git.ts`:
  - `gitShow(dir: string, rev: string, path: string): Promise<Buffer | null>` — `git cat-file blob <rev>:<path>` through `execFile` with `encoding: 'buffer'` and `maxBuffer: 64 * 1024 * 1024`, same environment as `git()`; `null` when the object does not exist.
  - `gitDeletions(dir: string, limit: number): Promise<Array<{ commit: string; name: string; date: string; paths: string[] }>>` — `git log -M --diff-filter=D --name-only -z -n <limit> --format=%x1e%H%x1f%an%x1f%aI`, parsed on `\x1e` / `\x1f` / `\0`; `[]` on an empty repository.
- Produces in `documents.ts`:
  - `const COMMIT = /^[0-9a-f]{7,40}$/` (anything else → `InvalidPath`).
  - `readVersion(slug: string, path: string, commit: string, actor: Actor): Promise<{ path: string; source: string; commit: string }>` — `reader`; `documentFile` rules; `ENOENT` error when `gitShow` returns null.
  - `restoreVersion(slug: string, path: string, commit: string, actor: Actor): Promise<{ commit: string }>` — `editor`; inside the lock: `flushSessions(slug, p => p === path, actor)`, old bytes from `gitShow`, same bytes as on disk → `{ commit: '' }`; else `writeAtomic`, `gitCommit` `Restore <p> to <commit.slice(0, 7)>`, restore the previous bytes on failure, `appendEvent` `update`, `syncIndex`.
  - `type DeletedDocument = { path: string; commit: string; name: string; agent?: string; date: string }`
  - `deletedDocuments(slug: string, actor: Actor): Promise<DeletedDocument[]>` — `reader`; `gitDeletions(root, 200)`, keeping `.md` paths not under `.inkmesh/` that do not exist now, first (newest) occurrence only; `name`/`agent` split like `history`.
  - `restoreDeleted(slug: string, path: string, actor: Actor): Promise<{ commit: string }>` — `editor`; `Conflict` when anything exists at `path`; the delete commit is the newest `gitDeletions` entry holding `path` (`ENOENT` when none); bytes from `gitShow(root, commit + '^', path)` and, when present, the comment file from the same revision; writes both (parents created), commits `Restore <p>` with both paths, removes both on failure, `appendEvent` `create`, `syncIndex`.

- [x] **Step 1: Write the failing tests.** `git.test.ts`: `shows a file at a revision as bytes` (CRLF and a `0xff` byte come back intact; a missing path → `null`); `lists deletions without renames` (delete `a b.md` and `été.md`, rename `c.md` → `d.md`: paths `['a b.md', 'été.md']` across entries, no `c.md`). `documents.test.ts`: `reads an old version`; `restores a version as a new commit` (last commit `Restore a.md to <7 hex>` by `Ann`, file equals the old bytes, an `update` event, `search` finds an old-only word); `restoring the same text makes no commit`; `restore commits the open session first` (`jon` has an open editor session on `a.md` with text `J`; `ann` restores the first version → newest first: `Restore a.md to …` by `Ann`, then `Update a.md` by `Jon` whose tree holds `J`); `refuses a bad commit id` (`HEAD`, `abc`, `../x`, 41 hex → `InvalidPath`); `lists deleted documents` (delete `a.md`, then folder `f` holding `f/b.md`, move `c.md` → `d.md` → paths `['f/b.md', 'a.md']`, no `c.md`, nothing under `.inkmesh`; after restoring `a.md` it leaves the list); `restores a deleted document with its comments` (comment on `a.md`, delete, `restoreDeleted` → content and thread back, commit `Restore a.md` holds both paths, a `create` event); `refuses to restore over an existing path` (`Conflict`); `readers cannot restore` (`Forbidden`).
- [x] **Step 2: Run** `npx vitest run src/lib/core/git.test.ts src/lib/core/documents.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm test` green.
- [x] **Step 5: Commit** `feat(core): restore a version or a deleted document`.

### Task 9: Inbox in `core`

**Files:**
- Create: `src/lib/core/inbox.ts`, `src/lib/core/inbox.test.ts`

**Interfaces:**
- Produces:
  - `type InboxItem = WorkspaceEvent & { workspace: string; workspaceName: string; unread: boolean }`
  - `inbox(userId: number, limit = 50): InboxItem[]` — events joined to the user's memberships, excluding `user_id = userId AND agent IS NULL`, newest first; `unread` = `id > last_read`.
  - `unreadCount(userId: number): number` — same filter, `id > last_read`, counted over a `LIMIT 100` subquery.
  - `markRead(userId: number, upTo: number): void` — `last_read = max(last_read, min(upTo, max(events.id)))`.
  - Both readers start with `INSERT OR IGNORE INTO inbox_cursors VALUES (?, (SELECT coalesce(max(id), 0) FROM events))`.

- [x] **Step 1: Write the failing tests:** `starts at the present` (events before the first call are listed but not unread; a new event by `ann` → `unreadCount(jon) === 1`); `shows others' events in my workspaces only` (events in `other`, where `jon` is not a member, are absent; `jon`'s own human events are absent); `includes my agents' work` (an event by `{…jon, agent: 'bot'}` is listed and unread); `marking read never goes back` (`markRead(id)` then `markRead(id - 1)` keeps `id`; a value above the highest id is clamped); `caps the count at 100` (150 events → 100); `leaving a workspace hides its events` (`removeMember` → its events vanish from `inbox`); `a deleted user takes the cursor along`.
- [x] **Step 2: Run** `npx vitest run src/lib/core/inbox.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS.
- [x] **Step 5: Commit** `feat(core): inbox with a per-user read cursor`.

### Task 10: Search and comments for agents (API and MCP)

**Files:**
- Modify: `src/lib/server/agent-api.ts` (`ops`, `toApiError`), `src/lib/server/mcp.ts`, `src/lib/server/mcp.test.ts`, `src/routes/api/v1/api.test.ts`
- Create: `src/routes/api/v1/workspaces/[workspace]/search/+server.ts`, `src/routes/api/v1/workspaces/[workspace]/comments/[...path]/+server.ts`

**Interfaces:**
- Changes: `toApiError` maps any `InvalidContent` other than `too-large` to 400 `bad_request`.
- Produces in `ops`: `search(actor, ws, q): { results: SearchHit[] }` (snippet markers `\u0002` `\u0003` removed; `q` trimmed, 1–200 characters, else `ApiError(400)`); `comments(actor, ws, path): { comments: Comment[] }`; `comment(actor, ws, path, body): { comment: Comment }`.
- Produces routes: the spec's three API rows (`POST` reads JSON `{ body: string }`, anything else → 400, answers 201).
- Produces MCP tools `search`, `read_comments`, `add_comment` (spec table and zod schemas); the instructions gain the comments sentence.

- [x] **Step 1: Write the failing tests.** `api.test.ts`: `searches a workspace` (200, the hit's `snippet` has no control characters; `q` missing or 201 characters → 400; non-member → 404); `reads and adds comments` (`POST` as a reader's agent → 201, author `Ann via reporter`; `GET` lists it; empty body → 400; 10 001 characters → 413; missing document → 404). `mcp.test.ts`: `lists the twelve tools` (sorted names equal M4's nine plus `add_comment`, `read_comments`, `search`); `a comment added in the browser is read by an agent` (`addComment` as `jon` through `core`, then `read_comments` for `ann`'s agent returns it, and `changes` lists a `comment` event); `add_comment works for a reader's agent`.
- [x] **Step 2: Run** `npx vitest run src/routes/api src/lib/server/mcp.test.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** — PASS; `npm run check` green.
- [x] **Step 5: Commit** `feat(api): search and comments for agents`.

### Task 11: Comments, version view and restore on the document page

**Files:**
- Create: `src/lib/ui/Comments.svelte`, `src/lib/ui/Rendered.svelte`, `src/routes/(app)/[workspace]/[...path]/comments.test.ts`, `e2e/collab.spec.ts`
- Modify: `src/routes/(app)/[workspace]/[...path]/+page.server.ts`, `+page.svelte`, `src/lib/ui/RightRail.svelte` (entries link to `?v=<hash>`), `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`

**Interfaces:**
- Consumes: `listComments`, `addComment`, `resolveComment` (Task 2), `renderHtml` (Task 3), `readVersion`, `restoreVersion` (Task 8).
- Changes `load` (documents only): adds `comments: Array<Comment & { html: string }>` (each body through `renderHtml`); when `url.searchParams.get('v')` is set: `version: { commit: string; html: string; entries: [string, string][] }` from `readVersion` (bad id or missing → 404) and the editor data is not needed.
- Produces actions: `comment` (`requireRole` reader; field `body`; `fail(400, { commentError: 'empty' | 'too-large', body })`; success `{}`), `resolve` (reader; fields `id`, `resolved` `'1'|'0'`; unknown id → `fail(404)`), `restore` (editor; field `commit`; `redirect(303, docHref(ws, path))`).
- Produces `Rendered.svelte` props `{ html: string }`: `<div class="rendered">{@html html}</div>` with styles matching the editor's document styles (16.5px Inter, tables with hairline rows and tabular numerals scrolling sideways on phones, panel code blocks, 2px hairline blockquote rule, images `max-width: 100%`). Reused by Tasks 16 (public) and comments (at 15px).
- Produces `Comments.svelte` props `{ comments: Array<Comment & { html: string }>; locale: Locale }` — the spec's Comments section, forms posting `?/comment` and `?/resolve` with `use:enhance`.
- i18n keys (`en` / `fr`): `comments.title` Comments / Commentaires · `comments.empty` No comments yet. / Aucun commentaire pour l’instant. · `comments.add` Add a comment / Ajouter un commentaire · `comments.submit` Comment / Commenter · `comments.resolve` Resolve / Résoudre · `comments.reopen` Reopen / Rouvrir · `comments.resolved` {count} resolved / {count} résolu(s) · `comments.tooLong` Use at most 10,000 characters. / 10 000 caractères au maximum. · `comments.needed` Write something first. / Écrivez d’abord quelque chose. · `version.of` Version of {date} by {author} / Version du {date} par {author} · `version.current` Back to the current version / Revenir à la version actuelle · `version.restore` Restore this version / Restaurer cette version · `version.confirm` Restore this version? The current text stays in the history. / Restaurer cette version ? Le texte actuel reste dans l’historique. · `version.label` Version {hash} / Version {hash}.

- [x] **Step 1: Write the failing tests.** `comments.test.ts` (harness of `save.test.ts`): `a reader comments and resolves` (action `comment` as a reader → the thread file holds it; `resolve` with its id → `resolved: true` in the next `load`); `an empty comment is refused` (`fail(400)` with `commentError: 'empty'`); `restore needs an editor` (reader → `error(403)`); `restore redirects to the document` (303, `location` `/demo/a.md`, history top `Restore a.md to …`); `load renders a version` (`?v=<first commit>` → `version.html` holds the first text; `?v=zzz` → 404). `e2e/collab.spec.ts`: `comment, resolve and reopen` (in `e2e-collab/`, create a document, add a comment, it appears with the owner's name; Resolve moves it under "1 resolved"; Reopen brings it back); `restore an earlier version` (type a word, leave and come back so the session commits, open the older History entry, the old text shows without the editor, Restore and confirm → the editor shows the old text and History's top entry starts with `Restore`).
- [x] **Step 2: Run** `npx vitest run "src/routes/(app)/[workspace]/[...path]"` and `npx playwright test e2e/collab.spec.ts` — FAIL.
- [x] **Step 3: Implement** (both languages, same keys).
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — PASS.
- [x] **Step 5: Commit** `feat(app): comments, version view and restore on the document page`.

### Task 12: Paste and drop images into the editor

**Files:**
- Create: `src/hooks.ts`, `src/hooks.test.ts`, `src/routes/(app)/[workspace]/-/images/+server.ts`, `src/routes/(app)/[workspace]/-/images/images.test.ts`, `e2e/images.spec.ts`
- Modify: `package.json` (`@milkdown/kit` `7.22.3` in `dependencies`), `src/routes/(app)/[workspace]/-/raw/[...path]/+server.ts`, `src/lib/editor/Editor.svelte`, `src/routes/(app)/[workspace]/[...path]/+page.svelte`, `src/lib/ui/FileStrip.svelte` (image message in its live region), `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`

**Interfaces:**
- Produces: `reroute: Reroute` in `src/hooks.ts` — the spec's two regular expressions, returning the rewritten pathname (encoding kept) or nothing.
- Produces: `POST /<ws>/-/images` — `requireRole(…, 'editor')`, `request.formData()`, fields `doc` (string) and `file` (`File`), else 400; `saveImage(…)` → 201 JSON `{ path, src, alt }`; `InvalidContent('too-large')` → 413, `'not-image'` → 400 `{ error: 'not-image' }`, `ENOENT` / `InvalidPath` → 404.
- Changes raw route: a path whose extension is an image extension → `readImage` → 200 with the spec's image headers; everything else unchanged (`.md` download).
- Changes `Editor.svelte`: new prop `onupload?: (file: File) => Promise<{ src: string; alt: string } | null>`. When set, after `new Crepe(...)` and before `create()`: `crepe.editor.config((ctx) => ctx.update(uploadConfig.key, (prev) => ({ ...prev, uploader })))` (import `uploadConfig` from `@milkdown/kit/plugin/upload`). The uploader keeps files whose `type` starts with `image/`, awaits `onupload` for each, and returns `schema.nodes.image.createAndFill({ src, alt })` for every non-null result; it never rejects (the plugin leaves its placeholder behind on a rejection). Readers get no `onupload`.
- Changes the document page: `onupload` POSTs `FormData { doc: data.path, file }` to `/<ws>/-/images`; on a non-201 answer it sets the strip's message to `image.failed` with `image.tooLarge`, `image.notImage` or `image.network` as reason and returns null.
- i18n: `image.failed` "Image not added: {reason}" / Image non ajoutée : {reason} · `image.tooLarge` larger than 5 MB / plus de 5 Mo · `image.notImage` only PNG, JPEG, GIF and WebP images / seulement des images PNG, JPEG, GIF et WebP · `image.network` the connection failed / la connexion a échoué.

- [x] **Step 1: Write the failing tests.** `hooks.test.ts` `reroutes image paths to the raw routes` (`/demo/notes/a.png` → `/demo/-/raw/notes/a.png`; `/demo/a%20b.JPG` → `/demo/-/raw/a%20b.JPG`; `/s/<43 chars>/img/x.webp` → `/s/<43 chars>/-/raw/img/x.webp`; unchanged: `/demo/a.md`, `/demo/-/raw/x.png`, `/api/v1/workspaces/demo/documents/x.png`, `/demo`, `/s/short/x.png`). `images.test.ts`: `uploads and serves an image` (201 `{ path: /^notes\/report-[0-9a-f]{8}\.png$/, src, alt }`; `GET` raw of that path → 200, `content-type: image/png`, `x-content-type-options: nosniff`, body equals the bytes); `refuses what is not an image` (SVG → 400 `not-image`; 5 MiB + 1 → 413; missing `file` → 400); `a reader cannot upload` (403); `a non-member gets 404 on serve`. `e2e/images.spec.ts`: `paste an image into the editor` (open a new `e2e-images/report.md`, dispatch a `paste` `ClipboardEvent` holding a `DataTransfer` with a 1×1 PNG `File` named `image.png` on `.ProseMirror`; an `img` appears; wait for "Saved"; reload → the `img` has `naturalWidth > 0` and `src` ending in `report-<8 hex>.png`; Raw shows `![image](report-….png)`); `a refused image is announced` (paste an SVG file → the strip says "Image not added", no `img` inserted, no placeholder left).
- [x] **Step 2: Run** `npx vitest run src/hooks.test.ts "src/routes/(app)/[workspace]/-/images"` and `npx playwright test e2e/images.spec.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — PASS; the round-trip and alt-text tests still pass.
- [x] **Step 5: Commit** `feat(app): paste and drop images into the editor`.

### Task 13: Search box and results page

**Files:**
- Create: `src/lib/ui/snippet.ts`, `src/lib/ui/snippet.test.ts`, `src/routes/(app)/[workspace]/-/search/+page.server.ts`, `src/routes/(app)/[workspace]/-/search/+page.svelte`, `src/routes/(app)/[workspace]/-/search/search.test.ts`, `e2e/search.spec.ts`
- Modify: `src/lib/ui/Header.svelte` (prop `search?: { workspace: string; q: string }`), `src/routes/(app)/[workspace]/+layout.svelte` (passes it; phone: the same form at the top of the drawer), `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`

**Interfaces:**
- Produces: `snippetParts(snippet: string): Array<{ text: string; mark: boolean }>` — splits on `\u0002…\u0003`; an unmatched marker is dropped.
- Produces: `load` → `requireRole(…, 'reader')`, `q = url.searchParams.get('q')?.trim().slice(0, 200) ?? ''`, `{ q, results: q ? search(ws, q, actor) : [] }`.
- Page: the spec's Search section; each result's title is a link (`docHref`), path in mono muted, snippet parts with `<mark>`.
- i18n: `search.label` Search this workspace / Rechercher dans cet espace · `search.title` Results for {q} / Résultats pour « {q} » · `search.none` No document contains {q}. / Aucun document ne contient « {q} ». · `search.prompt` Type a word to search. / Tapez un mot pour chercher.

- [x] **Step 1: Write the failing tests.** `snippet.test.ts` (`'a \u0002b\u0003 c'` → `[{a ,false},{b,true},{ c,false}]`; a stray `\u0003` disappears). `search.test.ts` (`load` returns a hit for a seeded word; `q` empty → `[]`; non-member → 404). `e2e/search.spec.ts` `search from the header` (type a word of a seeded document in "Search this workspace", Enter → results page lists it with the word marked; the link opens the document).
- [x] **Step 2: Run** the unit files and the e2e — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — PASS.
- [x] **Step 5: Commit** `feat(app): workspace search box and results`.

### Task 14: Deleted documents page

**Files:**
- Create: `src/routes/(app)/[workspace]/-/history/+page.server.ts`, `+page.svelte`, `src/routes/(app)/[workspace]/-/history/history.test.ts`
- Modify: `src/routes/(app)/[workspace]/+layout.svelte` (rail link `nav.deleted` under Members, for every role), `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`, `e2e/collab.spec.ts`

**Interfaces:**
- Consumes: `deletedDocuments`, `restoreDeleted` (Task 8).
- Produces: `load` → `requireRole(…, 'reader')`, `{ deleted: await deletedDocuments(ws, actor) }`; action `restore` (editor; field `path`) → `redirect(303, docHref(ws, path))`; `Conflict` → `fail(409, { restoreError: 'exists', path })`; `ENOENT` → `fail(404)`.
- i18n: `nav.deleted` Deleted documents / Documents supprimés · `deleted.title` Deleted documents / Documents supprimés · `deleted.empty` No document has been deleted. / Aucun document n’a été supprimé. · `deleted.path` Document / Document · `deleted.by` Deleted by / Supprimé par · `deleted.when` When / Quand · `deleted.restore` Restore / Restaurer · `deleted.exists` A document already exists at {path}. / Un document existe déjà à l’emplacement {path}.

- [x] **Step 1: Write the failing tests.** `history.test.ts`: `lists deleted documents for a reader`; `restore redirects to the document` (303; the file is back); `a reader cannot restore` (403); `restoring over a new document is refused` (409 `exists`). `e2e/collab.spec.ts` `restore a deleted document` (create `e2e-collab/gone.md`, delete it through Actions, open "Deleted documents", Restore → the document opens and the tree lists it).
- [x] **Step 2: Run** `npx vitest run "src/routes/(app)/[workspace]/-/history"` and the e2e — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — PASS.
- [x] **Step 5: Commit** `feat(app): list and restore deleted documents`.

### Task 15: Public links on the members page

**Files:**
- Modify: `src/routes/(app)/[workspace]/members/+page.server.ts`, `+page.svelte`, `src/lib/ui/FileActions.svelte` ("Public link…" for owners), `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`
- Create: `src/routes/(app)/[workspace]/members/share.test.ts`

**Interfaces:**
- Consumes: `createPublicLink`, `publicLinks`, `setSignupRole`, `revokePublicLink` (Task 5).
- Changes `load`: when the user is owner, adds `publicLinks: PublicLink[]`, `documents: string[]` (every document path of the layout's tree) and `share: url.searchParams.get('share')` (preselected scope); nothing for editors.
- Produces actions (each `requireRole(…, 'owner')` first): `shareCreate` (fields `scope` = `''` for the workspace or a document path, `signup` = `''` | `reader` | `editor`) → `{ shareUrl: url.origin + '/s/' + token }`; `shareSignup` (`id`, `signup`); `shareRevoke` (`id`). A bad `signup` value → 400; a missing document → `fail(404, { shareError: 'missing' })`.
- Page: section `id="public-links"` under the invitations, the spec's Manage list (table like the members table), the one-time URL block reusing the invitation link's readonly input, Copy and once-sentence, Revoke behind a native `<dialog>`.
- i18n: `share.title` Public links / Liens publics · `share.intro` Anyone with a public link can read what it covers, without an account. / Toute personne qui a un lien public peut lire ce qu’il couvre, sans compte. · `share.scope` Covers / Couvre · `share.workspace` Whole workspace / Tout l’espace · `share.signup` Sign-up / Inscription · `share.off` Off / Désactivée · `share.asReader` As reader / Comme lecteur · `share.asEditor` As editor / Comme éditeur · `share.create` Create public link / Créer un lien public · `share.once` This link will not be shown again: copy it now. / Ce lien ne sera plus affiché : copiez-le maintenant. · `share.revoke` Revoke / Révoquer · `share.revokeConfirm` Revoke this link? Visitors lose access at once. / Révoquer ce lien ? Les visiteurs perdent l’accès immédiatement. · `share.empty` No public link. / Aucun lien public. · `files.share` Public link… / Lien public…

- [x] **Step 1: Write the failing tests** in `share.test.ts`: `an owner creates a link shown once` (`shareCreate` → `shareUrl` matching `^http://localhost/s/[A-Za-z0-9_-]{43}$`; a following `load` lists the link and contains no token); `an editor sees and manages nothing` (`load` has no `publicLinks`; each action → `error(403)`); `sign-up can be changed and revoked` (`shareSignup` `reader` then `''`; `shareRevoke` → the list is empty).
- [x] **Step 2: Run** `npx vitest run "src/routes/(app)/[workspace]/members"` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test`, `npm run check` — PASS.
- [x] **Step 5: Commit** `feat(app): manage public links from the members page`.

### Task 16: Public pages and join by link

**Files:**
- Modify: `src/hooks.server.ts` (`/s/` branch), `src/lib/ui/FolderView.svelte` (renders without the drop context for readers)
- Create: `src/routes/s/[token]/+layout.server.ts`, `+layout.ts`, `+layout.svelte`, `+page.server.ts`, `+page.svelte`, `src/routes/s/[token]/[...path]/+page.server.ts`, `+page.svelte`, `src/routes/s/[token]/-/raw/[...path]/+server.ts`, `src/routes/s/public.test.ts`, `src/routes/join/[token]/+page.server.ts`, `+page.svelte`, `src/routes/join/join.test.ts`, `e2e/public.spec.ts`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`

**Interfaces:**
- Changes `handle`: for `pathname` starting with `/s/`: set `locals.locale` as today, `locals.user = null`, `locals.actor = null`, never touch `cookies`; refuse with 429 when `!loginAllowed('share|' + ip, 300)` or `!loginAllowed('share-miss|' + ip)`, then `loginFailed('share|' + ip)`; `resolve`, then set the spec's `/s/` headers on the response (also on 404 and 429). The routes call `loginFailed('share-miss|' + ip)` when `sharedScope` is null.
- Produces: `+layout.server.ts` → `sharedScope(params.token)` or `error(404)`; returns `{ token, workspaceName, path, signup: !!signupRole, slug }` (`slug` only to build the Edit link). `+layout.ts` → `export const csr = false`. `+layout.svelte` → top bar (wordmark as text), `<svelte:head><meta name="robots" content="noindex"></svelte:head>`.
- Produces: `/s/[token]` load: document link → `redirect(302, docHref('s/' + token, path))`; workspace link → `{ nodes: await sharedTree(token) }` rendered with `FolderView` (`workspace = 's/' + token`, `role = 'reader'`, `name = workspaceName`). `/s/[token]/[...path]` load: `.md` → `sharedDocument` → `{ kind: 'doc', title, entries, html: renderHtml(source) }`; otherwise a folder of `sharedTree` (workspace link) or 404. Every `Forbidden` / `InvalidPath` / `ENOENT` → 404.
- Produces: `/s/[token]/-/raw/[...path]` → `sharedFile`; a document gets the members' download headers, an image the image headers.
- Produces: `/join/[token]` like `/invite/[token]`: `load` → `{ link: { workspaceName, role } | null, user }` (null when sign-up is off or the token is unknown); actions `join` (logged in → `joinByLink` → 303 to the document or workspace) and `signup` (logged out; the invite page's validation; `!loginAllowed('join|' + ip)` → `fail(429)`, `loginFailed('join|' + ip)` on every attempt; `joinByLinkAsNewUser`, `startSession`, 303).
- i18n: `public.download` Download / Télécharger · `public.edit` Edit / Modifier · `public.join` Join / Rejoindre · `public.empty` This folder is empty. / Ce dossier est vide. · `join.title` Join {workspace} / Rejoindre {workspace} · `join.as` Join {workspace} as {role} / Rejoindre {workspace} comme {role} · `join.closed` This link does not allow sign-up. / Ce lien ne permet pas de s’inscrire. · `join.tooMany` Too many attempts. Try again later. / Trop de tentatives. Réessayez plus tard. (the invite page's field keys are reused for name, email and password).

- [x] **Step 1: Write the failing tests.** `public.test.ts` (load functions and the raw handler called directly; `handle` called with a stub `resolve` and a `cookies` object whose methods throw): `public responses carry no cookie and noindex` (a `/s/` request through `handle` never touches `cookies`; the response has `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: no-store`, the CSP); `a document link redirects to its canonical URL` (302 `location` `/s/<t>/notes/a.md`); `renders without active content` (a document holding `<script>` → `html` has `&lt;script&gt;`); `a document link answers its own path only` (`notes/b.md` → 404; raw `notes/c.png` → 404; raw `notes/pic.png` → 200 `image/png`); `a workspace link lists folders`; `an unknown token is 404 and throttled` (10 unknown tokens from one IP → the 11th request with a valid token is 429). `join.test.ts`: `sign-up from a link creates a member with the link's role` (303; the user is reader of `demo`; a session cookie is set); `a closed link refuses` (load `link: null`; action → `fail(410)`); `sign-ups are throttled per IP` (11th → 429). `e2e/public.spec.ts`: `a document link shows one document to a stranger` (owner creates a link to a seeded document holding an image on the members page; a new context with no storage state opens it: title and image visible, no `<script` in `page.content()`, response header `x-robots-tag` present, `/s/<t>/<a sibling>.md` → 404; owner revokes → the URL answers 404); `a workspace link lets a visitor browse and join` (owner creates a workspace link with sign-up as reader; the visitor opens a folder, a document, clicks Join, signs up and lands in the workspace with no editor toolbar).
- [x] **Step 2: Run** `npx vitest run src/routes/s src/routes/join` and `npx playwright test e2e/public.spec.ts` — FAIL.
- [x] **Step 3: Implement.** Public document page: the 72ch column, title, frontmatter block like the right rail's File list, `Rendered`, then Download and Edit (secondary) and Join (primary) in one row.
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — PASS; with the built app, `curl -sI http://localhost:4173/s/<token>` shows the headers and no `set-cookie`.
- [x] **Step 5: Commit** `feat(app): public read-only pages and sign-up from a link`.

### Task 17: Inbox page and unread count

**Files:**
- Create: `src/routes/(app)/inbox/+page.server.ts`, `+page.svelte`, `src/routes/(app)/inbox/inbox.test.ts`, `e2e/inbox.spec.ts`
- Modify: `src/routes/(app)/+layout.server.ts` (`unread: unreadCount(user.id)`), `src/lib/ui/Header.svelte` (prop `unread: number`, the Inbox link), the layouts that render `Header`, `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`

**Interfaces:**
- Consumes: `inbox`, `unreadCount`, `markRead` (Task 9).
- Produces: `load` → `{ items: inbox(user.id) }`; action `read` (field `upTo`, a non-negative integer, else 400) → `markRead`, then `{}` (the layout's count refreshes through `invalidateAll` from `use:enhance`).
- Page: the spec's Inbox section; "Mark all as read" (secondary) sends the first item's id; empty state one muted sentence.
- i18n: `nav.inbox` Inbox / Boîte de réception · `inbox.unread` {count} unread / {count} non lu(s) · `inbox.title` Inbox / Boîte de réception · `inbox.new` New / Nouveau · `inbox.empty` Nothing new from your workspaces. / Rien de nouveau dans vos espaces. · `inbox.markRead` Mark all as read / Tout marquer comme lu · `inbox.create` {author} created {path} / {author} a créé {path} · `inbox.update` {author} updated {path} / {author} a modifié {path} · `inbox.move` {author} moved {from} to {path} / {author} a déplacé {from} vers {path} · `inbox.delete` {author} deleted {path} / {author} a supprimé {path} · `inbox.comment` {author} commented on {path} / {author} a commenté {path} · `inbox.join` {author} joined {workspace} / {author} a rejoint {workspace}.

- [x] **Step 1: Write the failing tests.** `inbox.test.ts`: `lists others' events with unread state`; `mark all as read clears the count` (`unreadCount` 0 after the action); `a bad cursor is 400`. `e2e/inbox.spec.ts` `the inbox counts an agent's drop` (on the Connect page create a script token `e2e-inbox`; `page.request.put` a document `e2e-inbox/report.md` with it; reload → the header reads "Inbox 1"; the inbox lists "Owner created e2e-inbox/report.md" with "via e2e-inbox"; Mark all as read → the header reads "Inbox").
- [x] **Step 2: Run** `npx vitest run "src/routes/(app)/inbox"` and `npx playwright test e2e/inbox.spec.ts` — FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — PASS.
- [x] **Step 5: Commit** `feat(app): inbox and unread count`.

### Task 18: Reviews, decisions, architecture

**Files:**
- Modify: `docs/project/decisions.md`, `docs/project/architecture.md`, `docs/plans/roadmap.md`, `docs/project/handoff.md`, `DESIGN.md` (new components: comments, search box and results, version view, public page, inbox line), any file a review fixes

- [x] **Step 1: Reviews.** `review-ui` on the comments section, version view, search box and results, deleted documents, members public-links section, public document and folder pages, join page and inbox (1280 px and 390 px, FR and EN, keyboard only; the sign-up form and the revoke dialogs get the dark-pattern and consent checks at High). `impeccable-finish-reviewer` on the public document page and the inbox (new surfaces); apply material fixes. Copy pass on every new French string (« », non-breaking spaces, no capital on each word). `/code-review` and `ponytail-review` on the branch diff. Fix High findings, ledger the rest in the handoff.
- [x] **Step 2: Decisions** (append to `decisions.md`): `2026-10-19 — Public pages rendered on the server and sanitised` (choice: remark-rehype + rehype-sanitize + rehype-stringify, raw HTML shown as code, public pages without JavaScript under a strict CSP; rejected: the editor in read-only mode (ships the editor to visitors, keeps `javascript:` hrefs live); reopen if the two renderings drift visibly); `2026-10-19 — Images in the document's folder, served at their natural URL` (choice: `<doc>-<8 hex>.<ext>`, PNG/JPEG/GIF/WebP checked by signature, SVG refused, `reroute` to the raw routes, image-like folder names refused; rejected: `<doc>.assets/` folders (fill the tree), SVG sanitising (a dependency, a script-capable format); reopen if users need SVG or image management); `2026-10-19 — Public links under /s/, cookie-free; sign-up at /join/` (why: a public page can never act as a member or leak a session; the token stays out of referrers); `2026-10-19 — Inbox on one cursor per user; joins as invitation events` (rejected: per-event read flags, a notifications table; reopen when email digests need per-event state); `2026-10-19 — Image paste through Crepe's upload plugin` (it inserts the plain image node when `ImageBlock` is off, so the 2026-10-18 reopen condition did not trigger).
- [x] **Step 3: Architecture.** Core module list (`comments`, `search`, `images`, `publicLinks`, `inbox`, restore in `documents`), routes (`/<ws>/-/search`, `/<ws>/-/history`, `/<ws>/-/images`, `/inbox`, `/s/…`, `/join/…`, the `reroute` hook), invariant 2 (`.inkmesh` reachable only through `comments.ts` and move, delete, restore), the rendering rule (`{@html}` only from `renderHtml`), the public-link headers and limits. Roadmap: M5 status. Handoff: before deploying, `sqlite3 ~/inkmesh-data/inkmesh.db "select slug from workspaces where slug in ('inbox','join')"` returns nothing and no folder name in production ends in an image extension (`find ~/inkmesh-data/workspaces -type d -iregex '.*\.\(png\|jpe?g\|gif\|webp\)'`).
- [x] **Step 4: Run** `npm test`, `npm run check`, `npx playwright test` — all green; record the counts.
- [x] **Step 5: Commit** `docs: milestone 5 decisions, architecture and design`.
