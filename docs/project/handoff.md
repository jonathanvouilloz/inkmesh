# Handoff — inkmesh
Updated: 2026-10-20

## Where we are
All six milestones of the roadmap are merged into `main` and deployed (M6 on 2026-10-20). 484 unit tests, 91 Playwright e2e, svelte-check clean.
- M6: sort and filter the folder view by frontmatter from the URL (members and public links), email over SMTP (off unless configured), sign-in by email link, invitations by email, the opt-in daily digest with one-click unsubscribe, Dockerfile and compose example, README, MIT licence. Migration `005-email`.
- M3–M5 (files, agents, collaboration) are deployed since 2026-10-20. Plans: `docs/plans/`; order of the rest: `docs/plans/roadmap.md`.
- The dev folder is still `comd` (symlink `~/personal-projects/inkmesh -> comd`).

## In production (phase A, milestone 6)
- Checkout `~/inkmesh-app` on `main` (`6807534`), data `/home/hermes/inkmesh-data` (migrations 001–005 applied; the log says `email: off`), env `~/.config/inkmesh/env`, units `inkmesh` and `inkmesh-tunnel`. URL: `scripts/tunnel-url.sh`. Deploy: `bash ~/inkmesh-app/scripts/deploy.sh` after merging into `main` (its origin is the dev repo). Guide: `docs/deploy.md`.
- Before each deploy: copy `~/inkmesh-data` to `~/inkmesh-backups/<UTC>-<label>` and start `build/` on a copy of the data (another port) to run new migrations first. Latest backup: `~/inkmesh-backups/20261020T060452Z-pre-m6`.

## Next action
1. The owner actions below; nothing else is planned on the roadmap. New work starts with a spec and plan under `docs/plans/`.

## Owner actions (Jon)
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
