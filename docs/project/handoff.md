# Handoff — inkmesh
Updated: 2026-10-20

## Where we are
Milestones 3 (managing files), 4 (agents) and 5 (collaboration) are merged into `main` and deployed (2026-10-20). 404 unit tests, 80 Playwright e2e, svelte-check clean.
- M3: folder view, import, new folder, rename, move (links follow), delete, download.
- M4: events, one commit per editing session, agents and bearer tokens, OAuth 2.1, HTTP API `/api/v1`, remote MCP `/mcp`, the Connect page.
- M5: comments (UI, API, MCP), full-text search (header box, API, MCP), image paste and drop, version view and restore, deleted documents and restore, public links (document or workspace, optional sign-up at `/join/`), inbox with unread count. Migrations `003-collaboration` and `004-link-hint`.
- Plans: `docs/plans/2026-10-19-m*.md`. Order of the rest: `docs/plans/roadmap.md`.
- The dev folder is still `comd` (symlink `~/personal-projects/inkmesh -> comd`).

## In production (phase A, milestone 5)
- Checkout `~/inkmesh-app` on `main` (`cccdf1d`), data `/home/hermes/inkmesh-data` (migrations 001–004 applied), env `~/.config/inkmesh/env`, units `inkmesh` and `inkmesh-tunnel`. URL: `scripts/tunnel-url.sh`. Deploy: `bash ~/inkmesh-app/scripts/deploy.sh` after merging into `main` (its origin is the dev repo). Guide: `docs/deploy.md`.
- Before each deploy: copy `~/inkmesh-data` to `~/inkmesh-backups/<UTC>-<label>` and start `build/` on a copy of the data (another port) to run new migrations first. Pre-M5 backup: `~/inkmesh-backups/20261020T024132Z-pre-m5`.

## Next action
1. Milestone 6 (frontmatter filters, email and magic links, Dockerfile, README, licence): write its spec and plan.

## Owner actions (Jon)
- Test the real clients from the Connect page (Claude web connector, Claude Code `claude mcp add`, ChatGPT developer mode, Cursor `mcp.json`): connected, consent shows the right host, `list_workspaces`, `create_document`, `search` and `add_comment` work, commits read "Jon via <agent>". Fix any recipe wording that no longer matches the vendor menus.
- Rename the dev folder when no session runs in it; confirm MIT; register `inkmesh.ch` (phase B of `docs/deploy.md`).

