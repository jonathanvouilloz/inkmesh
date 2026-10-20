# Decisions — inkmesh

<!-- Append only. Never rewrite a decision: add one that replaces it. -->

## 2026-10-18 — Name, licence, languages
- Choice: the project is called inkmesh. Licence MIT (confirmed by the owner on 2026-10-20). Code, commits and docs in English; interface in French and English from the first screen.
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

## 2026-10-20 — Email over SMTP from the environment, nodemailer
- Choice: `SMTP_URL` (`smtp://`, `smtps://`, or `memory:` and `file:` for tests and trials), `MAIL_FROM` and `INKMESH_URL` turn email on, all three or none; a partial or invalid setup stops the start with a line naming the unset variable. Off, every email feature hides or says why, and password login works as before. Plain text only. Client: `nodemailer`, pinned exactly (no dependencies).
- Rejected: a hand-rolled SMTP client (about 250 lines of protocol we would own: STARTTLS, AUTH, dot-stuffing, encoded headers); an HTTP mail API (ties self-hosters to one vendor).
- Why: a lost magic link is a locked-out user; nodemailer has handled those edge cases for years and adds no transitive package.
- Reopen if: nodemailer stops being maintained or grows dependencies, or HTML email is wanted.

## 2026-10-20 — Email links use INKMESH_URL
- Choice: every URL in an email (sign-in link, invitation, digest inbox and unsubscribe) is built from `INKMESH_URL`. The invitation link shown on screen keeps the request's origin.
- Rejected: the request's origin: with `Host: evil.example` an attacker could have a victim emailed a valid token pointing to the attacker's server.
- Why: an email outlives the request that caused it and must point to the real instance.
- Reopen if: one instance must serve several public hostnames.

## 2026-10-20 — Failed sends log the user id and the error code only
- Choice: a failed send logs its label, the recipient's user id and nodemailer's `code`/`responseCode`, never `err.message`, the address or the URL.
- Rejected: logging the error message (it may hold the address, and a link holds a token).
- Why: logs leave the database's protection and must carry neither personal data nor credentials.
- Reopen if: failures cannot be diagnosed from the codes.

## 2026-10-20 — Magic links: single use, 15 minutes, POST to consume
- Choice: `/login?method=link` asks for an address; the answer is the same sentence for a known or unknown one, the send is not awaited, and the throttles (`link-ip` 10, `link-email` 3 per 15 minutes) count every request before the lookup. The token is stored hashed in `login_links`, lives 15 minutes, and a password change deletes it. The landing page's GET only reads; its POST consumes the link in one `DELETE … RETURNING` and starts the session. A refused address stays in the field; the sent state offers "Use another address".
- Rejected: consuming on GET (mail scanners open links and would burn them); a separate "forgot password" flow (the link is the recovery path, the CLI reset stays).
- Why: sign-in without a password, with no account enumeration and no state change on GET.
- Reopen if: users ask for longer-lived links, or scanners start POSTing.

## 2026-10-20 — Digest opt-in, daily slot, per-user state
- Choice: the daily digest is off until the user turns it on (account page). One slot a day at `DIGEST_HOUR` UTC (default 8); a run sends each opted-in user not yet served for the slot their unread events up to the slot, newest first, 50 lines at most. State is two columns per user (`digest_last_id`, `digest_sent_at`), none per event. The start-up catch-up and the timer call the same idempotent run, so a restart never sends twice for one slot. The timer is in memory, like the rate limits: a one-process shortcut.
- Rejected: on by default (nLPD art. 7, privacy by default: the digest hands paths and names to the SMTP provider); per-event state; immediate emails.
- Why: one short email on days that had changes, with the least stored state.
- Reopen if: users ask for immediate emails, mentions arrive, or the app runs as more than one process.

## 2026-10-20 — The digest cursor moves only when the digest turns on
- Choice: turning the digest on sets `digest_last_id` to the current highest event id; saving the setting while it is already on keeps the cursor, so pending events are not dropped. Turning it off and on again restarts from the present.
- Rejected: resetting the cursor on every save (a re-save silently skipped what was pending).
- Why: the first email covers only what happens after the opt-in, and a Save never loses news.
- Reopen if: users want a digest of the backlog when they opt in.

## 2026-10-20 — Digest delivery is at least once
- Choice: the state is written after the send succeeds; a failed send changes nothing, so the next slot carries those events. A crash between the send and the update repeats that digest at the next run.
- Rejected: marking before sending (a failed send would lose the events).
- Why: a duplicate email is a smaller harm than a lost one.
- Reopen if: duplicates are reported, or the SMTP provider offers idempotency keys.

## 2026-10-20 — One-click unsubscribe with an HMAC token
- Choice: each digest carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). The token is `<user id>.<HMAC-SHA256>` under a 32-byte key that migration `005-email` creates in `instance_keys`; it never expires and only turns the digest off, compared with `timingSafeEqual`. `/unsubscribe/<token>` acts only on POST; its GET shows one button. `/unsubscribe/` joins `isAgentPath`: exempt from the origin check (mail clients POST without `Origin`) and never reads the session cookie. `unsubscribe` is a reserved workspace slug.
- Rejected: a stored random token per user (more state, nothing gained); unsubscribing on GET (scanners).
- Why: stopping the digest must take one action and no login.
- Reopen if: the token needs to do more than stop the digest, or the key must rotate.

