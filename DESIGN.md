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
  top-bar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    padding: "0 16px"
    height: "44px"
  menu-trigger:
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    rounded: "{rounded.base}"
    padding: "3px 6px"
  menu-trigger-hover:
    backgroundColor: "{colors.hairline}"
  menu:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.base}"
    padding: "4px"
    width: "200px"
  menu-item:
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    rounded: "{rounded.base}"
    padding: "4px 6px"
  menu-item-hover:
    backgroundColor: "{colors.panel}"
  menu-item-current:
    textColor: "{colors.accent}"
  form-page:
    backgroundColor: "{colors.ground}"
    typography: "{typography.chrome}"
    padding: "24px 16px"
    width: "360px"
  table-cell:
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
    padding: "6px 12px 6px 0"
  table-header:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "6px 12px 6px 0"
  role-label:
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
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

inkmesh shows a member a real folder of real Markdown files and lets them edit one as calmly as a word-processor page. The shell is Linear's: a 44px panel-toned top bar carrying the wordmark and two menus, a narrow panel-toned rail on the left, a quiet properties rail on the right, 13px chrome with a grey hierarchy instead of colour, hairline borders and one blue accent reserved for the active item, links, focus and the single primary action. The page in the middle is Notion's: a wide, generous column of Inter at 16.5px with GitHub's Markdown conventions (grey code blocks, hairline table rows, a left-rule blockquote, task-list checkboxes).

The product's "geek" side is a state, never a second interface. Fragment Mono is the material that says "this is a file": it names the path in the file strip, the frontmatter keys, the folder names in the tree, the agent and timestamp in History, and the whole page when the Raw toggle is on. Everything read at length is Inter.

Confirmed rejections, from the owner's brief: the admin dashboard made of cards and stat tiles, icon-only buttons and sidebars that collapse to mystery icons, shadows as decoration, dark mode, marketing gradients, saturated blue buttons, kickers and eyebrows above headings.

**Key Characteristics:**
- Light mode only; a faintly warm paper ground with one slightly deeper panel tone for rails.
- One accent (ink blue) on the active tree item, links, focus rings, the pressed Raw toggle and the one primary button.
- State colours only where they carry meaning: green saved, amber changed-on-disk, red error.
- Two faces with a strict division of labour: Inter for reading and chrome, Fragment Mono for anything that is literally a file, key, hash, timestamp or copyable identifier (slug, email, invitation link).
- Flat surfaces separated by hairlines; a single soft shadow under the floating formatting toolbar.
- 6px radius everywhere a corner exists; 150ms ease-out motion, only when the user has not asked for reduced motion.

## Colors

Warm-grey neutrals carry the whole interface; one cool ink blue and three state colours are the only chroma.

### Primary
- **Ink Blue** (`accent`): the active document in the tree, links inside the document, the current workspace in the switcher and the current page in the rail (500 weight), the workspace names on the home list, the one primary button per screen, every focus ring (2px outline), the pressed state of the Raw toggle, the editor caret, the keyboard-focus bar at the left of the rich editor, checked task boxes, and the text selection tint (accent at 20% opacity via `color-mix`).

### Neutral
- **Paper Ground** (`ground`): the page, the file strip, inputs, selects, secondary buttons and the open header menus.
- **Panel** (`panel`): the top bar, both rails, the hover fill of a header menu item, the mobile bottom sheet, code blocks and inline raw-HTML spans.
- **Hairline** (`hairline`): every 1px border (rail edges, strip bottom, inputs, secondary buttons, toolbar, slash menu, header menus, top bar bottom, table rows, the home list rows, the rule between account sections), the hover background of tree items, the Members link and menu triggers, blockquote rule, inline-code background.
- **Ink** (`ink`): all primary text, icons, and the 30%-opacity drawer backdrop (`rgb(28 28 26 / 0.3)`).
- **Muted Grey** (`muted`): secondary text: folder names, frontmatter keys, agent and timestamp in History, commit messages, the save state while saving, the empty-workspace prompt, list markers, role labels, slugs, the email under a member's name, table headers, notes and hints under a field, the menu chevron.

