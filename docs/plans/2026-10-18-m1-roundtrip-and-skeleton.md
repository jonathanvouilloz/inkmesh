# Milestone 1: Markdown round-trip spike and project skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a WYSIWYG editor can edit real Markdown files without reformatting what the user did not touch, then ship the smallest inkmesh that lists, reads and edits documents of one workspace with git history.

**Architecture:** One SvelteKit (adapter-node) process. `src/lib/core/` is the only code that touches the data directory: safe paths, git, Markdown (shared remark config and block-level patching), documents. Routes are thin adapters over `core`. The editor is Milkdown Crepe, the one client-side island; raw mode is a textarea on the same page. No database, no accounts and no API in this milestone: the actor is a configured name, the HTTP and MCP adapters come in milestone 2 on top of the same `core`.

**Tech Stack:** Node 24, TypeScript, SvelteKit 3 + Svelte 5, Vitest 5, Playwright, remark 15 (remark-parse, remark-stringify, remark-gfm, remark-frontmatter), Milkdown Crepe 7.22, git CLI, @fontsource-variable/inter, @fontsource/fragment-mono.

**Spec:** `docs/project/prd.md`, `docs/project/architecture.md`, `docs/project/decisions.md`, direction contract in `.impeccable/surfaces/src-routes-app-workspace-path-page-svelte.md`.

## Global Constraints

- Node 24, TypeScript everywhere, English code, comments, commits and docs.
- Interface strings in French and English through `src/lib/i18n`, never hard-coded in components.
- All disk and git access lives in `src/lib/core/`; routes never import `node:fs` or run `git`.
- Data directory from `INKMESH_DATA` (default `./.data`, git-ignored); workspaces in `$INKMESH_DATA/workspaces/<slug>/`.
- Paths resolved inside the workspace; `..`, absolute paths, symlinks, `.git/` and `.inkmesh/` rejected.
- Invariant 3: saving a document the user did not edit must not change a byte; untouched blocks keep their original source.
- Commit author: display name, synthetic email `user-<id>@inkmesh.local`; `via <agent>` appended to the name when an agent acted.
- Light mode, WCAG 2.2 AA contrast, every action keyboard-reachable, usable at 390px wide.
- Design tokens exactly as the direction contract: ground `#FBFBFA`, panel `#F3F3F0`, hairline `#E4E4E0`, ink `#1C1C1A`, muted `#6E6E68`, accent `#2A47D1`; Inter 16.5px/1.6 body and 13px chrome; Fragment Mono 12.5px for paths, keys, hashes, timestamps, raw mode; radius 6px; motion 150ms ease-out inside `prefers-reduced-motion: no-preference`.
- Simplicity (ponytail): no option, abstraction or dependency nobody asked for; shortcuts carry a `shortcut:` comment.

## Review Focus

1. File and folder names with spaces, accents and non-Latin characters (`rapports/réunion été.md`) must list, open and save; pinned in Task 5.
2. Files with CRLF line endings written by a Windows agent must round-trip unchanged when untouched; pinned in Task 4.
3. A document with no frontmatter, and one that is only frontmatter with an empty body, must open and save; pinned in Task 4.
4. A symlink inside the workspace pointing outside it must be refused on read and write; pinned in Task 3.
5. A file deleted on disk while the editor is open must produce a clear conflict on save, not a new file silently recreated; pinned in Task 5.

---

### Task 1: Project scaffold, tokens, fonts, i18n

**Files:**
- Create: SvelteKit project at the repo root via `npx sv@latest create . --template minimal --types ts --no-add-ons --no-install` then add `vitest`, `playwright` and `adapter-node`
- Create: `src/app.css` (tokens and base styles), `src/lib/i18n/index.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/fr.ts`
- Modify: `svelte.config.js` (adapter-node), `.gitignore` (already lists `.data/`), `AGENTS.md` only if a command name differs from what it records
- Test: `src/lib/i18n/index.test.ts`

