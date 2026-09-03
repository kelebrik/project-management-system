# Jira history: completion of stages 0, A1, A2 history flag, and B

This contract supplements the earlier analytics documents. Jira remains strictly
read-only: the service uses only the existing guarded search, authentication, issue,
changelog, comment, worklog, and remote-link reads. It writes only to its own PostgreSQL
database. Attachments are never requested or stored.

## Stage 0

The capacity sampler remains a non-persisting estimate. A completed durable `SYNC` or
`BACKFILL` now records the real full-pass active processing duration, deduplicated discovered ticket
count, hydrated count, Jira request count, total/max request duration, response status
classes, and fixed route categories. Counters accumulate across every resumed attempt of
the same run. Route metrics never contain issue keys.

`scripts/backup-db.sh` creates a custom-format dump, validates it with
`pg_restore --list`, writes a checksum, and atomically writes an adjacent manifest with
actual bytes and elapsed time. The manifest contains no DSN or credentials.

## Stage A1: durable execution

`POST /api/projects/{projectId}/jira/sync` returns HTTP 202, `runId`, `statusUrl`, and a
poll interval. The database journal survives process restarts. A PostgreSQL-clock lease,
monotonic fence token, heartbeat, bounded attempts, checkpoint cursor, and transactional
fence assertions prevent an expired worker from changing snapshots, retries, sections,
SLA tracking, or cursors. Only one SYNC or BACKFILL can be active per project, and the
same settings lease also excludes projection rebuilds.

An ordinary attempt deadline pauses and resumes the same row without consuming the crash
attempt budget; `deadlinePauseCount` remains visible in run status. The independent
two-hour active-runtime limit still bounds a continuously resumed run. Time spent queued,
paused, or waiting for a stopped service does not consume that budget.

The single-process runner lives in the web service. On a free hosting plan it cannot run
while the service is spun down; the next service start resumes queued or expired work.
This is durable recovery, not a promise that an idle free instance stays awake.
The browser polls for at most 15 minutes per interaction and then releases its loading
state; the durable server run continues and is available through its status URL.

User-facing Jira analytics also has an on-demand current-projection refresh. Opening a
dashboard returns the local projection immediately, then queues at most one durable
`CURRENT` run per project when the projection is older than five minutes. Concurrent
viewers share that run. It reads only current issue fields in the configured label/epic
scope and never requests changelog, comments, worklogs, remote development data, or a
full history document. It updates no immutable versions and does not resolve history
retry rows. The UI shows the effective Jira refresh time and recalculates its local
aggregates after a successful refresh.

The defaults can be tuned with `JIRA_CURRENT_REFRESH_TTL_MS` (five minutes) and
`JIRA_CURRENT_REFRESH_RETRY_MS` (five minutes). The retry delay also applies when the
queue is occupied or Jira returns an empty scope. Empty results preserve the previous
projection. Current-projection freshness is stored separately, so a lightweight run does
not change the status or timestamp of a full synchronization. The durable project lease
still serializes `CURRENT`, `SYNC`, and `BACKFILL`, so lightweight refresh cannot race a
full import or overwrite a concurrently changed label/epic scope. An explicit full import,
backfill, or project-data clear preempts a queued or running lightweight refresh; the
regular administrative operation therefore never waits for the five-minute cache refresh.

The lightweight run never invents a historical Critical/Blocker start. For an unresolved
ticket it can only deactivate or keep active an already known SLA start from the current
type and priority; for a resolved ticket it preserves the full synchronization's verified
resolution-time priority. Current-field changes are marked for historical repair by the
next full synchronization.

An explicit full import starts a new sweep. A paused attempt of the same durable run
resumes after its saved issue-key checkpoint and retains the original scan boundary.
History gaps are repaired from the active projections marked as unversioned; permanent
hydration failures stay visible in the retry/completeness report and use retry backoff
instead of forcing a full Jira sweep on every ordinary synchronization.

## Historical dual-write flag

`JIRA_HISTORY_WRITE_ENABLED=false` disables immutable version writes. Unset or any other
value keeps them enabled. The value is captured on the run row at enqueue. An ordinary
SYNC can additionally be demoted once, from enabled to disabled, when the capacity limit
is reached during its execution; a BACKFILL stops instead. Current projections,
changelog-derived SLA fields, and development data continue to update while disabled,
but all five historical cursors stay frozen. Such active projections are marked
`projectionUnversionedSince` and are skipped by the projection rebuild endpoint, so an
administrator cannot roll current data back to an old version. History-status and as-of
reconstruction expose the resulting gap explicitly.

`JIRA_HISTORY_BUDGET_BYTES` sets the operator-approved primary-database history budget.
Invalid or non-positive values fall back to 5 GiB. Backfill checks the 95% gate when it is
queued and after every committed batch; capacity stop never deletes old history.
Ordinary synchronization degrades to current-state-only mode at the same gate, preserving
dashboards while recording an explicit history gap for later reconciliation.

## Stage B: backfill and completeness

Only a system administrator can queue `POST .../jira/backfill`. Backfill uses the stored
project scope, fully hydrates the current Jira state plus available changelog, comments,
worklogs and remote links, and saves an idempotent `OBSERVED` version. It does not invent
past full snapshots that Jira never supplied.

`GET .../jira/backfill/completeness` reports stable Jira-ID coverage, observed and fully
hydrated coverage, version totals and distribution, pending retry reasons, history-write
gaps, and the latest backfill measurements. Per-ticket details are paged at no more than
100 rows and a 10,000-row window; larger requests fail with HTTP 413.

A projection changed while historical writes were disabled is deliberately excluded from
observed and fully hydrated coverage until a later history-enabled observation records its
current version. It remains visible as `unversionedProjection` and in the `missing` page.

## Integrity gate for this migration

The existing capture/compare procedure accepts `TARGET_MIGRATION` and
`PRE_TARGET_MIGRATION`. For this release use:

```sh
export TARGET_MIGRATION=20260823180000_jira_sync_runs_backfill
export PRE_TARGET_MIGRATION=20260822200000_jira_aggregate_definitions_a2
```

Capture a stopped-service baseline before the migration and a post snapshot before the
first worker starts. The new table and nullable columns are excluded from old-data hashes
and checked by exact named postconditions. All A1/A2 tables and columns remain inside the
row and catalog hashes for this target. Creating the new snapshot index can briefly lock
the existing snapshot table, so apply this migration only in the agreed maintenance
window and take the baseline before migration execution.
