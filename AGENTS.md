# inkmesh — Instructions

## Read before working
1. `docs/project/handoff.md` (current state).
2. Depending on the task: `docs/project/prd.md`, `docs/project/architecture.md`, `docs/project/decisions.md`, `DESIGN.md`, the plan in progress under `docs/plans/`.

The conversation and the owner's recent decisions take precedence over the documents.

## Goal
A self-hosted, open-source collaboration space where documents are real Markdown files on disk, edited by humans in the browser through a simple WYSIWYG editor and by AI agents through a remote MCP server or an HTTP API, with the same rights and the same tools.

## Stack and commands
SvelteKit (adapter-node) on Node 24, TypeScript, SQLite via `node:sqlite`, git CLI, remark, Milkdown, MCP TypeScript SDK. See `docs/project/decisions.md`.

- `npm run dev` — local server, data in `./.data`
- `npm test` — unit tests (Vitest), including Markdown round-trip fixtures
- `npm run check` — svelte-check
- `npm run build` — production build
- Deploy: see `docs/project/architecture.md`, owner's approval required

## Conventions
- Code, comments, commits, docs: English. Interface strings: French and English, through the i18n layer, never hard-coded.
- Every disk or git access lives in `src/lib/core/`. Routes, API and MCP adapters call `core`, nothing else.
- One Markdown parser configuration, shared between server and editor.
- Commits: imperative subject, one change per commit. Branch per milestone, merge into `main`.
- Simplicity first (ponytail): no option, abstraction or dependency nobody asked for.

## Forbidden and guard rails
- Owner's approval before: deploying to the VPS, changing the systemd units or the tunnel config (`deploy/`), deploying from `~/inkmesh-app`, running a migration on production data, sending a real email, deleting a workspace.
- Never read or write outside `$INKMESH_DATA` at runtime. Never write into `.git/` of a workspace except through `git` commands in `core`.
- Secrets only in the environment file; nothing in git.
- Do not weaken the round-trip tests to make a build pass.

## Cycle
`resume-project` → work → checks → `wrap-session`.

- Stack or new surface: `choose-stack`, decision in `decisions.md`.
- Design: `design-references` then `/impeccable` (writes `DESIGN.md` at the root). Animations CSS first; GSAP only inside `matchMedia` with `prefers-reduced-motion`.
- UI review: `review-ui`. Code review: `/code-review` (correctness), `ponytail-review` (simplicity).