## 2026-10-20 — Inbox hint for the digest stays
- Choice: with email on and the digest off, the inbox shows one muted link "Get these changes by email once a day" to the account setting, on every visit.
- Rejected: hiding it once the user has turned the digest off (one more state for a quiet line).
- Why: it is a neutral link, not a prompt or a modal, and opt-in needs the setting to be findable.
- Reopen if: users complain about it.

## 2026-10-20 — Invitations by email, address not stored
- Choice: the members page's "New invitation link" form takes an optional address. The action validates one address and the `invite-mail` throttle (20 per 15 minutes per inviter) before creating anything, so a refusal creates no link. Once the link exists it is shown as before; a failed send says so and keeps the link. The address is not stored. Invitation and sign-in requests share one validator that accepts exactly one address (no list, no CR or LF).
- Rejected: storing the address (nLPD: only what the account needs); creating the link before the checks (a refusal left an unused link).
- Why: the link stays the invitation; email is a convenience on top.
- Reopen if: invitations must be addressed (resend, expiry reminders).
- Reopened 2026-10-20, see below.

## 2026-10-20 — Sort and filter in the URL, equality only, no YAML parser
- Choice: `?sort=<key>&order=asc|desc&<field>=<value>`, at most 5 equality filters ANDed (a list contains the value), case-insensitive. The form's `field`/`value` pair redirects (303) to the canonical URL, which also drops empty parameters and `order=asc`. Ties sort by name A→Z in both orders; sorting by name ignores Descending. `sort`, `order`, `field` and `value` are reserved and not offered as filters. Fields come from the frontmatter of the folder's direct documents through `frontmatterFields`: `key: value`, flow lists, and block lists whose `- item` lines are indented or at column 0; block scalars, anchors and aliases have no value; a `__proto__` key is skipped (it broke page serialisation).
- Rejected: a YAML parser dependency; operators other than equality; carrying fields on every tree node.
- Why: a shareable URL that works without JavaScript, public pages included, with no new dependency.
- Reopen if: frontmatter needs real YAML, users ask for ranges, OR filters or name Z→A.

## 2026-10-20 — The filter control reads "Add a filter"
- Choice: the select is labelled "Add a filter" / « Ajouter un filtre » with the first option "Choose a field" / « Choisir un champ »; active filters show in the sentence under the bar. Below 768 px the bar is a two-column grid.
- Rejected: "Filter by" with "No filter" (read as "no filter is active" while one was).
- Why: the select adds a filter; it does not show the current one.
- Reopen if: filters become removable one by one in the bar.

## 2026-10-20 — Public pages allow their own GET forms
- Choice: the `/s/` CSP has `form-action 'self'` instead of `'none'`, so the folder query form works on public pages.
- Rejected: no sort or filter on public pages.
- Why: public pages hold no POST form, and `/join/` lives outside `/s/`.
- Reopen if: a public page gains a POST form.

## 2026-10-20 — Docker image behind an HTTPS proxy; systemd stays the VPS reference
- Choice: a multi-stage `node:24-bookworm-slim` image with git, running as `node` (uid 1000), one `/data` volume, a healthcheck on `/login`; `compose.yaml` publishes on loopback only and reads `inkmesh.env`. The example sets `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH=1`, so a proxy is required: it must append or overwrite `X-Forwarded-For`, and a request straight to the port without that header answers 500. Verified by the owner on 2026-10-20: build, healthy within 60 s, `/login` 200, uid 1000, git 2.39, `create-admin`, `email: off`, `compose config` valid; image 711 MB.
- Rejected: leaving `ADDRESS_HEADER` unset (behind a proxy every throttle would key on the proxy's IP); a plain-http trial on port 3000 (the `Secure` cookie and the origin check need HTTPS).
- Why: other installers get a one-command start; this VPS keeps the systemd deploy it already runs.
- Reopen if: the owner's Docker check fails, or the VPS moves to containers.

## 2026-10-20 — MIT licence, the inkmesh authors
- Choice: `LICENSE` is MIT, "Copyright (c) 2026 the inkmesh authors"; `package.json` says `"license": "MIT"` and stays private. Replaces the 2026-10-18 "to confirm"; confirmed by Jon on 2026-10-20.
- Rejected: a copyleft licence.
- Why: the project is meant to be installed and adapted by others with the least friction.
- Reopen if: Jon does not confirm, or closed forks become a concern.

## 2026-10-20 — README in one file with a French section
- Choice: one English `README.md` with a short "En français" section at the end.
- Rejected: a full French translation in a second file.
- Why: one file cannot drift from its translation.
- Reopen if: French-speaking self-hosters need more than the summary.

## 2026-10-20 — Admin CLI unchanged
- Choice: `npm run admin` keeps its commands; `reset-password` stays the recovery path when email is off.
- Rejected: a test-email command, a digest command.
- Why: nothing in M6 needs the CLI.
- Reopen if: self-hosters need to check their SMTP setup without the UI.

## 2026-10-20 — Invitation address kept until the invitation is used
- Choice: an invitation stores the address it was mailed to (`invitations.email`, migration 006), and `/invite/<token>` uses it as the sign-up form's email default, still editable. Using the invitation clears the address, and creating any invitation clears it on expired ones.
- Rejected: not storing it (the invitee retyped an address we already had).
- Why: Jon's request after first real use.
- Reopen if: invitations must be addressed beyond sign-up (resend, expiry reminders), or the address must outlive the link.
