# M1 spike: Milkdown Crepe round-trip
Updated: 2026-10-18

`@milkdown/crepe` 7.22.3, default features, under `happy-dom` 21.0.3 in Vitest 5.0.5 (no polyfills needed). Each fixture body (frontmatter removed by `^---\n[\s\S]*?\n---\n`) goes through `new Crepe({ defaultValue })` → `create()` → `getMarkdown()`. Test: `src/lib/editor/roundtrip.spike.test.ts` (deleted in Task 7, see git history; replaced by `src/lib/editor/roundtrip.test.ts`). The `normalize` rule is the one in the plan; all four assertions fail.

| Fixture | Semantic match | Formatting changes observed | Content lost |
| --- | --- | --- | --- |
| `prd.md` | no | `-` bullets become `*`; a blank line is inserted between `# PRD — inkmesh` and the `Updated:` line that followed it directly. Nothing else differs after normalisation. | none |
| `architecture.md` | no | Same two changes as `prd.md`. | none |
| `kitchen-sink.md` | no | `-` bullets (plain, nested, task) become `*`; `---` rule becomes `***`; table cells re-padded to the alignment (`\| 42        \|` → `\|        42 \|`, centre column centred); leading blank line dropped. | image alt text: `![Workspace tree after indexing](./assets/tree.png)` → `![1.00](./assets/tree.png)` |
| `kitchen-sink-crlf.md` | no | Output is LF except a stray `\r` kept inside the fenced code block (after its first line) and inside the `<details>` HTML block, so code content gets mixed line endings. The LF-only frontmatter regex does not match CRLF, so the frontmatter reaches the editor and comes back as `***` + a paragraph + a setext heading (`-------------`), with `[` escaped to `\[`. | image alt text, as above; code block content altered (`\r` left on one line) |

Survives in every fixture: all text, link URLs and labels, image `src`, every table cell value and the alignment row, code block content and its `ts` language (LF fixtures), task-list checked state (`[x]` / `[ ]`), blockquote content and its line break, the `<details>` HTML block byte for byte, the backslash hard line break, heading levels H1 to H4 (ATX kept), `**` / `*` emphasis, ordered list numbers.

Cause of the alt-text loss: Crepe's `ImageBlock` feature stores the image ratio in the alt slot. Re-running `kitchen-sink.md` with `features: { [Crepe.Feature.ImageBlock]: false }` (exploratory, not in the committed test) keeps `![Workspace tree after indexing](./assets/tree.png)`.

**Verdict: NO-GO** for Crepe as configured by default: it replaces image alt text with a ratio (`1.00`), which is lost content under the gate's definition. The loss comes from one optional feature; with `ImageBlock` disabled and CRLF converted to LF before the editor sees the text, the remaining differences seen here are marker and padding normalisation only, which the owner may weigh against the "do not reformat untouched content" requirement.

**Controller ruling (2026-10-18): GO with conditions.** Crepe with `ImageBlock` disabled loses nothing; the remaining normalisation is handled by block-level patching in `core` (Task 4), and CRLF is converted before the editor and restored on save. Recorded in `docs/project/decisions.md`. The spike test is kept as documentation and skipped in the suite; Task 7 replaces it with an end-to-end round-trip test using the editor's real configuration.
