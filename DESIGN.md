---
name: inkmesh
description: An honest file browser that happens to have a beautiful editor.
colors:
  ground: "#FBFBFA"
  panel: "#F3F3F0"
  hairline: "#E4E4E0"
  ink: "#1C1C1A"
  muted: "#6E6E68"
  accent: "#2A47D1"
  ok: "#1B7F3B"
  warn: "#9A5C00"
  error: "#B3261E"
  on-accent: "#FFFFFF"
typography:
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.6
  chrome:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  mono:
    fontFamily: "Fragment Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
rounded:
  base: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.chrome}"
    rounded: "{rounded.base}"
    padding: "6px 10px"
  button-secondary:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    rounded: "{rounded.base}"
    padding: "6px 10px"
  button-strip:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.base}"
    padding: "2px 8px"
  button-strip-pressed:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.accent}"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "6px 8px"
  tree-item:
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    rounded: "{rounded.base}"
    padding: "3px 6px"
  tree-item-hover:
    backgroundColor: "{colors.hairline}"
  tree-item-active:
    textColor: "{colors.accent}"
  tree-folder:
    textColor: "{colors.muted}"
    typography: "{typography.mono}"
    rounded: "{rounded.base}"
    padding: "3px 6px"
  rail-left:
    backgroundColor: "{colors.panel}"
    typography: "{typography.chrome}"
    padding: "16px 12px"
    width: "240px"
  rail-right:
    backgroundColor: "{colors.panel}"
    typography: "{typography.chrome}"
    padding: "16px"
    width: "280px"
  file-strip:
    backgroundColor: "{colors.ground}"
    typography: "{typography.mono}"
    padding: "0 32px"
    height: "36px"
  document:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "32px"
    width: "72ch"
---

# Design System: inkmesh

## Overview

**Creative North Star: "The Honest File Browser"**

inkmesh shows a member a real folder of real Markdown files and lets them edit one as calmly as a word-processor page. The shell is Linear's: a narrow panel-toned rail on the left, a quiet properties rail on the right, 13px chrome with a grey hierarchy instead of colour, hairline borders and one blue accent reserved for the active item, links, focus and the single primary action. The page in the middle is Notion's: a wide, generous column of Inter at 16.5px with GitHub's Markdown conventions (grey code blocks, hairline table rows, a left-rule blockquote, task-list checkboxes).

The product's "geek" side is a state, never a second interface. Fragment Mono is the material that says "this is a file": it names the path in the file strip, the frontmatter keys, the folder names in the tree, the agent and timestamp in History, and the whole page when the Raw toggle is on. Everything read at length is Inter.

Confirmed rejections, from the owner's brief: the admin dashboard made of cards and stat tiles, icon-only buttons and sidebars that collapse to mystery icons, shadows as decoration, dark mode, marketing gradients, saturated blue buttons, kickers and eyebrows above headings.

**Key Characteristics:**
- Light mode only; a faintly warm paper ground with one slightly deeper panel tone for rails.
- One accent (ink blue) on the active tree item, links, focus rings, the pressed Raw toggle and the one primary button.
- State colours only where they carry meaning: green saved, amber changed-on-disk, red error.
- Two faces with a strict division of labour: Inter for reading and chrome, Fragment Mono for anything that is literally a file, key, hash or timestamp.
- Flat surfaces separated by hairlines; a single soft shadow under the floating formatting toolbar.
- 6px radius everywhere a corner exists; 150ms ease-out motion, only when the user has not asked for reduced motion.

## Colors

Warm-grey neutrals carry the whole interface; one cool ink blue and three state colours are the only chroma.

### Primary
- **Ink Blue** (`accent`): the active document in the tree, links inside the document, the "New document" primary button, every focus ring (2px outline), the pressed state of the Raw toggle, the editor caret, the keyboard-focus bar at the left of the rich editor, checked task boxes, and the text selection tint (accent at 20% opacity via `color-mix`).

### Neutral
- **Paper Ground** (`ground`): the page, the file strip, inputs and secondary buttons.
- **Panel** (`panel`): both rails, the mobile bottom sheet, code blocks and inline raw-HTML spans.
- **Hairline** (`hairline`): every 1px border (rail edges, strip bottom, inputs, secondary buttons, toolbar, slash menu), tree hover background, blockquote rule, inline-code background.
- **Ink** (`ink`): all primary text, icons, and the 30%-opacity drawer backdrop (`rgb(28 28 26 / 0.3)`).
- **Muted Grey** (`muted`): secondary text: folder names, frontmatter keys, agent and timestamp in History, commit messages, the save state while saving, the empty-workspace prompt, list markers.

