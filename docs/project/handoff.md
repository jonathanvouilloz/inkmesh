# Handoff — inkmesh
Updated: 2026-10-21

## Where we are
All six roadmap milestones and the UX polish after first real use are merged into `main` and deployed. 488 unit tests, 95 Playwright e2e, svelte-check clean. Jon validated this version on 2026-10-20.
- Since M6: production on `https://inkmesh.ch` with email on (Resend); invited email prefilled at sign-up (migration `006-invitation-email`); "+ New workspace" in the switcher for admins; switcher and home split "My workspaces" / "Shared with me"; pages 1040px, documents 760px; members page reordered; document tables with a visible grid, header row and editor handles; document body text in a softened ink (`--prose`) under heavier headings (500); hourly backup with an email alert on failure. Plan: `docs/plans/2026-10-20-ux-polish.md`.
- Only instance admins create workspaces (decision 2026-10-18, confirmed by Jon 2026-10-20). Admins: both of Jon's accounts (the second flag was set by hand in the database: the admin CLI has no promote command).
- 2026-10-21: open-source release. Public repository `https://github.com/jonathanvouilloz/inkmesh` (remote `github`; history rewritten to the GitHub noreply address, backups `~/inkmesh-backups/comd-before-rewrite*.bundle`). Landing page in `site/` (EN, FR, `/workflow` diagram) on `https://inkmesh.ch`; the app moved to `https://app.inkmesh.ch`.
- The dev folder is still `comd` (symlink `~/personal-projects/inkmesh -> comd`).

## In production (app https://app.inkmesh.ch, landing https://inkmesh.ch)
- Checkout `~/inkmesh-app` on `main`, data `/home/hermes/inkmesh-data` (migrations 001–006), env `~/.config/inkmesh/env` (SMTP through Resend from `noreply@inkmesh.ch`, `BACKUP_GITHUB_OWNER`), units `inkmesh`, `inkmesh-landing` (`deploy/landing.mjs` on 9311: serves `site/`, 308 for every other path to the app), `inkmesh-tunnel` (named tunnel `inkmesh`, `~/.cloudflared/inkmesh.yml`; zone in Jon's Cloudflare account, domain at Infomaniak), `inkmesh-backup.timer` (hourly) and `inkmesh-alert@.service`. Deploy: `bash ~/inkmesh-app/scripts/deploy.sh` after merging into `main`. Guide, backup and restore: `docs/deploy.md`.
- Backups: each workspace mirrored to a private GitHub repository `jonathanvouilloz/inkmesh-<slug>`; database snapshots in `~/inkmesh-backups/db/` (14 days, VPS only); a failed run emails the admins.
- Before each deploy: copy `~/inkmesh-data` to `~/inkmesh-backups/pre-deploy/<UTC>-<label>` (`chmod -R go-rwx`: it holds password hashes) and start `build/` on a copy of the data (another port) to run new migrations first.

## Next action
1. Jon reconnects his agents from scratch on `https://app.inkmesh.ch/mcp` following the README ("Connect an agent"), then we test the whole path together. Nothing else is planned; new work starts with a spec and plan under `docs/plans/`.

## Owner actions (Jon)
- Test the published repository from a clean clone (README install path).
- After merging into `main`: `git push github main` as well as `scripts/deploy.sh`.
- Rename the dev folder when no session runs in it.

## Known limits
Deliberate, ledgered in reviews: `docs/project/known-limits.md`.

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
- A partial email configuration (one or two of `SMTP_URL`, `MAIL_FROM`, `INKMESH_URL`), an unknown scheme, an SMTP URL without a host, a bad `INKMESH_URL` or `DIGEST_HOUR` stops the start on purpose: a typo must not silently turn email off.
- The e2e server runs with `SMTP_URL=file:` and `INKMESH_URL=http://localhost:4173` (`playwright.config.ts`): messages land in `.data-e2e/mail/*.eml`, quoted-printable, so specs strip soft breaks (`=\n`) before reading a token.
- `SMTP_URL=memory:` keeps every message in the in-process `outbox` without bound: tests only, never a running server.
