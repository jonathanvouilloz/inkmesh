# Milestone 2 — Accounts, roles, invitations, public URL (spec)

Updated: 2026-10-18. Implements PRD items 1 (workspaces and roles), 13 (accounts, invitation) and the first deployment. Architecture of record: `docs/project/architecture.md`; this spec only fixes what that document leaves open for this milestone.

## Goal

A team member invited by Jon opens `https://inkmesh.ch`, follows an invitation link, picks a name and a password, and edits documents in the workspaces they belong to, with their real name on every commit. Nobody else sees anything.

## Scope

1. Accounts: email + password login, session cookie, account page (rename, change password). No public signup, no email sending.
2. Workspaces: a logged-in instance admin creates workspaces; each member has one role (owner, editor, reader); roles are enforced in `core`.
3. Invitations by link: an owner or editor creates a single-use link carrying a role; the invitee creates an account (or joins with their existing one).
4. Members page per workspace: members with roles, role change, removal, pending links with revoke.
5. Deployment on the VPS behind a Cloudflare Tunnel on `inkmesh.ch`.

Deferred to milestone 3: HTTP API, remote MCP, agent tokens, "Connect your agent" page, magic links and any email, commit-per-editing-session. Until then, an agent running on the VPS (Hermes) edits the workspace folder directly and commits with the author `<Name> via <agent>` and email `user-<id>@inkmesh.local`.

## Data (SQLite, `$INKMESH_DATA/inkmesh.db`)

`node:sqlite` `DatabaseSync`, WAL mode, foreign keys on. Forward-only migrations in `src/lib/core/db.ts`, run from the SvelteKit `init` hook and by scripts; a `migrations` table records applied ids.

```sql
users        (id INTEGER PK, email TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
              password_hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)
sessions     (token_hash TEXT PK, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
              expires_at TEXT NOT NULL, created_at TEXT NOT NULL)
workspaces   (slug TEXT PK, name TEXT NOT NULL, created_at TEXT NOT NULL)
memberships  (workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
              user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
              role TEXT NOT NULL CHECK (role IN ('owner','editor','reader')), PRIMARY KEY (workspace, user_id))
invitations  (token_hash TEXT PK, workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
              role TEXT NOT NULL CHECK (role IN ('owner','editor','reader')),
              created_by INTEGER NOT NULL REFERENCES users, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
              used_by INTEGER REFERENCES users, used_at TEXT)
```

- Dates are ISO 8601 UTC strings. Tokens (sessions, invitations) are 32 random bytes, base64url in the cookie or URL, SHA-256 hex in the database.
- `workspaces.slug` is `[a-z0-9][a-z0-9-]{1,39}`; the folder `workspaces/<slug>` is created with the row (`ensureWorkspace`). A folder without a row is invisible; a row without a folder is recreated on first access.
- Passwords: `scrypt` from `node:crypto`, N=2^15, r=8, p=1, 16-byte salt, stored as `scrypt$<salt b64>$<hash b64>`; compared with `timingSafeEqual`. Minimum 10 characters, no other rule.
- Deleting a user cascades sessions and memberships; `invitations.created_by` keeps the id (no cascade) so history stays readable. The display name stays in git history (architecture, nLPD note).

## Roles

| Action | reader | editor | owner |
|---|---|---|---|
| list tree, read document, history | ✓ | ✓ | ✓ |
| create, edit document | | ✓ | ✓ |
| create invitation (role ≤ own role) | | ✓ | ✓ |
| members page: change role, remove member, revoke any link | | | ✓ |
| create workspace | instance admin only | | |

- An editor can only invite readers and editors; an owner can invite any role. A workspace keeps at least one owner: the last owner cannot be demoted or removed.
- Instance admin (`users.admin`) is a flag set by the CLI, not a role; it grants workspace creation and nothing else inside a workspace.
- Enforcement: `src/lib/core/access.ts` exports `roleOf(slug, userId): Role | null` and `assertRole(slug, actor, min: Role): Membership` (synchronous) throwing `Forbidden`. `listTree`, `readDocument`, `history` call `assertRole(slug, actor, 'reader')`; `writeDocument`, `createDocument` call `assertRole(slug, actor, 'editor')`. The actor becomes a required argument of every document function. Routes map `Forbidden` to 403 (404 when the user is not a member at all, so slugs are not enumerable).

## Flows

**Login** `/login`: email + password form action. On success: new session (30 days, fixed expiry), cookie `inkmesh_session` (HttpOnly, SameSite=Lax, Secure outside dev, path `/`), redirect to `?next=` if it is a same-origin path, else `/`. Failures return one generic message. Rate limit: 10 failures per email and per IP in 15 minutes (in-memory map), then 429 with the same generic message plus "try again later".

**Logout**: form action on `/logout`, deletes the session row and the cookie.

**Home** `/`: the user's workspaces (name, role). Admins see a create form (name, slug derived and editable). An empty state for a user with no workspace.

**Invitation** `/invite/[token]`:
- unknown, used or expired token → one page "This invitation is no longer valid".
- valid, visitor logged out → form: name, email, password → creates the user, the membership, marks the token used, opens a session, redirects to the workspace. If the email already exists: "You already have an account, sign in to accept", with a login link that returns here.
- valid, visitor logged in → one button "Join <workspace> as <role>"; if already a member, the role is raised to the invitation's role when higher, never lowered.
- Expiry 7 days. Token in the URL only; the page never echoes it.

