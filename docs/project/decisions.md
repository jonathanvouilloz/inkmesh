# Decisions — inkmesh

<!-- Append only. Never rewrite a decision: add one that replaces it. -->

## 2026-10-18 — Name, licence, languages
- Choice: the project is called inkmesh. Licence MIT, to confirm before the public release. Code, commits and docs in English; interface in French and English from the first screen.
- Rejected: working name "comd" (folder name only, to be renamed).
- Why: open-source project meant to be read and installed by others.
- Reopen if: a trademark conflict appears, or a copyleft licence is wanted to prevent closed forks.

## 2026-10-18 — Documents are Markdown files on disk, one git repository per workspace
- Choice: the source of truth for a document is a `.md` file in the workspace folder, images next to it. Each workspace is a plain git repository. Everything that is not a document (accounts, memberships and roles, agent tokens, notifications, public links) lives in a small SQLite database in the same data directory. No external backend.
- Rejected: a database as the source of truth with Markdown as import/export (including Convex); files on disk plus a separate index database as a second source of truth.
- Why: an agent or a human must be able to read the same file with `cat` or `git clone`, history comes free, a backup is a copy of one directory, self-hosting is one service.
- Reopen if: real-time multi-cursor editing becomes a requirement, which files plus git cannot serve.

## 2026-10-18 — Workspace-level roles, agents inherit their human's role
- Choice: three roles per workspace member: owner, editor, reader. An agent token is issued by a human and carries that human's role and the agent's name. No per-document permissions.
- Rejected: binary member / non-member; per-document permissions; a sandboxed "drafts only" mode for agents.
- Why: a team must be able to invite and manage itself; three roles are the smallest set that also covers public read-only sharing later.
- Reopen if: a client needs to see one document but not the workspace.

## 2026-10-18 — Saving: autosave to disk, one commit per editing session
- Choice: the editor writes the file a few seconds after the last keystroke. A commit is made when the author leaves the document, after one minute idle, or right before another author writes the same file. Agent writes commit immediately. Last write wins, with a warning and a diff when the file changed since the editor loaded it.
- Rejected: one commit per keystroke batch (unreadable history); explicit locks; CRDT real-time merge.
- Why: never lose work, keep a history a human can read, stay simple.
- Reopen if: simultaneous editing of the same document becomes frequent enough that the warning is a nuisance.

## 2026-10-18 — Agent access: remote MCP server plus HTTP API, OAuth where supported
- Choice: inkmesh exposes a remote MCP server (Streamable HTTP) and an HTTP API with the same capabilities. Clients that support it authorise through the browser (OAuth 2.1 with PKCE, inkmesh acting as authorisation server); the fallback is a bearer token copied from the "Connect your agent" page.
- Rejected: local stdio MCP server to install on each machine; git push/pull as the only agent interface; a dedicated CLI as the primary path.
- Why: non-technical members must connect Claude Desktop or Claude Code in under two minutes without a terminal.
- Reopen if: major clients drop remote MCP or OAuth support.

## 2026-10-18 — Stack: SvelteKit on Node 24, one process
- Choice: TypeScript end to end. SvelteKit (adapter-node) serves pages, HTTP API and the MCP server in one Node 24 process. SQLite through Node's built-in `node:sqlite`. Git through the `git` command line. Markdown through remark (unified) on the server and in the editor. Editor: Milkdown (ProseMirror on remark), to be confirmed by a one-day round-trip spike before any other UI work. MCP through the official TypeScript SDK. Lightweight in-house auth (sessions, hashed passwords, magic links). Deployed as a systemd service behind Caddy on the owner's VPS; a Dockerfile for other installers.
- Rejected: Next.js + React (same fit, heavier client, editor advantage marginal because Milkdown is framework-agnostic); Go backend + SvelteKit front (two languages, two Markdown parsers that would diverge); Hono + HTMX + a Vite island for the editor (hand-writing editor navigation, state and i18n that a framework provides); Cloudflare Workers (no persistent filesystem, no git).
- Why: the editor is JavaScript regardless; one language lets the server and the editor share one Markdown parser, which is the condition for a faithful round trip; the MCP TypeScript SDK is the reference implementation, including the authorisation-server helpers.
- Reopen if: the Milkdown spike fails and only a React editor holds the round trip (then Next.js); the WYSIWYG editor leaves the scope (then HTMX); single-binary distribution becomes the priority (then compile the same code with Bun before changing language).

