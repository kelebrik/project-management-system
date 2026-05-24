#!/usr/bin/env sh
set -eu

BASE="${APP_BASE_URL:-http://localhost:3000}"
REQUESTS="${PERF_REQUESTS:-20}"
MAX_AVG_MS="${PERF_MAX_AVG_MS:-1000}"
SUM_MS=0
I=1

while [ "$I" -le "$REQUESTS" ]; do
  TIME_TOTAL="$(curl -sS -o /dev/null -w '%{time_total}' "$BASE/api/ready")"
  MS="$(awk "BEGIN { printf \"%d\", $TIME_TOTAL * 1000 }")"
  SUM_MS=$((SUM_MS + MS))
  I=$((I + 1))
done

AVG_MS=$((SUM_MS / REQUESTS))
echo "Average /api/ready latency: ${AVG_MS}ms over ${REQUESTS} requests"

if [ "$AVG_MS" -gt "$MAX_AVG_MS" ]; then
  echo "Average latency too high: ${AVG_MS}ms > ${MAX_AVG_MS}ms" >&2
  exit 1
fi

echo "Performance smoke OK"
