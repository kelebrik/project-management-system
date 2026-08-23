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
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH="$(date -u +%s)"

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$FILE"

pg_restore --list "$FILE" >/dev/null

if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$FILE" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  SHA256="$(shasum -a 256 "$FILE" | awk '{print $1}')"
else
  echo "sha256 utility is required" >&2
  exit 1
fi
printf '%s  %s\n' "$SHA256" "$FILE" > "${FILE}.sha256"

FINISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
FINISH_EPOCH="$(date -u +%s)"
DURATION_MS="$(( (FINISH_EPOCH - START_EPOCH) * 1000 ))"
BYTES="$(wc -c < "$FILE" | tr -d ' ')"
FILE_NAME="$(basename "$FILE")"
MANIFEST="${FILE}.manifest.json"
MANIFEST_TMP="${FILE}.manifest.json.tmp"
cat > "$MANIFEST_TMP" <<EOF
{
  "schemaVersion": 1,
  "file": "${FILE_NAME}",
  "bytes": ${BYTES},
  "sha256": "${SHA256}",
  "startedAt": "${STARTED_AT}",
  "finishedAt": "${FINISHED_AT}",
  "durationMs": ${DURATION_MS},
  "pgRestoreListValidated": true
}
EOF
mv "$MANIFEST_TMP" "$MANIFEST"

if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name "pms-*.dump" -type f -mtime +"$RETENTION_DAYS" -delete
  find "$BACKUP_DIR" -name "pms-*.dump.sha256" -type f -mtime +"$RETENTION_DAYS" -delete
  find "$BACKUP_DIR" -name "pms-*.dump.manifest.json" -type f -mtime +"$RETENTION_DAYS" -delete
fi

echo "$FILE"
