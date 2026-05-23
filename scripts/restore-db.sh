#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_FILE="${1:-${RESTORE_FILE:-}}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: scripts/restore-db.sh <backup.dump>" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -f "${BACKUP_FILE}.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${BACKUP_FILE}.sha256"
  elif command -v shasum >/dev/null 2>&1; then
    EXPECTED="$(awk '{print $1}' "${BACKUP_FILE}.sha256")"
    ACTUAL="$(shasum -a 256 "$BACKUP_FILE" | awk '{print $1}')"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
      echo "Checksum mismatch for $BACKUP_FILE" >&2
      exit 1
    fi
  else
    echo "sha256 utility is not available; checksum was not verified" >&2
  fi
fi

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "Refusing to restore without RESTORE_CONFIRM=yes" >&2
  exit 1
fi

pg_restore "$BACKUP_FILE" \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges

echo "Restore completed from $BACKUP_FILE"
