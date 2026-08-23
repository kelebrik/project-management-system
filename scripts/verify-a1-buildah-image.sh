#!/usr/bin/env sh
set -eu

IMAGE_REF="${1:-}"
EXPECTED_REVISION="${2:-}"
EVIDENCE_DIR="${3:-}"
A1_MIGRATION=20260821200000_jira_issue_history_a1

[ -n "$IMAGE_REF" ] || { echo "image reference is required" >&2; exit 64; }
[ -n "$EXPECTED_REVISION" ] || { echo "expected revision is required" >&2; exit 64; }
[ -n "$EVIDENCE_DIR" ] || { echo "evidence directory is required" >&2; exit 64; }
case "$EXPECTED_REVISION" in
  *[!0-9a-f]*|'') echo "expected revision must be a lowercase hexadecimal commit" >&2; exit 64 ;;
esac

mkdir -p "$EVIDENCE_DIR"

CONTAINER="$(buildah from --pull=never "$IMAGE_REF")"
cleanup() {
  buildah rm "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

IMAGE_REVISION="$(buildah run "$CONTAINER" -- cat /app/RELEASE_REVISION)"
[ "$IMAGE_REVISION" = "$EXPECTED_REVISION" ] || {
  echo "image revision mismatch: expected $EXPECTED_REVISION, got $IMAGE_REVISION" >&2
  exit 1
}

find prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \; \
  | LC_ALL=C sort > "$EVIDENCE_DIR/checkout-migrations.txt"
buildah run "$CONTAINER" -- sh -c \
  "find /app/prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \\; | LC_ALL=C sort" \
  > "$EVIDENCE_DIR/image-migrations.txt"
cmp "$EVIDENCE_DIR/checkout-migrations.txt" "$EVIDENCE_DIR/image-migrations.txt"

NEWEST_MIGRATION="$(tail -n 1 "$EVIDENCE_DIR/image-migrations.txt")"
[ "$NEWEST_MIGRATION" = "$A1_MIGRATION" ] || {
  echo "A1 must be the newest image migration; got $NEWEST_MIGRATION" >&2
  exit 1
}

CHECKOUT_SHA="$(sha256sum "prisma/migrations/$A1_MIGRATION/migration.sql" | awk '{print $1}')"
IMAGE_SHA="$(buildah run "$CONTAINER" -- sha256sum "/app/prisma/migrations/$A1_MIGRATION/migration.sql" | awk '{print $1}')"
[ "$IMAGE_SHA" = "$CHECKOUT_SHA" ] || {
  echo "A1 migration hash mismatch" >&2
  exit 1
}

{
  printf 'revision=%s\n' "$IMAGE_REVISION"
  printf 'a1_migration_sha256=%s\n' "$IMAGE_SHA"
  printf 'newest_migration=%s\n' "$NEWEST_MIGRATION"
  printf 'migration_inventory=identical\n'
} > "$EVIDENCE_DIR/verification.txt"

printf 'PASS: image revision, A1 hash, and complete migration inventory match checkout.\n'
