#!/usr/bin/env sh
set -eu
: "${WORKFLOW_TEST_DATABASE_URL:?Set WORKFLOW_TEST_DATABASE_URL to an isolated PostgreSQL test database}"
node <<'NODE'
const url = new URL(process.env.WORKFLOW_TEST_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/test/i.test(decodeURIComponent(url.pathname))) {
  console.error('Workflow integration tests require a PostgreSQL database with test in its name');
  process.exit(1);
}
NODE
export DATABASE_URL="$WORKFLOW_TEST_DATABASE_URL"
# The shift journal test reads its own flag; both run against the same database.
export WORKFLOW_TEST_DATABASE=true
export SCHEDULE_SHIFT_TEST_DATABASE=true
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx --test tests/integration/*-postgres.test.ts
