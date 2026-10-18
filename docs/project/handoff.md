# Handoff — inkmesh
Updated: 2026-10-18

## Where we are
Milestone 1 is built on branch `m1-skeleton` (not merged into `main`): core (safe paths, git, shared remark processor, block-level `patchMarkdown` that keeps untouched blocks byte-identical, documents with SHA-256 conflict detection and a per-workspace write lock), seed script, workspace shell with folder tree and create form, document page with Milkdown Crepe (ImageBlock off), raw mode, right rail (frontmatter, git history), debounced autosave with conflict handling, error page, FR/EN i18n. 73 unit tests, 16 Playwright e2e on an isolated `.data-e2e`. Every task was reviewed by a fresh reviewer; the whole branch had a final review, one fix wave and one regression patch. Design: impeccable finish review shipped; `DESIGN.md` and `.impeccable/design.json` written from the built surface. The spike that confirmed Crepe is in `docs/plans/2026-10-18-m1-spike-results.md`.

The folder is still named `comd`; rename to `inkmesh` (`mv /home/hermes/personal-projects/comd /home/hermes/personal-projects/inkmesh`) when no session runs inside it.

## Next action
1. Owner: merge `m1-skeleton` into `main` (or ask for changes). Run `npm run seed && npm run dev` to try it: `/demo`.
2. Milestone 2 plan (`docs/plans/`): accounts and sessions, workspace memberships with roles, HTTP API and remote MCP server on top of `core`, agent tokens and the "Connect your agent" page, commit-per-editing-session. Then milestone 3: search (FTS5), comments, notifications, public links, image paste.

## Blockers and owner actions
- Owner: merge decision; rename the folder; confirm MIT before the public release.
- Deferred to milestone 2 (from reviews, all ledgered): LCS prefix/suffix trimming and `listTree` caching for large workspaces; definitions nested in lists or blockquotes are not protected by `patchMarkdown`; a failed create leaves the file staged; atomic rename resets the file mode; `gitLog` keeps the subject line only; title regex can match `# ` inside a fence; history has no `--follow`; Crepe's toolbar and slash-menu strings are English; HTML blocks render as source, not natively; image paste needs a custom handler without ImageBlock.

## In production
Nothing deployed. Before the first VPS deploy: set `BODY_SIZE_LIMIT` (adapter-node, 512K default), systemd user service with `INKMESH_DATA`, Caddy in front (see architecture.md).

## Known traps
- Never bypass `core` for disk or git access; every path goes through `resolveInside` (in-root symlinks are rejected on purpose: a link to `.git/config` was a command-execution path).
- `patchMarkdown` works on top-level blocks: editing one list item re-emits the whole list in normalised form (shortcut, documented).
- The e2e suite runs on one worker in alphabetical file order and depends on it; enabling retries or sharding breaks `document.spec`.
- The dev `.data/workspaces/demo` accumulates commits from manual use; `rm -rf .data/workspaces/demo && npm run seed` resets it.
- Crepe must run with `ImageBlock` disabled (`src/lib/editor/config.ts`), or image alt text is lost.
