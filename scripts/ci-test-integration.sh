#!/usr/bin/env sh
set -eu

REPORTS_DIR="${REPORTS_DIR:-reports}"
mkdir -p "$REPORTS_DIR"

npx --no-install tsx --test \
  --test-reporter=junit \
  --test-reporter-destination="$REPORTS_DIR/junit-integration.xml" \
  "tests/integration/**/*.test.ts"
