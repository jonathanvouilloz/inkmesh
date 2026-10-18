# Design references — inkmesh

Owner brief (2026-10-18): no fixed reference. Likes Linear and GitHub. Wants one simple, pleasant interface a non-technical person is comfortable in; the "geek" side is a raw Markdown toggle in the editor, not a second interface. Light mode by default. Space Grotesk is a candidate typeface, otherwise open.

| source | what we take | what we leave |
|---|---|---|
| Linear (linear.app, app shell in the hero) | App shell: narrow sidebar with icon + label navigation, document as the wide centre column, a quiet properties rail on the right (we use it for frontmatter and history). Small, tight UI type (13–14px) with grey hierarchy instead of colour. Hairline borders, 6–8px radii, no shadows. One restrained accent used only for the active item and primary action. | Dark mode as default. Marketing gradients and glow. Issue-tracker density (badges, cycles, priorities). |
| GitHub (github.com, Markdown rendering and repository views) | Markdown rendering conventions everyone already knows: heading scale, tables with hairline rows, code blocks with a grey background, task lists, blockquotes with a left rule. File tree browsing of a folder. Commit history as a plain list (author, message, relative time). Comment threads: avatar, name, time, body. | Dark marketing theme and purple accents. Dense top navigation. Multiple competing toolbars. |
| Notion (notion.com, product shots) | The editing feel for non-technical people: a calm white page with generous side margins, a large plain title, controls that appear on hover and otherwise stay out of the way, a slash menu for inserting blocks. Light mode. | Block drag handles everywhere. Database views, galleries, playful illustrations. Saturated blue buttons. Fixed-width page that ignores the document's structure. |
| Anti-reference: generic admin dashboards | — | Cards inside cards, coloured stat tiles, icon buttons without labels, sidebars that collapse to mystery icons. |

## Typography candidates (owner to pick at `/impeccable`)

- Interface and headings: **Space Grotesk** (owner's candidate). Risk: its quirky glyphs tire at body size in long documents, so pair it with a quieter text face.
- Document body, two candidates: **Inter** (neutral, excellent at 16–17px, matches the GitHub reading experience) or **Source Serif 4** (warmer, more "document" than "app", good for long reports).
- Code and raw Markdown: **JetBrains Mono** or the system monospace stack.
