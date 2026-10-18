---
version: 1
slug: "src-routes-app-workspace-path-page-svelte"
primary_target: "src/routes/(app)/[workspace]/[...path]/+page.svelte"
related_targets: ["src/routes/(app)/+layout.svelte"]
---

# Surface brief — document screen (workspace shell + editor)

Scope: the signed-in app shell and the document screen, the surface every member and every session lives in. Mode: Operate. Build path: code-led (no image generation on this machine, and Operate surfaces build code-led anyway).

Audience and job: an invited member, often non-technical, opens a workspace, finds a document, reads it comfortably, edits a paragraph, a table row or an image, and trusts that the file underneath is intact and attributed. The owner also reads history and restores versions here.

Content: real folder tree, Markdown documents with frontmatter, images, comment threads, git history. Constraints: light mode default, WCAG AA, keyboard complete, usable on a phone for reading and light edits, French and English strings.

Pinned by the owner's brief (`design/references/refs.md`): Linear's shell and density, GitHub's Markdown rendering conventions, Notion's calm editing page; Fragment Mono where a monospace is legitimate, Inter for everything read at length. The brief wins over any rolled direction; concept-seed was not run.

## Direction contract

THESIS: the document screen is an honest file browser that happens to have a beautiful editor. The real path, the real metadata and the real history are always one glance away while the page itself reads as calmly as a Notion page. It refuses the two category defaults: the infinite white page with chrome hidden until hover, and the admin dashboard made of cards.

OWN-WORLD: a faintly warm light ground (#FBFBFA) with a slightly deeper panel tone (#F3F3F0) for rails, hairline borders (#E4E4E0), near-black ink (#1C1C1A) and a muted grey (#6E6E68) for secondary text. One accent, ink blue (#2A47D1), for the active tree item, links, focus rings and the single primary button; state colours only where they mean something: green for saved, amber for "changed on disk since you opened it", red for errors. Inter at 16.5px/1.6 for document body, 13px for rail and chrome; Fragment Mono at 12.5px for file paths, frontmatter keys, commit hashes, timestamps and raw mode. Radius 6px, no shadows except a 1px border plus a soft 2px shadow on the floating formatting toolbar. Density: Linear in the rails, Notion in the page.

STORY: a member recognises a folder of files in the left rail, opens one, and gets a wide, quiet page. The right rail tells them what the file is (its frontmatter, rendered as key and value) and who touched it last ("Jon via claude-code, 2 h ago"). They edit as in a word processor; the save state in the file strip turns to "saved" on its own. They understand the file is real without being told.

FIRST VIEWPORT (desktop 1440): three columns. Left rail 240px: workspace switcher and user menu on top, search field, "New document" as the one primary button, then the folder tree with folders collapsible and files listed with their titles. Centre: the file strip at the top, a single line in Fragment Mono showing `rapports/q3-2026.md`, the save state, and a "Raw" toggle at its right end; below it the document at 72ch max width with the H1 title, then the body, with generous side margins. Right rail 280px: a "File" block listing frontmatter keys and values in Fragment Mono, a "History" block listing the last five commits as author, agent, relative time, and a "Comments" block with the count and the last comment. Mobile (390): single column, the tree in a left drawer, the right rail as a bottom sheet opened from the file strip.

FORM: brief-pinned composition (Linear shell, GitHub Markdown, Notion page), not rolled. Signature move: the file strip, the one line of Fragment Mono that names the file, shows its save state and flips the page into raw Markdown with one click, so the "geek" view is a state of the same page, never a second interface. Motion grammar: CSS only, 150ms ease-out on tree expand, rail open and raw-mode flip, all inside `prefers-reduced-motion`. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved

- Whether comments show inline in the right rail or on a dedicated panel below the document on narrow screens.
- Exact tree behaviour for folders with hundreds of files (virtualised list or pagination), decided when real data exists.
