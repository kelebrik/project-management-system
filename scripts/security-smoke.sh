#!/usr/bin/env sh
set -eu

BASE="${APP_BASE_URL:-http://localhost:3000}"

expect_code() {
  name="$1"
  expected="$2"
  shift 2
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$@")"
  case ",$expected," in
    *,"$code",*) ;;
    *)
      echo "$name expected $expected, got $code" >&2
      exit 1
      ;;
  esac
}

expect_code "GET /api/projects" "200" "$BASE/api/projects"
expect_code "GET /api/openapi.json" "200" "$BASE/api/openapi.json"
expect_code "GET /api/ready" "200" "$BASE/api/ready"
expect_code "POST /api/projects without auth" "400,401,403" \
  -X POST "$BASE/api/projects" \
  -H "Content-Type: application/json" \
  -d "{}"

echo "Security smoke OK"
