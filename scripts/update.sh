#!/usr/bin/env bash
# Safe, non-destructive versioned deployment. Never edits the running release.
set -Eeuo pipefail
BASE="$HOME/.local/share/quantscale-app"
SOURCE="$(cat "$HOME/.config/quantscale/source_path")"
CURRENT="$BASE/current"
mkdir -p "$BASE/releases" "$BASE/logs"
exec 9>"$BASE/update.lock"
flock -n 9 || { echo "Update already running"; exit 0; }
git -C "$SOURCE" fetch --quiet origin main
SHA="$(git -C "$SOURCE" rev-parse origin/main)"
RELEASE="$BASE/releases/$SHA"
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"
if [ "$PREVIOUS" = "$RELEASE" ]; then
  echo "Already deployed $SHA"
  exit 0
fi
if [ ! -d "$RELEASE" ]; then
  git -C "$SOURCE" worktree add --detach "$RELEASE" "$SHA"
fi
cd "$RELEASE"
TEMP_DATA="$(mktemp -d)"
trap 'rm -rf "$TEMP_DATA"' EXIT
echo "Validating $SHA before switching releases"
npm ci --no-audit --no-fund
npm run lint
DATA_DIR="$TEMP_DATA" npm test
npm run build
ln -sfn "$RELEASE" "$BASE/.current-next"
mv -Tf "$BASE/.current-next" "$CURRENT"
if ! systemctl --user restart quantscale.service; then
  echo "New release failed to start" >&2
  STATUS=1
else
  STATUS=1
  for i in $(seq 1 20); do
    if curl --silent --fail --max-time 2 http://127.0.0.1:3000/api/health | grep -q '"status":"ok"'; then
      STATUS=0
      break
    fi
    sleep 1
  done
fi
if [ "$STATUS" -ne 0 ]; then
  echo "Health check failed. Returning to previous version." >&2
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$BASE/.current-next"
    mv -Tf "$BASE/.current-next" "$CURRENT"
    systemctl --user restart quantscale.service || true
  else
    systemctl --user stop quantscale.service || true
  fi
  exit 1
fi
printf '%s\n' "$SHA" > "$BASE/deployed-commit"
echo "Deployed $SHA. Data directory was not modified."
