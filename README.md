# inkmesh

Markdown suits documents written by AI agents and read by people: it is structured, diffs well and carries metadata in its frontmatter. Sharing such a file with people who don't know the syntax, and letting them edit it, is hard; tools like Notion use their own block model and treat agents as outsiders. inkmesh is a self-hosted, open-source collaboration space where each document is a real Markdown file on disk, versioned by git, and where people (in the browser) and AI agents (through MCP or an HTTP API) work in the same workspaces with the same rights.

## What it does

- **Workspaces and roles.** A workspace is a folder of Markdown files and assets, and a git repository. Each member is owner, editor or reader. There is no public sign-up: people join by invitation or through a public link that allows it.
- **Folder view.** The sidebar shows the real folder tree. A folder lists its documents, sortable and filterable by any frontmatter field.
- **Editor and raw mode.** A WYSIWYG editor for headings, lists, tables, links, images and code, which leaves untouched content byte for byte. A raw Markdown mode for those who prefer it.
- **History and restore.** Every save is a commit attributed to its author ("Jon via claude-code" when an agent acted). Any version, or a deleted document, can be restored.
- **Comments.** One thread per document, stored in the workspace, so agents read them with the same tools.
- **Search.** Full-text search across a workspace, with the same results for people and agents.
- **Public links.** Read-only links to a document or a whole workspace, revocable, optionally letting visitors sign up and join.
- **Inbox and digest.** An in-app inbox of comments, changes and invitations, and an optional daily email digest.
- **Agents.** A remote MCP server at `/mcp` and an HTTP API at `/api/v1` with the same capabilities. Each agent has its own revocable token and acts with the rights of the person who connected it.
- **Connect an agent.** A page in every workspace that gives the exact thing to paste for Claude Desktop, Claude Code, ChatGPT, Cursor, any MCP client or a script, and shows whether the agent has connected.

The interface is in English and French, picked from the browser's language.

## Run with Docker

```sh
git clone <this repository> inkmesh && cd inkmesh
cp deploy/docker.env.example inkmesh.env
docker compose up -d
```

`compose.yaml` builds the image, keeps the data in the `inkmesh-data` volume and publishes the app on `127.0.0.1:3000` only.

**Put an HTTPS reverse proxy in front.** The example env file sets `ADDRESS_HEADER=x-forwarded-for` with `XFF_DEPTH=1`, so a proxy is required. It must terminate TLS, pass the `Host` header, send `X-Forwarded-Proto`, and append to (or overwrite) `X-Forwarded-For`. `XFF_DEPTH=1` trusts the last entry, which assumes exactly one proxy between the client and inkmesh. With two (Cloudflare in front of nginx, say), use `XFF_DEPTH=2`, or a provider header such as `ADDRESS_HEADER=cf-connecting-ip`. A request that reaches the container port directly, without these headers, gets a 500 on sign-in and on public pages. With Caddy, which sets them by default:

```
inkmesh.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

**Create the first admin.** The password is asked on the terminal (10 characters or more):

```sh
docker compose exec inkmesh npm run admin -- create-admin <email> "<name>"
```

The same script resets a password: `docker compose exec inkmesh npm run admin -- reset-password <email>`. The admin then creates workspaces and invites people from the browser.

## Run without Docker

You need Node 24 and git.

```sh
npm ci
npm run build
node build
```

Set the environment from `deploy/env.example` and create the first admin with `npm run admin -- create-admin <email> "<name>"` in the same environment. [docs/deploy.md](docs/deploy.md) describes one real setup with systemd user services and a Cloudflare tunnel; adapt the paths and the proxy to yours.

## Configuration

All settings are environment variables. `deploy/docker.env.example` and `deploy/env.example` are commented starting points.

| Variable | Default | Meaning |
| --- | --- | --- |
| `INKMESH_DATA` | `./.data` (`/data` in the image) | Data directory: the database and one git repository per workspace under `workspaces/<slug>`. |
| `PORT` | `3000` | Listening port. |
| `HOST` | `0.0.0.0` | Listening address. Use `127.0.0.1` behind a local proxy. |
| `BODY_SIZE_LIMIT` | `512K` | Largest request body. Raise it (the examples use `20M`) to save larger documents and images. |
| `PROTOCOL_HEADER` | unset | Header carrying the original protocol, usually `x-forwarded-proto`. |
| `HOST_HEADER` | unset | Header carrying the original host, usually `host`. |
| `ADDRESS_HEADER` | unset | Header carrying the client address, for the login throttle: `x-forwarded-for`, or `cf-connecting-ip` behind Cloudflare. |
| `XFF_DEPTH` | unset | With `x-forwarded-for`, how many proxies sit in front: `1` takes the last entry. |
| `SMTP_URL` | unset | SMTP server: `smtp://user:pass@host:587` (STARTTLS) or `smtps://user:pass@host:465`. |
| `MAIL_FROM` | unset | From header of every email, e.g. `inkmesh <noreply@inkmesh.example>`. |
| `INKMESH_URL` | unset | Public origin used in email links, e.g. `https://inkmesh.example`. |
| `DIGEST_HOUR` | `8` | UTC hour (0–23) when the daily digest goes out. |