### State
- **Saved Green** (`ok`): the word "Saved" in the file strip and the confirmation sentence after a form saves on the account page ("Name saved", "Password changed", `role="status"`), nothing else.
- **Disk-Changed Amber** (`warn`): the conflict sentence in the file strip and the loopback warning on the consent screen. Adjusted from the brief's `#B26B00` because that value failed AA at 12.5px.
- **Error Red** (`error`): "Could not save", form errors under their field (create path, slug, sign-in, invite, account, `role="alert"`) and the members page error line.

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
- **Title** (600, 16px): the page title of every standalone page (home, members, account, sign-in, invite) and the error page. One per page.
- **Label** (600, 13px): rail section headings ("File", "History"), section headings on the members and account pages, form field labels and table headers (muted). Sentence case, no tracking, no uppercase.
- **Chrome** (400, 13px): everything else in the rails, the top bar and its menus (wordmark at 600), every standalone page, the empty prompt and the error page.
- **Mono** (400, 12.5px): the file strip (path, save state, buttons), folder names in the tree, the create-form path input, frontmatter keys, "via agent" and timestamps (tabular numerals), workspace slugs, email inputs and the email under a member's name, invitation expiry dates, the one-time invitation and public links, a public link's token hint, search result paths, raw mode (line-height 1.7), code, and inline raw-HTML source.

### Named Rules
**The Mono Means File Rule.** Fragment Mono is used only where the text is a path, a key, a hash, a timestamp, an agent name, an identifier someone types or copies verbatim (slug, email, invitation link), raw Markdown or code. Prose and labels read in Inter.

**The Full Stop Rule.** A visible string that is a full sentence with a verb ends with a period ("A workspace keeps at least one owner."); labels, buttons, headings and verbless fragments ("Name saved", "At least 10 characters") do not. Role words are capitalised alone ("Owner") and lower-case inside a sentence ("Join Notes as editor"). French uses « » and a U+00A0 no-break space before : ; ? ! and inside the guillemets.

**The No Eyebrow Rule.** No kicker, eyebrow or small-caps label sits above a heading. Headings start the block.

## Layout

Every signed-in page starts with the 44px top bar; from 768px it sticks at the top and the rails and file strip stick under it (their sticky top is 44px). Desktop (1024px and up) is a fixed three-column grid: left rail 240px, centre fluid, right rail 280px, each rail sticky at the top and full viewport height with its own scroll. The file strip is sticky at the top of the centre column, 36px tall, with the same 32px side padding as the document; the document column is centred at a 72ch maximum with 32px padding. Between 768px and 1023px the right rail drops below the document as a full-width block with a top hairline and 32px side padding. Below 768px the shell becomes a single column: the 44px top bar scrolls away with the page (12px side padding, 8px gaps) and carries the "Open navigation" secondary button before the wordmark, the left rail as a 240px left drawer over a 30% ink backdrop, the right rail as a bottom sheet (60vh max, top corners rounded) opened by the "Details" button that appears in the file strip; the strip and document padding fall to 16px and the save state takes its own row under the path.

Standalone pages take two shapes. Signed-in list pages (home, members, account) centre a 72ch column with 32px padding (24px 16px on phones) and 24px between blocks (16px on members, whose sub-headings add 16px above). Form pages outside the app (sign-in, invite) centre a 360px column vertically in the viewport, 24px 16px padding, 24px between title and form. Forms inside list pages are 320px wide at most.

Spacing rhythm is 4/8/12/16/24/32: 4px between frontmatter rows, 4px between a field label and its input, 8px between form fields and strip buttons (12px on the form pages), 12px rail gaps and column gaps, 16px rail padding, 24px between rail sections and around standalone pages, 32px document padding. Tree rows are 3px 6px with 12px indent per level.

## Elevation & Depth

Flat. Surfaces sit on two tones (ground and panel) separated by hairlines; nothing is lifted at rest. The only shadow in the product is under the floating formatting toolbar, which must read as hovering over the text; the slash menu and the header menus use the same hairline and radius without a shadow. Crepe's own shadows are switched off.

### Shadow Vocabulary
- **Toolbar lift** (`box-shadow: 0 2px 2px rgb(28 28 26 / 0.06)`): the floating formatting toolbar only, together with its 1px hairline border.

### Named Rules
**The One Shadow Rule.** Only an element that floats over the document (the formatting toolbar) may carry a shadow, and it is this one, soft, 2px shadow. Rails, sheets, drawers, menus and buttons are flat.

## Shapes

