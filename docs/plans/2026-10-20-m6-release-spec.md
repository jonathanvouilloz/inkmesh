# Milestone 6 — Release (spec)

Updated: 2026-10-20. Implements PRD items 2 (sort and filter by frontmatter), 13 (email: daily digest, invitations by email) and 14 (magic-link login), plus what an open-source release needs: a Dockerfile with a compose example, a README for self-hosters and users, and a licence. Architecture of record: `docs/project/architecture.md`; this spec only fixes what that document leaves open for this milestone. Milestones 1 to 5 are assumed merged (folder view and `walkTree`, `frontmatterEntries`, accounts with `newToken`/`hashToken` and the in-memory throttle, invitations, public links under `/s/` with their CSP, the inbox and its `MINE` filter, `init` in `hooks.server.ts`).

## Goal

Jon opens a folder of reports, sorts it by `date` descending and keeps only `status: draft`, then pastes that URL to a teammate who sees the same list. A collaborator who forgot their password asks for an email link and is signed in one minute later. A member who turned on the daily digest gets one short email at 08:00 UTC on days when something changed, and stops it from that email in one click. A stranger installs inkmesh from the README with `docker compose up -d`, behind their own HTTPS proxy, under the MIT licence.

## Scope

1. Sort and filter the folder view (members and public workspace links) by any frontmatter field, from URL query parameters.
2. Email transport configured by environment, off when not configured.
3. Magic-link login.
4. Invitation links sent by email (optional, from the members page).
5. Daily digest of inbox events, opt-in per user, unsubscribe without login.
6. Dockerfile, `.dockerignore`, `compose.yaml`, `deploy/docker.env.example`.
7. README (English, with a short French section) and LICENSE (MIT).

Out of scope: see the last section.

## Decisions taken before this spec (not reopened)

These are the controller's rulings for M6; the plan's last task records each in `decisions.md`.

1. **Email transport: SMTP from the environment.** `SMTP_URL` and `MAIL_FROM`; at most one new dependency. Without configuration every email feature is off, the UI says so in one line (magic-link option hidden, digest setting disabled with its reason), password login keeps working. Tests and e2e never send real email: a memory or file transport chosen by the environment. No real email is sent while building.
2. **Magic links** are single-use, valid 15 minutes, stored as `hashToken(newToken())`, throttled per IP and per email, answered the same whether the account exists or not, consumed by a POST from a landing page (never by the GET, so mail scanners cannot burn them), and start a session like password login.
3. **Digest**: one email per user per day at a fixed hour (instance setting, default 08:00 UTC), only when unread events exist since the last digest; per-user setting on the account page; an unsubscribe link in each email that works without login (signed token). Scheduler: an in-process timer with one catch-up at start. State per user (`digest_last_id`, `digest_sent_at`), none per event.
4. **Sort and filter** on the server from URL query parameters (shareable), fields discovered from the folder's documents, sort by any field ascending or descending, filter by equality (lists: contains), keyboard and phone usable, no new dependency, public folder pages too.
5. **Licence MIT** (owner confirmation pending, a one-file change). README in English with a short French part.
6. **Docker**: `node:24` slim, multi-stage, git installed, non-root, one volume for `INKMESH_DATA`, an env file example, a healthcheck, a compose example. The systemd deploy stays the reference for this VPS.
7. **Admin CLI**: `reset-password` exists; nothing is added.

## Decisions made by this spec

- **SMTP client: `nodemailer@10.0.15`** (exact pin; MIT-0, no dependencies, ships its own types, published 2026-10-05). Compared on fit, as `choose-stack` would:

  | | nodemailer | hand-rolled client on `node:net`/`node:tls` |
  |---|---|---|
  | Code we own | ~40 lines (transport setup) | ~250 lines: EHLO, STARTTLS upgrade, AUTH PLAIN/LOGIN, dot-stuffing, reply-code parsing, timeouts |
  | Correctness risk | encoded-word headers for French names, line folding, 8BITMIME fallback and TLS edge cases handled for 15 years | each of these is a bug class we would own, and an SMTP bug means lost magic links |
  | Test transports | `streamTransport` gives the exact bytes for the file transport | to write |
  | Supply chain | one package, zero transitive dependencies | none |

  Chosen: nodemailer. The dependency adds no transitive package and removes a protocol implementation from a two-person project. Cost: one more package to update. A version at least two weeks old was picked over 10.1.x (six releases between 2026-10-14 and 2026-10-18).