`PORT`, `HOST`, `BODY_SIZE_LIMIT` and the four header variables are read by SvelteKit's [adapter-node](https://svelte.dev/docs/kit/adapter-node#Environment-variables).

## Email

Email is optional and off by default. Set `SMTP_URL`, `MAIL_FROM` and `INKMESH_URL` together to turn on sign-in links by email, invitation emails and the daily digest, which each person turns on in their settings and can leave with the one-click unsubscribe link in every digest. If only one or two of them are set, or a value is invalid, inkmesh refuses to start and names the problem. Links in emails always start with `INKMESH_URL`, never with the host of the request.

To try it without a mail server, use `SMTP_URL=file:`: each message is written as an `.eml` file under `$INKMESH_DATA/mail/`.

## Connecting agents

Open a workspace, then "Connect an agent" in the sidebar. Pick the tool and name the agent; the page gives the connector URL, the command or the JSON to paste. Tools that support it authorise through the browser (OAuth), so no token is copied by hand. For a script, the page issues a token for the HTTP API.

- MCP server: `https://<your host>/mcp`
- HTTP API: `https://<your host>/api/v1`, with the agent's token as a bearer token.

## Backup and upgrade

Everything lives in the data directory: `inkmesh.db` and `workspaces/`, where each workspace is an ordinary git repository you can clone or read without inkmesh.

- **Backup:** copy the data directory while inkmesh is stopped. With Docker: `docker compose stop && docker compose cp inkmesh:/data ./inkmesh-backup && docker compose start`. To back up while running, copy `workspaces/` and snapshot the database with Node's built-in SQLite (the image has no `sqlite3`): `docker compose exec inkmesh node -e "const s = require('node:sqlite'); s.backup(new s.DatabaseSync('/data/inkmesh.db'), '/data/inkmesh-backup.db')"`, then `docker compose cp inkmesh:/data/inkmesh-backup.db .`. Without Docker, run the same `node -e` with your data directory's paths.
- **Scheduled backup (optional, without Docker):** `scripts/backup.sh` mirrors every workspace to a private GitHub repository `<BACKUP_GITHUB_OWNER>/inkmesh-<slug>` through the `gh` CLI and keeps daily database snapshots in `~/inkmesh-backups/db/` (14 days). `deploy/inkmesh-backup.timer` runs it every hour, and `deploy/inkmesh-alert@.service` emails the instance admins when it fails (email must be configured).
- **Upgrade:** pull, rebuild, restart. With Docker: `git pull && docker compose up -d --build`. Without: `git pull && npm ci && npm run build`, then restart `node build`. Database migrations run at start and only go forward, so take a backup first if you may want to go back.

## Privacy

inkmesh keeps, for each account: name, email address, password hash, sessions, agent tokens (hashed) and the events behind the inbox. Git history keeps the display name of whoever made each change. When email is on, the SMTP provider receives what each message holds: the recipient's address, and the workspace names, document paths and people's names that invitations and digests contain. An invitation sent by email keeps the recipient's address until it is used; once it has expired, the next invitation created erases it. inkmesh has no analytics and sends nothing anywhere else.

## Development

- `npm install` — install dependencies
- `npm run seed` — create the `demo` workspace and, in development, the admin `owner@inkmesh.local` / `inkmesh-dev` who owns it (idempotent)
- `npm run admin -- create-admin <email> "<name>"` — create an instance admin; the password is read from stdin
- `npm run admin -- reset-password <email>` — set a new password, read from stdin
- `npm run dev` — local server, data in `./.data`
- `npm test` — unit tests (Vitest)
- `npm run check` — type and Svelte checks
- `npm run test:e2e` — browser tests (Playwright)
- `npm run build` — production build

To see emails locally, start the dev server with `SMTP_URL=file: MAIL_FROM='inkmesh <dev@localhost>' INKMESH_URL=http://localhost:5173`; messages land in `.data/mail/`.

## Licence

MIT, see [LICENSE](LICENSE).

## En français

inkmesh est un espace de travail auto-hébergé et open source. Chaque document est un vrai fichier Markdown sur le disque, versionné par git. Les personnes le modifient dans le navigateur avec un éditeur simple ; les agents IA passent par un serveur MCP ou une API HTTP, avec les mêmes droits. L’interface existe en français et en anglais, selon la langue du navigateur. Le plus simple pour l’installer est Docker : copiez `deploy/docker.env.example` vers `inkmesh.env`, lancez `docker compose up -d` derrière un proxy HTTPS, puis créez le premier compte administrateur (voir « Run with Docker » plus haut). Toutes les variables sont décrites dans la section « Configuration ». L’envoi d’e-mails (lien de connexion, invitations, résumé quotidien) est facultatif et désactivé par défaut. inkmesh est distribué sous licence MIT.
