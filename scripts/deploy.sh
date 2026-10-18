#!/usr/bin/env bash
# Pull, build and restart the production service. Migrations run at service start.
set -euo pipefail
cd "$(dirname "$0")/.."
if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
	git pull --ff-only
else
	echo "No upstream for $(git branch --show-current): skipping git pull."
fi
npm ci
npm run build
systemctl --user restart inkmesh
sleep 2 # a crash at startup shows up only after a moment
systemctl --user is-active inkmesh
