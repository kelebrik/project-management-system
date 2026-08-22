#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$SCRIPT_DIR/db-integrity-common.sh"

REPORT_FILE="${1:-./jira-history-a1-diagnostics.tsv}"
[ ! -e "$REPORT_FILE" ] || integrity_die "report path already exists: $REPORT_FILE"
REPORT_PARENT="$(dirname -- "$REPORT_FILE")"
[ -d "$REPORT_PARENT" ] || integrity_die "report parent directory does not exist: $REPORT_PARENT"
PARTIAL_FILE="$(mktemp "${REPORT_FILE}.partial.XXXXXX")"
trap 'rm -f "$PARTIAL_FILE"' EXIT HUP INT TERM

if ! integrity_psql > "$PARTIAL_FILE" <<'SQL'
\pset format unaligned
\pset tuples_only on
\pset fieldsep '\t'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TimeZone = 'UTC';
SET LOCAL DateStyle = 'ISO, YMD';
SET LOCAL IntervalStyle = 'postgres';
SET LOCAL extra_float_digits = 3;
SET LOCAL bytea_output = 'hex';
SET LOCAL client_encoding = 'UTF8';
SET LOCAL search_path = pg_catalog;

SELECT to_regclass('public."JiraIssueVersion"') IS NOT NULL
   AND to_regclass('public."JiraIssueHistoryRetry"') IS NOT NULL AS a1_exists \gset
\if :a1_exists
\else
  \warn 'ERROR: A1 tables are absent'
  SELECT 1 / 0;
\endif

SELECT 'SUMMARY', 'versions', count(*)::text FROM public."JiraIssueVersion";
SELECT 'SUMMARY', 'tickets', count(DISTINCT ("projectId", "jiraIssueId"))::text
FROM public."JiraIssueVersion";
SELECT 'SUMMARY', 'payload_bytes', COALESCE(sum("payloadBytes"), 0)::text
FROM public."JiraIssueVersion";
SELECT 'SUMMARY', 'snapshots_with_current_version', count(*)::text
FROM public."JiraIssueSnapshot" WHERE "currentVersionId" IS NOT NULL;
SELECT 'SUMMARY', 'pending_retries', count(*)::text
FROM public."JiraIssueHistoryRetry" WHERE status = 'PENDING';
SELECT 'SUMMARY', 'resolved_retries', count(*)::text
FROM public."JiraIssueHistoryRetry" WHERE status = 'RESOLVED';

SELECT 'CHECK', 'version_shape', (NOT EXISTS (
  SELECT 1 FROM public."JiraIssueVersion"
  WHERE "schemaVersion" <> 1 OR provenance <> 'OBSERVED'
    OR "contentHash" !~ '^[0-9a-f]{64}$'
    OR "payloadBytes" <= 0 OR "syncRunId" = ''
))::text;

SELECT 'CHECK', 'hydration_complete', (NOT EXISTS (
  SELECT 1 FROM public."JiraIssueVersion"
  WHERE NOT "changelogComplete" OR NOT "commentsComplete"
     OR NOT "worklogsComplete" OR NOT "remoteLinksComplete"
))::text;

SELECT 'CHECK', 'version_relations', (NOT EXISTS (
  SELECT 1
  FROM public."JiraIssueVersion" v
  LEFT JOIN public."JiraIssueSnapshot" s ON s.id = v."snapshotId"
  WHERE s.id IS NULL OR s."projectId" <> v."projectId"
     OR s."issueKey" <> v."issueKey"
     OR s."jiraId" IS DISTINCT FROM v."jiraIssueId"
))::text;