Every corner is 6px: buttons, inputs, selects, tree rows, menu triggers, header menus and their items, the toolbar and slash menu, inline raw-HTML spans, and the top corners of the mobile bottom sheet. The top bar, rails, the file strip, the document and tables have no radius; they are divided by 1px hairlines (right edge of the left rail, left edge of the right rail, bottom of the strip, top of the stacked right rail). Buttons are text in a hairline box, never pills, never icon-only. The tree's folder caret is a 12px stroked chevron (1.5 stroke) that rotates 90 degrees when open, always next to the folder's name. A header menu trigger carries a 5px muted chevron drawn from two 1.5px borders, pointing down, after its label.

## Components

### Buttons
- **Shape:** softly rounded (6px), text label in Inter 13px or Fragment Mono 12.5px, never an icon alone.
- **Primary:** accent fill, white text, 500 weight, 6px 10px. At most one per screen, and only where one action is the reason for the screen: "New document" in the workspace rail and "New workspace" on the home page for admins (both a `<summary>` that opens a create form), "Sign in" on the sign-in page, "Create account" or "Join" on the invite page, and the "Sign in" link styled as a button on the expired-invitation page, "Create account" or "Join {workspace} as {role}" on the join page, "Restore this version" in the version view and "Join" on a public document page. Pages of equal actions (members, account) have no primary: every button there is secondary.
- **Secondary:** ground fill, ink text, hairline border, 500 weight, 6px 10px: the submit inside a create form, "Open navigation", "Save" next to each role select, "Remove", "Revoke", "Create link", "Copy", and the account page's "Save" and "Change password". A secondary button sits at the start of its form (`align-self: flex-start`), never stretched.
- **Strip:** mono, ground fill, hairline border, 2px 8px: "Raw" toggle (pressed = accent border and accent text, `aria-pressed`) and "Details" (mobile only, `aria-expanded`). Colour and border transition 150ms ease-out.
- **Focus:** 2px accent outline, 2px offset, on `:focus-visible` only, no transition. No hover fill on buttons; menu triggers (`<summary>` in the top bar) are not buttons and take the hairline fill like tree items.

### Inputs / Fields
- **Style:** ground fill, hairline stroke, 6px radius, 6px 8px, inherits chrome type at 400; selects share it. The path, slug, email and invitation-link inputs switch to mono 12.5px.
- **Label:** above the input, 600 weight, 4px gap, the label wrapping the input.
- **Focus:** 2px accent outline, 2px offset, no transition.
- **Note:** a muted sentence directly under the input, tied by `aria-describedby` ("Changes already made keep your previous name.", wrapped with `text-wrap: pretty`); on the form pages a hint or error sits 4px under its field.
- **Error:** `aria-invalid` plus an error-red sentence under the field, tied by `aria-describedby` and announced with `role="alert"`; the hint under a password field turns red in place rather than adding a second line.

### Navigation (left rail and tree)
- Panel tone, right hairline, 240px, 16px 12px padding, 12px gaps, chrome 13px, `<nav aria-label>`. For owners and editors: the Members link, then the primary button, then the tree; readers see the tree only. The workspace name lives in the top bar's switcher, not the rail.
- Members link: a tree item outside the tree (3px 6px, ink, hairline hover, accent at 500 with `aria-current="page"` on the members page).
- Folders: `<details open>` with a mono muted summary and the rotating caret. Files: Inter 13px links showing the document title, 3px 6px, 6px radius.
- Hover: hairline background. Active (`aria-current="page"`): accent text at 500 weight. Focus: 2px accent outline inset.
- Mobile: a 240px drawer over a 30% ink backdrop, slides in 150ms ease-out; the drawer takes focus on open, `main` becomes `inert`, Escape or the backdrop closes it and focus returns to the opener. Closes on navigation and when the viewport grows past 768px.

