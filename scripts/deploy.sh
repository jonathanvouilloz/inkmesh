#!/usr/bin/env bash
# Pull, build and restart the production service. Migrations run at service start.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci
npm run build
systemctl --user restart inkmesh
systemctl --user is-active inkmesh
