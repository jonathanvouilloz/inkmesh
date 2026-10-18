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
