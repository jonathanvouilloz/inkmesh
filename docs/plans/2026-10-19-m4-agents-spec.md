# Milestone 4 — Agents (spec)

Updated: 2026-10-19. Implements PRD items 6 (commit per editing session), 7 (agent access, minus search and comments) and 8 ("Connect your agent"), plus the events table that milestone 5's inbox reads. Architecture of record: `docs/project/architecture.md`; this spec only fixes what that document leaves open for this milestone. Milestone 3 (`createFolder`, `importDocument`, `movePath`, `deletePath`, `linksTo`) is assumed merged.

## Goal

Jon adds `https://<host>/mcp` to Claude (web, Desktop or Code), ChatGPT or Cursor, approves once in the browser, and his agent lists, reads and writes documents in his workspaces under the name he gave it ("Jon via claude"). A script does the same with one `curl` and a token copied from the "Connect your agent" page. A human editing in the browser produces one commit per editing session instead of one per autosave.

## Scope

1. Agents and their credentials: a manual bearer token (shown once) or OAuth tokens obtained through the browser. Listed, renamed and revoked on the Connect page.
2. HTTP API under `/api/v1`, bearer token only.
3. Remote MCP server at `/mcp` (Streamable HTTP), OAuth 2.1 or bearer token.
4. inkmesh as its own OAuth 2.1 authorisation server: metadata, dynamic client registration, consent screen, token endpoint with rotating refresh tokens.
5. Events table, written by every document write; "what changed since" for agents.
6. Commit per editing session for the editor.
7. "Connect your agent" page with one recipe per client.

Out of scope: see the last section.

## Decisions taken before this spec (not reopened)

A token belongs to a user and carries an agent name; calls run with that user's role in each workspace; the workspace is named in every call; tokens are random, stored as SHA-256 hex, shown once, revocable; error body `{ "error": { "code", "message" } }`; every capability goes through `core`; one Node process; MCP over Streamable HTTP with the official TypeScript SDK; OAuth 2.1 with PKCE, inkmesh as authorisation server, consent screen with agent name and inherited role; fallback is a bearer token from the Connect page.

## Decisions made by this spec

- **SDK package.** The official SDK is now v2, split into packages. Use `@modelcontextprotocol/server@^2.3.1` (dependencies: `zod ^4.2` and `@modelcontextprotocol/core` only). The v1 monolith `@modelcontextprotocol/sdk@1.32.1` pulls 17 packages (express, hono, cors, jose, ajv, express-rate-limit…). `zod@^4.2` is declared as a direct dependency because the tool schemas import it; it is the SDK's own dependency, not an addition.
- **Transport from SvelteKit.** `createMcpHandler(factory, options)` from `@modelcontextprotocol/server` returns `{ fetch(request: Request, { authInfo }): Promise<Response> }`, a Web-standard handler that a `+server.ts` returns directly. It serves the 2026-07-28 revision and, by default (`legacy: 'stateless'`), 2025-era clients statelessly (GET and DELETE answer 405). The lower-level `WebStandardStreamableHTTPServerTransport` (same package) is not needed. The handler does no token verification: inkmesh authenticates first and passes `authInfo`; the factory reads the actor from `authInfo.extra.actor`, so each request gets a server bound to its actor.
- **Client registration: dynamic client registration (RFC 7591) only, no Client ID Metadata Documents in M4.** The 2026-07-28 spec says CIMD SHOULD, DCR MAY (deprecated). But every target client still registers through DCR when the server does not advertise CIMD (Claude falls back to DCR; Claude Code uses DCR by default; ChatGPT and Cursor support DCR), while CIMD forces the server to fetch arbitrary HTTPS URLs from a VPS that also hosts tailnet-only services (SSRF). Reopen when a target client drops DCR.
- **No OAuth scopes.** The workspace role is the only permission. `scopes_supported` is omitted; a requested `scope` is ignored and none is returned.
- **Issuer and resource.** Issuer = the request origin (`url.origin`, derived from the proxy headers), no path. MCP resource = `<origin>/mcp`. A tunnel hostname change therefore invalidates OAuth tokens (resource mismatch → 401 → the client re-authorises).
- **One API write route.** `PUT …/documents/<path>` covers create (`If-None-Match: *`), update (`If-Match: "<hash>"`) and import/replace (no precondition). A failed precondition is `409 conflict` (not 412), with the current hash, as decided.
- **SvelteKit CSRF check replaced.** SvelteKit 3.1 refuses any `POST/PUT/PATCH/DELETE` whose content type is a form type or missing and whose `Origin` is not the app's own, including requests with no `Origin` at all. That blocks `/oauth/token` (form-encoded, server to server), `DELETE /api/...` (no body) and `curl --data-binary` (form type by default). The built-in check is turned off (`csrf.trustedOrigins: ['*']`) and the same rule runs in `handle`, except on the four cookie-free agent paths (`/api/`, `/mcp`, `/oauth/token`, `/oauth/register`). Those paths never read the session cookie, so CSRF does not apply to them.

