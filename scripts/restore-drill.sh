#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${RESTORE_DRILL_DATABASE_URL:-}" ]; then
  echo "RESTORE_DRILL_DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_FILE="$(DATABASE_URL="$DATABASE_URL" BACKUP_DIR="$BACKUP_DIR" scripts/backup-db.sh)"

DATABASE_URL="$RESTORE_DRILL_DATABASE_URL" \
RESTORE_CONFIRM=yes \
scripts/restore-db.sh "$BACKUP_FILE"

DATABASE_URL="$RESTORE_DRILL_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$RESTORE_DRILL_DATABASE_URL" npx prisma migrate status

echo "Restore drill completed from $BACKUP_FILE"
