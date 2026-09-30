#!/usr/bin/env sh
set -eu
: "${SCHEDULE_SHIFT_TEST_DATABASE_URL:?Set SCHEDULE_SHIFT_TEST_DATABASE_URL to an isolated PostgreSQL test database}"
node <<'NODE'
const url = new URL(process.env.SCHEDULE_SHIFT_TEST_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/test/i.test(decodeURIComponent(url.pathname))) {
  console.error('Schedule shift integration tests require a PostgreSQL database with test in its name');
  process.exit(1);
}
NODE
export DATABASE_URL="$SCHEDULE_SHIFT_TEST_DATABASE_URL"
export SCHEDULE_SHIFT_TEST_DATABASE=true
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx --test tests/integration/schedule-shifts-postgres.test.ts
