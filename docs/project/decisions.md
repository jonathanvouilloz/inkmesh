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
