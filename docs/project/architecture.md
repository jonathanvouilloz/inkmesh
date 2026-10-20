# Architecture — inkmesh
Updated: 2026-10-20

## In one sentence

One Node process serves a SvelteKit web app, an HTTP API and a remote MCP server, all writing the same Markdown files in per-workspace git repositories, with a SQLite database for everything that is not a document.

## Components and boundaries

```
 browser (humans)          MCP clients (agents)        scripts (agents)
      │  HTML + fetch           │  Streamable HTTP          │  HTTP + bearer
      ▼                         ▼                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│ inkmesh (Node 24, SvelteKit adapter-node, behind a Cloudflare Tunnel)│
│                                                                      │
│  routes/ (pages, form actions)   api/ (REST)   mcp/ (tools, OAuth)   │
│                 └────────────────┬───────────────┘                   │
│                                  ▼                                   │
│                core/  — the only code allowed to touch disk          │
│   documents (read, write, move, delete, commit)   search (FTS5)      │
│   comments   history (git log, restore)            events (inbox)    │
│   accounts, memberships, roles, agent tokens, public links           │
└──────────────┬───────────────────────────────┬───────────────────────┘
               ▼                               ▼
   $INKMESH_DATA/workspaces/<slug>/      $INKMESH_DATA/inkmesh.db
   (one git repo each: .md, images,      (SQLite: users, sessions,
    .inkmesh/comments/)                   memberships, tokens, events,
                                          public links, search index)
```

