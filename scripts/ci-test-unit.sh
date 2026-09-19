#!/usr/bin/env sh
set -eu

REPORTS_DIR="${REPORTS_DIR:-reports}"
mkdir -p "$REPORTS_DIR/coverage"

npm run build --workspace @pms/shared

npx --no-install c8 \
  --reporter=cobertura \
  --reporter=text-summary \
  --report-dir="$REPORTS_DIR/coverage" \
  --include='apps/api/src/**/*.ts' \
  --include='apps/web/src/**/*.ts' \
  --exclude='**/*.test.ts' \
  -- tsx --test \
  --test-reporter=spec \
  --test-reporter=junit \
  --test-reporter-destination=stdout \
  --test-reporter-destination="$REPORTS_DIR/junit-unit.xml" \
  "apps/api/src/**/*.test.ts" \
  "apps/web/src/**/*.test.ts"
