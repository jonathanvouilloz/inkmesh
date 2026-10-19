# Milestone 5 — Collaboration (spec)

Updated: 2026-10-19. Implements PRD items 5 (image paste), 9 (history restore), 10 (full-text search), 11 (comments), 12 (public links) and the in-app part of 13 (inbox). Architecture of record: `docs/project/architecture.md`; this spec only fixes what that document leaves open for this milestone. Milestones 3 (`createFolder`, `importDocument`, `movePath` with link rewriting, `linksTo`, `deletePath`, folder view, `FileActions`, `drop.ts`) and 4 (events and `changes`, editing sessions and `flushSessions`, agents, `agent-api.ts` with `ops`, `toApiError`, `requireAgent`, `mcp.ts` with `mcpServer`, `/api/v1`, `/mcp`, the origin check in `handle`) are assumed merged.

## Goal

A teammate opens a report an agent dropped, pastes a screenshot into it, leaves a comment, and the agent reads that comment on its next run. Jon finds any document by a word in it, restores last week's version or a deleted file in two clicks, and sends a client a read-only link to one document that shows nothing else of the workspace. Every member sees, in an inbox, what others (people and agents) did since their last look.

## Scope

1. Comments: one thread per document, stored in the workspace, readable and writable by humans, the API and MCP; resolve and reopen.
2. Public links: read-only link to a document or a workspace, optional sign-up with a chosen role, revocable by an owner.
3. History restore: open and restore a previous version of a document; list and restore deleted documents.
4. Full-text search: one SQLite FTS5 index, same results in the header search, the API and MCP.
5. Image paste and drop in the editor, stored next to the document, served through role-checked and link-checked routes.
6. In-app inbox: events of the member's workspaces caused by others, unread count in the header, mark all as read.

Out of scope: see the last section.

## Decisions taken before this spec (not reopened)

Comments live in `.inkmesh/comments/<document path>.md`, one `## ` section per comment with author and timestamp, versioned with the workspace, not anchored; readers comment; the full-text index is a cache rebuilt at startup and updated on every `core` write, never authoritative; public links are random tokens stored hashed, read-only, without the editor, revocable by an owner, sign-up from a link off by default; images live next to the document; Crepe's `ImageBlock` stays disabled; uploads are images only, extension and content checked, size capped; the inbox reads the M4 events table; agents get every capability the day humans do.

## Decisions made by this spec