## 2026-10-18 — Editor: Milkdown Crepe confirmed, with conditions (spike result)
- Choice: keep Milkdown Crepe as the WYSIWYG editor. Conditions: Crepe runs with its `ImageBlock` feature disabled (it overwrites image alt text with a ratio); every save goes through `patchMarkdown`, which keeps the original source of untouched blocks and absorbs Crepe's marker, padding and blank-line normalisation; `core` converts CRLF to LF before the editor sees a body and restores the file's original line endings on save.
- Rejected: a React editor (BlockNote, TipTap) — the spike showed no content loss that a configuration does not fix, so the stack decision stands; accepting Crepe's reformatting as-is — it breaks the PRD's "do not reformat untouched content".
- Why: the spike (`docs/plans/2026-10-18-m1-spike-results.md`) found every construct survives except image alt text under one optional feature; the formatting drift is exactly what block-level patching was designed for.
- Reopen if: editing (not only parse and serialise) turns out to lose content, or image paste cannot be implemented on the plain image node without `ImageBlock`.

## 2026-10-18 — Symlinks inside a workspace are rejected, not only escaping ones
- Choice: `resolveInside` requires the nearest existing ancestor's real path to equal its expected place under the real root; any symlink in the path throws `InvalidPath`. `.git` and `.inkmesh` are rejected as any segment, and documents must be `.md` files whose name does not start with a dot.
- Rejected: rejecting only links whose target leaves the root (the first implementation).
- Why: an in-root link `cfg.md -> .git/config` let a document write reach git's config, and `git add` executed a command from it (reproduced in review). Invariant 2 of the architecture is the security boundary.
- Reopen if: a workspace must contain intentional symlinks (then resolve them in `core` with an allow-list, never implicitly).

## 2026-10-18 — Reference-style links are protected by the block patch
- Choice: `patchMarkdown` resolves link and image references against the document's definitions when comparing blocks, and keeps original definition blocks the editor dropped. Kept definitions are never removed through the editor path (shortcut, commented).
- Rejected: documenting the editor's inlining of reference links as a known limit.
- Why: Crepe rewrites `[text][ref]` into inline links and drops `[ref]: url`; without protection, any edit elsewhere rewrote untouched paragraphs, breaking invariant 3 on README-style documents.
- Reopen if: definitions nested in lists or blockquotes (not protected today) turn out to be common, or users need to delete definitions from the rich editor.

## 2026-10-18 — End-to-end tests run on their own data directory
- Choice: Playwright seeds and serves from `.data-e2e`, wiped before each run; the suite runs on one worker in file order.
- Rejected: sharing the developer's `.data` (edits and commits accumulated across runs and loosened the assertions).
- Why: repeatable assertions (exact history count, deterministic create).
- Reopen if: the suite grows enough to need parallel workers; then each spec needs its own workspace.

## 2026-10-18 — Public URL through a Cloudflare Tunnel, quick tunnel until the domain exists
- Choice: the VPS keeps the files and git; `cloudflared` (user systemd service) exposes `127.0.0.1:9310` through an outbound tunnel. Phase A: a quick tunnel with a random `*.trycloudflare.com` hostname so the owner can test before registering `inkmesh.ch`. Phase B: a named tunnel on `inkmesh.ch` (domain free on 2026-10-18, registration by the owner). The app derives its origin from `X-Forwarded-Proto` and `Host` (adapter-node 6 bakes `paths.origin` at build time and ignores an `ORIGIN` env variable).
- Rejected: Caddy with DNS A records and open ports 80/443 (works, but the owner wants Cloudflare in front and no inbound ports); Cloudflare Workers hosting (no filesystem, already rejected); Tailscale Funnel (its three allowed ports are taken by tailnet-only services on this VPS).
- Why: zero inbound exposure, TLS and DDoS handled by Cloudflare, one browser authorisation when the domain comes.
- Reopen if: the quick tunnel's unannounced hostname changes become a problem before the domain exists (then register the domain earlier), or Cloudflare terms change for tunnels.

## 2026-10-18 — Invitations by single-use link, no email in milestone 2
- Choice: an owner or editor creates a link carrying a role (7-day expiry, token hashed in the database, one acceptance); the inviter sends it through their own channel. Editors invite readers and editors only; owners invite any role. A workspace keeps at least one owner. Password login with scrypt; a password change or CLI reset deletes every session of that user. Forgotten password = `npm run admin -- reset-password` by the instance admin.
- Rejected: email invitations and magic links now (SMTP to configure and a second delivery channel to test before the first user); open signup.
- Why: the smallest flow that lets a non-technical person join in one click; email arrives with notifications in milestone 3.
- Reopen if: invitees lose links often, or notifications bring SMTP anyway.

