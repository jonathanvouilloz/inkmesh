# Handoff — inkmesh
Updated: 2026-10-18

## Where we are
Kickoff done: PRD validated, stack chosen and recorded, architecture written. No code yet. The folder is still named `comd`; rename to `inkmesh` at the end of a session when no session is running inside it.

## Next action
1. Design: `design-references` with the owner, then `/impeccable` to write `DESIGN.md`.
2. First plan (`docs/plans/`): milestone 1 = Milkdown round-trip spike on fixture files, then project skeleton (SvelteKit, `core.documents`, one workspace, read and edit a document).

## Blockers and owner actions
- Owner: provide design references (sites, screenshots) for the interface.
- Owner: confirm MIT before the public release.

## In production
Nothing deployed.

## Known traps
- Round-trip fidelity is the project's main risk: do not start UI work before the spike passes.
- OAuth for remote MCP clients is the second risk; bearer token is the fallback path and must work first.
- `node:sqlite` must be checked for FTS5 support in the spike.
