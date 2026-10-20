# Deploying inkmesh

Production runs on the owner's VPS as the user `hermes`: two systemd user services (linger is enabled, so they run without a login session). `inkmesh` runs `node build` on `127.0.0.1:9310`; `inkmesh-tunnel` runs `cloudflared` and is the only way in from outside. Backup and rollback: see `docs/project/architecture.md`, "Environments and deployment".

## Two checkouts

- **Dev**: `~/personal-projects/inkmesh`, where work, dev builds and e2e runs happen (`npm run test:e2e` runs `npm run build` and would overwrite `build/` under a live process).
- **Prod**: `~/inkmesh-app`, a clone of the dev repository (its `origin`) kept on `main`. Only `scripts/deploy.sh` touches it. The service runs there, and both units are linked from this clone (`~/inkmesh-app/deploy/*.service`), so the live unit always matches the deployed version.

Create the prod clone once: `git clone -b main ~/personal-projects/inkmesh ~/inkmesh-app`.

While the dev folder is still named `comd`, a symlink `~/personal-projects/inkmesh -> comd` makes the dev path valid; production does not depend on it. To rename for good: `cd ~/personal-projects && rm inkmesh && mv comd inkmesh`, then `git -C ~/inkmesh-app remote set-url origin ~/personal-projects/inkmesh` if the clone recorded the `comd` path.

Rollback: `cd ~/inkmesh-app && git checkout <previous sha> && npm ci && npm run build && systemctl --user restart inkmesh`; the data directory is untouched. `git checkout main` before the next `scripts/deploy.sh`.

## Phase A: quick tunnel, no domain

1. Environment file (secrets live here only, never in git):
   ```sh
   mkdir -p ~/.config/inkmesh /home/hermes/inkmesh-data
   cp deploy/env.example ~/.config/inkmesh/env
   ```
2. App unit, linked from the prod clone and enabled in one step (repeatable after a `disable`):
   ```sh
   systemctl --user enable /home/hermes/inkmesh-app/deploy/inkmesh.service
   ```
3. Build and start the app: `scripts/deploy.sh` (fast-forwards `~/inkmesh-app` to `main`, `npm ci`, build, restart `inkmesh`; migrations run at start). Run it again for every later deploy. Check: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9310/login` prints `200`.
4. First admin (do not run the seed in production), password on stdin:
   ```sh
   ( cd ~/inkmesh-app && set -a && . ~/.config/inkmesh/env && set +a && npm run admin -- create-admin <email> "<name>" )
   ```
5. Publish: this step makes the app reachable from the internet, so only after the admin exists and with the owner's approval. It also starts the tunnel at every boot:
   ```sh
   systemctl --user enable --now /home/hermes/inkmesh-app/deploy/inkmesh-tunnel.service
   ```
   Then `scripts/tunnel-url.sh` prints the `https://<words>.trycloudflare.com` URL. It changes at every tunnel restart and has no uptime promise.

Logs: `journalctl --user -u inkmesh -f`, `journalctl --user -u inkmesh-tunnel -f`.

## Phase B: inkmesh.ch with a named tunnel

1. **Jon, in his browser:** register `inkmesh.ch` (Cloudflare Registrar if it offers `.ch`, otherwise Infomaniak or Hostpoint), add the zone to his Cloudflare account (free plan) and set the registrar's nameservers to Cloudflare's.
2. **Jon, in his browser:** `~/.local/bin/cloudflared tunnel login` prints a URL; he opens it and authorises the `inkmesh.ch` zone. This writes `~/.cloudflared/cert.pem`.
3. Create the tunnel: `~/.local/bin/cloudflared tunnel create inkmesh` (prints the tunnel id and writes `~/.cloudflared/<tunnel-id>.json`).
4. Config: `cp deploy/cloudflared.yml ~/.cloudflared/inkmesh.yml` and replace `<tunnel-id>`.
5. DNS: `~/.local/bin/cloudflared tunnel route dns inkmesh inkmesh.ch`.
6. Env: nothing to change. The origin keeps coming from the proxy headers (`PROTOCOL_HEADER`, `HOST_HEADER`); adapter-node 6 does not read an `ORIGIN` variable (a fixed origin would be the build-time `paths.origin` option, not needed here).
7. Tunnel switch: in `deploy/inkmesh-tunnel.service`, comment the quick tunnel `ExecStart` and uncomment the `tunnel run` one; commit on `main` and run `scripts/deploy.sh` so the prod clone carries it.
8. Restart both: `systemctl --user daemon-reload && systemctl --user restart inkmesh inkmesh-tunnel`. Sessions survive (cookie name and path unchanged). Check `https://inkmesh.ch/login`.

## Backup

`scripts/backup.sh`, run every hour by `deploy/inkmesh-backup.timer`, mirrors each workspace's git repository to a private GitHub repository `<BACKUP_GITHUB_OWNER>/inkmesh-<slug>` (created on first run through the `gh` login of `hermes`) and refreshes a daily snapshot of `inkmesh.db` in `~/inkmesh-backups/db/`, kept 14 days. The database never leaves the VPS. Logs: `journalctl --user -u inkmesh-backup`; a failed push or snapshot makes the run fail, and systemd then starts `inkmesh-alert@inkmesh-backup.service`, which emails every instance admin the last log lines (`scripts/alert.ts`; nothing is sent when email is off).

1. Env: add `BACKUP_GITHUB_OWNER=jonathanvouilloz` to `~/.config/inkmesh/env`.
2. Units, linked from the prod clone: `ln -sf ~/inkmesh-app/deploy/inkmesh-backup.service ~/inkmesh-app/deploy/inkmesh-backup.timer ~/inkmesh-app/deploy/inkmesh-alert@.service ~/.config/systemd/user/ && systemctl --user daemon-reload`.
3. First run, by the owner (it sends the documents to GitHub): `systemctl --user start inkmesh-backup && journalctl --user -u inkmesh-backup -n 20 --no-pager`.
4. Every hour from then on: `systemctl --user enable --now inkmesh-backup.timer`.

Restore a workspace: `git clone https://github.com/<owner>/inkmesh-<slug>.git $INKMESH_DATA/workspaces/<slug>` with the app stopped; restore the database by copying a snapshot over `inkmesh.db` (app stopped, remove `inkmesh.db-wal` and `inkmesh.db-shm`).
