#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
. "$SCRIPT_DIR/db-integrity-common.sh"

A1_MIGRATION="20260821200000_jira_issue_history_a1"
PRE_A1_MIGRATION="20260821150000_jira_analytics_shared_dashboard_scope"
A1_SQL="$REPO_ROOT/prisma/migrations/$A1_MIGRATION/migration.sql"

usage() {
  echo "Usage: $0 baseline|post OUTPUT_DIR" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
PHASE="$1"
OUTPUT_DIR="$2"
[ "$PHASE" = "baseline" ] || [ "$PHASE" = "post" ] || usage
[ ! -e "$OUTPUT_DIR" ] || integrity_die "output path already exists: $OUTPUT_DIR"
[ -f "$A1_SQL" ] || integrity_die "A1 migration file is missing: $A1_SQL"

BACKUP_EVIDENCE="${DB_INTEGRITY_BACKUP_EVIDENCE_FILE:-}"
[ -n "$BACKUP_EVIDENCE" ] || integrity_die "DB_INTEGRITY_BACKUP_EVIDENCE_FILE is required"
[ -f "$BACKUP_EVIDENCE" ] || integrity_die "backup/PITR evidence file does not exist"
IMAGE_ID="${DB_INTEGRITY_IMAGE_ID:-}"
[ -n "$IMAGE_ID" ] || integrity_die "DB_INTEGRITY_IMAGE_ID is required (immutable deployed image digest)"
case "$IMAGE_ID" in
  *[!A-Za-z0-9:._/@+-]*) integrity_die "DB_INTEGRITY_IMAGE_ID contains unsupported characters" ;;
esac
IMAGE_MIGRATION_SHA="${DB_INTEGRITY_IMAGE_MIGRATION_SHA256:-}"
[ -n "$IMAGE_MIGRATION_SHA" ] || integrity_die \
  "DB_INTEGRITY_IMAGE_MIGRATION_SHA256 is required (read from inside the image)"
case "$IMAGE_MIGRATION_SHA" in
  *[!A-Fa-f0-9]*|'') integrity_die "DB_INTEGRITY_IMAGE_MIGRATION_SHA256 must be hexadecimal" ;;
esac
[ "${#IMAGE_MIGRATION_SHA}" -eq 64 ] || integrity_die \
  "DB_INTEGRITY_IMAGE_MIGRATION_SHA256 must contain 64 hexadecimal characters"

case "${DB_INTEGRITY_ALLOWED_ROLES:-postgres_exporter}" in
  *[!A-Za-z0-9_,.-]*) integrity_die "DB_INTEGRITY_ALLOWED_ROLES must be a comma-separated role list" ;;
esac
ALLOWED_ROLES="${DB_INTEGRITY_ALLOWED_ROLES:-postgres_exporter}"

A1_SHA="$(integrity_sha256 "$A1_SQL")"
[ "$IMAGE_MIGRATION_SHA" = "$A1_SHA" ] || integrity_die \
  "migration checksum in the deployed image differs from this checkout"

OUTPUT_PARENT="$(dirname -- "$OUTPUT_DIR")"
[ -d "$OUTPUT_PARENT" ] || integrity_die "output parent directory does not exist: $OUTPUT_PARENT"
PARTIAL_DIR="$(mktemp -d "${OUTPUT_DIR}.partial.XXXXXX")"
SQL_FILE="$(mktemp "${TMPDIR:-/tmp}/pms-integrity.XXXXXX")"
cleanup() {
  rm -f "$SQL_FILE"
  if [ -d "$PARTIAL_DIR" ]; then rm -rf "$PARTIAL_DIR"; fi
}
trap cleanup EXIT HUP INT TERM
chmod 700 "$PARTIAL_DIR"

