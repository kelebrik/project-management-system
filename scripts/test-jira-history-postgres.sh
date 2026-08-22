#!/usr/bin/env sh
set -eu

if [ -z "${JIRA_HISTORY_TEST_DATABASE_URL:-}" ]; then
  echo "ERROR: JIRA_HISTORY_TEST_DATABASE_URL is required" >&2
  exit 1
fi

node <<'NODE'
const value = process.env.JIRA_HISTORY_TEST_DATABASE_URL;
let url;
try {
  url = new URL(value);
} catch {
  console.error('ERROR: JIRA_HISTORY_TEST_DATABASE_URL must be a PostgreSQL URL');
  process.exit(1);
}
const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/test/i.test(databaseName)) {
  console.error('ERROR: Jira history tests require a database whose name contains "test"');
  process.exit(1);
}
NODE

DATABASE_URL="$JIRA_HISTORY_TEST_DATABASE_URL" ./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx --test tests/integration/jira-history-race.test.ts
