#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

OUTPUT="${MIGRATION_DRY_RUN_OUTPUT:-./migration-dry-run.sql}"

npx prisma migrate status
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > "$OUTPUT"

if [ ! -s "$OUTPUT" ]; then
  echo "-- No schema diff" > "$OUTPUT"
fi

echo "Migration dry-run SQL written to $OUTPUT"