## 2026-10-18 — Instance admin flag, workspaces created only by admins
- Choice: `users.admin` (set by the CLI) grants workspace creation and nothing inside a workspace; slugs are `[a-z0-9][a-z0-9-]{1,39}` minus the reserved top-level route names.
- Rejected: any member creating workspaces (the VPS belongs to the owner; invitees should not fill it); an "instance owner" role mixed with workspace roles.
- Why: keeps workspace roles as the only permission model inside content.
- Reopen if: a trusted collaborator needs their own workspaces (then a per-user "may create" flag or a quota).

## 2026-10-19 — Move and delete
- Choice: links follow a move. In the same commit, every relative link or image URL that pointed into the moved item, and every relative URL inside a moved document, is rewritten; the move and rename dialogs say how many other documents will be updated. Delete renames the item into a trash location, then commits the removal; recovery is through git history.
- Rejected: leaving links broken; an opt-out checkbox nobody asked for; a trash folder in the tree.
- Why: relative links and images must survive a reorganisation, and one commit keeps the change reviewable and revertible.
- Reopen if: a workspace grows large enough that the link scan makes moves slow.

## 2026-10-19 — MCP SDK v2 server package
- Choice: `@modelcontextprotocol/server` with `createMcpHandler`, mounted in a SvelteKit `+server.ts` at `/mcp`.
- Rejected: the v1 monolith `@modelcontextprotocol/sdk` (17 runtime packages, express and hono among them).
- Why: two dependencies (`zod` and the SDK core) and a handler that takes a web `Request`, which is what SvelteKit gives.
- Reopen if: the v2 line is abandoned.

## 2026-10-19 — OAuth registration by DCR, no CIMD yet
- Choice: dynamic client registration (`POST /oauth/register`), public clients, PKCE S256.
- Rejected: Client ID Metadata Documents for now.
- Why: every target client (Claude, Claude Code, ChatGPT, Cursor) registers by DCR, and CIMD means fetching arbitrary URLs from the VPS.
- Reopen if: a target client drops DCR.

## 2026-10-19 — Editing sessions persisted in SQLite
- Choice: an open editing session (workspace, path, author) is a database row; it is committed under its author on idle, on leave, before another author writes the file, and at the next start after a crash or deploy.
- Rejected: committing everything dirty at start as an unknown author.
- Why: a restart must not lose who wrote what.
- Reopen if: sessions move out of the single process.

## 2026-10-19 — Origin check in handle
- Choice: SvelteKit's built-in origin check is off; `handle` refuses form and content-type-less writes whose `Origin` is not the app's own, except on the cookie-free agent endpoints (`/api/`, `/mcp`, `/oauth/token`, `/oauth/register`, `/.well-known/oauth-*`).
- Rejected: per-route exceptions, which SvelteKit does not offer.
- Why: SvelteKit 3.1 refuses origin-less form posts, which OAuth token requests and curl uploads are.
- Reopen if: SvelteKit adds per-route exemptions.

## 2026-10-19 — Rate limits sized for shared connector IPs
- Choice: per IP and per 15 minutes, 100 client registrations, 50 failed token requests, 10 failed bearer authentications, counted only when a token was sent.
- Rejected: the login limit of 10 everywhere.
- Why: Claude's connector traffic shares egress IPs across all its users, and MCP clients probe without a token first.
- Reopen if: registration spam appears.

## 2026-10-19 — MCP tool hints and body limit
- Choice: `openWorldHint: false` on every tool, `destructiveHint: false` on `create_document`; the `/mcp` body limit is 6 × the document cap + 64 KiB.
- Rejected: the SDK defaults (open world, destructive), which make clients ask for confirmation on a create; a flat 8 MiB limit.
- Why: the tools touch only this instance and a create never overwrites; a control byte JSON-escapes to six bytes, so a document at the cap must still fit.
- Reopen if: a tool starts reaching outside the instance, or the document cap changes shape.

## 2026-10-19 — Public pages rendered on the server and sanitised
- Choice: public pages, the version view and comment bodies are rendered by `renderHtml` (remark-rehype, rehype-sanitize with the default schema and `clobberPrefix: ''`, rehype-stringify). Raw HTML becomes code before rendering, so it shows as its source. Public pages ship no JavaScript and run under a strict CSP. Members keep the editor.
- Rejected: the editor in read-only mode (ships the editor bundle to visitors and keeps `javascript:` hrefs live).
- Why: a page a stranger opens must be inert by construction and work on a slow phone.
- Reopen if: the editor and the rendered page drift visibly for the same document.