- **`SMTP_URL` schemes**: `smtp://user:pass@host:587` (STARTTLS when offered), `smtps://user:pass@host:465` (implicit TLS), and two non-sending ones for development and tests: `memory:` (each message appended to an in-process array, `outbox`) and `file:` (each message written as an `.eml` file into `$INKMESH_DATA/mail/`, so nothing is written outside the data directory). The e2e server runs with `file:`.
- **Email needs a configured public URL, `INKMESH_URL`** (for example `https://inkmesh.ch`). Links in emails are never built from the request's `Host`: an attacker could otherwise ask for a magic link for a victim with `Host: evil.example` and the victim would receive a valid token pointing to the attacker's server. Email is **on** only when `SMTP_URL`, `MAIL_FROM` and `INKMESH_URL` are all set. Some but not all set, an unknown scheme, or an `INKMESH_URL` that is not a bare `http(s)` origin → the process refuses to start with one line naming the variable (a typo must not silently turn email off). Cost: one more variable for self-hosters; on this VPS phase A (random tunnel host) cannot enable email until phase B.
- **Plain-text emails only.** No HTML part: nothing to sanitise, nothing to render wrongly, readable everywhere. Cost: no styling.
- **Magic links**
  - Table `login_links`; each row carries its user, the `next` path (already passed through `safeNext`), its expiry and creation time. Creating one first deletes expired rows. Consuming is one `DELETE … RETURNING` (atomic: two concurrent POSTs cannot both win). A password change or reset (`setPassword`) deletes the user's links with their sessions. Several unexpired links can coexist (two requests in a row both work, each once).
  - Request: `/login?method=link` shows one email field. The action counts `link-ip|<ip>` (10 per 15 minutes) and `link-email|<email>` (3 per 15 minutes) on every request, before the lookup, then answers the same sentence for a known or unknown address. The email is sent **without awaiting** it, so the answer time does not reveal whether a message was sent; a send failure is logged.
  - Landing `/login/link/<token>`: the GET only reads (valid → "Continue as {email}." and a Sign in button; expired, used or unknown → a sentence and a link to ask again). The POST consumes the link, starts the session and redirects to `next`. Headers as `/join/`: `referrer-policy: same-origin`, `cache-control: no-store`, `x-robots-tag: noindex, nofollow`.
  - The login page's password form keeps its fields; its action becomes `?/password` (SvelteKit forbids a default action next to named ones).
  - Not throttled: the landing page's token check (256-bit tokens; same known limit as `/join/`).
