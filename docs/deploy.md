# Deploying inkmesh

Production runs on the owner's VPS as the user `hermes`: two systemd user services (linger is enabled, so they run without a login session). `inkmesh` runs `node build` on `127.0.0.1:9310`; `inkmesh-tunnel` runs `cloudflared` and is the only way in from outside. Backup and rollback: see `docs/project/architecture.md`, "Environments and deployment".

The unit files point at `%h/personal-projects/inkmesh`. While the repository folder is still named `comd`, a symlink `~/personal-projects/inkmesh -> comd` makes that path valid. To rename for good, with no change to the units:

```sh
cd ~/personal-projects && rm inkmesh && mv comd inkmesh
systemctl --user reenable /home/hermes/personal-projects/inkmesh/deploy/inkmesh.service
systemctl --user restart inkmesh
# only if the tunnel is already enabled:
systemctl --user reenable /home/hermes/personal-projects/inkmesh/deploy/inkmesh-tunnel.service
```

`reenable` with the path rewrites the unit links in case any was resolved to the `comd` path.

## Phase A: quick tunnel, no domain

1. Environment file (secrets live here only, never in git):
   ```sh
   mkdir -p ~/.config/inkmesh /home/hermes/inkmesh-data
   cp deploy/env.example ~/.config/inkmesh/env
   ```
2. App unit, linked from the repository and enabled in one step (repeatable after a `disable`):
   ```sh
   systemctl --user enable /home/hermes/personal-projects/inkmesh/deploy/inkmesh.service
   ```
3. Build and start the app: `scripts/deploy.sh` (pull, `npm ci`, build, restart `inkmesh`; migrations run at start). Run it again for every later deploy. Check: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9310/login` prints `200`.
4. First admin (do not run the seed in production), password on stdin:
   ```sh
   ( set -a; . ~/.config/inkmesh/env; set +a; npm run admin -- create-admin <email> "<name>" )
   ```
5. Publish: this step makes the app reachable from the internet, so only after the admin exists and with the owner's approval. It also starts the tunnel at every boot:
   ```sh
   systemctl --user enable --now /home/hermes/personal-projects/inkmesh/deploy/inkmesh-tunnel.service
   ```
   Then `scripts/tunnel-url.sh` prints the `https://<words>.trycloudflare.com` URL. It changes at every tunnel restart and has no uptime promise.

Logs: `journalctl --user -u inkmesh -f`, `journalctl --user -u inkmesh-tunnel -f`.

## Phase B: inkmesh.ch with a named tunnel

1. **Jon, in his browser:** register `inkmesh.ch` (Cloudflare Registrar if it offers `.ch`, otherwise Infomaniak or Hostpoint), add the zone to his Cloudflare account (free plan) and set the registrar's nameservers to Cloudflare's.
2. **Jon, in his browser:** `~/.local/bin/cloudflared tunnel login` prints a URL; he opens it and authorises the `inkmesh.ch` zone. This writes `~/.cloudflared/cert.pem`.
3. Create the tunnel: `~/.local/bin/cloudflared tunnel create inkmesh` (prints the tunnel id and writes `~/.cloudflared/<tunnel-id>.json`).
4. Config: `cp deploy/cloudflared.yml ~/.cloudflared/config.yml` and replace `<tunnel-id>`.
5. DNS: `~/.local/bin/cloudflared tunnel route dns inkmesh inkmesh.ch`.
6. Env switch: in `~/.config/inkmesh/env`, remove `PROTOCOL_HEADER` and `HOST_HEADER`, uncomment `ORIGIN=https://inkmesh.ch`.
7. Tunnel switch: in `deploy/inkmesh-tunnel.service`, comment the quick tunnel `ExecStart` and uncomment the `tunnel run` one; commit.
8. Restart both: `systemctl --user daemon-reload && systemctl --user restart inkmesh inkmesh-tunnel`. Sessions survive (cookie name and path unchanged). Check `https://inkmesh.ch/login`.
