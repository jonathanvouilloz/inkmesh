#!/usr/bin/env bash
# Fast-forward the production checkout to main, build it and restart the service. Migrations run at start.
# Run from the dev repository; it acts on ~/inkmesh-app, whose origin is the dev repository.
set -euo pipefail
cd ~/inkmesh-app
git pull --ff-only origin main
npm ci
npm run build
systemctl --user restart inkmesh
sleep 2 # a crash at startup shows up only after a moment
systemctl --user is-active inkmesh