### Top bar and menus
One 44px panel-toned line on every signed-in page, bottom hairline, 16px side padding, 12px gaps, no wrap: on phones the "Open navigation" button first, then the wordmark (ink, 600, underline on hover), then a `<nav aria-label>` holding two `<details>` menus, the workspace switcher after the wordmark and the user menu pushed to the right edge. Each trigger is a `<summary>` showing the current workspace or the user's name (ellipsis past 16rem), 3px 6px, 6px radius, hairline fill on hover, a muted chevron. The open menu drops 4px under its trigger: ground fill, hairline border, 6px radius, 4px padding, flat, 60vh maximum with its own scroll; the switcher is 200px minimum and left-aligned, the user menu 160px and right-aligned. Items are full-width rows at 4px 6px with a panel fill on hover and an inset focus ring; the switcher lists each workspace with its mono muted slug on a second line and marks the current one accent at 500 (`aria-current="page"`); the user menu holds "Account" and "Log out" (a form button styled as an item). Navigation, Escape (focus back to the trigger) and a click outside close both menus. Inside a workspace, a plain "Connect an agent" link (3px 6px, ink, underline on hover, accent at 500 with `aria-current="page"` on its page) sits just before the user menu; on phones it leaves the bar and becomes the user menu's first item. An "Inbox" link of the same shape sits just before the user menu on every signed-in page; see Inbox.

### Form pages
Sign-in and invite are the form page: no top bar, a 360px column centred in the viewport, the 16px/600 title, 24px, then the form with 12px between fields, the primary button last. Email inputs are mono. The error or hint sits 4px under its field in error red (`role="alert"`), and focus returns to the first field after a failed sign-in. The expired invitation keeps the shape: title, a muted help sentence 8px below, then the primary-styled "Sign in" link. The OAuth consent screen is a form page too: the title naming the client, the return host in mono, the workspaces and roles the agent receives, the agent-name field with its muted "signs as" note, then the secondary "Deny" and the primary "Allow" side by side, flush right; an invalid request shows only its sentence as the title. The account page is the signed-in variant inside the 72ch column: the title, then one `<section>` per concern, each opened by a label-weight heading 8px above a 320px form, sections separated by 24px and a top hairline, secondary buttons only, the green or red result sentence under the button.

### Tables
Members and pending invitations are plain tables at full column width: no fills, no zebra, no radius, a hairline under every row including the header. Cells are 6px 12px 6px 0, vertically centred, left-aligned; the last column holds the row actions (secondary buttons) flush right. Headers are muted label weight. A member is one cell: the name in Inter with the mono muted email on its own line under it. Owners see a role select with an explicit secondary "Save" beside it (it wraps under the select on phones); others see the role label as text. Dates are mono with tabular numerals. Each table is named by the heading above it (`aria-labelledby`). Below them, "New invitation link" is a role select and the secondary "Create link" in one row; the one-time link that follows is a readonly mono input that selects itself on focus, a "Copy" button that says "Copied" through a polite live region, and a muted sentence saying it will not be shown again.

The Connect page is a list page: the agents table (mono name with its muted kind under it, creation date hidden on phones, last use, secondary "Rename" and "Revoke" opening small dialogs, "Cancel" focused first in Revoke), then a radio group of tools, the recipe as a numbered list with commands in mono, and every copyable value (server URL, one-time token, configuration, command) as a readonly mono field with its "Copy" button, multi-line values in a self-sizing textarea.

### Role label
The workspace role as a word, never a badge: chrome 13px, muted on the home list (right-aligned on the workspace row, after the accent workspace name and the mono muted slug, 8px row padding and a bottom hairline), ink in a members table cell. Capitalised when it stands alone ("Owner", "Éditeur"), lower-case inside a sentence ("Join Notes as editor").

### File Strip (signature)
One sticky line of Fragment Mono at the top of the page: path on the left (truncated from the left so the file name survives, `<bdi>` keeps it left-to-right), the save state in the centre as a polite live region, the Details and Raw buttons on the right. Idle shows nothing; "Saving…" muted, "Saved" green, "Could not save" red, and the conflict sentence amber and allowed to wrap. Raw flips the same page to a mono textarea (12.5px / 1.7, 70vh minimum) and back.

### Right Rail (File and History)
Panel tone, left hairline, 280px, 16px padding, 24px between sections. Section headings are label weight and focusable (they receive focus when the mobile sheet opens). File: a two-column definition list, mono muted keys and Inter values, 4px 12px gaps. History: the last five commits as author (Inter), "via agent" and relative time (mono muted, tabular numerals), message on its own muted line. Mobile: bottom sheet, 60vh maximum, top corners 6px, same motion and focus contract as the drawer.