- **Server-side rendering for public pages and old versions: remark-rehype + rehype-sanitize + rehype-stringify**, not the editor in read-only mode. The public page then works without JavaScript and ships no editor bundle to visitors (phones, slow links), and it can run under `script-src 'none'`. The editor in read-only mode would also render `javascript:` link URLs as live `href`s (Milkdown's link mark copies the URL as written). Three new runtime dependencies: `remark-rehype@^11.1.2`, `rehype-sanitize@^6.0.0`, `rehype-stringify@^10.0.1` (all from the unified collective, which already provides the parser). Raw HTML is never passed through: `html` nodes become code (block) or inline code before `remark-rehype`, so they show as their source, like in the editor. `rehype-sanitize` runs with its default (GitHub) schema: it drops non-allowed protocols (`javascript:`, `data:`, `vbscript:`) and attributes and prefixes ids.
- **Members keep the editor.** The reader's read-only editor is unchanged in M5; only public pages, the version view and comment bodies use `renderHtml`.
- **Image naming: same folder, `<document base name>-<8 hex>.<ext>`** (`notes/report.md` gets `notes/report-3f9a1c2e.png`), referenced as `![<file name without extension>](report-3f9a1c2e.png)`. Rejected: a `<doc>.assets/` folder, because `listTree` shows every folder and the tree would fill with asset folders; images never appear in the tree (only `.md` files do). Moving a document moves the link (M3 rewriting), not the image.
- **SVG is refused**, not sanitised (sanitising SVG needs a dependency and still leaves a script-capable format on the origin). Accepted: PNG, JPEG, GIF, WebP, at most 5 MiB.
- **Insert a plain image node in Crepe through its upload plugin.** With `ImageBlock` off, Crepe already registers `@milkdown/plugin-upload` and its uploader inserts `schema.nodes.image` (the plain node) with a `blob:` URL. The editor overrides `uploadConfig` with an uploader that POSTs the file and inserts `image.createAndFill({ src, alt })`. `@milkdown/kit@7.22.3` becomes a direct dependency at the exact version Crepe pins (already installed; no new package).
- **Images are served at their natural URL.** A relative image URL in `/demo/notes/report.md` resolves to `/demo/notes/report-3f9a1c2e.png`; the `reroute` hook (`src/hooks.ts`) sends image paths under a workspace or a public link to the matching raw route. No URL rewriting in documents or in the editor. `assertFolderName` also refuses folder names ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, so a path with an image extension is never a folder.
- **Public routes live under `/s/<token>/…` and never read the session cookie.** `handle` returns before the cookie lookup on `/s/` paths, so no `Set-Cookie` can come back from them. A document link's canonical URL is `/s/<token>/<document path>` (`/s/<token>` redirects there) so relative images and links resolve inside the link. Sign-up from a link is a separate route, `/join/<token>`, outside `/s/`, because it creates a session.
- **The workspace history page lists deleted documents only.** Recent activity is the inbox.
- **Inbox: one global cursor per user**, an event id (ids are global and monotonic). A user without a cursor gets the current highest id on first read, so joining a workspace does not flood the inbox with its past. The inbox uses the M4 exclusion rule: a human sees their own agents' changes, not their own.
- **Invitations in the inbox are `join` events** ("Ann joined Demo"): M2 invitations are links, not addressed to anyone, so the observable fact is the join (by invitation or by public link).
- **Resolving a comment commits but appends no event** (state change, visible in the thread and in git); adding one appends a `comment` event. Readers may add, resolve and reopen.
- **Search is per workspace.** The header box searches the current workspace; agents name the workspace like every other call.
- **Public links follow a moved document** (their stored path is updated in the same `movePath` call); a deleted document's link answers 404 until the document is restored.

## Data (migration `003-collaboration`)

```sql
-- The M4 CHECK on events.type cannot be altered: rebuild, keeping ids and the AUTOINCREMENT sequence.
CREATE TABLE events_new (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id INTEGER REFERENCES users ON DELETE SET NULL, author TEXT NOT NULL, agent TEXT,
  type TEXT NOT NULL CHECK (type IN ('create','update','move','delete','comment','join')),
  path TEXT NOT NULL, from_path TEXT, commit_hash TEXT, at TEXT NOT NULL);
INSERT INTO events_new SELECT * FROM events;
UPDATE sqlite_sequence SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'events') WHERE name = 'events_new';
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
```

- `join` events have `path = ''`. A `comment` event's `path` is the document's path and `commit_hash` the comment's commit.
- `search_index` is a cache: emptied and refilled by `rebuildIndex()` at every start; deleting it loses nothing. Node 24's bundled SQLite has FTS5 (checked on v24.21.0, `remove_diacritics 2` makes `cafe` match `café`).
- Public link tokens: `newToken()` (32 random bytes base64url, 43 chars), stored as `hashToken(token)`, shown once.

## Comment files

Path: `<workspace>/.inkmesh/comments/<document path>` (the document `notes/a.md` has its thread in `.inkmesh/comments/notes/a.md`). Created on the first comment. Hidden from the tree, the folder view, search and every document function (`resolveInside` rejects `.inkmesh`); reached only through `comments.ts`, which resolves it with `resolveInside(root, rel, { inkmesh: true })` (same symlink rules, `.inkmesh` allowed as the first segment only).

Grammar:

```
file     = preamble section*
preamble = any lines before the first heading line; kept byte for byte, not a comment
section  = heading LF body
heading  = "## " author " · " at [ " · resolved" ] [spaces] EOL
           regex: ^## (.+) · (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z)( · resolved)?[ \t]*\r?$
author   = the commit author name: "Ann Keller" or "Jon via claude"
at       = ISO 8601 UTC; it is also the comment's id, unique in the file
body     = every line up to the next heading line, leading and trailing blank lines dropped; Markdown
```

Example:

```markdown
## Ann Keller · 2026-10-19T14:22:33.120Z

The Q3 row is missing from the second table.

## Jon via claude · 2026-10-19T15:01:02.004Z · resolved

Added Q3 from `reports/q3.md`.
```

- **Add**: body trimmed, CRLF → LF, 1–10 000 characters (`InvalidContent('empty')` / `InvalidContent('too-large')`); a body line that matches the heading regex is written with a leading backslash (`\## …`, which Markdown renders as `## …`); `at = new Date().toISOString()`, plus 1 ms while a comment with that id exists; appended as `\n## <author> · <at>\n\n<body>\n` after making sure the file ends with a newline. Commit `Comment on <p>`; event `comment`.
- **Resolve / reopen**: adds or removes ` · resolved` on that heading line only; every other byte is unchanged. Commit `Resolve comment on <p>` or `Reopen comment on <p>`; no event. Unknown id → 404.
- A file edited by hand is read as written: a heading that does not match the grammar is body text of the previous comment (or preamble). Two comments with the same id: the first one is resolved.
- **Follows its document**: `movePath` renames `.inkmesh/comments/<from>` (file, or folder for a folder move) to `.inkmesh/comments/<to>` in the same commit; `deletePath` moves it to the trash with the document, in the same commit; `restoreDeleted` brings it back with the document.

## Images

- **Upload** `POST /<ws>/-/images` (cookie session, editor, same-origin check of M4 applies): multipart fields `doc` (the document's path) and `file`. Checks, in order: the document exists; size ≤ `MAX_IMAGE_BYTES = 5 * 1024 * 1024` (413); the file name's extension is `png`, `jpg`, `jpeg`, `gif` or `webp` (case-insensitive) and the first bytes are that format's signature (PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; GIF `GIF87a` or `GIF89a`; WebP `RIFF` at 0 and `WEBP` at 8) — otherwise 400. Stored as `<doc dir>/<doc base>-<8 hex>.<ext>` (`jpeg` stored as `jpg`) with an exclusive write, committed at once as `Add image <p>` by the actor. No event, not indexed. Answer 201 `{ "path": "notes/report-3f9a1c2e.png", "src": "report-3f9a1c2e.png", "alt": "<file name without extension>" }`.
- **Serve**: `GET /<ws>/-/raw/<path>` (existing route) serves an image path through `readImage` (reader): the extension and the signature must agree, else 404. Headers: `content-type` from the detected format, `x-content-type-options: nosniff`, `content-security-policy: default-src 'none'`, `cache-control: private, max-age=0, must-revalidate`. Public links: `GET /s/<token>/-/raw/<path>`, same checks plus the link's scope.
- **Reroute** (`src/hooks.ts`, runs on server and client):
  - `^/(?!api/)([a-z0-9][a-z0-9-]{1,39})/(?!-/)(.+\.(?:png|jpe?g|gif|webp))$` (case-insensitive) → `/$1/-/raw/$2`
  - `^/s/([A-Za-z0-9_-]{43})/(?!-/)(.+\.(?:png|jpe?g|gif|webp))$` (case-insensitive) → `/s/$1/-/raw/$2`
  - anything else unchanged.
- An image no document references any more stays on disk (and in git). Deleting a document does not delete its images.

## Search

- `search_index` holds one row per document: `workspace`, `path`, `title` (first `# ` heading, else the file name without `.md`, the `listTree` rule), `body` (the whole file, frontmatter included). Non-UTF-8 files are skipped.
- Updated inside the `core` write that changed the files, after its commit (or after the disk write for an editor autosave): `writeDocument`, `createDocument`, `importDocument`, `movePath` (old prefix removed, new paths and every rewritten document reindexed), `deletePath` (prefix removed), `restoreVersion`, `restoreDeleted`. `rebuildIndex()` at start covers files changed outside `core` (an agent with shell access). An index failure is logged and never fails the write.
- Query: the text is split on white space, each term stripped of `"` and wrapped as `"term"*`, at most 10 terms, ANDed. An empty query returns nothing. A term is a prefix: `rep` finds `report`.
- Results: at most 20, best first (`ORDER BY rank`), each `{ path, title, snippet }`; the snippet is FTS5 `snippet(search_index, 3, '\u0002', '\u0003', '…', 12)`. The UI turns the markers into `<mark>` by splitting the string (never `{@html}`); the API and MCP strip them.
- Role: `reader` of the workspace; a non-member gets 404 like everywhere else.

## Public links

- **Manage** (owners only, members page, section "Public links"): list (scope: "Whole workspace" or the document path in mono; sign-up: Off, Reader, Editor; created by and date), "New public link" (scope select of "Whole workspace" and every document path; sign-up select, Off by default) → the URL `<origin>/s/<token>` shown once with Copy; a sign-up select with Save per link; Revoke with a confirmation. `FileActions` gets "Public link…" for owners, a link to `/<ws>/members?share=<path>#public-links` that preselects the document.
- **Visit** (no account, no session):
  - `GET /s/<token>`: unknown or revoked token → 404. A document link → `302` to `/s/<token>/<document path, segments encoded>`. A workspace link → the root folder listing.
  - `GET /s/<token>/<path>`: a document link answers only its own path (any other → 404). A workspace link answers any document (rendered) or folder (listing, folders first, then documents with title and last change, like the folder view without actions).
  - `GET /s/<token>/-/raw/<path>`: the `.md` download (same headers as the members' download) or an image. A document link serves its own `.md` and the images its document references (relative image URLs and image reference definitions resolved against the document's folder); nothing else. A workspace link serves any document or image.
  - A rendered document page: a 44px top bar with the wordmark (not a link to the app home), the document title, the frontmatter block (`frontmatterEntries`), the sanitised HTML, and three actions: "Download" (raw link), "Edit" (a plain link to `/<ws>/<path>`; the app's login redirect does the rest), and "Join" (only when sign-up is on, to `/join/<token>`). A workspace link adds a breadcrumb of folder links inside the link.
- **Join** `/join/<token>` (a page like `/invite/[token]`): unknown token, revoked link or sign-up off → "This link does not allow sign-up". Logged out: name, email, password → creates the account and the membership with the link's role, opens a session, redirects to the document (document link) or the workspace. Logged in: one button "Join <workspace> as <role>"; an existing member's role is raised, never lowered (same rule as invitations). Each join appends a `join` event. Every sign-up attempt counts against `join|<ip>` (10 per 15 minutes, then 429).
- **Every `/s/` response** (set in `handle`): `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer` (the token is in the URL), `cache-control: no-store` (revocation is immediate), `x-frame-options: DENY`, and `content-security-policy: default-src 'none'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. Pages under `/s/` set `csr = false` (no JavaScript) and carry `<meta name="robots" content="noindex">`.
- **Rate limits** (the M2 in-memory throttle, generalised with a `max` argument): every `/s/` request counts against `share|<ip>` (300 per 15 minutes); an unknown token also counts against `share-miss|<ip>` (10 per 15 minutes). Over either → 429 with no body detail.

## History restore

- **Version view** `/<ws>/<path>?v=<commit>`: the document as it was at that commit, rendered with `renderHtml`, read-only, under a line "Version of {date} by {author}" (from the history entry, or the short hash when it is older than the 20 listed), with "Back to the current version" and, for editors, "Restore this version". The right rail's History entries become links to their version.
- **Restore a version** (action `restore`, field `commit`, editor): `restoreVersion` flushes the editing sessions on that path (another author's open session is committed first, under their name), writes the old bytes, commits `Restore <p> to <short hash>` (7 characters), appends an `update` event, reindexes. Same bytes as now → no commit. The page redirects to the document; an open editor elsewhere gets the M1 conflict state on its next save.
- **Deleted documents** `/<ws>/-/history` (every member; restore for editors): documents deleted from the workspace (renames excluded, already restored excluded), newest first, at most 200 delete commits scanned: path (mono), deleted by, when, "Restore". `restoreDeleted` takes the bytes from the parent of the commit that deleted the path (and the comment file from the same commit, when it existed), refuses with `Conflict` when something exists at that path now, commits `Restore <p>`, appends a `create` event, reindexes. A left-rail link "Deleted documents" sits under Members.
- Commit hashes are validated as `^[0-9a-f]{7,40}$`; anything else is a 400.

## Inbox

- `/inbox` (signed in, outside any workspace): the 50 latest events of the user's workspaces not caused by the user (M4 rule: same `user_id` and no agent), newest first, one line each: "{author} commented on {path}", "{author} created / updated / deleted {path}", "{author} moved {from} to {path}", "{author} joined {workspace}"; `via {agent}` in mono when an agent acted; workspace name; relative time in mono. Lines whose id is above the cursor are unread: the whole line at 600 weight with the visually hidden word "New". Document lines link to the document (comments to `#comments`); deleted documents link to `/<ws>/-/history`.
- "Mark all as read" (form action) sets the cursor to the highest event id listed. No per-event read state.
- Header: an "Inbox" link before the user menu, with the unread count in the label ("Inbox 3", `aria-label` "Inbox, 3 unread"; nothing after "Inbox" at 0; "99+" above 99). Counted in the `(app)` layout load, one capped SQL count.

## HTTP API (additions)

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/v1/workspaces/{ws}/search?q={text}` | `q` 1–200 characters | 200 `{ "results": [{ "path", "title", "snippet" }] }` | 400, 401, 404 |
| `GET /api/v1/workspaces/{ws}/comments/{path}` | — | 200 `{ "comments": [{ "id", "author", "at", "resolved", "body" }] }` (oldest first; `[]` without a thread) | 400, 401, 404 (document missing) |
| `POST /api/v1/workspaces/{ws}/comments/{path}` | JSON `{ "body": string }` | 201 `{ "comment": { … } }` | 400 (bad JSON, empty), 401, 404, 413 (> 10 000 characters) |

`toApiError` gains: any `InvalidContent` other than `too-large` → 400 `bad_request`. A reader's agent may comment. `changes` now returns `comment` and `join` events (`join` with `"path": ""`).

## MCP tools (additions)

| Tool | Input (zod) | Output (text content, JSON) | Annotations |
|---|---|---|---|
| `search` | `{ workspace, query }` | `{ results: [{ path, title, snippet }] }` | readOnly |
| `read_comments` | `{ workspace, path }` | `{ comments: [{ id, author, at, resolved, body }] }` | readOnly |
| `add_comment` | `{ workspace, path, body }` | `{ comment }` | — |

`query`, `path`, `workspace` are `z.string().min(1)`; `body` is `z.string().min(1).max(10000)`. The server instructions gain one sentence: "Comments on a document are read with read_comments and added with add_comment."

## Interface

New surfaces: comments section under the document, version view, deleted-documents page, search box and results page, public link section on the members page, public pages (document, folder), join page, inbox page and header link. All under `DESIGN.md`: Inter for prose, Fragment Mono for paths, hashes, timestamps and agent names, one accent, no eyebrow, no badges (the unread count is text), no cards. Specifics:

- **Comments** (`id="comments"`, under the editor, same 72ch column): a label-weight heading "Comments", open comments oldest first (author in Inter, `via agent` and time in mono muted, the body rendered with `renderHtml` at 15px), each with a secondary "Resolve"; resolved comments collapsed in a `<details>` "{count} resolved" with "Reopen"; then a textarea (label "Add a comment") and a secondary "Comment" button. Readers see the form too. Empty state: one muted sentence.
- **Search**: a `role="search"` form in the top bar of workspace pages (input labelled "Search this workspace", 200px, grows to 280px on focus from 1024px; on phones the field is under the top bar in the left drawer). Results page `/<ws>/-/search?q=`: the query in the title ("Results for {q}"), one row per hit: title as accent link, path in mono muted, snippet with `<mark>` (panel fill, ink text, no colour), "No document contains {q}." when empty. Works without JavaScript (GET form).
- **Version view**: replaces the editor area; the file strip shows the path and "Version {short hash}" in mono; the line and the two actions sit above the rendered document; Restore is the only primary button of the screen, behind a native `<dialog>` confirmation ("Restore this version? The current text stays in the history.").
- **Deleted documents**: a list page in the workspace shell, table like the members page (path mono, deleted by, when mono, Restore secondary).
- **Public pages**: no rails; the 72ch document column; Download and Edit secondary, Join primary when present.
- **Image paste**: a failed upload (too large, not an image, network) is announced in the file strip's live region ("Image not added: {reason}") in error red, and nothing is inserted.

i18n: every string in `en` and `fr` (French with « » and non-breaking spaces before `:` `;` `?` `!`). Key families: `comments.*`, `search.*`, `version.*`, `deleted.*`, `share.*` (members section), `public.*` (visitor pages), `join.*`, `inbox.*`, `image.*`, `nav.inbox`, `nav.deleted`, `files.share`.

## Security rules

- **Scope of a public link** is checked in `core` (`publicLinks.ts`), never only in the route: a document link reads one document, its `.md` and the images it references; a workspace link reads that workspace only. Paths go through `resolveInside`; `.git` and `.inkmesh` stay unreachable, so comments are never public.
- **Public responses** never set or read a cookie, carry `noindex`, `no-referrer`, `no-store`, the CSP above, and contain no JavaScript.
- **Rendering**: no raw HTML reaches the output; URLs are filtered by `rehype-sanitize`'s protocol allow-list; the HTML is produced only on the server and inserted with `{@html}` only from `renderHtml`'s return value.
- **Images**: extension and signature must agree on upload and on every serve; SVG and everything else refused; `nosniff`; size cap; exclusive writes with random names (no overwrite).
- **Comments** are written only through `comments.ts`; the body cannot forge another comment's heading.
- **Roles**: comment and search `reader`; image upload, restore `editor`; public links `owner`. Join by link grants at most `editor`.
- **Reserved slugs**: `inbox` and `join` join the reserved list. Before deploying, check that no production workspace uses them.
- **Rate limits**: `share|<ip>` 300 / 15 min, `share-miss|<ip>` 10 / 15 min, `join|<ip>` 10 / 15 min. In memory, per process (M2 shortcut).

## Testing

- Unit: migration (events rebuilt with ids and sequence kept, new tables, FTS5 available); comment grammar (parse, append, escape, resolve keeps bytes, hand-edited files); comments follow move, delete, restore; search (diacritics, prefix, role, every writer keeps the index current, rebuild, syntax characters in the query); `renderHtml` (raw HTML, `javascript:` and `data:` URLs, event-handler attributes, tables and task lists still render); images (signature matrix, SVG, size, naming, serve check); public link scope matrix (document vs workspace link, siblings, unreferenced image, traversal, revoked, moved document); join (role raise, sign-up off, throttle); inbox (exclusion, cursor initialisation, unread cap, mark read); restore (version, deleted, comment file restored, conflict, session flushed first); API and MCP rows of the tables above.
- E2E: comment from the UI then read it through the API; paste an image into the editor and see it rendered after reload; search from the header; restore a version and a deleted document; public document link in a cookie-less context (renders, no sibling reachable, revoked → 404); join from a link; inbox count changes after another user's edit.

## Out of scope for this spec

Inline (anchored) comments, mentions and threads inside a thread; resolving comments through the API or MCP; email of any kind (M6); per-event read state; cross-workspace search; search in comments or in old versions; history and restore through the API or MCP; public links with expiry or a password; analytics on public links; image resizing, thumbnails, SVG; a picker button for images (paste and drop only; the raw Markdown mode accepts no paste); garbage collection of unreferenced images; restoring a deleted folder as one unit (each document is restored on its own); rendering raw HTML.
