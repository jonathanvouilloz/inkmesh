# Known limits — inkmesh
Updated: 2026-10-20

Deliberate gaps ledgered in reviews; each is small and safe to leave until someone needs it.

- Rate limits and the write lock are in memory (one process). Connector egress IPs are shared: registration 100 and token failures 50 per 15 min per IP; a valid token is never throttled.
- OAuth: no refresh-token reuse detection (RFC 9700 §4.14.2); an abandoned consent leaves a never-connected agent in the list; a revoked agent's client is pruned after 24 h, so a connector that cached its client id must be re-added; no CORS on the OAuth endpoints (browser agents out of scope).
- Editor sessions: a failed idle commit waits for the next flush, leave or restart; the leave beacon renders a page for nothing.
- UI: in the members public-links table a long document path wraps at hyphens at 1280 px (narrow first column); phone buttons are about 30 px tall (project-wide convention, under 44 px); the import status line has no dismiss; no screen-reader run yet; the editor (Crepe) toolbar strings are English.
- Navigation: the header unread count refreshes only on a full page load; in-document `#section` links no longer jump in the editor (heading ids are prefixed `user-content-`) and rendered HTML has no heading ids.
- History: a small document moved and heavily rewritten by link relocation can fall under git's rename threshold and be listed as deleted (restoring it duplicates it); a failed `restoreDeleted` can leave empty folders; a well-formed but unknown or ambiguous commit id answers 404.
- Comments: a move overwrites a stray thread file already at the destination (only possible outside `core`; it stays in git).
- Images: no size check on serve (only a shell can plant a large file); the upload's document check runs outside the write lock (worst case an orphan image); alt text keeps control characters from the file name; upload failures other than 400 and 413 read "the connection failed"; unreferenced images are never removed.
- Public links: a document link serves embedded images and image definitions, not inline links to an image (`[x](pic.png)` answers 404); sign-up from a document link grants a workspace-wide role (spec); public pages may load third-party `https:` images, which see the visitor's IP; revoking an unknown id succeeds silently; a re-join by a member appends a `join` event; the bare `/s/` path shows the generic error page; the `/join/` page's token check is not throttled (the sign-up is).
- Public links: `dropLinks` runs before the commit or move, so a failed write still loses the links of a deleted document at that path (fails toward privacy).
- Rendering: footnote ids can repeat when several rendered blocks share a page (comments and the version view), so a footnote link may jump to the wrong block.
- `/login?next=/join/<token>` lacks the `no-store`, `noindex` and `same-origin` referrer headers that `/join/` has.
- `SearchForm` (`value={q}`) and the comment textarea (`value={…}`) still use the pattern that hydration resets.
- Search: snippets can run a heading into the next paragraph (no separator in the indexed text); the results page title has no app suffix; footnote labels in rendered HTML are English.
- Design lows not done: the viewed version is not marked in the History rail; the resolved-comments `<details>` uses the browser's triangle, not the tree chevron.
- Test gaps: no route tests for name checks (and `scripts/admin.ts` does not check names); no reader-role search test; no `unreadCount` test for a removed workspace; no e2e for an unsafe image (unit-tested); e2e leaves `demo/e2e-xss/link.md` (the data directory is wiped per run).
- Carried over: HTML blocks render as source. While email is off, a forgotten password is `npm run admin -- reset-password <email>`.
- Folder query: filters cannot be removed one by one (only "Clear filters"); sorting by name has no Z→A; `{field} is {value}` reads loosely for a list field (the match is "contains"); the folder page reads each top-level document in full for its fields on every view; the `.where` line uses a negative margin.
- Frontmatter: the document page's read path does not strip a UTF-8 BOM (the fields path does).
- Sign-in links: "Ask for a new link" on an expired link drops `next`.
- Email config: `memory:` and `file:` are accepted in production; `MAIL_FROM` is not validated (a bad one shows on the first send's log line).
- Digest: in dev, a hooks reload can start a second timer (the stop function is not kept), so a dev instance may send a digest twice; one SQL query per user per run; the run assumes event ids grow with time (one writer).
- Docker: `XFF_DEPTH=1` trusts one proxy hop; two proxies (Cloudflare then nginx) need `2` or `ADDRESS_HEADER=cf-connecting-ip`.
- Tests: the unreadable-file test fails when run as root; the "concurrent consumes" login-link test is sequential (node:sqlite is synchronous); one unit test failed once in the M6 fix wave and was not identified, and `search.spec` ("search from the header", "on a phone") fails about one run in three, passing on rerun: watch both.

- Admin CLI: no command to make an existing account an instance admin (done by hand in the database on 2026-10-20); add `grant-admin <email>` if it is needed again.
- Tables: column widths cannot be set by hand: GFM Markdown has no place to store them, so a width would be lost at save and unseen by agents; the browser sizes columns to their content.
