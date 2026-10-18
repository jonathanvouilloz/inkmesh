# Handoff — inkmesh
Updated: 2026-10-18

## Where we are
Milestone 2 is merged into `main` (2026-10-18): accounts (scrypt, sessions, throttled login), workspaces with roles enforced in `core`, single-use invitation links, members page, account page, home with workspace list, header with workspace and user menus, read-only mode for readers, admin CLI (`npm run admin`). 118 unit tests, 34 Playwright e2e. Design: finish review shipped, `DESIGN.md` updated. Spec and plan: `docs/plans/2026-10-18-m2-*`.

The dev folder is still `comd`, reached through the symlink `~/personal-projects/inkmesh -> comd` (the deploy docs use the `inkmesh` path).

## In production (phase A)
- Prod checkout `~/inkmesh-app` (clone of the dev repo, branch `main`), data `/home/hermes/inkmesh-data`, env `~/.config/inkmesh/env`.
- Units linked from the prod clone: `inkmesh` (Node on `127.0.0.1:9310`) and `inkmesh-tunnel` (Cloudflare quick tunnel). Both enabled.
- Public URL: `scripts/tunnel-url.sh` prints it; it changes at every tunnel restart. Current: https://exam-lots-gently-listings.trycloudflare.com
- Admin account: Jon. No workspace yet: Jon creates them from the home page.
- Deploy: `bash ~/inkmesh-app/scripts/deploy.sh` after merging into `main`. Guide and phase B (inkmesh.ch): `docs/deploy.md`.

## Next action
1. Jon tests the public URL, changes his password on `/account`, creates a workspace and invites someone with a link.
2. Register `inkmesh.ch`, then phase B of `docs/deploy.md` (named tunnel; one browser authorisation).
3. Milestone 3 plan: HTTP API + remote MCP + agent tokens + "Connect your agent" page (the hermes agent on the VPS can already edit files in `/home/hermes/inkmesh-data/workspaces/<slug>` and commit as `Jon via hermes`), then commit-per-editing-session, search, comments, notifications, public links, image paste.

## Blockers and owner actions
- Owner: rename the dev folder when no session runs inside it (`rm ~/personal-projects/inkmesh && mv ~/personal-projects/comd ~/personal-projects/inkmesh`; units are unaffected, they point at `~/inkmesh-app`); confirm MIT; register `inkmesh.ch`.
- Known limits (deliberate): no email of any kind (forgotten password = `npm run admin -- reset-password <email>`); the login throttle and the write lock are in memory (single process); a direct POST to `127.0.0.1:9310` without the `cf-connecting-ip` header returns 500 (`ADDRESS_HEADER` is set; only the tunnel reaches the port); the quick tunnel hostname is random and unannounced.
- Deferred from reviews (ledgered, none blocking): definitions nested in lists/blockquotes unprotected by `patchMarkdown`; `listTree` caching; `gitLog` subject only; HTML blocks rendered as source; image paste; Crepe toolbar strings in English; user deletion needs a decision on `invitations.created_by`; expired sessions are deleted on sight, never swept.

## Known traps
- Never bypass `core` for disk, git or database access; every path goes through `resolveInside`; every document function takes an `actor` and calls `assertRole` first.
- adapter-node 6 bakes `paths.origin` at build time and ignores `ORIGIN`; without `X-Forwarded-Proto` it assumes `https`, so plain-http form posts fail the CSRF check (local captures need the header or `vite preview`).
- Dev builds and e2e must never run in `~/inkmesh-app`; the e2e `webServer` rebuilds `build/` in the dev tree.
- The e2e suite runs on one worker in alphabetical file order; `zz-account.spec.ts` must stay last.
- `systemctl --user disable <unit>` removes a linked unit file; re-enable with the absolute path under `~/inkmesh-app/deploy/`.
- Crepe must run with `ImageBlock` disabled; `patchMarkdown` works on top-level blocks.
