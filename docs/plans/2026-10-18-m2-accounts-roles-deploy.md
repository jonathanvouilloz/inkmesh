# Milestone 2 — Accounts, roles, invitations, public URL: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invited people log in on the public URL (a Cloudflare quick tunnel now, `https://inkmesh.ch` later), see only their workspaces, and edit with their real name on commits; roles are enforced in `core`; the app runs as a systemd service behind a Cloudflare Tunnel.

**Architecture:** A SQLite database (`node:sqlite`) next to the workspaces holds users, sessions, workspaces, memberships and invitations. Two new `core` modules (`accounts.ts`, `access.ts`) own it; the document functions take an actor and call `assertRole`. `hooks.server.ts` turns the session cookie into `locals.user`; a route group `(app)` redirects anonymous visitors to `/login`. Deployment adds unit files and a tunnel config under `deploy/`.

**Tech Stack:** SvelteKit 3 (adapter-node), Svelte 5 runes, Node 24 `node:sqlite` and `node:crypto` (scrypt), Vitest 5, Playwright, systemd user units, `cloudflared`.

**Spec:** `docs/plans/2026-10-18-m2-accounts-roles-deploy-spec.md` (data, roles, flows, deployment). Boundaries: `docs/project/architecture.md`. Conventions: `AGENTS.md`.

## Global Constraints

- Only `src/lib/core/` touches disk, git or the database; routes call `core` functions and map `Forbidden` to 403, non-membership to 404, `Conflict` to 409, `InvalidPath` to 400.
- Core modules import each other with relative `.ts` paths (Node runs `scripts/*.ts` unbundled); routes use `#lib/...`.
- Every user-visible string goes through `t(key, locale)` with an `en` and a `fr` entry; French copy uses « » and non-breaking spaces before `:` `;` `?` `!`.
- Passwords: `scrypt`, N=2^15, r=8, p=1, 16-byte salt, stored `scrypt$<salt b64>$<hash b64>`, compared with `timingSafeEqual`, minimum 10 characters.
- Tokens: 32 random bytes, base64url outside, SHA-256 hex inside the database. Session 30 days, invitation 7 days. Cookie `inkmesh_session`: HttpOnly, SameSite=Lax, Path=/, Secure when `!dev`.
- Roles: `reader < editor < owner`. Instance admin is `users.admin`, not a role.
- Dates in the database are ISO 8601 UTC strings (`new Date().toISOString()`).
- Commit author stays `commitAuthor(actor)`: `<name>[ via <agent>]`, `user-<id>@inkmesh.local`.
- Tests run on a temp `INKMESH_DATA` (see `documents.test.ts`); e2e on `.data-e2e`.
- Code, comments and commits in English; Conventional Commits; no new runtime dependency.

## Review Focus

1. Email entered with another case or surrounding spaces than at signup must still log in (Task 2 test `authenticates case-insensitively and trims`).
2. `/login?next=//evil.com` or `next=https://…` must redirect to `/`, never off-origin (Task 5 test `ignores an off-origin next`).
3. The same invitation link submitted twice (double click, two tabs) must create one member and fail the second cleanly (Task 3 test `an invitation accepts once`).
4. The last owner demoted or removed through the members form must be refused with a message, not leave an ownerless workspace (Task 3 tests `keeps the last owner`, Task 7 e2e `the last owner cannot be demoted`).
5. A deleted user's cookie must stop working at once (Task 2 test `a session dies with its user`).

---

### Task 1: Database module and migrations

**Files:**
- Create: `src/lib/core/db.ts`, `src/lib/core/db.test.ts`

**Interfaces:**
- Produces: `db(): DatabaseSync` — opens `$INKMESH_DATA/inkmesh.db` on first call per data directory (creates the directory), sets `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`, runs pending migrations, caches the handle keyed by the resolved path. `closeDb(): void` closes and forgets every cached handle (tests call it in `afterEach`). `MIGRATIONS: readonly { id: string; sql: string }[]` with one entry `001-accounts` creating the five tables from the spec plus `migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`.

- [ ] **Step 1: Write the failing tests** in `db.test.ts` (temp `INKMESH_DATA` per test, `closeDb()` in `afterEach`):

