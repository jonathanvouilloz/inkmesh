# Handoff — inkmesh
Updated: 2026-10-20

## Where we are
Milestone 6 (release) is merged into `main`, not yet deployed. Production still runs milestone 5. 484 unit tests, 91 Playwright e2e, svelte-check clean.
- M6: sort and filter the folder view by frontmatter from the URL (members and public links), email over SMTP (off unless configured), sign-in by email link, invitations by email, the opt-in daily digest with one-click unsubscribe, Dockerfile and compose example, README, MIT licence. Migration `005-email`.
- M3–M5 (files, agents, collaboration) are deployed since 2026-10-20. Plans: `docs/plans/`; order of the rest: `docs/plans/roadmap.md`.
- The dev folder is still `comd` (symlink `~/personal-projects/inkmesh -> comd`).

## In production (phase A, milestone 5)
- Checkout `~/inkmesh-app` on `main` (`cccdf1d`), data `/home/hermes/inkmesh-data` (migrations 001–004 applied), env `~/.config/inkmesh/env`, units `inkmesh` and `inkmesh-tunnel`. URL: `scripts/tunnel-url.sh`. Deploy: `bash ~/inkmesh-app/scripts/deploy.sh` after merging into `main` (its origin is the dev repo). Guide: `docs/deploy.md`.
- Before each deploy: copy `~/inkmesh-data` to `~/inkmesh-backups/<UTC>-<label>` and start `build/` on a copy of the data (another port) to run new migrations first. Pre-M5 backup: `~/inkmesh-backups/20261020T024132Z-pre-m5`.

## Next action
1. Deploy M6 (owner's approval). Before: `sqlite3 ~/inkmesh-data/inkmesh.db "select slug from workspaces where slug = 'unsubscribe'"` returns nothing; back up the data; run migration `005-email` on a copy of the data first (the usual copy-and-start check). The production env sets no mail variable, so the log says `email: off` and the app behaves as in M5 apart from the folder query bar.
2. Then the owner actions below.

## Owner actions (Jon)
- Confirm the MIT licence (decision 2026-10-20).
- Choose an SMTP provider and, once `inkmesh.ch` exists (phase B of `docs/deploy.md`), set `SMTP_URL`, `MAIL_FROM` and `INKMESH_URL` in `~/.config/inkmesh/env`. Email stays off in production until then. Sending a real email needs his approval.
- Check the Docker image, which nobody has built yet (hermes is not in the `docker` group). Either run, from the repo root as a user in that group:
  ```sh
  docker build -t inkmesh:m6-check .
  cp deploy/docker.env.example /tmp/inkmesh-m6-check.env
  docker run -d --name inkmesh-m6-check --env-file /tmp/inkmesh-m6-check.env -v inkmesh-m6-check:/data -p 127.0.0.1:3999:3000 inkmesh:m6-check
  for i in $(seq 1 12); do s=$(docker inspect -f '{{.State.Health.Status}}' inkmesh-m6-check); echo "$s"; [ "$s" = healthy ] && break; sleep 5; done   # healthy within 60 s
  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3999/login     # 200
  docker exec inkmesh-m6-check id -u                                        # 1000
  docker exec inkmesh-m6-check git --version                                # git version 2.x
  printf 'long enough 1\n' | docker exec -i inkmesh-m6-check npm run admin -- create-admin a@example.ch "Admin"   # Created admin
  docker logs inkmesh-m6-check                                              # contains "email: off"
  docker image ls inkmesh:m6-check --format '{{.Size}}'                     # note the size
  cp deploy/docker.env.example inkmesh.env && docker compose config -q && rm inkmesh.env   # exit 0
  docker rm -f inkmesh-m6-check && docker volume rm inkmesh-m6-check && docker rmi inkmesh:m6-check && rm /tmp/inkmesh-m6-check.env
  ```
  or add `hermes` to the `docker` group so an agent can run it (root-equivalent on the VPS: his call).
- Test the real clients from the Connect page (Claude web connector, Claude Code `claude mcp add`, ChatGPT developer mode, Cursor `mcp.json`): connected, consent shows the right host, `list_workspaces`, `create_document`, `search` and `add_comment` work, commits read "Jon via <agent>". Fix any recipe wording that no longer matches the vendor menus.
- Publish the repository and replace the `git clone <this repository>` placeholder in `README.md`.
- Rename the dev folder when no session runs in it; register `inkmesh.ch` (phase B).

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
- Carried over: HTML blocks render as source. While email is off, a forgotten password is `npm run admin -- reset-password <email>`.
- Folder query: filters cannot be removed one by one (only "Clear filters"); sorting by name has no Z→A; `{field} is {value}` reads loosely for a list field (the match is "contains"); the folder page reads each top-level document in full for its fields on every view; the `.where` line uses a negative margin.
- Frontmatter: the document page's read path does not strip a UTF-8 BOM (the fields path does).
- Sign-in links: "Ask for a new link" on an expired link drops `next`.
- Email config: `memory:` and `file:` are accepted in production; `MAIL_FROM` is not validated (a bad one shows on the first send's log line).
- Digest: in dev, a hooks reload can start a second timer (the stop function is not kept), so a dev instance may send a digest twice; one SQL query per user per run; the run assumes event ids grow with time (one writer).
- Docker: `XFF_DEPTH=1` trusts one proxy hop; two proxies (Cloudflare then nginx) need `2` or `ADDRESS_HEADER=cf-connecting-ip`.
- Tests: the unreadable-file test fails when run as root; the "concurrent consumes" login-link test is sequential (node:sqlite is synchronous); one unit test failed once in the M6 fix wave and was not identified, and `search.spec` failed its URL check once: watch both.

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
