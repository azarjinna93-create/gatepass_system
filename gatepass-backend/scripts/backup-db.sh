#!/usr/bin/env bash
# Weekly logical backup of the gate pass Postgres database (Neon/RDS).
# Run on the EC2 host, not inside a container — keeps the dump on host disk,
# outside the containers' lifecycle, and needs no image changes.
#
# Usage: backup-db.sh [env-file]   (default: ~/gatepass_system/.env.aws)

set -euo pipefail

ENV_FILE="${1:-$HOME/gatepass_system/.env.aws}"
BACKUP_DIR="$HOME/gatepass_system/backups"
RETENTION_DAYS=60   # ~8 weekly backups

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "backup-db.sh: DATABASE_URL not set (checked $ENV_FILE)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y-%m-%d)"
OUT_FILE="$BACKUP_DIR/gatepass-$STAMP.sql.gz"

echo "Dumping database to $OUT_FILE ..."
pg_dump "$DATABASE_URL" | gzip > "$OUT_FILE.tmp"
mv "$OUT_FILE.tmp" "$OUT_FILE"
echo "✓ Backup written: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

echo "Pruning backups older than $RETENTION_DAYS days ..."
find "$BACKUP_DIR" -name 'gatepass-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete
