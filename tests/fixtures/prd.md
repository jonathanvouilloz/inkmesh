# PRD — inkmesh
Updated: 2026-10-18

## Problem

Markdown is the most efficient format for documents produced by AI agents and read by their owners. It is structured, diff-friendly, and carries metadata in its frontmatter. But sharing a Markdown file with other people so they can read it comfortably and edit it without knowing the syntax is hard. Notion and similar tools are built around their own block model: Markdown is only an import/export format, and an AI agent cannot act in them as a first-class user.

inkmesh is a self-hosted, open-source collaboration space where the unit of content is a real Markdown file on disk, and where humans (through the browser) and AI agents (through MCP or an HTTP API) are equal users of the same workspaces.

## Users

- **Owner** (Jon). Runs the instance on his VPS, creates workspaces, invites people, connects his own agents. Daily use, desktop first, phone for reading.
- **Invited collaborators.** Members of a project workspace. Some write Markdown, most do not: they need a simple rich-text editor with headings, bold, lists, tables and images. A few times a week, desktop and phone.
- **AI agents.** Each agent is connected by a human and acts with that human's rights, under its own name. It lists, reads, creates, edits and searches documents, reads comments. Several agents per human are expected (Claude Code, a reporting script, etc.).

No public signup. Everyone on the instance was invited by the owner or by a workspace member.

## Expected outcome

The first version is done when a project team of two or more humans and their agents works on one workspace for a real project:

- an agent drops a report into the workspace from the terminal in one command or one MCP call;
- a teammate who does not know Markdown opens it in the browser, edits a paragraph, adds a table row and an image, and saves without ever seeing raw Markdown or YAML;
- the owner can see who changed what and when, and restore a previous version;
- a comment left on the document by a human is read by an agent on its next run;
- a non-technical member connects Claude Desktop or Claude Code to the workspace in under two minutes, without a terminal, by following the "Connect your agent" page.

The repository is publishable as open source at that point: English code and docs, i18n with French and English interface.

## Scope, in priority order

1. **Workspaces and roles.** A workspace is a folder of Markdown files and assets on disk, versioned by git. Each member has one role: owner (manages members, roles and public links), editor (reads, writes, invites), reader (reads and comments). Non-members see nothing. An agent inherits the role of the human who connected it.
2. **Browsing.** A sidebar shows the real folder tree. Document lists can be sorted and filtered by frontmatter fields (date, tags, status, author, any field present). Frontmatter is displayed as a readable metadata block at the top of the document.
3. **Editing.** A WYSIWYG editor that reads and writes standard Markdown (CommonMark + GFM tables + frontmatter) with a limited toolbar: headings, bold, italic, bullet and numbered lists, task lists, tables, links, images, code blocks, quotes. A raw Markdown mode for those who want it. Round-tripping must not reformat content the user did not touch.
4. **Images.** Paste or drag an image into the editor; it is stored next to the document and referenced with a standard Markdown image link.
5. **Saving and conflicts.** The editor writes the file to disk a few seconds after the last keystroke, so no work is lost. One git commit per editing session: when the author leaves the document, after one minute idle, or right before another author writes the same file. Agent writes commit immediately, one write = one commit. Last write wins: if the file changed on disk since the editor loaded it, the editor warns before saving and shows the difference.
6. **Agent access.** A remote MCP server (one URL, nothing to install) and an HTTP API with the same capabilities: list workspaces, list and search documents, read, create, update, delete, read comments. Each agent has its own token, issued by a human and revocable; it carries that human's rights and the agent's name.
7. **Plug-and-play connection for non-technical users.** A "Connect your agent" page in the workspace: pick the tool (Claude Desktop, Claude Code, ChatGPT, Cursor, generic MCP client), name the agent, and get the exact thing to paste: a connector URL for tools that add remote MCP servers from their settings, a one-line command for Claude Code, a JSON snippet for the rest. Authorization goes through the browser (OAuth) where the tool supports it, so no token is ever copied by hand in that path. The page shows whether the agent has connected yet, and lets the human rename or revoke it.
8. **History.** Every save is a git commit attributed to the human, and to the agent when one acted ("Jon via claude-code"). The browser shows the document history and restores a version.
9. **Full-text search.** Across a workspace, same results for humans and agents.
10. **Comments.** A discussion thread per document, stored as a file next to the document so agents read it through the same tools. No inline anchors in v1.
11. **Public links.** A read-only link to a document or a whole workspace, usable without an account, revocable by an owner.
12. **Notifications.** An in-app inbox for every member: new comment, document changed by someone else, invitation. An MCP tool and API endpoint "what changed since my last visit" that returns the same events to agents. Email delivery (daily digest, immediate on mention) comes last in the build order.
13. **Accounts.** Password or magic-link login, invitation by an owner or editor, French and English interface.

## Out of scope

- Real-time multi-cursor editing (CRDT, presence).
- Database views (a folder displayed as a table with one column per frontmatter field), editing frontmatter through a form.
- Per-document permissions. Roles exist only at workspace level.
- Nested pages, Notion-style blocks, databases, templates, embeds.
- Public signup, billing, multi-tenant hosting.
- Mobile app. The web interface must be usable on a phone for reading and light edits.
- Export to PDF or other formats: the file is already Markdown.
- Push notifications.

## Constraints

- Lives on the owner's VPS alongside other projects; must run as a single service with its data in one directory that can be backed up with a copy.
- Documents are files on disk versioned by git. Everything that is not a document (accounts, roles, agent tokens, notifications, public links) lives in a small local database inside the same data directory. No external backend service.
- Workspaces are plain git repositories on disk: anything the agent writes through the API, a human could also write with a text editor and a `git commit`, and vice versa.
- Target: a clean first version in one to two months of part-time work, then open-source release.
- Code, commits, docs and comments in English. Interface in French and English from the first screen.
- Licence to be chosen before the public release (default proposal: MIT).
- Swiss nLPD: personal data is limited to name, email and login credentials; no analytics by default.

## Open questions

- Comment file format and location (sidecar `doc.comments.md` vs a `.inkmesh/` folder per workspace). Decided in architecture.
- Whether a workspace can be an existing git repository the owner points to, or must be created by inkmesh. Leaning: created by inkmesh in v1.
- How an agent discovers which workspace to write to by default (token scoped to one workspace, or workspace named in each call).
- Which clients support adding a remote MCP server with OAuth from their settings today (Claude Desktop and claude.ai do; to verify for ChatGPT, Cursor and others before writing the connection recipes).