- **Invitations by email**: the "New invitation link" form gets an optional "Email the link to" field when email is on. The action creates the link as today (shown once, as today), then sends it and says whether it went; a failure never loses the link. The address is not stored (nLPD: only what the account needs). Sends count against `invite-mail|<user id>` (20 per 15 minutes). The email is in the inviter's interface language.
- **Digest default: off until the user opts in.** nLPD art. 7 asks for privacy by default; the digest hands document paths and names to the instance's SMTP provider (a processor), and the inbox already informs every member in the app. Cost: members who would want it must find it; the inbox page carries one link to the setting when email is on and the digest is off.
- **Digest timing: a daily slot.** `DIGEST_HOUR` (integer 0–23, UTC, default `8`; anything else stops the start). The slot is the latest `DIGEST_HOUR:00Z` at or before now. A run for a slot sends to each user with `digest = 1` whose `digest_sent_at` is null or before the slot, the events that are theirs (the inbox rule), with `id > max(digest_last_id, inbox last_read)` and `at <= slot`; nothing such → no email and no state change. After a send: `digest_last_id` = the highest id sent, `digest_sent_at` = now. This makes the start-up catch-up and the timed run the same idempotent call: a restart at 10:00 sends what the 08:00 run would have (if it did not run), and never events after 08:00, which belong to tomorrow. A failed send is logged and changes nothing, so the next slot carries those events. Turning the digest on sets `digest_last_id` to the current highest event id, so the first email covers only what happens after.
- **Digest content**: subject "inkmesh: {count} changes in your workspaces"; the inbox sentences ("Ann updated notes/a.md · Demo", `via agent` appended to the author), newest first, at most 50 lines, then "{count} more in your inbox." when there are more, the inbox URL, and the footer with the unsubscribe URL. The locale is the user's stored `locale`, saved with the digest setting from the interface language at that moment.
- **Unsubscribe token: HMAC, not a stored token.** `<user id>.<base64url HMAC-SHA256(key, "unsubscribe:" + user id)>`, the key a 32-byte random value created by the migration in `instance_keys` (no secret to configure, survives restarts, travels with the database backup). It never expires and only turns the digest off. Verified with `timingSafeEqual`.
- **One click**: each digest carries `List-Unsubscribe: <INKMESH_URL/unsubscribe/<token>>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), so mail clients that show an Unsubscribe button stop the digest with one click and a POST. The link in the body opens `/unsubscribe/<token>`, whose one button POSTs (a GET never changes state, for the same scanner reason as magic links). `/unsubscribe/` is exempt from the origin check (mail providers POST without an `Origin`) and never reads the session cookie: it joins the `isAgentPath` predicate, renamed in a comment as "cookie-free paths". Cost: from the body link, unsubscribing is two clicks (link, button).
- **Sort and filter URL**: `?sort=<key>&order=asc|desc&<field>=<value>&…`. `sort`, `order`, `field` and `value` are reserved parameter names; every other parameter whose name is a field of the folder is an equality filter (at most 5, ANDed, values at most 200 characters, compared case-insensitively after trimming; a list field matches when one item equals the value). Unknown parameters are ignored. Sort keys: any field of the folder, and two built-ins, `title` and `modified` (last change), used when no document of the folder has a field of that name (a frontmatter field wins over a built-in). No `sort` → today's order (by name). `order` defaults to `asc`. Comparison: `localeCompare` with `{ numeric: true, sensitivity: 'base' }` on the first value (ISO dates and numbers order correctly); documents without the field come last in both orders; ties by name. Cost: a frontmatter field named `sort`, `order`, `field` or `value` cannot be filtered.
- **The filter form is a GET form** of `field` and `value` (plus hidden inputs carrying the active filters; the sort and order selects belong to the same form). The load turns `field=status&value=draft` into the canonical `?status=draft` with a 303 redirect, so the shared URL is always the readable one. Works without JavaScript, which public pages need.
- **While a filter is active, folders are not listed** (they have no fields); sorting alone keeps folders first, by name.
- **Field discovery**: the frontmatter of the documents directly in the folder (not nested), up to 30 field names sorted by name, up to 50 distinct values per field (for the value suggestions, a `<datalist>`). The controls show when the folder holds at least two documents; the filter part only when at least one field exists.
- **Frontmatter values without a YAML parser** (`frontmatterFields`, beside `frontmatterEntries`): a top-level `key: value` line; `[a, "b c"]` is a list split on commas (a value opening `[` without closing it is a plain scalar); an empty value followed by `- item` lines (indented or at column 0; blank and `#` comment lines between them keep the list open) is a list; a value starting with `|`, `>`, `&` or `*` (block scalar, anchor, alias) is no value; a leading BOM is ignored; surrounding matching quotes are dropped; an empty value is no value; the first occurrence of a key wins. Cost: YAML anchors, multi-line strings and nested maps are not understood (their key has no value); an inline `# note` stays part of the value.
- **Fields are read per folder, not carried by the tree.** `walkTree` stays as is; the folder page reads the frontmatter of that folder's documents. Putting fields on every tree node would send every document's frontmatter with every workspace page. Cost: the folder page reads its documents twice (tree and fields).
- **Public pages allow their own GET forms**: the `/s/` CSP changes `form-action 'none'` to `form-action 'self'`. Public pages hold no POST form, and `/join/` is outside `/s/`.
- **Docker**
  - Image `node:24-bookworm-slim`, three stages: `deps` (`npm ci --omit=dev`), `build` (`npm ci`, `npm run build`), runtime (git and ca-certificates from apt, `build/`, production `node_modules`, `package.json`, `scripts/`, `src/lib/` for the admin CLI). Runs as `node` (uid 1000), `/data` created and owned by `node` before `VOLUME /data`, `ENV INKMESH_DATA=/data PORT=3000 HOST=0.0.0.0 NODE_ENV=production`, `EXPOSE 3000`, `HEALTHCHECK` with Node's `fetch` on `http://127.0.0.1:3000/login`.
  - The container expects an HTTPS reverse proxy in front: adapter-node assumes `https` without `X-Forwarded-Proto`, and the session cookie is `Secure`, so a plain-http visit fails the origin check. `deploy/docker.env.example` sets `PROTOCOL_HEADER=x-forwarded-proto`, `HOST_HEADER=host`, `ADDRESS_HEADER=x-forwarded-for`, `XFF_DEPTH=1`; `compose.yaml` publishes `127.0.0.1:3000:3000` only, so no client can reach the port and forge those headers. The README gives a two-line Caddy example. Cost: no "open http://server:3000" trial; local trials use `npm run dev`.
  - The env file for compose is `inkmesh.env` (git-ignored), not `.env`, because Vite reads `.env` in development.
- **LICENSE**: MIT, "Copyright (c) 2026 the inkmesh authors"; `package.json` gains `"license": "MIT"` and stays `private` (not published to npm).
- **README: one file**, English, with a short "En français" section at the end (what inkmesh is, how to install, where to find the rest). One file cannot drift from a translation.
- **`unsubscribe` joins the reserved workspace slugs.**

## Data (migration `005-email`)

```sql
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN digest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN digest_last_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN digest_sent_at TEXT;
CREATE TABLE login_links (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  next TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE instance_keys (name TEXT PRIMARY KEY, key BLOB NOT NULL);
INSERT INTO instance_keys (name, key) VALUES ('unsubscribe', randomblob(32));
```

`locale` is `'en'` or `'fr'` (checked in code). Erasing a user removes their links (cascade) and their digest state (columns of the row).

## Environment (additions)

| Variable | Default | Meaning |
|---|---|---|
| `SMTP_URL` | unset (email off) | `smtp://…`, `smtps://…`, `memory:` (tests) or `file:` (writes `$INKMESH_DATA/mail/*.eml`) |
| `MAIL_FROM` | unset | the From header, for example `inkmesh <noreply@inkmesh.ch>` |
| `INKMESH_URL` | unset | public origin used in email links, for example `https://inkmesh.ch` |
| `DIGEST_HOUR` | `8` | UTC hour of the daily digest, 0–23 |

Transport timeouts (code, not configurable): connection 10 s, greeting 10 s, socket 30 s.

## Emails

| Email | When | Subject (en) | Body (en, plain text) |
|---|---|---|---|
| Sign-in link | `/login?method=link` for an existing account | Your inkmesh sign-in link | Hello {name}, the link `INKMESH_URL/login/link/<token>`, "It works once, for 15 minutes.", and "If you did not ask for it, ignore this email: nobody can sign in without the link." |
| Invitation | the optional field on the members page | {inviter} invites you to {workspace} | "{inviter} invites you to join {workspace} on inkmesh as {role}.", the invitation URL, "It works once and expires in 7 days." |
| Daily digest | the daily slot | inkmesh: {count} change(s) in your workspaces | intro line, one line per event, "{count} more in your inbox." if over 50, the inbox URL, footer with the unsubscribe URL |

Every email: `From: MAIL_FROM`, `To` the user's (or typed) address, UTF-8 text. The digest adds the two `List-Unsubscribe` headers. Exact copy in both languages: the plan's i18n keys (`mail.*`).

## Routes (additions and changes)

| Route | Method | Who | Behaviour |
|---|---|---|---|
| `/login` | GET | anonymous | password form; with email on, a link "Email me a sign-in link instead" to `?method=link` (keeping `next`) |
| `/login?method=link` | GET | anonymous | the email field and "Email me a link"; a link back to the password form. Email off → the password form |
| `/login?/password` | POST | anonymous | today's password login, unchanged |
| `/login?/link` | POST | anonymous | email off → 404; throttles; same answer `{ sent: true, email }` for every valid address; bad address → 400 `invite.email` |
| `/login/link/<token>` | GET | anyone | `{ email }` when the link is valid, else `{ email: null }` |
| `/login/link/<token>` | POST | anyone | consumes → session cookie, 303 to `next`; unusable → 410 |
| `/<ws>/members?/invite` | POST | editor | as today, plus optional `email` → `{ link, mailed }` or `{ link, mailError }` |
| `/account?/digest` | POST | signed in | `digest` = `'1'` or absent; email off → 400; stores the locale |
| `/unsubscribe/<token>` | GET | anyone | `{ valid }` |
| `/unsubscribe/<token>` | POST | anyone (no origin check, no cookie) | valid → digest off, `{ done: true }`; invalid → 404 |
| `/<ws>`, `/<ws>/<folder>`, `/s/<token>`, `/s/<token>/<folder>` | GET | as today | query parameters sort and filter the folder; `field`+`value` → 303 to the canonical URL |

## Interface

All under `DESIGN.md` (Inter, Fragment Mono for paths, emails, field names and values, one accent, no eyebrow, no badge, no card). New or changed surfaces:

- **Folder view query bar** (members and public): between the folder's tools and its list, a GET `<form aria-label="Sort and filter">` in one wrapping row (8px gaps): "Sort by" select (Name, Title, Last change, then each field in mono), "Order" select (Ascending, Descending), and, when fields exist, "Add a filter" select (Choose a field, then each field except the reserved names) and a "Value" input with the field's suggestions, then a secondary "Apply". Labels above their control like every field. Active filters show as one muted sentence under the bar ("Showing documents where status is draft and tags is q3.") with an accent "Clear filters" link (keeps the sort). When sorting by a frontmatter field, each document row shows that field's value in mono muted in place of the file name ("—" when it has none). No match: "No document matches." Below 768px the bar is a two-column grid (Sort beside Order, the filter beside its value, Apply on its own row). The bar is absent when the folder has fewer than two documents.
- **Login page** (form page): the password form as today; with email on, under the button, a plain accent link "Email me a sign-in link instead". The link variant: title "Sign in to inkmesh", the email field (mono), the primary "Email me a link", and the link "Use a password instead". After sending: the same title and one `role="status"` sentence naming the address (mono), nothing else to do.
- **Link landing page** (form page): title "Sign in to inkmesh", the sentence "Continue as {email}." (mono email) and the primary "Sign in". Unusable link: the title "This sign-in link has expired or was already used" and the accent link "Ask for a new link".
- **Members page, invitation form**: with email on, an optional mono email input "Email the link to (optional)" in the same row as the role select, before "Create link". After creation, under the one-time link, a green "Link sent to {email}." or a red "The email could not be sent: copy the link instead." (`role="status"` / `role="alert"`).
- **Account page**, new `<section id="digest">` "Daily digest" after Password: a checkbox labelled "Email me a summary of what changed in my workspaces, every day at {hour}:00 UTC", the muted note "Sent only on days when something changed.", the secondary "Save" and the green saved sentence. Email off: the checkbox disabled and unchecked, the note replaced by "Email is not set up on this server, so the digest is off.", no Save.
- **Inbox page**: with email on and the digest off, one muted line under the title with the accent link "Get these changes by email once a day" to `/account#digest`.
- **Unsubscribe page** (form page, no top bar): title "Stop the daily digest", the sentence "You will no longer get the daily email. You can turn it on again on your account page.", the primary "Stop the digest"; after it: "The daily digest is off." (`role="status"`). Invalid token: the title "This link is not valid".

i18n: every string in `en` and `fr`, French with « », a non-breaking space before `:` `;` `?` `!` and inside guillemets. Key families: `query.*`, `login.*` (additions), `loginLink.*`, `mail.*`, `members.*` (additions), `account.digest*`, `inbox.digestHint`, `unsubscribe.*`.

## Security rules

- **No account enumeration**: the link request answers the same text, status and timing (no awaited send) for known and unknown addresses; throttles count every request, known or not.
- **Tokens**: login links `newToken()`, only `hashToken` stored, 15 minutes, single use by atomic delete, removed by a password change; unsubscribe tokens are HMACs compared in constant time. No token is logged; mail send errors log the recipient's user id, not the address or the URL.
- **Links in emails** use `INKMESH_URL`, never the request's host.
- **No state change on GET**: login links and unsubscribe act only on POST.
- **Headers** on `/login/link/` and `/unsubscribe/`: `referrer-policy: same-origin`, `cache-control: no-store`, `x-robots-tag: noindex, nofollow`.
- **Origin check**: unchanged everywhere except `/unsubscribe/`, whose only effect needs the token.
- **Throttles** (in memory, 15 minutes): `link-ip|<ip>` 10, `link-email|<email>` 3, `invite-mail|<user id>` 20. The existing login keys are unchanged.
- **Query parameters** are data: field names and values are matched against the folder's own fields and rendered as text; nothing from the URL reaches the file system.
- **Docker**: non-root, the port published on loopback only in the example, no secret in the image; `inkmesh.env` git-ignored.
- **Reserved slug**: `unsubscribe`. Before deploying, check that no production workspace uses it.

## Testing

- Unit: `frontmatterFields` (scalars, quotes, flow and block lists, empty values, first key wins, CRLF); `folderFields` and `sharedFolderFields` (direct children only, role, document links refused); `queryFolder` (sort by field, built-ins, field shadowing a built-in, missing values last in both orders, numeric and date order, equality, list contains, case, five-filter cap, unknown parameters, folders hidden only while filtering, field and value caps) and the canonical redirect; mail configuration matrix (all off, partial, bad scheme, bad URL), memory and file transports, the three message builders in both languages; migration (columns, tables, key present and 32 bytes); login links (single use, expiry, concurrent consume, password change removes them, prune); the link request (same answer for unknown addresses, throttles, email off, `next` kept through `safeNext`); landing (GET does not consume, POST does, 410 after); invitation email (sent, failure keeps the link, throttle, email off ignores the field); digest (opt-in sets the cursor, slot computation at and around the hour, nothing to send, inbox cursor respected, `at <= slot`, catch-up idempotent, failed send keeps state, 50-line cap, locale, headers) and unsubscribe (valid, forged, other user's id, POST without origin passes the CSRF check); the public CSP.
- E2E (each spec in its own folder or account): sort and filter a folder by URL and by the form, share the URL in a new page (`e2e-query/`); the same on a public workspace link; ask for a sign-in link, read it from `.data-e2e/mail/`, open it, sign in (anonymous project); turn the digest on and off on the account page.
- Docker: build the image, run it on a throwaway volume, `/login` answers 200, the container is healthy, runs as uid 1000, has git; `docker compose config` validates the example.

## Out of scope for this spec

Mentions and immediate email on mention (mentions do not exist); HTML email; per-event email state or a notification preferences matrix; email address change and verification; a "forgot password" flow separate from magic links (the magic link is the recovery path; the CLI reset stays); sending a test email from the CLI; DKIM signing (the SMTP provider's job); a persistent or shared throttle; filtering with operators other than equality (ranges, not-equal, contains on scalars), OR between filters, saved views, columns per field (PRD out of scope: database views); sorting folders by field; nested-folder filtering; a frontmatter YAML parser; images for multiple architectures, a registry push, Kubernetes manifests; a hosted demo; translations of the README beyond the French section.
