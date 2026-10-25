#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BASE="${QUANTSCALE_HOME:-/opt/quantscale-research}"
BRANCH="research-foundation"
REPO="https://github.com/kennethhelman174/QuantScale.git"
mkdir -p "$BASE/releases" "$BASE/state"
exec 9>"$BASE/state/update.lock"
flock -n 9 || exit 0
TMP="$(mktemp -d "$BASE/releases/.fetch.XXXXXXXX")"
NEW=""
cleanup() { rm -rf "$TMP"; if [[ -n "$NEW" ]]; then rm -rf "$NEW"; fi; }
trap cleanup EXIT
export GIT_TERMINAL_PROMPT=0
git clone -q --depth 1 --branch "$BRANCH" --single-branch "$REPO" "$TMP/app"
SHA="$(git -C "$TMP/app" rev-parse HEAD)"
TARGET="$BASE/releases/$SHA"
if [[ ! -d "$TARGET" ]]; then
  NEW="$TARGET"
  mkdir "$TARGET"
  mv "$TMP/app/research" "$TARGET/research"
  python3 -m venv "$TARGET/venv"
  "$TARGET/venv/bin/python" -m pip install -q "$TARGET/research[dev]"
  (cd "$TARGET/research" && "$TARGET/venv/bin/python" -m pytest -q)
  (cd "$TARGET/research" && "$TARGET/venv/bin/quantscale" sample.csv --holdout >/dev/null)
  NEW=""
fi
ln -s "$TARGET" "$BASE/.current.next.$$"
mv -Tf "$BASE/.current.next.$$" "$BASE/current"
echo "QuantScale research promoted: $SHA"
