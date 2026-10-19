# Handoff — inkmesh
Updated: 2026-10-19

## Where we are
Milestones 3 (managing files) and 4 (agents) are merged into `main` locally; nothing is pushed or deployed. 276 unit tests, 63 Playwright e2e, svelte-check clean.
- M3: folder view, import by drag and drop or picker, new folder, rename, move (links follow the move in the same commit), delete (recoverable from git history), download.
- M4: events table; one commit per editing session (persisted, committed on leave, idle 60 s, other author, start and shutdown); agents and bearer tokens; OAuth 2.1 (DCR, PKCE S256, rotating refresh, consent screen); HTTP API `/api/v1`; remote MCP `/mcp` (`@modelcontextprotocol/server` 2.3.1); "Connect an agent" page at `/<ws>/-/connect`.
- Plans: `docs/plans/2026-10-19-m3-files.md`, `docs/plans/2026-10-19-m4-agents*.md`. Order of the rest: `docs/plans/roadmap.md`.
- The dev folder is still `comd` (symlink `~/personal-projects/inkmesh -> comd`).

## In production (phase A, still milestone 2)
- Checkout `~/inkmesh-app` on `main` at the M2 deploy, data `/home/hermes/inkmesh-data`, env `~/.config/inkmesh/env`, units `inkmesh` and `inkmesh-tunnel`. URL: `scripts/tunnel-url.sh`. Deploy: `bash ~/inkmesh-app/scripts/deploy.sh` (after pushing or pulling `main` into that checkout). Guide: `docs/deploy.md`.

## Next action
1. Milestone 5 plan `docs/plans/2026-10-19-m5-collaboration.md` (spec beside it). Start with Task 0: `javascript:` links are clickable in the editor today (stored XSS between members) — it should ship before more people are invited.
2. Then milestone 6 (frontmatter filters, email and magic links, Dockerfile, README, licence): plan not written yet.

## Owner actions (Jon)
- Before deploying M3+M4: check that production has no workspace named `oauth` (reserved now; M5 will also reserve `inbox`, `join`, `s`): `sqlite3 ~/inkmesh-data/inkmesh.db "select slug from workspaces"`. Run migration `002-agents` on a copy of the prod database first (it only creates tables).
- Approve the deploy; then test the real clients from the Connect page (Claude web connector, Claude Code `claude mcp add`, ChatGPT developer mode, Cursor `mcp.json`): connected, consent shows the right host, `list_workspaces` and `create_document` work, commits read "Jon via <agent>". Fix any recipe wording that no longer matches the vendor menus.
- Unchanged from before: rename the dev folder when no session runs in it; confirm MIT; register `inkmesh.ch` (phase B of `docs/deploy.md`).

## Known limits (deliberate, ledgered in reviews)
- Rate limits and the write lock are in memory (one process). Connector egress IPs are shared: registration 100 and token failures 50 per 15 min per IP; a valid token is never throttled.
- OAuth: no refresh-token reuse detection (RFC 9700 §4.14.2); an abandoned consent leaves a never-connected agent in the list; a revoked agent's client is pruned after 24 h, so a connector that cached its client id must be re-added; no CORS on the OAuth endpoints (browser agents out of scope).
- Editor sessions: a failed idle commit waits for the next flush, leave or restart; the leave beacon renders a page for nothing.
- UI: phone buttons are about 30 px tall (project-wide convention, under 44 px); the import status line has no dismiss; no screen-reader run yet; the editor (Crepe) toolbar strings are English.
- Carried over: no email (forgotten password = `npm run admin -- reset-password <email>`); image paste comes in M5; HTML blocks render as source.

## Known traps
- Never bypass `core` for disk, git or database access; every path goes through `resolveInside`; every document function takes an `actor` and calls `assertRole` first. `writeDocument` is the editor autosave only and refuses an agent actor; agents write through `importDocument`.
- `src/lib/server/csrf.ts` replaces SvelteKit's origin check (`trustedOrigins: ['*']` in `vite.config.ts`); `isAgentPath` both exempts the agent endpoints and makes `handle` skip the session cookie there. Keep them in one predicate.
- adapter-node 6 bakes `paths.origin` at build time and ignores `ORIGIN`; without `X-Forwarded-Proto` it assumes `https`, so plain-http form posts fail the origin check (local captures need the header or `vite preview`).
- Dev builds and e2e must never run in `~/inkmesh-app`; the e2e `webServer` rebuilds `build/` in the dev tree. E2e runs on one worker in alphabetical order; `zz-account.spec.ts` stays last.
- `systemctl --user disable <unit>` removes a linked unit file; re-enable with the absolute path under `~/inkmesh-app/deploy/`.
- Crepe must run with `ImageBlock` disabled; `patchMarkdown` works on top-level blocks.
