#!/usr/bin/env bash
set -Eeuo pipefail
DB="$HOME/.local/share/quantscale/data/quantscale.db"
DEST="$HOME/.local/share/quantscale/backups"
test -f "$DB" || { echo "No persistent database found at $DB" >&2; exit 1; }
mkdir -p "$DEST"
chmod 700 "$DEST"
FILE="$DEST/quantscale-$(date -u +%Y%m%dT%H%M%SZ).db"
sqlite3 "$DB" ".backup '$FILE'"
chmod 600 "$FILE"
echo "Backup: $FILE"
