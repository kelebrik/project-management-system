#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/pms-${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$FILE"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" > "${FILE}.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$FILE" > "${FILE}.sha256"
else
  echo "sha256 utility is not available; checksum file was not created" >&2
fi

if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name "pms-*.dump" -type f -mtime +"$RETENTION_DAYS" -delete
  find "$BACKUP_DIR" -name "pms-*.dump.sha256" -type f -mtime +"$RETENTION_DAYS" -delete
fi

echo "$FILE"
