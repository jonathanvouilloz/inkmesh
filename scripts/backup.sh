#!/usr/bin/env bash
# Off-site copy of every workspace (git mirror push to a private GitHub repository each) and a
# daily snapshot of the database kept on this machine. Run hourly by deploy/inkmesh-backup.timer.
# Needs: INKMESH_DATA, BACKUP_GITHUB_OWNER, a `gh` login on this machine. BACKUP_DIR and
# BACKUP_KEEP_DAYS are optional.
set -uo pipefail
umask 077 # the snapshots hold emails and password hashes
: "${INKMESH_DATA:?}" "${BACKUP_GITHUB_OWNER:?}"
backup_dir="${BACKUP_DIR:-$HOME/inkmesh-backups/db}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
failed=0

for ws in "$INKMESH_DATA"/workspaces/*/; do
	slug=$(basename "$ws")
	repo="$BACKUP_GITHUB_OWNER/inkmesh-$slug"
	if ! gh repo view "$repo" >/dev/null 2>&1; then
		gh repo create "$repo" --private --description "inkmesh backup of the $slug workspace" >/dev/null \
			|| { echo "create $repo failed"; failed=1; continue; }
	fi
	# Pushes to a URL, not a named remote: the workspace's .git stays untouched (AGENTS.md).
	if git -C "$ws" push --mirror --quiet "https://github.com/$repo.git"; then
		echo "pushed $slug"
	else
		echo "push $slug failed"
		failed=1
	fi
done

# One snapshot per day, refreshed by each hourly run; node:sqlite's backup is safe while the app writes.
mkdir -p "$backup_dir"
if node -e "const s = require('node:sqlite'); s.backup(new s.DatabaseSync(process.argv[1]), process.argv[2]).then(() => {}, (e) => { console.error(e.message); process.exit(1); })" \
	"$INKMESH_DATA/inkmesh.db" "$backup_dir/inkmesh-$(date -u +%F).db"; then
	echo "database saved"
else
	echo "database snapshot failed"
	failed=1
fi
find "$backup_dir" -name 'inkmesh-*.db' -mtime "+$keep_days" -delete

exit "$failed"
