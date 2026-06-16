#!/usr/bin/env sh
set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/ci-prisma-env.sh"

echo "Prisma generate env:" >&2
echo "  PRISMA_CLI_BINARY_TARGETS=${PRISMA_CLI_BINARY_TARGETS}" >&2
echo "  PRISMA_SCHEMA_ENGINE_BINARY=${PRISMA_SCHEMA_ENGINE_BINARY}" >&2
echo "  PRISMA_QUERY_ENGINE_LIBRARY=${PRISMA_QUERY_ENGINE_LIBRARY}" >&2
echo "  PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=${PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING}" >&2

for engine_path in "$PRISMA_SCHEMA_ENGINE_BINARY" "$PRISMA_QUERY_ENGINE_LIBRARY"; do
  if [ ! -s "$engine_path" ]; then
    echo "Missing Prisma engine: ${engine_path}" >&2
    exit 1
  fi
  echo "Found engine: ${engine_path} ($(wc -c <"$engine_path") bytes)" >&2
done

# Prisma schema references DATABASE_URL; CI has no database and runtime overrides this value.
export DATABASE_URL="${DATABASE_URL:-postgresql://ci:ci@127.0.0.1:5432/ci?schema=public}"

export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
exec scripts/ci-npm.sh exec -- prisma generate
