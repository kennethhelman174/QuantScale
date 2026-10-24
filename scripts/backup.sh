#!/usr/bin/env bash
# Backup SQLite WAL Database
set -e
BACKUP_DIR="/data/quantscale/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$BACKUP_DIR"

echo "Creating atomic SQLite database backup..."
if command -v sqlite3 &> /dev/null; then
  sqlite3 /data/quantscale/quantscale.db ".backup '$BACKUP_DIR/quantscale_$TIMESTAMP.db'"
else
  cp /data/quantscale/quantscale.db "$BACKUP_DIR/quantscale_$TIMESTAMP.db"
fi

echo "Backup created at: $BACKUP_DIR/quantscale_$TIMESTAMP.db"