**Interfaces:**
- Produces: `t(key: keyof typeof en, locale: Locale): string` and `type Locale = 'en' | 'fr'` from `src/lib/i18n`; CSS custom properties `--ground`, `--panel`, `--hairline`, `--ink`, `--muted`, `--accent`, `--ok`, `--warn`, `--error`, `--font-text`, `--font-mono`, `--radius`, `--ease` in `src/app.css`.

- [ ] **Step 1: Scaffold** with the `sv create` command above, then run `npm i -D vitest @playwright/test` and `npm i @sveltejs/adapter-node @fontsource-variable/inter @fontsource/fragment-mono`. Switch `svelte.config.js` to `adapter-node`. Add scripts: `test` → `vitest run`, `test:e2e` → `playwright test`, `check` → `svelte-check`.
- [ ] **Step 2: Write the failing test** `src/lib/i18n/index.test.ts`: `t('save.saved', 'fr')` returns `"Enregistré"`, `t('save.saved', 'en')` returns `"Saved"`, and `Object.keys(fr)` deep-equals `Object.keys(en)` so no key is missing in one language.
- [ ] **Step 3: Run** `npx vitest run src/lib/i18n` — expected FAIL, module not found.
- [ ] **Step 4: Implement** `en.ts` and `fr.ts` as flat objects with these keys and values: `app.name` "inkmesh"; `tree.new` "New document" / "Nouveau document"; `tree.search` "Search" / "Rechercher"; `strip.raw` "Raw" / "Brut"; `strip.rich` "Editor" / "Éditeur"; `save.saving` "Saving…" / "Enregistrement…"; `save.saved` "Saved" / "Enregistré"; `save.conflict` "This file changed on disk since you opened it. Reload to see the new version." / "Ce fichier a changé sur le disque depuis son ouverture. Rechargez pour voir la nouvelle version."; `save.error` "Could not save" / "Enregistrement impossible"; `rail.file` "File" / "Fichier"; `rail.history` "History" / "Historique"; `rail.via` "via"; `empty.pick` "Pick a document in the tree" / "Choisissez un document dans l'arborescence". `index.ts` exports `t` reading the locale's object. Locale comes from the `Accept-Language` header in `src/hooks.server.ts` (`fr` if it starts with `fr`, else `en`) and is passed through `event.locals.locale`.
- [ ] **Step 5: Tokens** in `src/app.css`: the custom properties above with the contract's values, `--ok #1B7F3B`, `--warn #B26B00`, `--error #B3261E`, font imports from the two fontsource packages, `body` background `var(--ground)` colour `var(--ink)` font `var(--font-text)`, and a `@media (prefers-reduced-motion: reduce) { * { transition: none !important } }` rule.
- [ ] **Step 6: Run** `npx vitest run src/lib/i18n` and `npm run check` — expected PASS, zero errors.
- [ ] **Step 7: Commit** `chore: scaffold SvelteKit app with tokens, fonts and i18n`.

### Task 2: Milkdown Crepe round-trip spike (go / no-go gate)

