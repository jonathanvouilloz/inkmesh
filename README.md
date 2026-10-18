# inkmesh

A self-hosted collaboration space where documents are real Markdown files on disk, edited by people in the browser and by AI agents with the same tools.

## Requirements

Node 24 and git.

## Commands

- `npm install` — install dependencies
- `npm run seed` — create the `demo` workspace (idempotent)
- `npm run dev` — local server
- `npm test` — unit tests (Vitest)
- `npm run test:e2e` — browser tests (Playwright)

## Configuration

- `INKMESH_DATA` — data directory, default `./.data`. Each workspace is a git repository under `$INKMESH_DATA/workspaces/<slug>`.
- `BODY_SIZE_LIMIT` — largest accepted request body (adapter-node), default `512K`; raise it, for example to `5M`, to save larger documents.