## Known limits (deliberate, ledgered in reviews)
- Rate limits and the write lock are in memory (one process). Connector egress IPs are shared: registration 100 and token failures 50 per 15 min per IP; a valid token is never throttled.
- OAuth: no refresh-token reuse detection (RFC 9700 §4.14.2); an abandoned consent leaves a never-connected agent in the list; a revoked agent's client is pruned after 24 h, so a connector that cached its client id must be re-added; no CORS on the OAuth endpoints (browser agents out of scope).
- Editor sessions: a failed idle commit waits for the next flush, leave or restart; the leave beacon renders a page for nothing.
- UI: in the members public-links table a long document path wraps at hyphens at 1280 px (narrow first column); phone buttons are about 30 px tall (project-wide convention, under 44 px); the import status line has no dismiss; no screen-reader run yet; the editor (Crepe) toolbar strings are English.
- Navigation: the header unread count refreshes only on a full page load; in-document `#section` links no longer jump in the editor (heading ids are prefixed `user-content-`) and rendered HTML has no heading ids.
- History: a small document moved and heavily rewritten by link relocation can fall under git's rename threshold and be listed as deleted (restoring it duplicates it); a failed `restoreDeleted` can leave empty folders; a well-formed but unknown or ambiguous commit id answers 404.
- Comments: a move overwrites a stray thread file already at the destination (only possible outside `core`; it stays in git).
- Images: no size check on serve (only a shell can plant a large file); the upload's document check runs outside the write lock (worst case an orphan image); alt text keeps control characters from the file name; upload failures other than 400 and 413 read "the connection failed"; unreferenced images are never removed.
- Public links: a document link serves embedded images and image definitions, not inline links to an image (`[x](pic.png)` answers 404); sign-up from a document link grants a workspace-wide role (spec); public pages may load third-party `https:` images, which see the visitor's IP; revoking an unknown id succeeds silently; a re-join by a member appends a `join` event; the bare `/s/` path shows the generic error page; the `/join/` page's token check is not throttled (the sign-up is).
- Public links: `dropLinks` runs before the commit or move, so a failed write still loses the links of a deleted document at that path (fails toward privacy).
- Rendering: footnote ids can repeat when several rendered blocks share a page (comments and the version view), so a footnote link may jump to the wrong block.
- `/login?next=/join/<token>` lacks the `no-store`, `noindex` and `same-origin` referrer headers that `/join/` has.
- `SearchForm` (`value={q}`) and the comment textarea (`value={…}`) still use the pattern that hydration resets.
- Search: snippets can run a heading into the next paragraph (no separator in the indexed text); the results page title has no app suffix; footnote labels in rendered HTML are English.
- Design lows not done: the viewed version is not marked in the History rail; the resolved-comments `<details>` uses the browser's triangle, not the tree chevron; at 1280 px a document path in the public-links table wraps at hyphens.
- Test gaps: no route tests for name checks (and `scripts/admin.ts` does not check names); no reader-role search test; no `unreadCount` test for a removed workspace; no e2e for an unsafe image (unit-tested); e2e leaves `demo/e2e-xss/link.md` (the data directory is wiped per run).
- Carried over: no email (forgotten password = `npm run admin -- reset-password <email>`); HTML blocks render as source.

## Known traps
- Never bypass `core` for disk, git or database access; every path goes through `resolveInside`; every document function takes an `actor` and calls `assertRole` first. `writeDocument` is the editor autosave only and refuses an agent actor; agents write through `importDocument`.
- A new `core` write that puts a document at a path must drop the public links on it (`dropLinks` in `documents.ts`), call `syncIndex` after its commit, and carry the comment thread when it moves or removes a document.
- `src/lib/server/csrf.ts` replaces SvelteKit's origin check (`trustedOrigins: ['*']` in `vite.config.ts`); `isAgentPath` both exempts the agent endpoints and `/unsubscribe/` (one-click unsubscribe posts from mail clients) and makes `handle` skip the session cookie there. Keep them in one predicate. A page that posts a form must not send `no-referrer` (the browser then sends `Origin: null`).
- adapter-node 6 bakes `paths.origin` at build time and ignores `ORIGIN`; without `X-Forwarded-Proto` it assumes `https`, so plain-http form posts fail the origin check (local captures need the header or `vite preview`).
- Hydration resets inputs rendered with `value={…}`: use `defaultValue` (or `bind:value`) on any prefilled field (decision 2026-10-20).
- SvelteKit answers `__data.json` under `/s/` too, with the same load, scope and headers: any data a `/s/` load returns is public.
- Dev builds and e2e must never run in `~/inkmesh-app`; the e2e `webServer` rebuilds `build/` in the dev tree. E2e runs on one worker in alphabetical order; `zz-account.spec.ts` stays last. Each spec works in its own folder; shared state it creates (public links) is cleaned in `afterEach`, since another spec counts it. Typing into a page that is still hydrating needs `waitUntil: 'networkidle'` first.
- `systemctl --user disable <unit>` removes a linked unit file; re-enable with the absolute path under `~/inkmesh-app/deploy/`.
- Crepe must run with `ImageBlock` disabled; `patchMarkdown` works on top-level blocks.
- Asking for a sign-in link costs a known address two SQLite writes and an unknown one none: a small timing difference the throttles (3 per address, 10 per IP per 15 minutes) make hard to measure. Keep any new work on that path equal for both.
- `SMTP_URL=memory:` keeps every message in the in-process `outbox` without bound: tests only, never a running server.