## 2026-10-19 — Images in the document's folder, served at their natural URL
- Choice: a pasted or dropped image is stored next to its document as `<doc base>-<8 hex>.<ext>` and linked by that relative name. PNG, JPEG, GIF and WebP only, 5 MiB at most, the extension and the signature must agree on upload and on every serve. SVG is refused. The `reroute` hook sends image paths under a workspace or a public link to the raw routes. Folder names ending in an image extension are refused.
- Rejected: `<doc>.assets/` folders (they fill the tree); sanitising SVG (a dependency, and still a script-capable format on the origin).
- Why: the Markdown stays readable with `cat` and any other tool resolves the image; no URL rewriting anywhere.
- Reopen if: users need SVG, or a way to manage and clean up images.

## 2026-10-19 — Public links under /s/, cookie-free; sign-up at /join/
- Choice: a public link is a random token (stored hashed) under `/s/<token>/…`, read-only, scoped to one document or one workspace, checked in `core`. `handle` returns before the cookie lookup on `/s/`. Sign-up from a link, when its owner turned it on, is a separate route `/join/<token>` because it creates a session.
- Rejected: public pages inside the app shell with an anonymous session.
- Why: a public page can never act as a member or leak a session, and the token stays out of referrers.
- Reopen if: links need an expiry, a password or analytics.

## 2026-10-19 — Inbox on one cursor per user; joins as invitation events
- Choice: the inbox reads the events table with one read cursor per user (a global event id); a user without one starts at the present. Invitations appear as `join` events, since M2 invitations are links addressed to nobody.
- Rejected: per-event read flags; a separate notifications table.
- Why: one number per user covers "what changed since I looked", for humans and agents alike.
- Reopen if: email digests need per-event state.

## 2026-10-19 — Image paste through Crepe's upload plugin
- Choice: the editor overrides Crepe's `uploadConfig` with an uploader that posts the file to `/<ws>/-/images` and inserts the plain image node.
- Rejected: enabling `ImageBlock`.
- Why: with `ImageBlock` off, Crepe's upload plugin already inserts the plain image node, so the 2026-10-18 reopen condition ("image paste cannot be implemented on the plain image node") did not trigger.
- Reopen if: Crepe drops the upload plugin or changes the node it inserts.

## 2026-10-20 — A new document at a path drops the public links on it
- Choice: creating, importing or moving a document onto a path deletes the public links on that path (and under it, for a folder) in the same write. Delete keeps the links (they answer 404); `restoreDeleted` brings the same document back and the links with it.
- Rejected: keeping links on any path forever (the spec's first reading).
- Why: a client's old link must never show a different document that later lands at the same path.
- Reopen if: owners want links to survive a deliberate delete and re-create (today they must share again).

## 2026-10-20 — Public links carry a 4-character hint
- Choice: migration `004-link-hint` stores the last 4 characters of a link's token (null for older links). The members page, its accessible names and the revoke dialog show it ("Whole workspace …x1Ab").
- Rejected: showing only the scope, which makes two links to the same scope indistinguishable.
- Why: an owner must know which link they revoke. Four characters (about 24 of 256 bits) do not help guess a token.
- Reopen if: links get names chosen by their owner.

## 2026-10-20 — Join and invitation pages send same-origin referrers
- Choice: `/join/` and `/invite/` answer with `referrer-policy: same-origin`, `cache-control: no-store` and `x-robots-tag: noindex, nofollow`. `/s/` keeps `no-referrer`, since it posts nothing.
- Rejected: `no-referrer` on the sign-up pages: browsers then send `Origin: null` on the form POST and `csrf.ts` refuses the sign-up.
- Why: the token never leaves the origin, and the sign-up still passes the origin check.
- Reopen if: the origin check stops relying on `Origin`.

## 2026-10-20 — The inbox shows the 50 latest lines
- Choice: `inbox(userId)` returns the 50 latest events, a literal limit; the unread count stops at 100 (the header shows "99+").
- Rejected: a limit parameter (unused, and `LIMIT -1` would have meant unlimited).
- Why: the inbox answers "what happened lately"; older events stay in history.
- Reopen if: the inbox needs paging or filters.

## 2026-10-20 — Prefilled inputs use defaultValue
- Choice: a server-prefilled text input in a page that hydrates (a value kept after a failed post) uses `defaultValue={…}`, or `bind:value`, never `value={…}`.
- Rejected: `value={form?.x ?? ''}`: at hydration Svelte sets `input.value` and erases what a visitor typed before the scripts ran.
- Why: on a slow network a person types into the server-rendered form before it hydrates; their text must survive.
- Reopen if: Svelte stops resetting `value` at hydration.
