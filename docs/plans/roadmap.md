# Roadmap — inkmesh
Updated: 2026-10-19

Build order of the PRD scope (`docs/project/prd.md`, item numbers in brackets). Each milestone gets its own plan under `docs/plans/` when it starts, a branch, and a merge into `main`.

| Milestone | Content | Status |
|---|---|---|
| M1 | Round-trip editor, document tree, autosave [2 tree, 4, 6 autosave, 9 history list] | merged |
| M2 | Accounts, roles, invitations, deployment [1, 14 password] | merged |
| M3 | Managing files: folder view, import by drag and drop or picker, new folder, rename, move, delete, download [2 folder view, 3] | merged (plan: `2026-10-19-m3-files.md`) |
| M4 | Agents: agent tokens, HTTP API, remote MCP with OAuth, "Connect your agent" page, events table, commit per editing session [6, 7, 8] | plan: `2026-10-19-m4-agents.md` |
| M5 | Collaboration: comments, public links with optional sign-up, history restore (versions and deleted documents), full-text search, image paste, in-app inbox [5, 9, 10, 11, 12, 13 inbox] | |
| M6 | Release: frontmatter sort and filter in the folder view, magic links and email digests, Dockerfile, README, licence [2 filters, 13 email, 14 magic link] | |

Order rationale: M3 makes the instance usable for real files before agents arrive; M4 delivers the PRD's core promise (agents as equal users) and the event table that M5's inbox and "what changed since" read; M5's comments and public links reuse M4's API surface so agents get them on day one.
