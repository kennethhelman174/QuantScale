#!/usr/bin/env bash
# Safe, non-destructive versioned deployment. Never edits the running release.
set -Eeuo pipefail
BASE="$HOME/.local/share/quantscale-app"
SOURCE="$(cat "$HOME/.config/quantscale/source_path")"
BRANCH="$(cat "$HOME/.config/quantscale/deploy_branch")"
CURRENT="$BASE/current"
mkdir -p "$BASE/releases" "$BASE/logs"
exec 9>"$BASE/update.lock"
flock -n 9 || { echo "Update already running"; exit 0; }
git -C "$SOURCE" fetch --quiet origin "$BRANCH"
SHA="$(git -C "$SOURCE" rev-parse "origin/$BRANCH")"
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
# npm lockfiles generated on x64 can omit the platform-specific Rolldown binding.
# For Raspberry Pi 64-bit, explicitly install the version matching Rolldown.
if [ "$(uname -s)" = "Linux" ] && [ "$(uname -m)" = "aarch64" ]; then
  ROLLDOWN_VERSION="$(node -p 'require("./node_modules/rolldown/package.json").version')"
  echo "Ensuring Rolldown Linux ARM64 GNU binding v$ROLLDOWN_VERSION"
  npm install --no-save --package-lock=false --no-audit --no-fund \
    "@rolldown/binding-linux-arm64-gnu@$ROLLDOWN_VERSION"
  node -e 'require.resolve("@rolldown/binding-linux-arm64-gnu"); console.log("ARM64 Rolldown binding available")'
fi
npm run lint
DATA_DIR="$TEMP_DATA" npm test
npm run build
# SQLite-consistent backup before activating a new release.
DB="$HOME/.local/share/quantscale/data/quantscale.db"
if [ -f "$DB" ]; then
  DEST="$HOME/.local/share/quantscale/backups"
  mkdir -p "$DEST"
  chmod 700 "$DEST"
  sqlite3 "$DB" ".backup '$DEST/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ).db'"
fi
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