### State
- **Saved Green** (`ok`): the word "Saved" in the file strip, nothing else.
- **Disk-Changed Amber** (`warn`): the conflict sentence in the file strip. Adjusted from the brief's `#B26B00` because that value failed AA at 12.5px.
- **Error Red** (`error`): "Could not save" and the create-form path error.

### Named Rules
**The One Accent Rule.** Blue means "this is the thing" (active, link, focus, primary action). It never fills a surface larger than a button and never decorates.

**The Earned State Rule.** Green, amber and red appear only as text that reports a save state or an error. No coloured badges, tiles or backgrounds.

**The Hairline Rule.** Every border in the product is 1px of `hairline`. Depth is tonal (ground vs panel), not drawn.

## Typography

**Body Font:** Inter Variable (with system-ui, sans-serif)
**Label/Mono Font:** Fragment Mono (with ui-monospace, monospace)

**Character:** Inter reads like a calm page; Fragment Mono, slightly smaller and often muted, is the typewriter stamp that marks a thing as a real file, key or hash. The two never compete: a line is in one face or the other.

### Hierarchy
- **Body** (400, 16.5px, 1.6): the document, rich and raw alike. Column capped at 72ch.
- **Document headings**: Crepe's default scale on top of the 16.5px base; the project sets weight and size only through `--crepe-base-font-size`. Keep it so; do not invent a heading ramp.
- **Title** (600, 16px): the only non-document heading, on the error page.
- **Label** (600, 13px): rail section headings ("File", "History") and the workspace name. Sentence case, no tracking, no uppercase.
- **Chrome** (400, 13px): everything else in the rails, the mobile top bar, the empty prompt and the error page.
- **Mono** (400, 12.5px): the file strip (path, save state, buttons), folder names in the tree, the create-form path input, frontmatter keys, "via agent" and timestamps (tabular numerals), raw mode (line-height 1.7), code, and inline raw-HTML source.

### Named Rules
**The Mono Means File Rule.** Fragment Mono is used only where the text is a path, a key, a hash, a timestamp, an agent name, raw Markdown or code. Prose and labels read in Inter.

**The No Eyebrow Rule.** No kicker, eyebrow or small-caps label sits above a heading. Headings start the block.

## Layout

Desktop (1024px and up) is a fixed three-column grid: left rail 240px, centre fluid, right rail 280px, each rail sticky at the top and full viewport height with its own scroll. The file strip is sticky at the top of the centre column, 36px tall, with the same 32px side padding as the document; the document column is centred at a 72ch maximum with 32px padding. Between 768px and 1023px the right rail drops below the document as a full-width block with a top hairline and 32px side padding. Below 768px the shell becomes a single column: a 48px top bar with the "Open navigation" secondary button and the workspace name, the left rail as a 240px left drawer over a 30% ink backdrop, the right rail as a bottom sheet (60vh max, top corners rounded) opened by the "Details" button that appears in the file strip; the strip and document padding fall to 16px and the save state takes its own row under the path.

Spacing rhythm is 4/8/12/16/24/32: 4px between frontmatter rows, 8px between form fields and strip buttons, 12px rail gaps and column gaps, 16px rail padding, 24px between rail sections and around standalone pages, 32px document padding. Tree rows are 3px 6px with 12px indent per level.

## Elevation & Depth

Flat. Surfaces sit on two tones (ground and panel) separated by hairlines; nothing is lifted at rest. The only shadow in the product is under the floating formatting toolbar, which must read as hovering over the text; the slash menu uses the same hairline and radius without a shadow. Crepe's own shadows are switched off.

### Shadow Vocabulary
- **Toolbar lift** (`box-shadow: 0 2px 2px rgb(28 28 26 / 0.06)`): the floating formatting toolbar only, together with its 1px hairline border.

### Named Rules
**The One Shadow Rule.** Only an element that floats over the document (the formatting toolbar) may carry a shadow, and it is this one, soft, 2px shadow. Rails, sheets, drawers, menus and buttons are flat.

## Shapes

Every corner is 6px: buttons, inputs, tree rows, the toolbar and slash menu, inline raw-HTML spans, and the top corners of the mobile bottom sheet. Rails, the file strip and the document have no radius; they are divided by 1px hairlines (right edge of the left rail, left edge of the right rail, bottom of the strip, top of the stacked right rail). Buttons are text in a hairline box, never pills, never icon-only. The tree's folder caret is a 12px stroked chevron (1.5 stroke) that rotates 90 degrees when open, always next to the folder's name.

## Components