SELECT 'CHECK', 'current_projection', (NOT EXISTS (
  SELECT 1
  FROM public."JiraIssueSnapshot" s
  LEFT JOIN public."JiraIssueVersion" v ON v.id = s."currentVersionId"
  WHERE s."currentVersionId" IS NOT NULL AND (
    v.id IS NULL OR v."snapshotId" <> s.id OR v."projectId" <> s."projectId"
    OR v."jiraIssueId" IS DISTINCT FROM s."jiraId"
    OR v."issueKey" IS DISTINCT FROM s."issueKey"
    OR v."issueUrl" IS DISTINCT FROM s."issueUrl"
    OR v.summary IS DISTINCT FROM s.summary
    OR v.status IS DISTINCT FROM s.status
    OR v.priority IS DISTINCT FROM s.priority
    OR v.assignee IS DISTINCT FROM s.assignee
    OR v.reporter IS DISTINCT FROM s.reporter
    OR v."issueType" IS DISTINCT FROM s."issueType"
    OR v.resolution IS DISTINCT FROM s.resolution
    OR v.sprint IS DISTINCT FROM s.sprint
    OR v."issueCreatedAt" IS DISTINCT FROM s."issueCreatedAt"
    OR v."criticalPriorityAt" IS DISTINCT FROM s."criticalPriorityAt"
    OR v."criticalEndPriority" IS DISTINCT FROM s."criticalEndPriority"
    OR v."resolutionAt" IS DISTINCT FROM s."resolutionAt"
    OR v."commitCount" IS DISTINCT FROM s."commitCount"
    OR v."mergeRequestCount" IS DISTINCT FROM s."mergeRequestCount"
    OR v."developmentUpdatedAt" IS DISTINCT FROM s."developmentUpdatedAt"
    OR v."developmentDataAvailable" IS DISTINCT FROM s."developmentDataAvailable"
    OR v."developmentBaselineCaptured" IS DISTINCT FROM s."developmentBaselineCaptured"
    OR v."transitionHistoryComplete" IS DISTINCT FROM s."transitionHistoryComplete"
    OR v."issueUpdatedAt" IS DISTINCT FROM s."updatedAt"
  )
))::text;

-- This mirrors the structural attachment predicates in jira-version-canonical.ts.
-- It reports only a count/boolean; payload content never leaves PostgreSQL.
SELECT 'CHECK', 'attachments_absent', (NOT EXISTS (
  SELECT 1 FROM public."JiraIssueVersion"
  WHERE payload::text ~* '"attachments?"[[:space:]]*:'
     OR payload::text ~* '"type"[[:space:]]*:[[:space:]]*"(media|mediagroup|mediasingle|mediainline)"'
     OR payload::text ~* '"(field|fieldId)"[[:space:]]*:[[:space:]]*"attachments?"'
     OR (payload::text ~* '"filename"[[:space:]]*:'
         AND payload::text ~* '"(mimeType|content|thumbnail)"[[:space:]]*:')
))::text;

SELECT 'CHECK', 'retry_state', (NOT EXISTS (
  SELECT 1 FROM public."JiraIssueHistoryRetry"
  WHERE (status = 'PENDING' AND "resolvedAt" IS NOT NULL)
     OR (status = 'RESOLVED' AND "resolvedAt" IS NULL)
     OR attempts < 1 OR "nextRetryAt" IS NULL
))::text;

SELECT 'CHECK', 'cursor_state', (NOT EXISTS (
  SELECT 1 FROM public."JiraAnalyticsSettings"
  WHERE ("historyCursorUpdatedAt" IS NULL) <> ("historyCursorJiraIssueId" IS NULL)
))::text;

SELECT 'CERTIFICATION', 'migration_data_integrity', 'USE_BASELINE_POST_GATE';
SELECT 'CERTIFICATION', 'lifetime_immutability', CASE WHEN EXISTS (
  SELECT 1 FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  WHERE c.relname = 'JiraIssueVersion' AND con.contype = 'f' AND con.confdeltype = 'c'
) THEN 'NOT_CERTIFIED_CASCADE_DELETE' ELSE 'REQUIRES_FULL_RECONCILIATION_EVIDENCE' END;
SELECT 'CERTIFICATION', 'full_reconciliation_replay', 'NOT_RUN_NO_PROCESSED_ISSUE_EVIDENCE';
SELECT 'CERTIFICATION', 'jira_write_permissions', 'NOT_CHECKED_BY_DATABASE_DIAGNOSTICS';
SELECT 'CERTIFICATION', 'backup_restore', 'NOT_CHECKED_BY_DATABASE_DIAGNOSTICS';
COMMIT;
SQL
then
  integrity_die "A1 diagnostics query failed"
fi

if ! awk -F '\t' '
  BEGIN {
    split("version_shape hydration_complete version_relations current_projection attachments_absent retry_state cursor_state", names, " ");
    for (i in names) expected[names[i]] = 1;
  }
  $1 == "CHECK" {
    if (!($2 in expected) || seen[$2] || $3 != "true") failed = 1;
    seen[$2] = 1;
  }
  END {
    for (name in expected) if (!(name in seen)) failed = 1;
    exit failed ? 1 : 0;
  }
' "$PARTIAL_FILE"; then
  mv "$PARTIAL_FILE" "$REPORT_FILE"
  trap - EXIT HUP INT TERM
  echo "FAIL: one or more A1 structural checks failed; report: $REPORT_FILE" >&2
  exit 1
fi

mv "$PARTIAL_FILE" "$REPORT_FILE"
trap - EXIT HUP INT TERM
echo "PASS: A1 structural diagnostics passed (see separate NOT_CERTIFIED lines): $REPORT_FILE"