## Data (migration `002-agents`)

```sql
CREATE TABLE oauth_clients (client_id TEXT PRIMARY KEY, name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL /* JSON array */, created_at TEXT NOT NULL);
CREATE TABLE agents (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  name TEXT NOT NULL, oauth_client_id TEXT REFERENCES oauth_clients ON DELETE SET NULL,
  created_at TEXT NOT NULL, last_used_at TEXT);
CREATE TABLE agent_tokens (token_hash TEXT PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bearer','access','refresh')), resource TEXT,
  expires_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE oauth_codes (code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents ON DELETE CASCADE, redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL, resource TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id INTEGER REFERENCES users ON DELETE SET NULL, author TEXT NOT NULL, agent TEXT,
  type TEXT NOT NULL CHECK (type IN ('create','update','move','delete')),
  path TEXT NOT NULL, from_path TEXT, commit_hash TEXT, at TEXT NOT NULL);
CREATE INDEX events_workspace ON events (workspace, id);
CREATE TABLE editing_sessions (workspace TEXT NOT NULL REFERENCES workspaces ON DELETE CASCADE, path TEXT NOT NULL,
  user_id INTEGER NOT NULL, author TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (workspace, path));
```

- `events.id` is `AUTOINCREMENT` so ids are never reused: the agent cursor stays monotonic. `author` is the display name at the time, so an event outlives its user.
- `editing_sessions.user_id` has no foreign key on purpose: a session of a deleted user must still be committed (author name kept), never dropped with its uncommitted text.
- Revoking an agent deletes its row; its tokens and codes cascade. Events and git history keep the agent's name as text.

## Tokens

| Token | Format | Stored | Lifetime |
|---|---|---|---|
| Manual bearer (Connect page) | `ink_` + 32 random bytes base64url (47 chars) | SHA-256 hex, `kind='bearer'`, `resource` null | until revoked |
| OAuth access | same format | `kind='access'`, `resource='<origin>/mcp'` | 1 hour |
| OAuth refresh | same format | `kind='refresh'`, `resource='<origin>/mcp'` | 30 days, rotated at every use |
| Authorisation code | 32 random bytes base64url | SHA-256 hex in `oauth_codes` | 60 seconds, single use |

- The `ink_` prefix lets secret scanners and logs recognise a leaked token. The hash covers the whole string.
- `/api/v1` accepts only `bearer` tokens. `/mcp` accepts `bearer` tokens, and `access` tokens whose `resource` equals `<origin>/mcp` and that have not expired (RFC 8707 audience check).
- Each authenticated call sets `agents.last_used_at` when it is older than one minute (one write per minute at most).
- Agent name: trimmed, 1–40 characters, no `<`, `>` or control characters (it lands in the git author `Jon via <name>`).
- Expired access tokens, refresh tokens and codes are deleted whenever a new token or code is issued. Registered clients older than 24 hours with no agent are deleted at each registration (Claude registers a new client per connection).

## Events

Every successful document write through `core` appends one event inside the workspace lock, after its commit: `createDocument` → `create`; `importDocument` → `create`, or `update` when it replaced; `movePath` → `move` (`path` = new, `from_path` = old; also for an empty folder, with no commit); `deletePath` → `delete` (a folder is one event); an editing-session commit → `update`. `createFolder` writes no event (git does not see empty folders). A write that changes nothing (empty commit) writes no event.