```ts
it('creates the schema once', () => {
  const names = () => db().prepare("select name from sqlite_master where type='table' order by name").all().map((r) => r.name);
  expect(names()).toEqual(['invitations', 'memberships', 'migrations', 'sessions', 'users', 'workspaces']);
  closeDb();
  expect(names()).toEqual(['invitations', 'memberships', 'migrations', 'sessions', 'users', 'workspaces']); // second open: no error, no duplicate
  expect(db().prepare('select count(*) as n from migrations').get()).toEqual({ n: 1 });
});
it('enforces foreign keys and roles', () => {
  expect(() => db().prepare("insert into memberships values ('nope', 1, 'owner')").run()).toThrow(/FOREIGN KEY/);
  db().prepare("insert into workspaces values ('w', 'W', '2026-01-01T00:00:00.000Z')").run();
  db().prepare("insert into users (email, name, password_hash, created_at) values ('a@b.c', 'A', 'x', '2026-01-01T00:00:00.000Z')").run();
  expect(() => db().prepare("insert into memberships values ('w', 1, 'god')").run()).toThrow(/CHECK/);
});
it('opens one database per data directory', () => {
  const first = db();
  process.env.INKMESH_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-db2-'));
  expect(db()).not.toBe(first);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/core/db.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement `db.ts`** with `import { DatabaseSync } from 'node:sqlite'` and `dataDir()` from `./data.ts`. Migrations run inside one transaction each; `CREATE TABLE` statements are copied from the spec's Data section verbatim.
- [ ] **Step 4: Run** the test file — PASS. Run `npx vitest run` — the 73 existing tests still pass.
- [ ] **Step 5: Commit** `feat(core): sqlite database with forward-only migrations`.

### Task 2: Accounts — passwords, users, sessions, login throttle

**Files:**
- Create: `src/lib/core/accounts.ts`, `src/lib/core/accounts.test.ts`

**Interfaces:**
- Consumes: `db()` from Task 1.
- Produces:
  - `type User = { id: number; email: string; name: string; admin: boolean }`
  - `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>`
  - `createUser(input: { email: string; name: string; password: string; admin?: boolean }): Promise<User>` — trims and lower-cases the email, throws `Conflict` (from `./paths.ts`) when the email exists, throws `RangeError` when the password is under 10 characters.
  - `userByEmail(email: string): User | null`, `userById(id: number): User | null`
  - `authenticate(email: string, password: string): Promise<User | null>`
  - `updateName(id: number, name: string): void`, `changePassword(id: number, current: string, next: string): Promise<boolean>` (false when `current` is wrong)
  - `setPassword(id: number, next: string): Promise<void>` (CLI reset)
  - `createSession(userId: number): string` (returns the raw base64url token), `sessionUser(token: string): User | null` (null and row deleted when expired), `deleteSession(token: string): void`
  - `hashToken(token: string): string` (SHA-256 hex) and `newToken(): string` — exported for Task 3.
  - `loginAllowed(key: string): boolean`, `loginFailed(key: string): void`, `loginSucceeded(key: string): void` — in-memory map, 10 failures per key within 15 minutes.

- [ ] **Step 1: Write the failing tests** (temp data dir, `closeDb()` after each):

```ts
it('hashes with scrypt and verifies', async () => {
  const stored = await hashPassword('correct horse 1');
  expect(stored).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  expect(await verifyPassword('correct horse 1', stored)).toBe(true);
  expect(await verifyPassword('wrong', stored)).toBe(false);
});
it('refuses short passwords and duplicate emails', async () => {
  await expect(createUser({ email: 'a@b.c', name: 'A', password: 'short' })).rejects.toBeInstanceOf(RangeError);
  await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
  await expect(createUser({ email: 'A@B.C', name: 'B', password: 'long enough 1' })).rejects.toBeInstanceOf(Conflict);
});
it('authenticates case-insensitively and trims', async () => {
  await createUser({ email: 'Jon@Example.ch', name: 'Jon', password: 'long enough 1' });
  expect((await authenticate('  jon@example.CH ', 'long enough 1'))?.name).toBe('Jon');
  expect(await authenticate('jon@example.ch', 'nope nope nope')).toBeNull();
  expect(await authenticate('nobody@example.ch', 'long enough 1')).toBeNull();
});
it('creates, reads, expires and deletes sessions', async () => {
  const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
  const token = createSession(u.id);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(sessionUser(token)?.id).toBe(u.id);
  expect(sessionUser('not-a-token')).toBeNull();
  db().prepare("update sessions set expires_at = '2000-01-01T00:00:00.000Z'").run();
  expect(sessionUser(token)).toBeNull();
  expect(db().prepare('select count(*) as n from sessions').get()).toEqual({ n: 0 });
});
it('a session dies with its user', async () => {
  const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
  const token = createSession(u.id);
  db().prepare('delete from users where id = ?').run(u.id);
  expect(sessionUser(token)).toBeNull();
});
it('changes the password only with the current one', async () => {
  const u = await createUser({ email: 'a@b.c', name: 'A', password: 'long enough 1' });
  expect(await changePassword(u.id, 'wrong wrong wrong', 'new password 1')).toBe(false);
  expect(await changePassword(u.id, 'long enough 1', 'new password 1')).toBe(true);
  expect((await authenticate('a@b.c', 'new password 1'))?.id).toBe(u.id);
});
it('throttles after ten failures', () => {
  for (let i = 0; i < 10; i++) { expect(loginAllowed('k')).toBe(true); loginFailed('k'); }
  expect(loginAllowed('k')).toBe(false);
  loginSucceeded('k');
  expect(loginAllowed('k')).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/core/accounts.test.ts` — FAIL.
- [ ] **Step 3: Implement `accounts.ts`** with `node:crypto` (`scrypt`, `randomBytes`, `createHash`, `timingSafeEqual`). `authenticate` runs `verifyPassword` against a fixed dummy hash when the user is unknown so timing does not reveal existence.
- [ ] **Step 4: Run** the test file — PASS.
- [ ] **Step 5: Commit** `feat(core): accounts, sessions and login throttle`.

### Task 3: Access — workspaces, memberships, roles, invitations

**Files:**
- Create: `src/lib/core/access.ts`, `src/lib/core/access.test.ts`

**Interfaces:**
- Consumes: `db()`, `newToken`, `hashToken`, `User`, `createUser` (tests only); `Actor` from `./actor.ts`; `ensureWorkspace` from `./documents.ts`.
- Produces:
  - `type Role = 'reader' | 'editor' | 'owner'`; `const ROLES: readonly Role[] = ['reader', 'editor', 'owner']`
  - `class Forbidden extends Error`
  - `type Membership = { workspace: string; userId: number; role: Role }`
  - `type Workspace = { slug: string; name: string }`
  - `createWorkspace(slug: string, name: string, owner: Actor): Promise<Workspace>` — slug must match `/^[a-z0-9][a-z0-9-]{1,39}$/` else `InvalidPath`; `Conflict` when the slug exists; inserts the row, the owner membership, then `ensureWorkspace(slug)`.
  - `workspacesOf(userId: number): (Workspace & { role: Role })[]` ordered by name.
  - `workspace(slug: string): Workspace | null`
  - `roleOf(slug: string, userId: number): Role | null`
  - `assertRole(slug: string, actor: Actor, min: Role): Membership` — throws `Forbidden` (message `'not a member'` when `roleOf` is null, `'insufficient role'` otherwise). Synchronous.
  - `members(slug: string): { user: User; role: Role }[]`
  - `setRole(slug: string, userId: number, role: Role, by: Actor): void` — `by` must be owner; throws `Conflict('last owner')` when it would demote the last owner.
  - `removeMember(slug: string, userId: number, by: Actor): void` — same guard.
  - `createInvitation(slug: string, role: Role, by: Actor): string` — `by` must be editor or above; an editor may only pass `reader` or `editor` (else `Forbidden`); returns the raw token; expiry now + 7 days.
  - `type Invitation = { workspace: Workspace; role: Role; createdBy: string; expiresAt: string }`; `invitation(token: string): Invitation | null` — null when unknown, used or expired.
  - `acceptInvitation(token: string, userId: number): Workspace` — in one transaction: re-reads the row `where used_at is null and expires_at > now`, inserts or raises the membership (never lowers), marks `used_by`/`used_at`; throws `Conflict('invalid invitation')` when no row matched.
  - `pendingInvitations(slug: string): { id: string; role: Role; createdBy: string; expiresAt: string }[]` where `id` is the token hash.
  - `revokeInvitation(slug: string, id: string, by: Actor): void` — owner, or the editor who created it; deletes the row.

- [ ] **Step 1: Write the failing tests** (temp data dir, `closeDb()` after each; helper `user(name, admin?)` creating a user with `createUser`):

```ts
it('creates a workspace folder and its owner', async () => {
  const jon = await user('jon');
  await createWorkspace('team', 'Team', jon);
  expect(fs.existsSync(path.join(workspaceDir('team'), '.git'))).toBe(true);
  expect(workspacesOf(jon.id)).toEqual([{ slug: 'team', name: 'Team', role: 'owner' }]);
  await expect(createWorkspace('Team', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
  await expect(createWorkspace('../x', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
  await expect(createWorkspace('team', 'x', jon)).rejects.toBeInstanceOf(Conflict);
});
it.each([
  ['reader', 'reader', true], ['reader', 'editor', false], ['reader', 'owner', false],
  ['editor', 'reader', true], ['editor', 'editor', true], ['editor', 'owner', false],
  ['owner', 'reader', true], ['owner', 'editor', true], ['owner', 'owner', true]
] as const)('%s asked for %s → %s', async (has, min, ok) => { /* seed membership, expect assertRole to return or throw Forbidden */ });
it('a non-member is Forbidden with "not a member"', …);
it('keeps the last owner', async () => {
  // owner tries setRole(self, 'editor') → Conflict; removeMember(self) → Conflict; after a second owner exists both succeed
});
it('only owners manage members', …); // editor calling setRole / removeMember → Forbidden
it('editors invite up to editor, owners invite owners', …); // editor + 'owner' → Forbidden; owner + 'owner' ok
it('an invitation accepts once', async () => {
  const token = createInvitation('team', 'editor', owner);
  expect(invitation(token)?.role).toBe('editor');
  acceptInvitation(token, bob.id);
  expect(roleOf('team', bob.id)).toBe('editor');
  expect(invitation(token)).toBeNull();
  expect(() => acceptInvitation(token, carol.id)).toThrow(Conflict);
});
it('joining raises but never lowers a role', …); // owner accepting a reader invitation stays owner; reader accepting editor becomes editor
it('expired invitations are invisible', …); // update expires_at to the past → invitation() null, accept throws
it('revocation: owner any, editor own only', …);
```

- [ ] **Step 2: Run** `npx vitest run src/lib/core/access.test.ts` — FAIL.
- [ ] **Step 3: Implement `access.ts`.** `assertRole` compares `ROLES.indexOf`. `createdBy` is the inviter's display name (join on users).
- [ ] **Step 4: Run** the test file — PASS.
- [ ] **Step 5: Commit** `feat(core): workspaces, memberships, roles and invitations`.

### Task 4: Documents enforce roles; seed and admin CLI

**Files:**
- Modify: `src/lib/core/documents.ts` (all five exported functions), `src/lib/core/documents.test.ts`, `src/lib/core/actor.ts` (delete `currentActor`), `scripts/seed.ts`, `README.md` (environment section)
- Create: `scripts/admin.ts`
- Modify: `package.json` scripts: add `"admin": "node scripts/admin.ts"`

**Interfaces:**
- Consumes: `assertRole`, `createWorkspace`, `roleOf` (Task 3); `createUser`, `userByEmail`, `setPassword` (Task 2).
- Produces (new signatures, used by every route task):
  - `listTree(slug: string, actor: Actor): Promise<TreeNode[]>` — `assertRole(slug, actor, 'reader')`
  - `readDocument(slug: string, path: string, actor: Actor)` — reader
  - `history(slug: string, path: string, actor: Actor)` — reader
  - `writeDocument(slug, path, body, { expectedHash, actor })` — `assertRole(slug, actor, 'editor')` before anything else
  - `createDocument(slug, path, actor)` — editor
  - `ensureWorkspace(slug)` unchanged (called by `createWorkspace`; no role check, it is not reachable from routes).
  - `scripts/admin.ts <create-admin <email> <name> | reset-password <email>>`: reads the password from stdin (`node:readline/promises`, echo on is acceptable), prints the result, exit code 1 with a one-line usage on bad arguments. Runs migrations through `db()`.
  - Seed: after the demo workspace, `createUser({ email: 'owner@inkmesh.local', name: 'Owner', password: 'inkmesh-dev', admin: true })` when missing, then an owner membership on `demo` through `createWorkspace('demo', 'Demo', owner)` when the row is missing (the folder already exists: `createWorkspace` must tolerate an existing folder, which `ensureWorkspace` already does). Commits keep the author `Owner` / `Owner via claude-code`.

- [ ] **Step 1: Extend `documents.test.ts`**: in `beforeEach`, create user `jon` and `createWorkspace('demo', 'Demo', jon)` instead of `ensureWorkspace`; `actor` becomes `{ id: jon.id, name: 'Jon' }`; add:

```ts
it('a reader cannot write and a stranger cannot read', async () => {
  const reader = await createUser({ email: 'r@b.c', name: 'R', password: 'long enough 1' });
  db().prepare("insert into memberships values ('demo', ?, 'reader')").run(reader.id);
  const r = { id: reader.id, name: 'R' };
  await expect(listTree('demo', r)).resolves.toBeTruthy();
  await expect(createDocument('demo', 'x.md', r)).rejects.toBeInstanceOf(Forbidden);
  await expect(writeDocument('demo', doc, 'x', { expectedHash: 'h', actor: r })).rejects.toBeInstanceOf(Forbidden);
  await expect(readDocument('demo', doc, { id: 999, name: 'S' })).rejects.toThrow('not a member');
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/core/documents.test.ts` — FAIL (signatures).
- [ ] **Step 3: Implement**: add the `actor` parameter and `assertRole` call to each function; delete `currentActor` and the `INKMESH_OWNER_NAME` lines in README; rewrite `scripts/seed.ts` and write `scripts/admin.ts`. Routes still compile against the old signatures for now; `npm run check` is allowed to fail until Task 5, note it in the report.
- [ ] **Step 4: Run** `npx vitest run` — all core tests pass. Run `rm -rf .data && npm run seed` twice — second run prints "already seeded" and exits 0. Run `printf 'long enough 1\n' | npm run admin -- create-admin a@b.c Ann` — prints the created user; a second run says the email exists.
- [ ] **Step 5: Commit** `feat(core): role checks on documents, admin CLI, seeded owner account`.

### Task 5: Session pipeline, login and logout, route group guard

**Files:**
- Modify: `src/app.d.ts` (`Locals: { locale; user: User | null; actor: Actor | null }`), `src/hooks.server.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`, `src/routes/(app)/[workspace]/+layout.server.ts`, `src/routes/(app)/[workspace]/+page.server.ts`, `src/routes/(app)/[workspace]/[...path]/+page.server.ts`, `playwright.config.ts`, `e2e/*.spec.ts`
- Create: `src/routes/(app)/+layout.server.ts`, `src/routes/login/+page.server.ts`, `src/routes/login/+page.svelte`, `src/routes/logout/+page.server.ts`, `src/lib/server/redirect.ts`, `src/lib/server/redirect.test.ts`, `e2e/auth.setup.ts`, `e2e/login.spec.ts`

**Interfaces:**
- Consumes: `sessionUser`, `createSession`, `deleteSession`, `authenticate`, `loginAllowed`, `loginFailed`, `loginSucceeded` (Task 2); `assertRole`, `Forbidden`, `roleOf` (Task 3); new document signatures (Task 4).
- Produces:
  - `safeNext(next: FormDataEntryValue | string | null): string` in `src/lib/server/redirect.ts` — returns `next` only when it starts with a single `/` and not `//` and not `/\`, else `/`.
  - `hooks.server.ts`: `init` = `db()` then `assertGit`; `handle` sets `locals.user` from the `inkmesh_session` cookie and `locals.actor = user && { id: user.id, name: user.name }`.
  - `(app)/+layout.server.ts`: `if (!locals.user) redirect(303, '/login?next=' + encodeURIComponent(url.pathname + url.search))`; returns `{ user: locals.user }`.
  - `/login` actions `default`: fields `email`, `password`, hidden `next`; throttle key `${ip}|${email}` with `event.getClientAddress()`; on failure `fail(400, { error: 'login.failed', email })`, when throttled `fail(429, { error: 'login.throttled', email })`; on success set the cookie and `redirect(303, safeNext(next))`. A logged-in visitor on `/login` is redirected to `/`.
  - `/logout` action `default`: `deleteSession`, delete cookie, `redirect(303, '/login')`.
  - Workspace routes: `+layout.server.ts` loads with `locals.actor!`, catches `Forbidden` → `error(roleOf(...) === null ? 404 : 403)`; both actions do the same check first (they run before layouts). Keep a helper `requireRole(slug, locals, min): Membership` in `src/lib/server/guard.ts` that does the `Forbidden` → `error()` mapping; every route task reuses it.
  - i18n keys: `login.title`, `login.email`, `login.password`, `login.submit`, `login.failed` ("Email or password is incorrect"), `login.throttled` ("Too many attempts, try again in a few minutes"), `nav.logout`.
  - Playwright: a `setup` project runs `e2e/auth.setup.ts` which logs in as `owner@inkmesh.local` / `inkmesh-dev` and saves `storageState` to `.data-e2e/owner.json`; the existing specs run in a `chromium` project with that `storageState` and `dependencies: ['setup']`. `login.spec.ts` uses `storageState: { cookies: [], origins: [] }`.

- [ ] **Step 1: Unit test** `redirect.test.ts`:

```ts
it('ignores an off-origin next', () => {
  expect(safeNext('/demo/a.md?x=1')).toBe('/demo/a.md?x=1');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'demo', '', null]) expect(safeNext(bad)).toBe('/');
});
```

- [ ] **Step 2: E2E** `login.spec.ts`:

```ts
test('anonymous visitors are sent to login and come back', async ({ page }) => {
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/login\?next=%2Fdemo$/);
  await page.getByLabel('Email').fill('owner@inkmesh.local');
  await page.getByLabel('Password').fill('inkmesh-dev');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/demo$/);
});
test('a wrong password stays on the form with one generic message', …); // URL still /login, text 'Email or password is incorrect', email kept
test('logout returns to login', …); // click 'Log out' in the shell header (added in Task 6: here, POST /logout directly with page.request and assert /demo redirects)
```

- [ ] **Step 3: Run** `npx vitest run src/lib/server` — FAIL; `npm run check` — errors on the old signatures.
- [ ] **Step 4: Implement** everything in Files. Login page: one centred column (max 360px), `inkmesh` wordmark, two labelled fields, one primary button, error text under the form in `--error`; tokens from `src/app.css`, no new colours.
- [ ] **Step 5: Run** `npm run check` (0 errors), `npx vitest run` (all pass), `npm run test:e2e` — all 16 old specs pass under the owner state, the 3 new pass.
- [ ] **Step 6: Commit** `feat(app): sessions, login, logout and protected routes`.

### Task 6: Home, workspace header, read-only mode for readers

**Files:**
- Create: `src/routes/(app)/+page.server.ts`, `src/routes/(app)/+page.svelte`, `src/lib/ui/Header.svelte`, `e2e/home.spec.ts`
- Modify: `src/routes/(app)/[workspace]/+layout.server.ts` (return `role`, `workspaces`), `src/routes/(app)/[workspace]/+layout.svelte` (use `Header`, hide the create form for readers), `src/routes/(app)/[workspace]/[...path]/+page.svelte` (read-only editor when `role === 'reader'`), `src/lib/editor/Editor.svelte` (prop `readonly: boolean`, `crepe.setReadonly(readonly)`; raw mode shows a read-only textarea), `src/lib/i18n/{en,fr}.ts`

**Interfaces:**
- Consumes: `workspacesOf`, `createWorkspace`, `roleOf` (Task 3); `requireRole` (Task 5).
- Produces:
  - `/` load: `{ workspaces: workspacesOf(user.id), admin: user.admin }`; action `create` (`name`, `slug`) for admins only (403 otherwise): `InvalidPath` → `fail(400, { createError: 'slug' })`, `Conflict` → `fail(409, { createError: 'exists' })`, success → `redirect(303, '/' + slug)`.
  - `Header.svelte` props `{ workspaces, current?: string, user, role?: Role, locale }`: workspace switcher (`<details>` menu listing the user's workspaces, current one marked), link `Members` when `role !== 'reader'`, link `Account` (route in Task 8), form button `Log out`. Fragment Mono for slugs. Replaces the existing `topbar` content; the phone opener stays.
  - Slug suggestion: client-side from the name (`lowercase, [^a-z0-9]+ → -, trim -`), editable.
  - i18n keys: `home.title`, `home.empty` ("You are not a member of any workspace yet. Ask for an invitation link."), `home.create`, `home.name`, `home.slug`, `home.slugBad`, `home.exists`, `nav.workspaces`, `nav.members`, `nav.account`, `role.owner`, `role.editor`, `role.reader`, `editor.readonly` ("You can read this document; editing needs the editor role").

- [ ] **Step 1: E2E** `home.spec.ts` (owner state):

```ts
test('home lists my workspaces with my role', …); // 'Demo' visible with 'owner'
test('an admin creates a workspace and lands in it', …); // name 'Side Project' → slug auto 'side-project' → URL /side-project, tree empty state visible
test('a bad slug is refused inline', …); // slug 'Bad Slug' → 'Lowercase letters, digits and dashes only'
```
  Plus in `e2e/login.spec.ts` replace the direct-POST logout test with: header `Log out` → `/login`.

- [ ] **Step 2: Run** `npm run test:e2e -- home` — FAIL.
- [ ] **Step 3: Implement.** Reader mode: the save action already throws `Forbidden` → 403; the page additionally never starts `Autosave` when `readonly`, and the strip shows `editor.readonly` instead of the save state.
- [ ] **Step 4: Run** `npm run check`, `npx vitest run`, `npm run test:e2e` — all pass.
- [ ] **Step 5: Commit** `feat(app): home with workspace list, header with switcher, read-only mode`.

### Task 7: Invitations and members page

**Files:**
- Create: `src/routes/invite/[token]/+page.server.ts`, `src/routes/invite/[token]/+page.svelte`, `src/routes/(app)/[workspace]/members/+page.server.ts`, `src/routes/(app)/[workspace]/members/+page.svelte`, `e2e/members.spec.ts`
- Modify: `src/lib/i18n/{en,fr}.ts`

**Interfaces:**
- Consumes: `invitation`, `acceptInvitation`, `createInvitation`, `pendingInvitations`, `revokeInvitation`, `members`, `setRole`, `removeMember` (Task 3); `createUser`, `userByEmail`, `createSession` (Task 2); `requireRole` (Task 5).
- Produces:
  - `/invite/[token]` load: `{ invitation: invitation(token) | null, user: locals.user }`; never returns the token. Actions: `join` (logged in: `acceptInvitation`, redirect to `/<slug>`), `signup` (`name`, `email`, `password`: existing email → `fail(409, { error: 'invite.exists' })`; short password → `fail(400, { error: 'invite.password' })`; else `createUser`, `acceptInvitation`, `createSession`, cookie, redirect). Invalid token → render the "no longer valid" state with status 410.
  - `/[workspace]/members` load (editor+): `{ members, pending, role }`. Actions: `invite` (`role`) → `{ link: url.origin + '/invite/' + token }` shown once; `revoke` (`id`); `setRole` (`userId`, `role`) owner only; `remove` (`userId`) owner only. `Conflict('last owner')` → `fail(409, { error: 'members.lastOwner' })`.
  - i18n keys: `invite.title` ("You are invited to {workspace} as {role}"), `invite.join`, `invite.name`, `invite.email`, `invite.password`, `invite.create`, `invite.exists` ("You already have an account, sign in to accept"), `invite.signin`, `invite.password` ("At least 10 characters"), `invite.invalid` ("This invitation is no longer valid"), `members.title`, `members.role`, `members.remove`, `members.pending`, `members.invite`, `members.link`, `members.copy`, `members.copied`, `members.expires`, `members.by`, `members.revoke`, `members.lastOwner` ("A workspace keeps at least one owner"). `t()` gains `{name}` interpolation: `t(key, locale, vars?: Record<string, string>)`.

- [ ] **Step 1: E2E** `members.spec.ts` (owner state, plus a fresh anonymous context for the invitee):

```ts
test('an owner invites an editor who signs up and edits', …); // members → invite role editor → read link → new context opens link → fills Nina / nina@example.ch / 'ten chars ok' → lands on /demo → opens project/prd.md → toolbar visible
test('the last owner cannot be demoted', …); // setRole self → reader → message 'A workspace keeps at least one owner', role still owner
test('a used link is no longer valid', …); // reopen the link from test 1 → heading 'This invitation is no longer valid'
test('a reader sees no Members link and gets 403 on /demo/members', …); // invite reader, sign up in a new context, header has no Members, goto /demo/members → 403 error page (a reader is a member, so 403, not 404)
```

- [ ] **Step 2: Run** `npm run test:e2e -- members` — FAIL.
- [ ] **Step 3: Implement.** Members page is a single column inside the shell's main area: members table (name, email in Fragment Mono, role select or text), pending links table, invite form; copy button uses `navigator.clipboard` with the link also in a read-only input.
- [ ] **Step 4: Run** `npm run check`, `npx vitest run`, `npm run test:e2e` — all pass.
- [ ] **Step 5: Commit** `feat(app): invitation links and members page`.

### Task 8: Account page

**Files:**
- Create: `src/routes/(app)/account/+page.server.ts`, `src/routes/(app)/account/+page.svelte`, `e2e/account.spec.ts`
- Modify: `src/lib/i18n/{en,fr}.ts`

**Interfaces:**
- Consumes: `updateName`, `changePassword` (Task 2).
- Produces: actions `rename` (`name`, non-empty, ≤ 80 chars) and `password` (`current`, `next`): wrong current → `fail(400, { error: 'account.wrong' })`, short → `fail(400, { error: 'account.short' })`, success → `{ ok: 'rename' | 'password' }`. Keys: `account.title`, `account.name`, `account.save`, `account.saved`, `account.password`, `account.current`, `account.next`, `account.change`, `account.changed`, `account.wrong`, `account.short`, `account.history` ("Your display name stays in the history of past changes").

- [ ] **Step 1: E2E** `account.spec.ts`: rename to `Owner 2` → header shows `Owner 2`; wrong current password → `account.wrong` text; set a new password then log out and back in with it (restore the original at the end so later specs keep working, or order this spec last: file name `zz-account.spec.ts`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** check, unit, e2e — PASS.
- [ ] **Step 5: Commit** `feat(app): account page`.

### Task 9: Deployment — service, quick tunnel, deploy script

**Files:**
- Create: `deploy/inkmesh.service`, `deploy/inkmesh-tunnel.service`, `deploy/cloudflared.yml` (phase B template), `deploy/env.example`, `scripts/deploy.sh`, `scripts/tunnel-url.sh`, `docs/deploy.md`
- Modify: `README.md` (link to `docs/deploy.md`), `docs/project/handoff.md` ("In production" section)

**Interfaces:**
- `deploy/inkmesh.service` (user unit): `ExecStart=/usr/bin/env node build`, `WorkingDirectory=%h/personal-projects/inkmesh`, `EnvironmentFile=%h/.config/inkmesh/env`, `Restart=on-failure`, `RestartSec=5`, `WantedBy=default.target`.
- `deploy/env.example` (phase A): `PORT=9310`, `HOST=127.0.0.1`, `PROTOCOL_HEADER=x-forwarded-proto`, `HOST_HEADER=host`, `BODY_SIZE_LIMIT=20M`, `INKMESH_DATA=/home/hermes/inkmesh-data`, `NODE_ENV=production`; a commented phase B block: `ORIGIN=https://inkmesh.ch` replacing the two header lines.
- `deploy/inkmesh-tunnel.service`: `ExecStart=%h/.local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:9310`, `After=inkmesh.service`, `Restart=on-failure`, `RestartSec=10`; a commented alternative `ExecStart` for phase B: `… --config %h/.cloudflared/config.yml tunnel run`.
- `deploy/cloudflared.yml` (phase B): `tunnel: inkmesh`, `credentials-file: /home/hermes/.cloudflared/<tunnel-id>.json`, ingress `inkmesh.ch` → `http://127.0.0.1:9310`, then `service: http_status:404`.
- `scripts/tunnel-url.sh`: `journalctl --user -u inkmesh-tunnel -o cat --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1`.
- `scripts/deploy.sh`: `set -euo pipefail; cd "$(dirname "$0")/.."; git pull --ff-only; npm ci; npm run build; systemctl --user restart inkmesh; systemctl --user is-active inkmesh`.
- `docs/deploy.md`: phase A steps (env file, both units, `scripts/deploy.sh`, `npm run admin -- create-admin`, `scripts/tunnel-url.sh`), then phase B steps marking the two that need Jon's browser (register `inkmesh.ch` and add the zone; `cloudflared tunnel login`), then `tunnel create`, config, `tunnel route dns`, env switch, restart both units. Backup and rollback are linked to architecture.md, not repeated.

- [ ] **Step 1: Verify** `npm run build && PORT=9310 HOST=127.0.0.1 PROTOCOL_HEADER=x-forwarded-proto HOST_HEADER=host INKMESH_DATA=/tmp/inkmesh-smoke node build` serves `/login` with 200 (`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9310/login`) and that a POST to `/login` with `Origin: https://example.trycloudflare.com` and `Host: example.trycloudflare.com` and `X-Forwarded-Proto: https` is not rejected as cross-site (status 400 with the form error, not 403). Stop it.
- [ ] **Step 2: Write** the files. Run `systemd-analyze --user verify deploy/inkmesh.service deploy/inkmesh-tunnel.service` — no errors (a warning about the missing EnvironmentFile is fine). `bash -n scripts/*.sh`.
- [ ] **Step 3: Install the app service**: `mkdir -p ~/.config/inkmesh`, copy `env.example` to `~/.config/inkmesh/env`, link both unit files into `~/.config/systemd/user/`, `systemctl --user daemon-reload`, `systemctl --user enable --now inkmesh`, `curl` `/login` on 9310 → 200. Do **not** start `inkmesh-tunnel`: starting it exposes the VPS publicly and is the controller's call with the owner (leave it enabled but stopped, say so in the report).
- [ ] **Step 4: Commit** `feat(deploy): systemd units, cloudflared quick tunnel, deploy script and guide`.

### Task 10: Design finish review of the new surfaces (controller-run)

Not a subagent implementation task. After Task 8: capture login, home, invitation, members and account at desktop and phone widths into `design/shots/`, dispatch `impeccable:impeccable-finish-reviewer` once on the five captures against `DESIGN.md` and the surface brief, apply its material fixes in one batch, re-capture once, then `impeccable:impeccable-documenter` to update `DESIGN.md` if new components appeared (header, menu, tables, forms). Record the ruling in the ledger; commit `style(app): finish review of milestone 2 surfaces`.

- [ ] Captures taken, finish review run, fixes applied, DESIGN.md updated or confirmed unchanged.