### Document editor
Crepe themed through its custom properties onto this palette: ground background, panel for code blocks and hover, hairline outlines, muted list markers, accent checked boxes, 20%-accent selection. A 2px accent bar at the left margin appears only while the editor has keyboard focus. Blockquotes carry a 2px hairline left rule. Code keeps whole tokens and scrolls sideways; tables use tabular numerals, no-wrap headers, and scroll sideways on phones only. Raw HTML renders as its source in a panel-toned mono span.

### Search box and results
Workspace pages carry a `role="search"` GET form in the top bar after the switcher: an input named "Search this workspace" with the short placeholder "Search", 200px wide, 4px 8px padding, growing to 280px on focus from 1024px (150ms, reduced motion respected). Below 768px it leaves the bar and sits at the top of the left drawer. The results page `/<ws>/-/search` is a list page: the title "Results for “{q}”", then one hairline row per hit: the title as an accent link at 500, the path in mono muted beside it, and the snippet on its own line with each match in a `<mark>` (panel fill, ink text, 600 weight, no colour). No match: one muted sentence quoting the query. Below 768px the page repeats the search field with a secondary "Search" button, since the header box is in the drawer. Snippets are split into text and marks, never inserted as HTML.

### Comments
A `<section id="comments">` under the document in the same 72ch column, 48px above it, a top hairline and 24px padding, chrome 13px. A label-weight "Comments" heading (it takes focus after Resolve or Reopen), then the open comments oldest first, 20px apart: author in Inter, "via agent" and the relative time in mono muted on one meta line, the body rendered at 15px (the document look scaled down), a secondary "Resolve" under it. Resolved comments sit in a `<details>` whose muted summary counts them ("1 resolved", plural through the locale), each with "Reopen". Then the form: the label "Add a comment", a 15px textarea at full width (80px minimum, vertical resize), the error in red under it, and a secondary "Comment". No comment yet: one muted sentence. Readers see and use the form.