`changes(slug, actor, since?)` (role `reader`): events of the workspace not caused by this exact author (same `user_id` and same `agent`; an agent sees its human's edits, not its own). Without `since`: the 50 latest, oldest first. With `since`: events with `id > since`, oldest first, at most 200, `more: true` when there are more. `cursor` = id of the last event returned, or the workspace's current highest id when none is returned. Reads are not events.

Event JSON: `{ "id": 42, "type": "move", "path": "b.md", "from": "a.md", "author": "Jon", "agent": "claude", "commit": "<sha>", "at": "2026-10-19T…Z" }` (`from`, `agent`, `commit` omitted when null).

## Commit per editing session

- `writeDocument` (the editor's autosave, the only caller) writes the file and does not commit. Inside the workspace lock it upserts `editing_sessions (workspace, path, user_id, author, updated_at)` and re-arms an in-memory timer of 60 seconds for that path.
- A session ends, and is committed as `Update <path>` with its author (`commitAuthor({ id: user_id, name: author })`) plus one `update` event, when:
  1. **Idle:** the timer fires 60 s after the last save.
  2. **The author leaves the document:** the editor posts the `leave` action of the document page (in-app navigation, after its last save has resolved), or sends it with `navigator.sendBeacon` on `pagehide` (tab closed, phone backgrounded). `endSession` commits only when the session belongs to the caller.
  3. **Another author writes the same file:** every `core` write flushes the sessions it touches before writing, inside the same lock: `writeDocument` and `importDocument` the same path (unless the session's author is the writer: same `user_id`, no agent — then the session simply continues); `deletePath` the path and everything under it; `movePath` every session of the workspace (it may rewrite links in any document). An agent is always another author, so an agent write never mixes with a human's session.
  4. **Shutdown:** on `sveltekit:shutdown` (systemd stop, `SIGTERM`), every open session is committed before the process exits.
- **Restart with uncommitted changes.** Sessions live in SQLite, timers only in memory. The `init` hook commits every row left by a crash (author from the row) before serving requests. A row is deleted only after its commit succeeds; a failed commit stays and is retried at the next flush or start.
- A commit that finds nothing to stage (the author reverted their edit) deletes the row and writes no event.
- The `leave` beacon can arrive before a last in-flight autosave; that save then opens a new session that commits 60 s later. Two commits instead of one, nothing lost.
- History in the right rail shows a session once it is committed; the document itself is always current.

## HTTP API

Authentication: `Authorization: Bearer ink_…` (bearer tokens only). The session cookie is never read. No CORS headers (agents are not browsers). Paths in URLs are workspace-relative, one URL segment per path segment, percent-encoded.

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/v1/workspaces` | — | 200 `{ "workspaces": [{ "slug", "name", "role" }] }` | 401 |
| `GET /api/v1/workspaces/{ws}/tree` | — | 200 `{ "tree": TreeNode[] }` (M3 shape: `name`, `path`, `kind`, `title?`, `modified?`, `children?`) | 401, 404 |
| `GET /api/v1/workspaces/{ws}/documents/{path}` | — | 200 `{ "path", "content", "hash" }`, header `ETag: "<hash>"` | 400, 401, 404 |
| `PUT /api/v1/workspaces/{ws}/documents/{path}` | body: the file, UTF-8, ≤ 3 MiB, any content type; optional `If-None-Match: *` (create only) or `If-Match: "<hash>"` (update only) | 201 `{ "path", "hash" }` when created, 200 when updated or replaced | 400, 401, 403, 404 (`If-Match` on a missing file), 409 `{ "error": { "code": "conflict", "message", "currentHash": "<hash>" \| null } }`, 413 |
| `DELETE /api/v1/workspaces/{ws}/documents/{path}` | — (a folder path deletes the folder) | 204 | 400, 401, 403, 404 |
| `POST /api/v1/workspaces/{ws}/move` | JSON `{ "from", "to" }` | 200 `{ "path" }` | 400, 401, 403, 404, 409 |
| `GET /api/v1/workspaces/{ws}/changes?since={cursor}` | `since` optional integer ≥ 0 | 200 `{ "events": Event[], "cursor": number, "more": boolean }` | 400, 401, 404 |

Error mapping (one function, shared with MCP): missing or invalid token → 401 `unauthorized` with `WWW-Authenticate: Bearer realm="inkmesh"`; `Forbidden('not a member')` or unknown workspace → 404 `not_found` (slugs are not enumerable); `Forbidden('insufficient role')` → 403 `forbidden`; `InvalidPath`, bad JSON, bad `since` → 400 `bad_request`; `InvalidContent('not-utf8')` → 400; `InvalidContent('too-large')` or `content-length` over 3 MiB → 413 `payload_too_large`; `Conflict` → 409 `conflict`; `ENOENT` → 404; too many failed authentications → 429 `too_many_requests` (the only code added to the decided list). Unknown errors are 500 and are logged, never echoed.

Commit messages for agent writes are the M3 ones: `Import <p>` (create), `Replace <p>` (replace), `Update <p>` (update with a hash), `Move <a> to <b>`, `Delete <p>`; author `<Name> via <agent>`.

One-command drop of a report: `curl -X PUT -H "Authorization: Bearer $INKMESH_TOKEN" -H "Content-Type: text/markdown" --data-binary @report.md https://<host>/api/v1/workspaces/<ws>/documents/reports/report.md`.

## MCP server

`POST /mcp` (and `GET`, `DELETE`, answered by the SDK) at `<origin>/mcp`. Without a valid token: 401 with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp"` (plus `error="invalid_token"` when a token was sent). Server info `{ name: 'inkmesh', version: <package.json version> }`, instructions: "Every tool takes a workspace slug: call list_workspaces first. Paths are relative to the workspace; documents end in .md. Read a document before updating it and pass its hash as expected_hash." Request body limit 6 × the document cap + 64 KiB (worst-case JSON escaping of a 3 MiB document: a control byte becomes `\u00XX`, six bytes).

| Tool | Input (zod) | Output (text content, JSON) | Annotations |
|---|---|---|---|
| `list_workspaces` | `{}` | `{ workspaces: [{ slug, name, role }] }` | readOnly |
| `list_tree` | `{ workspace: string }` | `{ tree }` | readOnly |
| `read_document` | `{ workspace, path }` | `{ path, content, hash }` | readOnly |
| `create_document` | `{ workspace, path, content }` | `{ path, hash }`; conflict when it exists | not destructive |
| `update_document` | `{ workspace, path, content, expected_hash }` | `{ path, hash }`; conflict carries `currentHash` | — |
| `replace_document` | `{ workspace, path, content }` | `{ path, hash, replaced }` | destructive |
| `move` | `{ workspace, from, to }` | `{ path }` | — |
| `delete` | `{ workspace, path }` | `{ deleted: path }` | destructive |
| `changes` | `{ workspace, since?: number }` | `{ events, cursor, more }` | readOnly |

Every tool also declares `openWorldHint: false` (it touches only this instance); `—` means the MCP default (`destructiveHint` true for a tool that is not read-only). All strings are `z.string().min(1)`; `content` is `z.string()` (may be empty), `since` is `z.number().int().min(0).optional()`. A failed call returns `isError: true` with the same `{ "error": { "code", "message", … } }` body as the API, so the model can read it; protocol errors are left to the SDK. `content` is the full file, frontmatter included, stored byte for byte (no `patchMarkdown`: an agent writes like a text editor).

## OAuth 2.1 authorisation server

### Discovery

- `GET /.well-known/oauth-protected-resource/mcp` and `GET /.well-known/oauth-protected-resource` (RFC 9728, both, for clients that probe either):
  `{ "resource": "<origin>/mcp", "authorization_servers": ["<origin>"], "bearer_methods_supported": ["header"], "resource_name": "inkmesh" }`
- `GET /.well-known/oauth-authorization-server` (RFC 8414):
  `{ "issuer": "<origin>", "authorization_endpoint": "<origin>/oauth/authorize", "token_endpoint": "<origin>/oauth/token", "registration_endpoint": "<origin>/oauth/register", "response_types_supported": ["code"], "grant_types_supported": ["authorization_code", "refresh_token"], "code_challenge_methods_supported": ["S256"], "token_endpoint_auth_methods_supported": ["none"], "authorization_response_iss_parameter_supported": true }`
- All three: `content-type: application/json`, `access-control-allow-origin: *`, `cache-control: max-age=3600`. No `openid-configuration` (clients try `oauth-authorization-server` first).

### Registration — `POST /oauth/register` (RFC 7591)

JSON body ≤ 16 KiB. Accepted: `redirect_uris` (1–5 strings, each ≤ 512 chars, `https:` or `http:` with host `localhost` or `127.0.0.1`, no fragment), `client_name` (≤ 100 chars, default "MCP client"); every other field is ignored. Answer 201 `{ "client_id": <uuid>, "client_id_issued_at", "client_name", "redirect_uris", "grant_types": ["authorization_code","refresh_token"], "response_types": ["code"], "token_endpoint_auth_method": "none" }` (public client whatever was asked). Errors 400 `{ "error": "invalid_redirect_uri" | "invalid_client_metadata", "error_description" }`. Throttle: 100 registrations per client IP per 15 minutes, then 429.

### Authorisation — `GET /oauth/authorize` (consent page, behind login)

Query: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state` (echoed), `resource` (optional, defaults to `<origin>/mcp`), `scope` (ignored).

1. Unknown `client_id`, or `redirect_uri` not registered → an error page, **never a redirect**. Matching is exact, except loopback `http://localhost` and `http://127.0.0.1` URIs, where the port is ignored (RFC 8252 §7.3; Claude Code picks a port per session).
2. Logged-out visitor → `/login?next=<this URL>` (the `(app)` group already does it).
3. Any other bad parameter → redirect to `redirect_uri` with `error` (`unsupported_response_type`, `invalid_request` for missing or non-S256 PKCE, `invalid_target` when `resource` ≠ `<origin>/mcp`), `state` and `iss=<origin>`.
4. Otherwise the consent page: the client's self-declared name, the redirect host in Fragment Mono, an extra warning when the redirect is a loopback address ("This app runs on a computer. Continue only if you started this connection yourself."), an "Agent name" field prefilled with the client name, the user's workspaces with their role ("It acts as you: editor in Demo, reader in Clients"), **Allow** and **Deny**. Headers `x-frame-options: DENY` and `content-security-policy: frame-ancestors 'none'`.
5. **Allow** (form action, re-validates everything): reuses the user's agent for this client (renamed if the name changed) or creates one; issues a code bound to client, redirect URI, challenge, resource and agent; redirects to `redirect_uri?code=…&state=…&iss=<origin>`. **Deny** redirects with `error=access_denied&state=…&iss=…`.

### Token — `POST /oauth/token`

`application/x-www-form-urlencoded`, answers JSON with `cache-control: no-store`.

- `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`, optional `resource`: the code must exist, be unexpired, match client, redirect URI and (when sent) resource, and `base64url(sha256(code_verifier))` must equal the challenge. The code is deleted in the same transaction that issues the tokens, whatever the outcome after lookup (a second use always fails).
- `grant_type=refresh_token`, `refresh_token`, `client_id`, optional `resource`: the refresh token must exist, be unexpired, belong to an agent of this client; it is deleted and a new pair issued (rotation).
- Success 200 `{ "access_token", "token_type": "Bearer", "expires_in": 3600, "refresh_token" }`. Errors 400 `{ "error": "invalid_request" | "invalid_grant" | "invalid_client" | "unsupported_grant_type" | "invalid_target" }`; `invalid_grant` for any expired, used, revoked or mismatched code or refresh token.
- Throttle: 50 failed requests per client IP per 15 minutes, then 429.

No revocation endpoint: revocation is on the Connect page.

## "Connect your agent" page — `/<ws>/-/connect`

Inside the workspace shell, reachable by every member from a header link "Connect an agent". It lists **the user's agents** (one list for all workspaces, as tokens are per user): name, "via OAuth" or "token", created, last used or "Not connected yet" (the page re-loads every 5 seconds while such an agent is listed and the tab is visible), Rename, Revoke (with a confirmation). A line under the title: "An agent acts as you, with your role in each of your workspaces. Every change it makes is signed «You via its name»."

Then "Add an agent": a choice of tool, each showing the server URL `<origin>/mcp` with a copy button and its steps. Copy uses `navigator.clipboard`, the value is also in a read-only input. Steps verified against vendor docs on 2026-10-19 (sources below); the controller confirms each one against the live instance in Task 13.

- **Claude (web, Desktop, mobile).** Customize → Connectors → **Add custom connector**. Name `inkmesh`, URL `<origin>/mcp`. If the dialog asks how Claude identifies itself, choose **Register automatically**. **Add**, then **Connect**: inkmesh opens, name the agent, **Allow**. Free plan: one custom connector. Team and Enterprise: an organisation Owner adds it first under Organization settings → Connectors → Add → Custom → Web, then each member clicks **Connect**.
- **Claude Code.** In a terminal: `claude mcp add --transport http --scope user inkmesh <origin>/mcp`, then in Claude Code type `/mcp`, pick `inkmesh`, **Authenticate** (or run `claude mcp login inkmesh`). The browser opens inkmesh: name the agent, **Allow**.
- **ChatGPT.** Paid plans only. Settings → Apps → Advanced settings → turn on **Developer mode**; then create an app: name `inkmesh`, MCP server URL `<origin>/mcp`, authentication **OAuth**, confirm, then sign in to inkmesh and **Allow**. (Menu names move between ChatGPT releases; the page says so.)
- **Cursor.** Cursor Settings → Tools & MCP → **Add custom MCP** opens `~/.cursor/mcp.json`; paste `{ "mcpServers": { "inkmesh": { "url": "<origin>/mcp" } } }`, save, then click **Connect** (or "Needs login") next to inkmesh, and **Allow** in the browser.
- **Other MCP client** and **Script or HTTP API.** A form "Agent name" → **Create token** shows the token once (warning: "Copy it now, it will not be shown again") with, for MCP: `{ "mcpServers": { "inkmesh": { "type": "http", "url": "<origin>/mcp", "headers": { "Authorization": "Bearer <token>" } } } }`; for a script: the `curl` drop command above with the current workspace slug and a `reports/` path, plus `GET …/changes`. Claude Code users who prefer a token get `claude mcp add --transport http inkmesh <origin>/mcp --header "Authorization: Bearer <token>"`.

i18n: every string in `en` and `fr` (French with « » and non-breaking spaces before `:` `;` `?` `!`); command lines, JSON and URLs are not translated and use Fragment Mono. Key families: `connect.*` (page), `consent.*` (OAuth screen), `nav.connect`.

## Security rules

- **Authentication paths.** Session cookie for pages and form actions only; bearer token for `/api` and `/mcp` only. The API and MCP never read the cookie, the pages never accept a bearer token.
- **CSRF.** The replacement check in `handle` refuses (403) a `POST/PUT/PATCH/DELETE` with a form or missing content type whose `Origin` is not `url.origin`, on every path except `/api/`, `/mcp`, `/oauth/token`, `/oauth/register`.
- **Roles.** Unchanged: `core` checks the user's role on every call; an agent of a reader cannot write; a workspace the user is not a member of answers 404.
- **OAuth.** PKCE S256 required; redirect URIs exact (loopback port excepted) and checked before any redirect; codes 60 s and single use; access tokens 1 h bound to `<origin>/mcp`; refresh tokens rotated; `iss` in every authorisation response (RFC 9207); consent cannot be framed; the consent form is a SvelteKit action (same-origin check applies).
- **Rate limits** (the existing in-memory throttle, per key per 15 minutes, keys namespaced): failed bearer authentications per IP (`bearer|<ip>`, 10, counted only when a token was sent: clients probe without one), registrations per IP (`register|<ip>`, 100), failed token requests per IP (`token|<ip>`, 50). Successful agent traffic is not limited in M4. Anthropic's connector traffic comes from one shared range, so these limits are per Claude-wide IP, not per user; acceptable at this instance's size.
- **Audit.** Every agent write is a commit `<Name> via <agent>` and an event with `user_id` and `agent`. Agents and their last use are on the Connect page. Reads are not logged.
- **Secrets.** Tokens never appear in logs or URLs (query-string tokens are refused: only the header is read). Shown once.
- **Reserved slug.** `oauth` joins the reserved workspace slugs (`/oauth/...` routes). Before deploying, check that no production workspace uses it.

## Interface

Two new surfaces (Connect page, consent screen) and one header link, under `DESIGN.md` (Inter, Fragment Mono for URLs, commands, tokens and hosts; one accent; no eyebrow). Code blocks are read-only with a copy button; the tool choice is a radio group usable with the keyboard. `review-ui` runs on both surfaces at 1280 px and 390 px, light and dark, FR and EN; `impeccable-finish-reviewer` on the Connect page (new surface).

## Testing

- Unit: migration; events (append from each write, cursor, exclusion of own events); sessions (defer, idle with fake timers, flush by another author, same author continues, leave, recovery after a simulated restart, failed commit keeps the row); agents (token format, hash only in the database, rename, revoke kills tokens, access-token audience and expiry, last-use throttling); OAuth (registration validation, loopback port matching, code single use, PKCE, refresh rotation, revoked agent's refresh fails); CSRF rule matrix; API routes (each status code of the table); MCP tools through `mcpHandler.fetch` (list, read, update conflict, reader write refused).
- E2E: editing session (no commit while editing, one commit after leaving); full OAuth flow driven with `fetch` and the logged-in browser (register, consent, token, `tools/call`); Connect page (create token shown once, it works with `curl`-like fetch, revoke makes it 401).
- Real clients (manual, Task 13): Claude web, Claude Code, ChatGPT, Cursor against the deployed instance.

## Out of scope for this spec

Search and comments tools (M5); Client ID Metadata Documents; OAuth scopes and read-only or per-workspace tokens; token revocation (RFC 7009) and introspection endpoints; OpenID Connect discovery; refresh-token family revocation on reuse; per-agent request rate limits; folder creation, history and restore through the API; an event for empty-folder creation; MCP resources, prompts and `subscriptions/listen` notifications; the in-app inbox (M5) and email (M6); CORS for browser-based agents.

## Sources

- MCP authorization, revision 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- Authorization server discovery: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery
- Client registration (CIMD, DCR deprecated): https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration
- Security considerations: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations
- TypeScript SDK v2, `@modelcontextprotocol/server` 2.3.1 (README and `dist/*.d.mts`: `createMcpHandler`, `WebStandardStreamableHTTPServerTransport`, `McpServer.registerTool`, `AuthInfo`): https://www.npmjs.com/package/@modelcontextprotocol/server, https://ts.sdk.modelcontextprotocol.io/v2/ ; v1 dependencies from `npm view @modelcontextprotocol/sdk@1.32.1`
- Claude connectors, authentication (DCR/CIMD selection, callback `https://claude.ai/api/mcp/auth_callback`, loopback for Claude Code, refresh): https://claude.com/docs/connectors/building/authentication
- Claude, add a custom connector by URL: https://claude.com/docs/connectors/custom/add-unlisted
- Claude Code MCP (`claude mcp add --transport http`, `/mcp`, `claude mcp login`, DCR default): https://code.claude.com/docs/en/mcp
- ChatGPT Apps SDK authentication (CIMD or DCR, PKCE S256, `resource`, redirect `https://chatgpt.com/connector_platform_oauth_redirect` with RFC 9207): https://developers.openai.com/apps-sdk/build/auth ; developer mode steps (secondary, menu names vary): https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt (403 to automated fetch), https://www.elastic.co/docs/deploy-manage/app-connections/connect-mcp-host
- Cursor MCP (`mcp.json` `url`, OAuth redirects `http://localhost:8787/callback` and `https://www.cursor.com/agents/mcp/oauth/callback`): https://cursor.com/docs/mcp
- SvelteKit 3.1 CSRF rule: `node_modules/@sveltejs/kit/src/runtime/server/csrf.js` (`is_csrf_forbidden`) and `src/exports/vite/index.js` (`trustedOrigins: ['*']` disables it); adapter-node `sveltekit:shutdown`: `node_modules/@sveltejs/adapter-node/src/index.js`