**Members** `/[workspace]/members`: table of members (name, role, change role select for owners, remove), pending invitations (role, created by, expires, revoke) and a "New invitation link" form (role). The created link is shown once with a copy button.

**Account** `/account`: change display name; change password (current + new); sessions are not listed.

**Workspace layout** `/[workspace]`: `assertRole(reader)` in `+layout.server.ts` and in every action (actions run before layouts). The shell gets a header row: workspace switcher (list of the user's workspaces), user name, links to Members (owner/editor), Account, Logout. Readers see the document without the editor toolbar: the editor is mounted read-only and the create form is hidden.

**First admin**: `node scripts/admin.ts create-admin <email> <name>` prompts for a password on stdin and inserts the admin user; `reset-password <email>` does the same for an existing user. `npm run seed` creates the admin `owner@inkmesh.local` / `inkmesh-dev` in development (skipped when it exists) and makes them owner of `demo`.

## Request pipeline

- `hooks.server.ts` `handle`: reads the cookie, loads `locals.user` (`{ id, name, email, admin }`) or `null`; expired sessions are deleted on sight. `locals.actor` is `{ id, name }` for `core`. Protected routes live under a `(app)` group whose `+layout.server.ts` redirects to `/login?next=<path>` when `locals.user` is null; `/login` and `/invite/[token]` live outside the group.
- `init`: runs migrations, then `assertGit`.
- CSRF: SvelteKit's origin check on form actions; in production the origin is derived from the proxy headers (`PROTOCOL_HEADER=x-forwarded-proto`, `HOST_HEADER=host`), so the check and `Secure` cookies work behind the tunnel. adapter-node 6 no longer reads `ORIGIN`.
- `currentActor()` and the `INKMESH_OWNER_NAME` variable are removed.

## Deployment

- Data: `INKMESH_DATA=/home/hermes/inkmesh-data`. Service: systemd user unit `~/.config/systemd/user/inkmesh.service` running `node build` from `/home/hermes/personal-projects/inkmesh`, `EnvironmentFile=%h/.config/inkmesh/env` with `PORT=9310`, `HOST=127.0.0.1`, `BODY_SIZE_LIMIT=20M`, `INKMESH_DATA`, `NODE_ENV=production`, and the origin settings of the current phase. Restart on failure; `loginctl` linger is already enabled for `hermes`.
- Phase A, no domain yet (now): a Cloudflare **quick tunnel** (`cloudflared tunnel --url http://127.0.0.1:9310`) as a second user service. Cloudflare assigns a random `https://<words>.trycloudflare.com` URL, printed in the service journal, that changes at every restart of the tunnel and comes with no uptime promise: good enough for Jon's tests. The app derives its origin from the proxy headers, `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=host`, so CSRF and `Secure` cookies follow whatever hostname Cloudflare hands out. `scripts/tunnel-url.sh` prints the current URL from the journal.
- Phase B, `inkmesh.ch` registered (later): named tunnel created once with `cloudflared tunnel login` (browser authorisation by Jon), `cloudflared tunnel create inkmesh`, `cloudflared tunnel route dns inkmesh inkmesh.ch`; `~/.cloudflared/config.yml` with ingress `inkmesh.ch` → `http://127.0.0.1:9310`, catch-all 404; the tunnel service switches to `tunnel run`; the env file does not change (origin still from the proxy headers). Sessions survive the switch (cookie name and path unchanged).
- Domain: `inkmesh.ch` is free at the time of writing. Jon registers it: through Cloudflare Registrar if `.ch` appears on cloudflare.com/tld-policies at that time (not confirmed), otherwise with a Swiss registrar (Infomaniak, Hostpoint), then adds the zone to his Cloudflare account (free plan) and sets the registrar's nameservers to the ones Cloudflare gives.
- `scripts/deploy.sh`: `git pull --ff-only && npm ci && npm run build && systemctl --user restart inkmesh`. Migrations run at service start.
- The Node port is bound to localhost; only the tunnel reaches it. No Cloudflare Access (the app has its own login).

## Interface

Four new surfaces (login, home, members, invitation) and a header row on the workspace shell, all under `DESIGN.md`: Inter body, Fragment Mono for slugs, emails and links, 240 / 72ch / 280 grid where the shell applies, one accent, no eyebrow. Copy in FR and EN through `t()`. Every form has labels, errors named next to the field, keyboard complete. An impeccable finish review runs once on the four surfaces together at the end.

## Testing

- Unit (Vitest, in-memory or temp-dir SQLite): migrations idempotent; password hash and verify; session create / lookup / expiry; `assertRole` matrix (one assertion per cell of the table above); last-owner protection; invitation lifecycle (valid, used, expired, role ceiling for editors, join raises never lowers); document functions reject a reader write and a non-member read.
- E2E (Playwright, `.data-e2e`): login then open demo; wrong password stays on login; reader sees no toolbar and gets 403 on a crafted save; invitation link creates a member who then edits; members page changes a role; logout redirects to login.
- The existing 73 unit tests and 16 e2e keep passing; the e2e `webServer` seeds the admin and logs in through a stored state.

## Out of scope for this spec

Email of any kind, agent tokens, API and MCP, public read-only links, notifications, search, workspace deletion or renaming, user deletion from the UI (CLI only: `scripts/admin.ts delete-user <email>`, deferred until someone needs it).
