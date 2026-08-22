#!/usr/bin/env sh

# Shared read-only PostgreSQL transport for integrity tooling.

integrity_die() {
  echo "ERROR: $*" >&2
  exit 1
}

integrity_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    integrity_die "sha256sum or shasum is required"
  fi
}

integrity_validate_identifier() {
  case "$2" in
    ''|-*|*[!A-Za-z0-9_.@-]*) integrity_die "$1 contains unsupported characters" ;;
  esac
}

integrity_psql() {
  pg_options="-c default_transaction_read_only=on -c statement_timeout=0 -c lock_timeout=5000"

  if [ -n "${DB_INTEGRITY_SSH_HOST:-}" ]; then
    ssh_user="${DB_INTEGRITY_SSH_USER:-${USER:-}}"
    db_name="${DB_INTEGRITY_DB_NAME:-}"
    [ -n "$db_name" ] || integrity_die "DB_INTEGRITY_DB_NAME is required for SSH transport"
    integrity_validate_identifier "DB_INTEGRITY_SSH_HOST" "$DB_INTEGRITY_SSH_HOST"
    integrity_validate_identifier "DB_INTEGRITY_SSH_USER" "$ssh_user"
    integrity_validate_identifier "DB_INTEGRITY_DB_NAME" "$db_name"

    ssh \
      -o BatchMode=yes \
      -o GSSAPIAuthentication=yes \
      -o GSSAPIDelegateCredentials=no \
      "${ssh_user}@${DB_INTEGRITY_SSH_HOST}" \
      "PGOPTIONS='$pg_options' psql -X -q -v ON_ERROR_STOP=1 -d '$db_name'"
    return
  fi

  [ -n "${DATABASE_URL:-}" ] || integrity_die \
    "set DATABASE_URL or DB_INTEGRITY_SSH_HOST/DB_INTEGRITY_DB_NAME"
  case "$DATABASE_URL" in
    *sslmode=disable*|*sslmode=allow*|*sslmode=prefer*)
      integrity_die "direct DATABASE_URL contains a non-enforcing sslmode" ;;
    *sslmode=require*|*sslmode=verify-ca*|*sslmode=verify-full*) ;;
    *) integrity_die "direct DATABASE_URL must enforce sslmode=require, verify-ca, or verify-full" ;;
  esac
  PGOPTIONS="$pg_options" node "$SCRIPT_DIR/db-integrity-psql.mjs"
}