# Prisma deploy must have no other committed migration to apply before A1.
EXPECTED_VALUES=""
for migration_dir in "$REPO_ROOT"/prisma/migrations/*; do
  [ -d "$migration_dir" ] || continue
  migration_name="$(basename "$migration_dir")"
  case "$migration_name" in
    *[!0-9a-z_]*) integrity_die "invalid migration directory name: $migration_name" ;;
  esac
  migration_stamp="${migration_name%%_*}"
  if [ "$migration_stamp" -lt 20260821200000 ]; then
    if [ -n "$EXPECTED_VALUES" ]; then EXPECTED_VALUES="$EXPECTED_VALUES,"; fi
    EXPECTED_VALUES="${EXPECTED_VALUES}('${migration_name}')"
  fi
done
[ -n "$EXPECTED_VALUES" ] || integrity_die "no pre-A1 migrations found"

cat > "$SQL_FILE" <<SQL_HEADER
\\set capture_phase '$PHASE'
\\set allowed_roles '$ALLOWED_ROLES'
\\pset format unaligned
\\pset tuples_only on
\\pset fieldsep '\t'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TimeZone = 'UTC';
SET LOCAL DateStyle = 'ISO, YMD';
SET LOCAL IntervalStyle = 'postgres';
SET LOCAL extra_float_digits = 3;
SET LOCAL bytea_output = 'hex';
SET LOCAL client_encoding = 'UTF8';
SET LOCAL search_path = pg_catalog;

SELECT NOT pg_is_in_recovery() AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: integrity capture refuses a recovery/standby target'
  SELECT 1 / 0;
\\endif

SELECT r.rolsuper OR pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER') AS assertion_ok
FROM pg_roles r WHERE r.rolname = current_user \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: capture role must be superuser or a member of pg_read_all_stats'
  SELECT 1 / 0;
\\endif

SELECT has_function_privilege(current_user, 'pg_control_system()', 'EXECUTE')
   AND has_function_privilege(current_user, 'pg_control_checkpoint()', 'EXECUTE')
  AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: capture role needs EXECUTE on pg_control_system() and pg_control_checkpoint()'
  SELECT 1 / 0;
\\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_stat_activity a
  WHERE a.datid = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND a.pid <> pg_backend_pid()
    AND a.backend_type = 'client backend'
    AND NOT (a.usename = ANY(regexp_split_to_array(:'allowed_roles', ',')))
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: another client backend is connected to the target database'
  SELECT 1 / 0;
\\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r', 'p', 'm', 'v', 'f')
    AND (c.relrowsecurity OR c.relforcerowsecurity)
) AND NOT EXISTS (
  SELECT 1 FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: RLS/policies make a complete row inventory unverifiable'
  SELECT 1 / 0;
\\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r', 'p', 'm', 'v', 'f')
    AND a.attnum > 0 AND NOT a.attisdropped
    AND NOT has_column_privilege(current_user, c.oid, a.attnum, 'SELECT')
) AND NOT EXISTS (
  SELECT 1
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind = 'S'
    AND NOT has_sequence_privilege(current_user, c.oid, 'SELECT')
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: capture role cannot SELECT every user column and sequence'
  SELECT 1 / 0;
\\endif

SELECT NOT EXISTS (
  SELECT 1
  FROM regexp_split_to_table(:'allowed_roles', ',') role_name
  JOIN pg_roles r ON r.rolname = role_name
  WHERE r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND c.relkind IN ('r', 'p')
         AND has_table_privilege(r.rolname, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
     )
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: an allowed monitoring role has write-capable database privileges'
  SELECT 1 / 0;
\\endif

WITH expected(name) AS (VALUES $EXPECTED_VALUES)
SELECT NOT EXISTS (
  SELECT 1 FROM expected e
  WHERE NOT EXISTS (
    SELECT 1 FROM public._prisma_migrations m
    WHERE m.migration_name = e.name
      AND m.finished_at IS NOT NULL
      AND m.rolled_back_at IS NULL
  )
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: at least one committed pre-A1 migration is not successfully applied'
  SELECT 1 / 0;
\\endif

SELECT NOT EXISTS (
  SELECT 1 FROM public._prisma_migrations
  WHERE finished_at IS NULL AND rolled_back_at IS NULL
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: an unfinished migration must be resolved before capture'
  SELECT 1 / 0;
\\endif

SELECT COALESCE(max(migration_name) FILTER (
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
), '') = '$PRE_A1_MIGRATION' AS assertion_ok
FROM public._prisma_migrations
WHERE migration_name < '$A1_MIGRATION' \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: target is not at the expected pre-A1 migration boundary'
  SELECT 1 / 0;
\\endif

SELECT CASE WHEN :'capture_phase' = 'baseline' THEN
  NOT EXISTS (
    SELECT 1 FROM public._prisma_migrations
    WHERE migration_name = '$A1_MIGRATION'
      AND rolled_back_at IS NULL
  )
ELSE
  (SELECT count(*) = 1 FROM public._prisma_migrations
   WHERE migration_name = '$A1_MIGRATION'
     AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
END AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: A1 migration state does not match the requested capture phase'
  SELECT 1 / 0;
\\endif

SELECT 'META', 'capture_phase', :'capture_phase';
SELECT 'META', 'system_identifier', system_identifier::text FROM pg_control_system();
SELECT 'META', 'timeline_id', timeline_id::text FROM pg_control_checkpoint();
SELECT 'META', 'database_name', current_database();
SELECT 'META', 'database_oid', oid::text FROM pg_database WHERE datname = current_database();
SELECT 'META', 'server_address', COALESCE(inet_server_addr()::text, 'local-socket');
SELECT 'META', 'server_port', COALESCE(inet_server_port()::text, 'local-socket');
SELECT 'META', 'server_version_num', current_setting('server_version_num');
SELECT 'META', 'server_encoding', pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();
SELECT 'META', 'datcollate', datcollate FROM pg_database WHERE datname = current_database();
SELECT 'META', 'datctype', datctype FROM pg_database WHERE datname = current_database();
SELECT 'META', 'datcollversion', COALESCE(datcollversion, '') FROM pg_database WHERE datname = current_database();
SELECT 'META', 'postmaster_started_at', pg_postmaster_start_time()::text;
SELECT 'META', 'server_timestamp', clock_timestamp()::text;
SELECT 'META', 'wal_lsn_bytes', pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')::numeric::text;
SELECT 'META', 'current_role', current_user;

-- Stable table hashes use an explicit, catalog-generated JSON projection. Only the
-- six nullable A1 columns are omitted from their two pre-existing tables.
SELECT format(
  'SELECT %L, %L, %L, count(*)::text, encode(sha256(convert_to(COALESCE(string_agg(row_hash, %L ORDER BY row_hash COLLATE "C"), %L), %L)), %L) FROM (SELECT encode(sha256(convert_to(jsonb_build_object(%s)::text, %L)), %L) AS row_hash FROM %I.%I t%s) rows',
  'TABLE', n.nspname, c.relname, '', '', 'UTF8', 'hex',
  string_agg(format('%L, to_jsonb(t.%I)', a.attname, a.attname), ', ' ORDER BY a.attnum),
  'UTF8', 'hex', n.nspname, c.relname,
  CASE WHEN n.nspname = 'public' AND c.relname = '_prisma_migrations'
    THEN format(' WHERE NOT (migration_name = %L AND finished_at IS NOT NULL AND rolled_back_at IS NULL)', '$A1_MIGRATION')
    ELSE '' END
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'm')
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
  AND NOT (
    n.nspname = 'public' AND c.relname = 'JiraAnalyticsSettings' AND a.attname IN (
      'historyCursorUpdatedAt', 'historyCursorJiraIssueId',
      'historyLastFullReconciledAt', 'historyFullCursorIssueKey', 'historyFullStartedAt'
    )
  )
  AND NOT (n.nspname = 'public' AND c.relname = 'JiraIssueSnapshot' AND a.attname = 'currentVersionId')
GROUP BY n.nspname, c.relname
ORDER BY n.nspname, c.relname
\\gexec

SELECT format(
  'SELECT %L, %L, %L, last_value::text, is_called::text FROM %I.%I',
  'SEQUENCE', n.nspname, c.relname, n.nspname, c.relname
)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind = 'S'
ORDER BY n.nspname, c.relname
\\gexec

-- Old catalog objects are fingerprinted individually. Expected A1 additions are
-- excluded here and verified by named invariants below; every other addition,
-- deletion, rewrite, ACL/default/type change, or manual DDL changes the set/hash.
SELECT 'CATALOG', 'relation', n.nspname || '.' || c.relname,
  encode(sha256(convert_to(jsonb_build_object(
    'kind', c.relkind, 'persistence', c.relpersistence, 'owner', pg_get_userbyid(c.relowner),
    'acl', COALESCE(c.relacl::text, ''), 'options', COALESCE(c.reloptions::text, ''),
    'rls', c.relrowsecurity, 'forceRls', c.relforcerowsecurity,
    'tablespace', COALESCE(t.spcname, ''), 'relfilenode', c.relfilenode
  )::text, 'UTF8')), 'hex')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_tablespace t ON t.oid = c.reltablespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'm', 'v', 'f', 'S')
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
ORDER BY n.nspname, c.relname;

SELECT 'CATALOG', 'column', n.nspname || '.' || c.relname || '.' || a.attname,
  encode(sha256(convert_to(jsonb_build_object(
    'num', a.attnum, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
    'default', COALESCE(pg_get_expr(d.adbin, d.adrelid), ''), 'identity', a.attidentity,
    'generated', a.attgenerated, 'collation', COALESCE(coll.collname, ''),
    'acl', COALESCE(a.attacl::text, ''), 'dropped', a.attisdropped
  )::text, 'UTF8')), 'hex')
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
LEFT JOIN pg_collation coll ON coll.oid = a.attcollation
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  AND c.relkind IN ('r', 'p', 'm', 'v', 'f') AND a.attnum > 0
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
  AND NOT (n.nspname = 'public' AND c.relname = 'JiraAnalyticsSettings' AND a.attname IN (
    'historyCursorUpdatedAt', 'historyCursorJiraIssueId',
    'historyLastFullReconciledAt', 'historyFullCursorIssueKey', 'historyFullStartedAt'))
  AND NOT (n.nspname = 'public' AND c.relname = 'JiraIssueSnapshot' AND a.attname = 'currentVersionId')
ORDER BY n.nspname, c.relname, a.attnum;

SELECT 'CATALOG', 'constraint', n.nspname || '.' || c.relname || '.' || con.conname,
  encode(sha256(convert_to(jsonb_build_object(
    'type', con.contype, 'definition', pg_get_constraintdef(con.oid, true),
    'deferred', con.condeferrable, 'initiallyDeferred', con.condeferred,
    'validated', con.convalidated, 'deleteAction', con.confdeltype, 'updateAction', con.confupdtype
  )::text, 'UTF8')), 'hex')
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
  AND NOT (
    n.nspname = 'public' AND c.relname = 'JiraIssueSnapshot'
    AND con.conname = 'JiraIssueSnapshot_currentVersionId_fkey'
  )
ORDER BY n.nspname, c.relname, con.conname;

SELECT 'CATALOG', 'index', ns.nspname || '.' || idx.relname,
  encode(sha256(convert_to(jsonb_build_object(
    'table', tn.nspname || '.' || tbl.relname, 'definition', pg_get_indexdef(i.indexrelid),
    'unique', i.indisunique, 'primary', i.indisprimary, 'valid', i.indisvalid,
    'ready', i.indisready, 'clustered', i.indisclustered, 'replicaIdentity', i.indisreplident
  )::text, 'UTF8')), 'hex')
FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
JOIN pg_namespace ns ON ns.oid = idx.relnamespace
JOIN pg_class tbl ON tbl.oid = i.indrelid JOIN pg_namespace tn ON tn.oid = tbl.relnamespace
WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema') AND ns.nspname NOT LIKE 'pg_toast%'
  AND NOT (tn.nspname = 'public' AND tbl.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
  AND NOT (
    tn.nspname = 'public' AND tbl.relname = 'JiraIssueSnapshot'
    AND idx.relname = 'JiraIssueSnapshot_currentVersionId_key'
  )
ORDER BY ns.nspname, idx.relname;

SELECT 'CATALOG', 'trigger', n.nspname || '.' || c.relname || '.' || tg.tgname,
  encode(sha256(convert_to(jsonb_build_object(
    'definition', pg_get_triggerdef(tg.oid, true), 'enabled', tg.tgenabled
  )::text, 'UTF8')), 'hex')
FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT tg.tgisinternal AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
ORDER BY n.nspname, c.relname, tg.tgname;

SELECT 'CATALOG', 'policy', n.nspname || '.' || c.relname || '.' || p.polname,
  encode(sha256(convert_to(jsonb_build_object(
    'command', p.polcmd, 'permissive', p.polpermissive, 'roles', p.polroles::text,
    'using', COALESCE(pg_get_expr(p.polqual, p.polrelid), ''),
    'check', COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')
  )::text, 'UTF8')), 'hex')
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
ORDER BY n.nspname, c.relname, p.polname;

SELECT 'CATALOG', 'rule', n.nspname || '.' || c.relname || '.' || r.rulename,
  encode(sha256(convert_to(pg_get_ruledef(r.oid, true), 'UTF8')), 'hex')
FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT (n.nspname = 'public' AND c.relname IN ('JiraIssueVersion', 'JiraIssueHistoryRetry'))
ORDER BY n.nspname, c.relname, r.rulename;

SELECT 'CATALOG', 'enum', n.nspname || '.' || typ.typname,
  encode(sha256(convert_to(jsonb_build_object(
    'owner', pg_get_userbyid(typ.typowner), 'acl', COALESCE(typ.typacl::text, ''),
    'labels', COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = typ.oid), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')
FROM pg_type typ JOIN pg_namespace n ON n.oid = typ.typnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND typ.typtype = 'e'
  AND NOT (
    n.nspname = 'public'
    AND typ.typname IN ('JiraIssueVersionProvenance', 'JiraHistoryRetryStatus')
  )
ORDER BY n.nspname, typ.typname;

SELECT 'CATALOG', 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  encode(sha256(convert_to(jsonb_build_object(
    'definition', pg_get_functiondef(p.oid), 'owner', pg_get_userbyid(p.proowner),
    'acl', COALESCE(p.proacl::text, '')
  )::text, 'UTF8')), 'hex')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

SELECT 'CATALOG', 'extension', extname,
  encode(sha256(convert_to(jsonb_build_object(
    'version', extversion, 'schema', n.nspname, 'relocatable', extrelocatable
  )::text, 'UTF8')), 'hex')
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY extname;

SELECT 'CATALOG', 'default_acl', d.oid::text,
  encode(sha256(convert_to(jsonb_build_object(
    'role', pg_get_userbyid(d.defaclrole), 'schema', COALESCE(n.nspname, ''),
    'type', d.defaclobjtype, 'acl', COALESCE(d.defaclacl::text, '')
  )::text, 'UTF8')), 'hex')
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace ORDER BY d.oid;

SELECT 'CATALOG', 'comment',
  descr.classoid::regclass::text || '.' || descr.objoid::text || '.' || descr.objsubid::text,
  encode(sha256(convert_to(descr.description, 'UTF8')), 'hex')
FROM pg_description descr
WHERE descr.classoid IN (
  'pg_class'::regclass, 'pg_type'::regclass, 'pg_proc'::regclass,
  'pg_namespace'::regclass, 'pg_constraint'::regclass, 'pg_extension'::regclass
)
ORDER BY descr.classoid, descr.objoid, descr.objsubid;

SELECT 'CATALOG', 'shared_comment',
  descr.classoid::regclass::text || '.' || descr.objoid::text,
  encode(sha256(convert_to(descr.description, 'UTF8')), 'hex')
FROM pg_shdescription descr
ORDER BY descr.classoid, descr.objoid;

-- Exact A1 postconditions. These run before the first application sync.
SELECT :'capture_phase' = 'baseline' AS is_baseline \gset
\if :is_baseline
SELECT 'A1_CHECK', 'new_tables',
  (to_regclass('public."JiraIssueVersion"') IS NULL
   AND to_regclass('public."JiraIssueHistoryRetry"') IS NULL)::text;
SELECT 'A1_CHECK', 'new_table_rows', true::text;
SELECT 'A1_CHECK', 'new_columns_null', true::text;
SELECT 'A1_CHECK', 'expected_columns',
  ((SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname IN ('JiraAnalyticsSettings', 'JiraIssueSnapshot')
      AND n.nspname = 'public'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname IN (
        'historyCursorUpdatedAt','historyCursorJiraIssueId','historyLastFullReconciledAt',
        'historyFullCursorIssueKey','historyFullStartedAt','currentVersionId')) = 0)::text;
SELECT 'A1_CHECK', 'expected_types',
  ((SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname IN ('JiraIssueVersionProvenance','JiraHistoryRetryStatus')) = 0)::text;
SELECT 'A1_CHECK', 'expected_constraints',
  ((SELECT count(*) FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND con.conname IN (
    'JiraIssueVersion_pkey','JiraIssueVersion_projectId_fkey','JiraIssueVersion_snapshotId_fkey',
    'JiraIssueSnapshot_currentVersionId_fkey','JiraIssueHistoryRetry_pkey','JiraIssueHistoryRetry_projectId_fkey')) = 0)::text;
SELECT 'A1_CHECK', 'expected_indexes',
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='i' AND c.relname IN (
      'JiraIssueVersion_pkey','JiraIssueVersion_projectId_jiraIssueId_contentHash_key',
      'JiraIssueVersion_projectId_jiraUpdatedAt_jiraIssueId_idx','JiraIssueVersion_snapshotId_observedAt_idx',
      'JiraIssueVersion_projectId_status_priority_idx','JiraIssueVersion_projectId_resolution_resolutionAt_idx',
      'JiraIssueVersion_labels_idx','JiraIssueSnapshot_currentVersionId_key',
      'JiraIssueHistoryRetry_pkey','JiraIssueHistoryRetry_projectId_issueKey_key',
      'JiraIssueHistoryRetry_status_nextRetryAt_idx','JiraIssueHistoryRetry_projectId_status_firstFailedAt_idx')) = 0)::text;
\else
SELECT 'A1_CHECK', 'new_tables',
  (to_regclass('public."JiraIssueVersion"') IS NOT NULL
   AND to_regclass('public."JiraIssueHistoryRetry"') IS NOT NULL)::text;
SELECT 'A1_CHECK', 'new_table_rows',
  ((SELECT count(*) FROM public."JiraIssueVersion") = 0
   AND (SELECT count(*) FROM public."JiraIssueHistoryRetry") = 0)::text;
SELECT 'A1_CHECK', 'new_columns_null',
  (NOT EXISTS (SELECT 1 FROM public."JiraAnalyticsSettings" WHERE
    "historyCursorUpdatedAt" IS NOT NULL OR "historyCursorJiraIssueId" IS NOT NULL OR
    "historyLastFullReconciledAt" IS NOT NULL OR "historyFullCursorIssueKey" IS NOT NULL OR
    "historyFullStartedAt" IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public."JiraIssueSnapshot" WHERE "currentVersionId" IS NOT NULL))::text;
SELECT 'A1_CHECK', 'expected_columns',
  ((SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.oid = 'public."JiraAnalyticsSettings"'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname IN ('historyCursorUpdatedAt','historyCursorJiraIssueId','historyLastFullReconciledAt','historyFullCursorIssueKey','historyFullStartedAt')
      AND NOT a.attnotnull AND a.attidentity = '' AND a.attgenerated = ''
      AND NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum)) = 5
   AND (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.oid = 'public."JiraIssueSnapshot"'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname = 'currentVersionId' AND NOT a.attnotnull AND a.attidentity = '' AND a.attgenerated = ''
      AND NOT EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum)) = 1)
  ::text;

SELECT 'A1_CHECK', 'expected_types',
  ((SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typtype='e' AND t.typname IN ('JiraIssueVersionProvenance','JiraHistoryRetryStatus')) = 2)
  ::text;

SELECT 'A1_CHECK', 'expected_constraints',
  ((SELECT count(*) FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND con.conname IN (
    'JiraIssueVersion_pkey','JiraIssueVersion_projectId_fkey','JiraIssueVersion_snapshotId_fkey',
    'JiraIssueSnapshot_currentVersionId_fkey','JiraIssueHistoryRetry_pkey','JiraIssueHistoryRetry_projectId_fkey')) = 6)
  ::text;

SELECT 'A1_CHECK', 'expected_indexes',
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='i' AND c.relname IN (
      'JiraIssueVersion_pkey','JiraIssueVersion_projectId_jiraIssueId_contentHash_key',
      'JiraIssueVersion_projectId_jiraUpdatedAt_jiraIssueId_idx','JiraIssueVersion_snapshotId_observedAt_idx',
      'JiraIssueVersion_projectId_status_priority_idx','JiraIssueVersion_projectId_resolution_resolutionAt_idx',
      'JiraIssueVersion_labels_idx','JiraIssueSnapshot_currentVersionId_key',
      'JiraIssueHistoryRetry_pkey','JiraIssueHistoryRetry_projectId_issueKey_key',
      'JiraIssueHistoryRetry_status_nextRetryAt_idx','JiraIssueHistoryRetry_projectId_status_firstFailedAt_idx')) = 12)
  ::text;
\endif

SELECT 'A1_MIGRATION', id, checksum, started_at::text, finished_at::text,
  applied_steps_count::text, COALESCE(rolled_back_at::text, ''), (logs IS NULL)::text,
  migration_name
FROM public._prisma_migrations
WHERE migration_name = '$A1_MIGRATION'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL;

SELECT pg_stat_clear_snapshot() IS NULL AS stats_snapshot_cleared \gset
SELECT NOT EXISTS (
  SELECT 1 FROM pg_stat_activity a
  WHERE a.datid = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND a.pid <> pg_backend_pid() AND a.backend_type = 'client backend'
    AND NOT (a.usename = ANY(regexp_split_to_array(:'allowed_roles', ',')))
) AS assertion_ok \\gset
\\if :assertion_ok
\\else
  \\warn 'ERROR: another client backend appeared during integrity capture'
  SELECT 1 / 0;
\\endif
COMMIT;
SQL_HEADER

MANIFEST="$PARTIAL_DIR/manifest.tsv"
if ! integrity_psql < "$SQL_FILE" > "$MANIFEST"; then
  integrity_die "database capture failed; no complete manifest was created"
fi

if ! awk -F '\t' '
  BEGIN {
    split("new_tables new_table_rows new_columns_null expected_columns expected_types expected_constraints expected_indexes", names, " ");
    for (i in names) expected[names[i]] = 1;
  }
  $1 == "A1_CHECK" {
    if (!($2 in expected) || seen[$2] || $3 != "true") failed = 1;
    seen[$2] = 1;
  }
  END {
    for (name in expected) if (!(name in seen)) failed = 1;
    exit failed ? 1 : 0;
  }
' "$MANIFEST"; then
  integrity_die "an A1 schema/data invariant failed"
fi

TOOL_PARTS="$PARTIAL_DIR/tool-parts.txt"
{
  integrity_sha256 "$SCRIPT_DIR/db-integrity-common.sh"
  integrity_sha256 "$SCRIPT_DIR/db-integrity-psql.mjs"
  integrity_sha256 "$0"
  integrity_sha256 "$SCRIPT_DIR/db-integrity-compare.mjs"
} > "$TOOL_PARTS"
TOOL_SHA="$(integrity_sha256 "$TOOL_PARTS")"
rm -f "$TOOL_PARTS"
BACKUP_SHA="$(integrity_sha256 "$BACKUP_EVIDENCE")"
GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
{
  printf 'EVIDENCE\ttool_sha256\t%s\n' "$TOOL_SHA"
  printf 'EVIDENCE\tmigration_sha256\t%s\n' "$A1_SHA"
  printf 'EVIDENCE\timage_migration_sha256\t%s\n' "$IMAGE_MIGRATION_SHA"
  printf 'EVIDENCE\timage_id\t%s\n' "$IMAGE_ID"
  printf 'EVIDENCE\tgit_commit\t%s\n' "$GIT_COMMIT"
  printf 'EVIDENCE\tbackup_evidence_sha256\t%s\n' "$BACKUP_SHA"
  printf 'EVIDENCE\tallowed_roles\t%s\n' "$ALLOWED_ROLES"
} >> "$MANIFEST"

MANIFEST_SHA="$(integrity_sha256 "$MANIFEST")"
printf '%s  manifest.tsv\n' "$MANIFEST_SHA" > "$PARTIAL_DIR/manifest.sha256"
printf 'complete\t%s\n' "$MANIFEST_SHA" > "$PARTIAL_DIR/COMPLETE"
mv "$PARTIAL_DIR" "$OUTPUT_DIR"
trap - EXIT HUP INT TERM
rm -f "$SQL_FILE"
echo "$OUTPUT_DIR"
