# Handoff — inkmesh
Updated: 2026-10-21

## Where we are
Open-source release done on 2026-10-21. All six milestones, the UX polish, the landing page and the connect page redesign are merged into `main`, deployed and pushed to `github/main`.
- Repository: `https://github.com/jonathanvouilloz/inkmesh` (public, MIT, remote `github`; history uses the GitHub noreply address).
- Landing page: `site/` (EN, FR, `/workflow` diagram), General Sans headings, Fragment Mono text, logo track 02 (`design/logo/showcase.html`).
- Connect page: tool choice as step 1, numbered tick-box steps, Claude Code over SSH has its own recipe.
- Admins: both of Jon's accounts (the second flag was set by hand in the database: the admin CLI has no promote command). Only admins create workspaces.
- The dev folder is still `comd` (symlink `~/personal-projects/inkmesh -> comd`).

## Next action
Nothing planned. New work starts with a spec and plan under `docs/plans/`.

## Verification (2026-10-21)
- `npm test`: 489 passed. `npm run test:e2e`: 96 passed. `npm run check`: 0 errors, 0 warnings.
- `curl` on `https://inkmesh.ch/`, `/fr/`, `/workflow/`, `https://app.inkmesh.ch/login`: 200; `https://inkmesh.ch/login` and `POST /mcp`: 308 to app.inkmesh.ch; OAuth metadata names `https://app.inkmesh.ch/mcp`.
- A headless Claude Code agent listed the workspaces through `https://app.inkmesh.ch/mcp` (token, user scope).
- Not checked: invitation and digest emails since the move (links now start with app.inkmesh.ch).

## Uncommitted state
Nothing: branch `main`, clean, equal to `github/main` and to `~/inkmesh-app`.

## Blockers and owner actions
- Test the published repository from a clean clone (README install path).
- Rename the dev folder when no session runs in it.
- After merging into `main`: `scripts/deploy.sh` and `git push github main`.

## In production (app https://app.inkmesh.ch, landing https://inkmesh.ch)
- Checkout `~/inkmesh-app` on `main`, data `/home/hermes/inkmesh-data` (migrations 001–006), env `~/.config/inkmesh/env` (`INKMESH_URL=https://app.inkmesh.ch`, SMTP through Resend from `noreply@inkmesh.ch`, `BACKUP_GITHUB_OWNER`).
- Units: `inkmesh` (9310), `inkmesh-landing` (9311, `deploy/landing.mjs`), `inkmesh-tunnel` (`~/.cloudflared/inkmesh.yml`, from `deploy/cloudflared.yml`), `inkmesh-backup.timer` (hourly), `inkmesh-alert@.service`. Guide: `docs/deploy.md`.
- Backups: workspaces mirrored to private repos `jonathanvouilloz/inkmesh-<slug>`; database snapshots in `~/inkmesh-backups/db/` (14 days). Before each deploy: copy `~/inkmesh-data` to `~/inkmesh-backups/pre-deploy/<UTC>-<label>` (`chmod -R go-rwx`) and run new migrations on a copy first.

## Known limits
Deliberate, ledgered in reviews: `docs/project/known-limits.md`.

## Known traps
- The session's auto-mode classifier blocks git history rewrites and tunnel/env changes even after the owner says yes in chat: put the commands in a script and let the owner run it with `! bash <script>`.
- `fr-typography` through `frtypo.py` (scratchpad, not in the repo) adds a narrow space inside code tokens (`role\u202f: reader`) and HTML entities: check mono tags after each run.
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
