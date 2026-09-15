#!/usr/bin/env sh
set -eu
: "${ARTIFACT_TEST_DATABASE_URL:?Set ARTIFACT_TEST_DATABASE_URL to an isolated PostgreSQL test database}"
node <<'NODE'
const url = new URL(process.env.ARTIFACT_TEST_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/test/i.test(decodeURIComponent(url.pathname))) {
  console.error('Artifact integration tests require a PostgreSQL database with test in its name');
  process.exit(1);
}
NODE
export DATABASE_URL="$ARTIFACT_TEST_DATABASE_URL"
export ARTIFACT_TEST_DATABASE=true
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx --test tests/integration/artifact-table-postgres.test.ts