### Version view
Opened from a History entry (each entry's message links to `?v=<commit>`), it replaces the editor: the file strip shows the path and "Version {short hash}" in mono; above the rendered document, a line with a bottom hairline holds "Version of {date} by {author}" in muted chrome (the date in mono, UTC) on the left and, on the right, the accent link "Back to the current version" and, for editors, the primary "Restore this version". It opens a native modal `<dialog>`: 360px, ground, hairline, 6px radius, 24px 16px padding, a 30% ink backdrop, the 16px/600 title, one sentence ("The current text stays in the history."), then the primary Restore and the secondary Cancel, which takes the focus.

### Deleted documents
A list page reached by the rail's "Deleted documents" link (under Members): the title, then the members-style table (path in mono, deleted by with "via agent" in mono muted, when as relative mono time, the secondary "Restore" for editors in a last column whose header is visually hidden). Nothing wraps but the path. Below 768px each row becomes two lines: the path on its own line, who and when under it, Restore at the right. A refused restore (something exists at the path) is a red sentence above the table. Empty: one muted sentence.

### Public links section (members page)
Owners only, after the invitations, under the heading "Public links" (focus target after Save or Revoke) and a muted sentence saying anyone with a link reads what it covers without an account. A table: scope ("Whole workspace" in Inter, or the document path in mono) with the token hint "…x1Ab" in mono muted (it ends the URL, and tells same-scope links apart); a sign-up select (Off, As reader, As editor) with its secondary "Save" beside it at every width; created by and the relative time in mono; a secondary "Revoke". Revoke asks first in the same dialog as the version view ("Revoke the link “{scope} …{hint}”? Visitors lose access at once.", Cancel focused); without JavaScript it revokes at once. Below the table, a row with the scope select (mono) and the sign-up select (Off by default) and the secondary "Create public link"; the URL then appears once as a readonly mono field labelled "Public link", focused, with "Copy" and the not-shown-again sentence. A document's Actions menu offers "Public link…", which opens this section with that document selected.

### Public pages
Under `/s/<token>`, no app shell and no JavaScript: a 44px panel bar with the wordmark as plain text (not a link), then a 72ch column at 13px chrome with 32px padding (24px 16px on phones). A document page: for a workspace link, a muted breadcrumb of folder links separated by muted "/"; the 16px/600 title when the document has a heading; the frontmatter as the right rail's key and value list; the rendered document at 16.5px; then, under a top hairline, "Download" and "Sign in to edit" as secondary buttons and "Join" as the primary when sign-up is on. A folder page is the breadcrumb then the folder view without actions, sharing its left edge. An unknown or revoked link is the plain error page.

### Join page
`/join/<token>` is the form page: the title "Join {workspace}", then a sentence naming the role and who sees the name and email ("You join Demo as reader. Its members see your name and email."), then the sign-up form shared with the invitation page (name, mono email, password with its hint, the primary "Create account", and "Already have an account? Sign in" under it). A signed-in visitor sees only the primary "Join {workspace} as {role}". A link without sign-up shows "This link does not allow sign-up." and a "Sign in" link.

### Folder query bar
Above a folder's list once it holds two documents, a GET form labelled "Sort and filter": "Sort by" and "Order" selects, then, when fields exist, "Add a filter" (first option "Choose a field", then each field in mono except the reserved `sort`, `order`, `field` and `value`) and a mono "Value" input, then a secondary "Apply". Selects are capped at 16ch (the filter select at 20ch, room for its first option) and the value input takes the rest of the row, so Apply stays on it. Active filters are one muted sentence under the bar with an accent "Clear filters" link. Sorting by a field shows its value in mono muted in place of the file name, and "—" for a document without it. Below 768px the bar is a two-column grid: Sort beside Order, the filter beside its value, Apply on its own row.

### Inbox
In the top bar, "Inbox" is a plain link like "Connect an agent"; when something is unread its label carries the count as text ("Inbox 3", "99+" above 99, accessible name "Inbox, 3 unread"), never a badge. Below 768px the link moves into the user menu and the count rides on the menu trigger ("Owner · 3", named "Owner, 3 unread"). The `/inbox` page is a list page: the title, a secondary "Mark all as read" when something is unread, then one hairline row per event (50 at most): the sentence ("Ann commented on notes/a.md") with paths as mono accent links, "via agent" in mono muted, and at the right the workspace name and the relative time in mono. An unread row is at 600 weight with a visually hidden "New"; its mono parts stay at 400 (Fragment Mono has no bold). Empty: one muted sentence.

### Image paste
Pasting or dropping an image inserts it at once; a refused one inserts nothing and the file strip's live region says "Image not added: {reason}" in error red, cleared when another document opens.

### Error page and empty state
Chrome 13px with 24px padding: a 16px/600 title and one accent link back to the workspace; the empty workspace and the empty home list each show a single muted sentence.

## Do's and Don'ts

### Do:
- **Do** use `accent` for exactly four jobs: active item, link, focus ring, the one primary action per screen.
- **Do** draw every edge as a 1px `hairline` and convey depth with ground-versus-panel tone.
- **Do** set Fragment Mono at 12.5px on paths, keys, hashes, agents, timestamps, raw Markdown and code, and Inter everywhere people read.
- **Do** give every interactive element a visible text label and a 2px accent `:focus-visible` outline.
- **Do** wrap every transition in `prefers-reduced-motion: no-preference` and keep it at 150ms ease-out.
- **Do** end a full sentence that has a verb with a period, lower-case a role word inside a sentence, and set French with « » and a U+00A0 before : ; ? ! and inside the guillemets.
- **Do** give a screen at most one primary button, and none when its actions are equals; everything else is secondary.
- **Do** route every visible string through `t()` with an English and a French entry; never hard-code a label.
- **Do** manage focus on overlays: move it in on open, return it to the opener on close, make the page `inert` behind a drawer.

### Don't:
- **Don't** build cards, stat tiles or cards inside cards; blocks are separated by space and hairlines.
- **Don't** ship icon-only buttons or a rail that collapses to icons.
- **Don't** give a button a hover fill; only tree items, the Members link, menu triggers (hairline) and menu items (panel) take one.
- **Don't** turn a role into a badge or chip; it is a muted word.
- **Don't** add shadows anywhere but the floating formatting toolbar.
- **Don't** put a kicker, eyebrow or uppercase tracked label above a heading.
- **Don't** add a dark mode or a second theme; the product is light only.
- **Don't** use a state colour as a fill or badge; it is text reporting a state.
- **Don't** leave a placeholder for a feature that has not shipped; an absent block beats an empty promise.
- **Don't** insert HTML with `{@html}` except through `Rendered.svelte` and `renderHtml`'s output.
