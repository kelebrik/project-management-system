# Jira analytics: stage F

Stage F switches dashboard widgets from inline v1 rules to managed aggregate definitions. Jira remains strictly read-only: preflight and switch read only the application's synchronized PostgreSQL projections.

## Switch contract

`POST /api/projects/{projectId}/jira/aggregates/switch-dashboard` is available only to a system administrator and requires:

- the current raw dashboard hash;
- the dashboard period and assignee used for parity evaluation;
- `dryRun`, which performs no database writes, including audit writes.

The endpoint treats a missing saved dashboard as the standard v1 dashboard without changing the raw `null` optimistic-lock value. It builds the import plan and prospective v2 dashboard in memory, feeds v1 and v2 from one ordered local database pass, and requires a full canonical match.

The applied switch then repeats the plan in a bounded-retry serializable transaction. It locks the project and settings, rechecks the source and plan hashes, creates missing definitions, saves the v2 dashboard and records one conversion generation atomically. Reused definitions are not copied. Definitions created by a switch are retained after rollback because they may already be referenced elsewhere.

The former applied `convert-dashboard` operation returns HTTP 410. Its dry-run remains for one compatibility release, but it cannot change the dashboard.

## Rollback contract

Every switch increments the conversion `attempt`. Rollback requires the current attempt and v2 config hash, preventing a delayed request from rolling back a later conversion generation.

The server exposes an explicit rollback state:

- `AVAILABLE`: the managed dashboard is active and rollback is open;
- `USED`: this generation was rolled back;
- `CLOSED`: the legacy window was finalized and cannot be reopened.

Rollback restores the exact original storage state. A project that used the implicit default returns to SQL `NULL`; it is not pinned to a copied default JSON document. The discarded v2 document and hash are written to the audit event in the same transaction as the restore.

Ordinary dashboard editing cannot bypass the state machine. v1 can be saved only before a switch or after a successful rollback. v2 can be saved only while a conversion is `AVAILABLE`, or after it has been finalized as `CLOSED`.

## Release boundary

The v1 evaluator remains in the stage F release and in the immediately following release. The retirement release must use this order:

1. remove or disable the switch operation;
2. finalize every `AVAILABLE` conversion as `CLOSED` in bounded batches;
3. verify that `SELECT count(*) FROM "JiraAnalyticsDashboardConversion" WHERE "rollbackState" = 'AVAILABLE'` returns zero and that the `pms_jira_analytics_conversions_available_total` gauge is zero;
4. remove the v1 evaluator and rollback operation.

The release must stop if the count is non-zero. `CLOSED` projects continue to edit and execute their v2 dashboards; they cannot be resurrected into a new rollback generation.

## Verification

1. Run a dry-run for a project with a stored v1 dashboard and confirm `MATCH`.
2. Repeat for a project using the implicit default and confirm `sourceStored: false`.
3. Apply the switch and confirm the dashboard returns v2 results unchanged.
4. Edit a v2 title or layout and confirm the converted hash follows the saved config.
5. Dry-run rollback with the current `attempt`, then apply it.
6. Confirm the exact v1 storage state was restored and v1 editing is available again.
7. Confirm a stale attempt, mismatched config hash, `CLOSED` state and direct engine-version bypass each return HTTP 409 without writes.