- Pages, API and MCP are three thin adapters over one `core` module. A capability exists for agents the day it exists for humans, because both call the same function.
- `core` is the only layer that reads or writes the data directory. Adapters never touch `fs` or `git`.
- Files are managed in `core/documents.ts` by `createFolder`, `importDocument`, `movePath`, `deletePath` and `linksTo` (the documents a move would rewrite).
- Agent support in `core`: `lock` (`serialised(slug, …)`, one write at a time per workspace), `events` (one event per write, the `changes` cursor), `sessions` (editing sessions persisted in SQLite, committed on idle, leave, another author's write or restart), `agents` (named agents of a user, bearer tokens, revocation), `oauth` (client registration, codes, access and refresh tokens).
- Collaboration in `core`: `comments` (the thread file of a document: list, add, resolve), `search` (the FTS5 index: `syncIndex` after every write, `rebuildIndex` at start, never fails a write or the boot), `images` (save and read, signature checked), `publicLinks` (owner management, link scope checks, join by link), `inbox` (the user's events and read cursor), and in `documents` `readVersion`, `restoreVersion`, `deletedDocuments` and `restoreDeleted`. A comment thread moves, goes to the trash and comes back with its document, in the same commit.
- Routes: pages and form actions under `(app)/` (cookie session); `api/v1/` the HTTP API and `mcp/` the MCP server (bearer only); `.well-known/` the OAuth authorisation-server and protected-resource metadata; `oauth/register` and `oauth/token` (public endpoints) and `(app)/oauth/authorize`, the consent screen. Collaboration: `/<ws>/-/search` (results page, GET form), `/<ws>/-/history` (deleted documents), `POST /<ws>/-/images` (upload), `/<ws>/<path>?v=<commit>` (version view and restore), `/inbox`; outside the app shell, `/s/<token>/…` (public pages and `/s/<token>/-/raw/…`, cookie-free) and `/join/<token>` (sign-up from a link). The `reroute` hook (`src/hooks.ts`) sends an image path under a workspace or a public link to the matching raw route, so documents link images by their natural relative URL.
- Markdown is parsed with remark (unified) both in `core` and in the editor; there is one parser configuration, shared.
- The editor is the one large client-side island (Milkdown on ProseMirror). Everything else is server-rendered. Markdown shown outside the editor (public pages, the version view, comment bodies) comes from `renderHtml` in `core/markdown.ts` (sanitised, raw HTML as code); `{@html}` appears only in `Rendered.svelte` and only takes `renderHtml`'s output.

## Data

**Source of truth.** A document is a `.md` file in `workspaces/<slug>/`. Its folder tree is the navigation tree. Images live next to the document that embeds them, named `<doc base>-<8 hex>.<ext>`; deleting a document leaves its images. Each workspace folder is a git repository created by inkmesh; inkmesh never manages remotes in v1. Anything a human could do with a text editor and `git commit` in that folder, inkmesh must accept on the next read.

**Comments.** `workspaces/<slug>/.inkmesh/comments/<document path>.md`: one Markdown file per commented document, one `## ` section per comment with author and timestamp. Versioned with the workspace, hidden from the document tree, reached only through `core/comments.ts` (`listComments`, `addComment`, `resolveComment`). Resolving rewrites the heading line only and appends no event.

**Database (`inkmesh.db`, SQLite).** Users, sessions, workspace memberships with role, agent tokens, OAuth clients and codes, events, public links, and the full-text index. The full-text index is a cache rebuilt from files at startup and updated on every write through `core`; it is never authoritative.

**Events and notifications.** Every write through `core` appends an event (workspace, actor, agent name, type, path, time). A member's inbox is the events in their workspaces not caused by themselves (their own agents' events included), read against one cursor per user; an agent's "what changed since" is the same query with a cursor. Email delivery, when built, reads the same table.

**Agent identity.** A token belongs to a user and carries an agent name. Calls made with it run with the user's role in each workspace. The workspace is named in every API and MCP call; there is no default workspace per token.

**Personal data (nLPD).** Display name, email, password hash, sessions, tokens, events. Git commits use the display name and a synthetic address `user-<id>@inkmesh.local`, never the real email, so erasing a user deletes their row and sessions without rewriting history. The display name remains in git history; the account page says so.

**Backup.** Copy `$INKMESH_DATA` while the service is stopped, or copy the workspaces and `VACUUM INTO` the database while running.

## Invariants

1. Every document write goes through `core` inside `serialised(slug, …)`: it first commits the open editing sessions it touches (each under its own human), then writes, commits and appends exactly one event; agents commit at once, the editor once per editing session, so two authors never share a commit.
2. Paths are resolved inside the workspace folder; `..`, absolute paths, symlinks, `.git/` and `.inkmesh/` are rejected by the document functions. `.inkmesh/` is reachable only through `comments.ts` and the move, delete and restore code, with `resolveInside(…, { inkmesh: true })`.
3. Saving a document that the user did not edit must not change a byte of the file. Round-trip fidelity is tested on fixture files in CI.
4. Reading never requires the index: if the database is deleted, the workspaces are still complete.
5. A commit always has an author: the human's display name, with `via <agent>` appended when a token acted.
6. Roles are checked in `core`, never only in the adapter.

## Environments and deployment

- **Local.** `npm run dev` with `INKMESH_DATA=./.data` (git-ignored). Seed script creates an owner and a sample workspace.
- **Production.** The owner's VPS. Built with `npm run build`, run by a systemd user service as `hermes` on `127.0.0.1:9310`; a second user service runs `cloudflared`, which holds an outbound tunnel to Cloudflare (TLS terminated there, no inbound port on the VPS). The app derives its origin from the proxy headers (`PROTOCOL_HEADER`, `HOST_HEADER`). Data in `/home/hermes/inkmesh-data`. Steps and the phase A (quick tunnel, random `trycloudflare.com` hostname) / phase B (`inkmesh.ch`) switch: `docs/deploy.md`. The service runs from its own checkout, `~/inkmesh-app` (a clone of the dev repository on `main`), so dev builds never touch the live `build/`. Deploy = `scripts/deploy.sh` (fast-forward that checkout, build, restart). Rollback = check out the previous commit there, build, restart; the data directory is untouched. Database schema changes are forward-only migrations run at startup.
- **Other installers.** A Dockerfile with one volume for `$INKMESH_DATA`.

## Security

- Sessions in a cookie (HttpOnly, Secure, SameSite=Lax), passwords hashed with scrypt from `node:crypto`, magic links as single-use tokens with a short expiry (once email exists).
- Agent tokens are random, stored hashed, revocable from the "Connect your agent" page. OAuth 2.1 authorisation server for MCP clients: PKCE required, dynamic client registration, consent screen shows the agent name and the role it will inherit.
- Public links are random tokens stored hashed, scoped in `core` (a document link reads its document, its `.md` and the images it references; a workspace link reads that workspace). Every `/s/` response carries `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: no-store`, `x-frame-options: DENY` and a CSP with no script source (`default-src 'none'; img-src 'self' https:; …; form-action 'none'`); pages there set `csr = false`. `/join/` and `/invite/` carry `same-origin` referrers, `no-store` and `noindex`.
- No secrets in git. Runtime secrets (session key, SMTP) come from the environment file read by systemd.
- Uploads: PNG, JPEG, GIF and WebP only, extension and signature checked on upload and on every serve, 5 MiB cap enforced before buffering, served with `nosniff` and `default-src 'none'`, stored next to the document with an exclusive write.
- Rate limiting (in memory, per IP, 15 minutes) on login, OAuth, and public links: every `/s/` request counts against `share` (300), an unknown token also against `share-miss` (10), sign-ups from a link against `join` (10).