**Files:**
- Create: `tests/fixtures/*.md` (copy `docs/project/prd.md` and `docs/project/architecture.md`, plus `kitchen-sink.md` written by hand: frontmatter, H1 to H4, bold, italic, links, an image, bullet list with `-`, numbered list, nested list, task list, GFM table, fenced code block with language, blockquote, horizontal rule, a raw HTML block `<details>`, a hard line break, CRLF variant `kitchen-sink-crlf.md`)
- Create: `src/lib/editor/roundtrip.spike.test.ts`
- Create: `docs/plans/2026-10-18-m1-spike-results.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a written go / no-go. Go means every fixture survives Crepe parse → serialize with no lost content (text, links, images, table cells, code), even if whitespace or markers differ. No-go means content is lost, and the plan stops: the owner decides between Milkdown with a custom remark plugin or a React editor (decision recorded in `decisions.md` before continuing).

- [ ] **Step 1: Install** `npm i @milkdown/crepe` and `npm i -D happy-dom`; set `test.environment` to `happy-dom` for files matching `*.spike.test.ts` in `vite.config.ts`.
- [ ] **Step 2: Write the test**: for each fixture, create `new Crepe({ root: document.createElement('div'), defaultValue: body })` where `body` is the fixture with its frontmatter removed by a regex on `^---\n[\s\S]*?\n---\n`, `await crepe.create()`, `const out = crepe.getMarkdown()`. Assert `normalize(out) === normalize(body)` where `normalize` lowercases nothing, but: collapses runs of blank lines, trims trailing spaces, replaces `*` list markers with `-`, replaces `__`/`_` emphasis with `**`/`*`, and strips the table alignment dashes to a single `-`. Print to stdout the unified diff (`npm i -D diff`) of the raw `out` versus `body` for each fixture, so the report can classify what Crepe changes.
- [ ] **Step 3: Run** `npx vitest run src/lib/editor/roundtrip.spike.test.ts`. Expected: the assertions tell which fixtures are semantically equal; the diffs tell what formatting Crepe normalises.
- [ ] **Step 4: Write the report** `docs/plans/2026-10-18-m1-spike-results.md`: one table row per fixture (semantic match yes/no, formatting changes observed, content lost if any), then the verdict line `GO` or `NO-GO` with the reason. Note anything Crepe drops (HTML blocks are the likely one).
- [ ] **Step 5: Decide.** GO: continue. NO-GO: stop and present the report to the owner with the two options from the decision record. Commit `test: Milkdown round-trip spike and results` either way.

### Task 3: Safe paths and git in `core`

**Files:**
- Create: `src/lib/core/data.ts`, `src/lib/core/paths.ts`, `src/lib/core/git.ts`
- Test: `src/lib/core/paths.test.ts`, `src/lib/core/git.test.ts`

**Interfaces:**
- Produces:
  - `dataDir(): string` (absolute `INKMESH_DATA` or `<cwd>/.data`) and `workspaceDir(slug: string): string` in `data.ts`; `slug` must match `/^[a-z0-9][a-z0-9-]{0,63}$/` or throws `InvalidPath`.
  - `resolveInside(root: string, rel: string): string` in `paths.ts`: returns the absolute path or throws `InvalidPath`; rejects `..` segments, absolute `rel`, empty, a leading `.git/` or `.inkmesh/` segment, and any existing path whose `realpath` is outside `root`.
  - `class InvalidPath extends Error` and `class Conflict extends Error` in `paths.ts`.
  - `gitInit(dir: string): Promise<void>`, `gitCommit(dir: string, opts: { paths: string[]; message: string; author: { name: string; email: string } }): Promise<string>` (returns the commit hash; runs `git add -A -- <paths>` then `git commit`, and returns `''` without committing when nothing is staged), `gitLog(dir: string, path: string, limit: number): Promise<Array<{ hash: string; name: string; date: string; message: string }>>` in `git.ts`, all via `execFile('git', ...)` from `node:child_process`, with `GIT_CONFIG_NOSYSTEM=1` and `-c commit.gpgsign=false`.

- [ ] **Step 1: Write the failing tests** in `paths.test.ts`: `resolveInside(root, 'a/b.md')` returns `${root}/a/b.md`; `'../x.md'`, `'/etc/passwd'`, `''`, `'.git/config'`, `'.inkmesh/comments/x.md'` each throw `InvalidPath`; a symlink `root/link` created with `fs.symlinkSync('/tmp', root + '/link')` makes `resolveInside(root, 'link/x')` throw `InvalidPath` (Review Focus 4). In `git.test.ts`, using a `fs.mkdtempSync` dir: after `gitInit`, writing `a.md` and `gitCommit(dir, { paths: ['a.md'], message: 'add a', author: { name: 'Jon via test', email: 'user-1@inkmesh.local' } })` returns a 40-char hash and `gitLog(dir, 'a.md', 5)` has one entry with `name === 'Jon via test'`; a second `gitCommit` with no changes returns `''`.
- [ ] **Step 2: Run** `npx vitest run src/lib/core` — expected FAIL, modules not found.
- [ ] **Step 3: Implement** the three files with the signatures above.
- [ ] **Step 4: Run** `npx vitest run src/lib/core` — expected PASS.
- [ ] **Step 5: Commit** `feat(core): safe paths and git helpers`.

### Task 4: Shared Markdown processor, frontmatter split, block-level patch

**Files:**
- Create: `src/lib/core/markdown.ts`
- Test: `src/lib/core/markdown.test.ts` using `tests/fixtures/*.md` from Task 2

**Interfaces:**
- Produces:
  - `splitFrontmatter(source: string): { frontmatter: string; body: string }` where `frontmatter` is the verbatim leading block including both `---` fences and its trailing newline, or `''`; `frontmatter + body === source` always.
  - `frontmatterEntries(frontmatter: string): Array<[string, string]>`: top-level `key: value` lines only, trimmed, in order. `shortcut: no YAML parser, nested values are shown as their raw line; upgrade when filtering by frontmatter lands (milestone 3)`.
  - `processor`: the one unified instance `unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']).use(remarkStringify, { bullet: '-', emphasis: '*', strong: '*', fences: true, rule: '-' })`, exported for the editor to reuse.
  - `patchMarkdown(original: string, edited: string): string`: parses both bodies with `processor`, pairs top-level mdast children by a longest-common-subsequence on their `processor.stringify` form, emits for every unchanged block the original source slice (`node.position.start.offset` to `end.offset`) with the original separator that followed it, and for changed or new blocks the `edited` source slice. Preserves the original's line ending style (`\r\n` if the original contains it) and trailing newline.

- [ ] **Step 1: Write the failing tests**: `splitFrontmatter` on `kitchen-sink.md` reassembles byte-identical; on a body with no frontmatter returns `frontmatter === ''` (Review Focus 3); on a file that is only frontmatter returns `body === ''` (Review Focus 3). `frontmatterEntries('---\ntitle: Q3\ntags: [a, b]\n---\n')` equals `[['title','Q3'],['tags','[a, b]']]`. `patchMarkdown(x, x) === x` for every fixture including `kitchen-sink-crlf.md` (Review Focus 2). `patchMarkdown(x, xWithOneParagraphChanged)` differs from `x` only on that paragraph's lines (assert with the `diff` package: exactly one changed hunk). `patchMarkdown(x, processor.stringify(processor.parse(x)))` equals `x` (a serializer that normalises markers must not touch untouched blocks).
- [ ] **Step 2: Run** `npx vitest run src/lib/core/markdown` — expected FAIL.
- [ ] **Step 3: Install** `npm i unified remark-parse remark-stringify remark-gfm remark-frontmatter` and `npm i -D diff @types/diff`; implement `markdown.ts`. For the LCS, a plain O(n·m) table over block strings is enough: `shortcut: quadratic LCS over top-level blocks, fine below a few thousand blocks; upgrade to a diff library if a document ever exceeds that`.
- [ ] **Step 4: Run** `npx vitest run src/lib/core/markdown` — expected PASS.
- [ ] **Step 5: Commit** `feat(core): shared remark processor, frontmatter split and block-level patch`.

### Task 5: Documents: list, read, write with conflict detection

**Files:**
- Create: `src/lib/core/documents.ts`, `src/lib/core/actor.ts`
- Test: `src/lib/core/documents.test.ts`

**Interfaces:**
- Consumes: `workspaceDir`, `resolveInside`, `InvalidPath`, `Conflict`, `gitInit`, `gitCommit`, `gitLog`, `splitFrontmatter`, `patchMarkdown`.
- Produces:
  - `type Actor = { id: number; name: string; agent?: string }`; `currentActor(): Actor` in `actor.ts` reading `INKMESH_OWNER_NAME` (default `"Owner"`), id `1`. `shortcut: single configured actor, no accounts; replaced by sessions in milestone 2`. `commitAuthor(actor: Actor): { name: string; email: string }` returns name `"<name> via <agent>"` when `agent` is set, email `user-<id>@inkmesh.local`.
  - `type TreeNode = { name: string; path: string; kind: 'folder' | 'doc'; title?: string; children?: TreeNode[] }`.
  - `listTree(slug: string): Promise<TreeNode[]>`: folders first then docs, both sorted by `localeCompare` with `{ numeric: true }`; only `.md` files; skips `.git`, `.inkmesh`, and dotfiles; `title` is the first `# ` heading or the file name without extension.
  - `readDocument(slug: string, path: string): Promise<{ path: string; source: string; frontmatter: string; body: string; hash: string }>` where `hash` is the SHA-256 hex of `source`.
  - `writeDocument(slug: string, path: string, body: string, opts: { expectedHash: string; actor: Actor }): Promise<{ hash: string; commit: string }>`: throws `Conflict` when the file's current hash differs from `expectedHash` or when the file no longer exists (Review Focus 5); otherwise writes `frontmatter + patchMarkdown(oldBody, body)`, commits with `commitAuthor(actor)` and message `Update <path>`, returns the new hash. `shortcut: one commit per autosave; commit-per-editing-session (PRD item 5) lands with sessions in milestone 2`.
  - `createDocument(slug: string, path: string, actor: Actor): Promise<void>`: writes `# <title>\n` where title is the file name without extension, fails with `Conflict` if the file exists, commits `Create <path>`.
  - `type HistoryEntry = { hash: string; name: string; agent?: string; date: string; message: string }` and `history(slug: string, path: string): Promise<HistoryEntry[]>`: `gitLog` limited to 20, `name`/`agent` split on `" via "`.
  - `ensureWorkspace(slug: string): Promise<void>`: `mkdir -p` and `gitInit` if `.git` is missing.

- [ ] **Step 1: Write the failing tests** with `INKMESH_DATA` pointed at a `mkdtemp` dir: `ensureWorkspace('demo')` then `createDocument('demo', 'rapports/réunion été.md', actor)` then `listTree('demo')` returns the folder `rapports` with one doc whose `title === 'réunion été'` (Review Focus 1); `readDocument` returns `body === '# réunion été\n'` and a 64-char hash; `writeDocument` with the right hash returns a new hash and `history` has two entries, the newest `name === 'Jon'`, `agent === 'claude-code'` when the actor had `agent: 'claude-code'`; `writeDocument` with a stale hash throws `Conflict`; deleting the file then `writeDocument` throws `Conflict` (Review Focus 5); `readDocument('demo', '../x.md')` throws `InvalidPath`; writing a body identical to the current one returns the same hash and `history` length does not grow.
- [ ] **Step 2: Run** `npx vitest run src/lib/core/documents` — expected FAIL.
- [ ] **Step 3: Implement** `documents.ts` and `actor.ts`.
- [ ] **Step 4: Run** `npx vitest run` — expected all PASS.
- [ ] **Step 5: Commit** `feat(core): documents list, read, write with conflict detection and history`.

### Task 6: Seed script and app shell with the folder tree

**Files:**
- Create: `scripts/seed.ts`, `src/routes/(app)/+layout.server.ts`, `src/routes/(app)/+layout.svelte`, `src/routes/(app)/+page.svelte`, `src/lib/ui/Tree.svelte`, `src/routes/+layout.svelte` (imports `app.css`)
- Modify: `package.json` scripts: `seed` → `node scripts/seed.ts` (Node 24 strips types natively)
- Test: `e2e/shell.spec.ts` (Playwright)

**Interfaces:**
- Consumes: `ensureWorkspace`, `createDocument`, `listTree`, `t`.
- Produces: layout `data` of shape `{ workspace: string; tree: TreeNode[]; locale: Locale }`; the route `/(app)/demo` lists the tree; `shortcut: single workspace "demo" hard-wired in the layout load; the workspace list and switcher come with memberships in milestone 2`.

- [ ] **Step 1: Seed script**: `ensureWorkspace('demo')`, then copy `docs/project/prd.md` and `docs/project/architecture.md` into `demo/project/` and `tests/fixtures/kitchen-sink.md` into `demo/examples/` with `fs.copyFile` (seeding is the one legitimate direct write outside `writeDocument`, said in a comment), followed by one `gitCommit` with message `Seed demo workspace`. Idempotent: skips files that exist.
- [ ] **Step 2: Write the failing e2e test** `e2e/shell.spec.ts`: after `npm run seed`, `GET /demo` shows a left rail with the text "project" and "examples", the button "New document" / "Nouveau document" depending on `Accept-Language`, and the centre shows the `empty.pick` text. At 390px width the rail is hidden and a button with `aria-label` "Open navigation" shows it as a drawer.
- [ ] **Step 3: Run** `npx playwright test e2e/shell.spec.ts` — expected FAIL (404).
- [ ] **Step 4: Implement** the layout per the direction contract's FIRST VIEWPORT: left rail 240px (`--panel` background, hairline right border) with the workspace name, a search input (`tree.search`, disabled with `aria-disabled` and a `title` saying search comes later), the one primary button `tree.new`, and `Tree.svelte` rendering `TreeNode[]` as nested `<ul>` with `<details>` for folders (open by default) and `<a href="/demo/<path>">` for docs showing `title`; active doc gets `aria-current="page"` and accent colour. Centre area is the `<slot/>`; `+page.svelte` renders the `empty.pick` line in `--muted`. Mobile: rail `position: fixed`, off-canvas, toggled by the "Open navigation" button in a 48px top bar, 150ms transform transition.
- [ ] **Step 5: Run** `npx playwright test e2e/shell.spec.ts` and `npm run check` — expected PASS.
- [ ] **Step 6: Commit** `feat(app): seed script and workspace shell with folder tree`.

### Task 7: Document page: file strip, editor, raw mode, right rail

**Files:**
- Create: `src/routes/(app)/[workspace]/[...path]/+page.server.ts`, `src/routes/(app)/[workspace]/[...path]/+page.svelte`, `src/lib/editor/Editor.svelte`, `src/lib/ui/FileStrip.svelte`, `src/lib/ui/RightRail.svelte`
- Test: `e2e/document.spec.ts`

**Interfaces:**
- Consumes: `readDocument`, `history`, `frontmatterEntries`, `t`, Crepe.
- Produces: page `data` of shape `{ path: string; body: string; hash: string; entries: [string, string][]; history: HistoryEntry[] }`; `Editor.svelte` props `{ value: string; onchange: (markdown: string) => void }` mounting Crepe in `onMount` with `defaultValue`, calling `onchange(crepe.getMarkdown())` on each `markdownUpdated` listener event, and destroying it in `onDestroy`; the raw mode is a `<textarea>` bound to the same `value`.

- [ ] **Step 1: Write the failing e2e test** `e2e/document.spec.ts`: `GET /demo/examples/kitchen-sink.md` shows a file strip containing the text `examples/kitchen-sink.md` in the mono font, a `Raw`/`Brut` toggle, the H1 from the file inside the editor, a right rail with a "File"/"Fichier" block listing `title` from the frontmatter and a "History"/"Historique" block with one entry "Seed demo workspace". Clicking the toggle shows a `<textarea>` whose value starts with `# `; clicking again restores the editor with the same content. A missing path returns 404.
- [ ] **Step 2: Run** `npx playwright test e2e/document.spec.ts` — expected FAIL.
- [ ] **Step 3: Implement** `+page.server.ts` `load` (404 via `error(404)` on `InvalidPath` or missing file) and the three components per the FIRST VIEWPORT block: strip is one 36px line, Fragment Mono 12.5px, path left, save state centre (empty for now), toggle right as a `<button aria-pressed>`; centre column `max-width: 72ch`, body 16.5px/1.6; right rail 280px with the two blocks, keys in mono muted, values in text; history rows `name`, then `via agent` in mono when present, then relative time (`Intl.RelativeTimeFormat`). Crepe's default theme CSS is imported once and its variables overridden to the tokens (`--crepe-color-background` → `--ground`, `--crepe-font-default` → `--font-text`, `--crepe-font-code` → `--font-mono`). Under 1024px the right rail stacks below the document; at 390px the strip stays one line with the path truncated from the left (`direction: rtl` on the span with `text-overflow: ellipsis`).
- [ ] **Step 4: Run** `npx playwright test` and `npm run check` — expected PASS.
- [ ] **Step 5: Commit** `feat(app): document page with Crepe editor, raw mode and right rail`.

### Task 8: Autosave with conflict handling

**Files:**
- Modify: `src/routes/(app)/[workspace]/[...path]/+page.server.ts` (add `actions.save`), `src/routes/(app)/[workspace]/[...path]/+page.svelte`, `src/lib/ui/FileStrip.svelte`
- Test: `e2e/save.spec.ts`, `src/routes/(app)/[workspace]/[...path]/save.test.ts`

**Interfaces:**
- Consumes: `writeDocument`, `currentActor`, `Conflict`.
- Produces: form action `save` taking `body` and `hash` fields, returning `{ hash }` on success, `fail(409, { conflict: true })` on `Conflict`, `fail(400)` on `InvalidPath`; client state `saveState: 'idle' | 'saving' | 'saved' | 'conflict' | 'error'` shown in the strip with `save.*` strings, colour `--muted` / `--ok` / `--warn` / `--error`, and `role="status"`.

- [ ] **Step 1: Write the failing unit test** `save.test.ts` calling the action with a mocked `request` (`FormData` with `body` and a stale `hash`) against a temp workspace: returns status 409 with `conflict: true`; with the right hash returns a new `hash` and the file on disk contains the new body.
- [ ] **Step 2: Write the failing e2e test** `e2e/save.spec.ts`: open the kitchen-sink document, type " edited" at the end of the first paragraph in the editor, wait for the strip to show "Saved"/"Enregistré" within 5 s; then read the file from `.data/workspaces/demo/examples/kitchen-sink.md` and assert it contains " edited" and that the fenced code block lines are byte-identical to the fixture; `git log` in that workspace has a newest commit "Update examples/kitchen-sink.md" by `Owner`. Second scenario: overwrite the file on disk from the test, type again, and assert the strip shows the conflict message and the file is unchanged.
- [ ] **Step 3: Run** both — expected FAIL.
- [ ] **Step 4: Implement**: the page debounces `onchange` by 2000 ms, posts the form with `fetch` and `applyAction`-free manual handling (`deserialize` from `$app/forms`), updates `hash` on success, sets `saveState` accordingly, and stops autosaving after a conflict until reload. `beforeunload` warns when an edit is pending. Raw mode edits go through the same path.
- [ ] **Step 5: Run** `npx vitest run` and `npx playwright test` — expected PASS.
- [ ] **Step 6: Commit** `feat(app): debounced autosave with conflict detection`.

### Task 9: Finish review, DESIGN.md, handoff

**Files:**
- Create: `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png`, `design/shots/*.png`, `DESIGN.md`, `.impeccable/design.json`, `README.md`
- Modify: `docs/project/handoff.md`

- [ ] **Step 1: Capture** the document page at 1440×900 and 390×844 with the Playwright screenshot command from the `design-references` skill into `design/shots/` and copy into `.impeccable/review/`; open each capture and confirm it shows the page.
- [ ] **Step 2: Detector**: run `impeccable detect --json src/routes src/lib/ui src/lib/editor src/app.css`, fix the mechanical findings in one batch, keep the rest for the reviewer.
- [ ] **Step 3: Reference check**: compare the captures to `design/references/refs.md` line by line; fix drifts in the same batch; second capture round only to confirm.
- [ ] **Step 4: Finish reviewer**: spawn `impeccable-finish-reviewer` with the request, the surface brief path, the captures, the detector output and the craft-floor reference; act on its disposition (fix once, recapture, score). Then `review-ui` on the document page.
- [ ] **Step 5: Documenter**: spawn `impeccable-documenter` to write `DESIGN.md` at the repo root and `.impeccable/design.json` from the built surface. Verify both exist and carry the tokens.
- [ ] **Step 6: README** with the five commands (`install`, `seed`, `dev`, `test`, `test:e2e`) and `INKMESH_DATA`; rewrite `handoff.md` (current state, next milestone: accounts, memberships, HTTP API and MCP on top of `core`).
- [ ] **Step 7: Commit** `docs: design system, README and handoff after milestone 1`.