### Buttons
- **Shape:** softly rounded (6px), text label in Inter 13px or Fragment Mono 12.5px, never an icon alone.
- **Primary:** accent fill, white text, 500 weight, 6px 10px. One per screen: "New document" in the left rail (a `<summary>` that opens the create form).
- **Secondary:** ground fill, ink text, hairline border, 6px 10px: "Create" in the form, "Open navigation" in the mobile top bar.
- **Strip:** mono, ground fill, hairline border, 2px 8px: "Raw" toggle (pressed = accent border and accent text, `aria-pressed`) and "Details" (mobile only, `aria-expanded`). Colour and border transition 150ms ease-out.
- **Focus:** 2px accent outline, 2px offset, on `:focus-visible` only. No hover fill on buttons.

### Inputs / Fields
- **Style:** ground fill, hairline stroke, 6px radius, 6px 8px, inherits chrome type; the path input switches to mono 12.5px.
- **Focus:** 2px accent outline, 2px offset.
- **Error:** `aria-invalid` plus an error-red sentence below, tied by `aria-describedby`.

### Navigation (left rail and tree)
- Panel tone, right hairline, 240px, 16px 12px padding, chrome 13px. Workspace name in label weight at the top, then the primary button, then the tree.
- Folders: `<details open>` with a mono muted summary and the rotating caret. Files: Inter 13px links showing the document title, 3px 6px, 6px radius.
- Hover: hairline background. Active (`aria-current="page"`): accent text at 500 weight. Focus: 2px accent outline inset.
- Mobile: a 240px drawer over a 30% ink backdrop, slides in 150ms ease-out; the drawer takes focus on open, `main` becomes `inert`, Escape or the backdrop closes it and focus returns to the opener. Closes on navigation and when the viewport grows past 768px.

### File Strip (signature)
One sticky line of Fragment Mono at the top of the page: path on the left (truncated from the left so the file name survives, `<bdi>` keeps it left-to-right), the save state in the centre as a polite live region, the Details and Raw buttons on the right. Idle shows nothing; "Saving…" muted, "Saved" green, "Could not save" red, and the conflict sentence amber and allowed to wrap. Raw flips the same page to a mono textarea (12.5px / 1.7, 70vh minimum) and back.

### Right Rail (File and History)
Panel tone, left hairline, 280px, 16px padding, 24px between sections. Section headings are label weight and focusable (they receive focus when the mobile sheet opens). File: a two-column definition list, mono muted keys and Inter values, 4px 12px gaps. History: the last five commits as author (Inter), "via agent" and relative time (mono muted, tabular numerals), message on its own muted line. Mobile: bottom sheet, 60vh maximum, top corners 6px, same motion and focus contract as the drawer.

### Document editor
Crepe themed through its custom properties onto this palette: ground background, panel for code blocks and hover, hairline outlines, muted list markers, accent checked boxes, 20%-accent selection. A 2px accent bar at the left margin appears only while the editor has keyboard focus. Blockquotes carry a 2px hairline left rule. Code keeps whole tokens and scrolls sideways; tables use tabular numerals, no-wrap headers, and scroll sideways on phones only. Raw HTML renders as its source in a panel-toned mono span.

### Error page and empty state
Chrome 13px with 24px padding: a 16px/600 title and one accent link back to the workspace; the empty workspace shows a single muted sentence.

## Do's and Don'ts

### Do:
- **Do** use `accent` for exactly four jobs: active item, link, focus ring, the one primary action per screen.
- **Do** draw every edge as a 1px `hairline` and convey depth with ground-versus-panel tone.
- **Do** set Fragment Mono at 12.5px on paths, keys, hashes, agents, timestamps, raw Markdown and code, and Inter everywhere people read.
- **Do** give every interactive element a visible text label and a 2px accent `:focus-visible` outline.
- **Do** wrap every transition in `prefers-reduced-motion: no-preference` and keep it at 150ms ease-out.
- **Do** route every visible string through `t()` with an English and a French entry; never hard-code a label.
- **Do** manage focus on overlays: move it in on open, return it to the opener on close, make the page `inert` behind a drawer.

### Don't:
- **Don't** build cards, stat tiles or cards inside cards; blocks are separated by space and hairlines.
- **Don't** ship icon-only buttons or a rail that collapses to icons.
- **Don't** add shadows anywhere but the floating formatting toolbar.
- **Don't** put a kicker, eyebrow or uppercase tracked label above a heading.
- **Don't** add a dark mode or a second theme; the product is light only.
- **Don't** use a state colour as a fill or badge; it is text reporting a state.
- **Don't** leave a placeholder for a feature that has not shipped (search, comments, switcher); an absent block beats an empty promise.
