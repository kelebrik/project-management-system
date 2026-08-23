# Jira analytics: stage C1 observed-history as-of reconstruction

Status: implemented after B1 verification. C1 adds historical state preview to the
governed aggregate constructor without a database migration or Jira request.

Jira remains strictly read-only. C1 reads only typed columns from immutable A1 versions.
It never reads or returns the archived JSON document, comments, worklogs, descriptions,
remote links, attachment information, or validation details.

## User-visible boundary

System administrators can set `Состояние на дату` in the aggregate-constructor preview
when the source is `Тикеты` or `SLA Critical/Blocker`. An authorized project reader can
also pass the same runtime parameter to the saved single-aggregate result endpoint. The
saved aggregate definition is unchanged. Clearing the field returns to the current
projection. The browser control and rendered timestamp use the browser's local timezone;
the API always receives and returns an ISO timestamp with an explicit offset.

The response and preview visibly identify the result as `RECONSTRUCTED` from
`OBSERVED_VERSIONS`. They also show the selected instant, reconstructed ticket count,
number of tickets that already existed in the selected scope but lack an observation by
that instant, eligible version rows, and P95/maximum observation lag. Tickets created
after the selected instant are not completeness gaps. A date before the first eligible
observation is an explicit warning state and is never presented as a confirmed zero.

Dashboard-wide as-of evaluation is not enabled in C1. The ordinary dashboard remains on
the B1 current projection and rejects an unexpected `asOf` parameter.

## Reconstruction semantics

For a project and UTC instant `T`, candidates are `JiraIssueVersion` rows where:

- `observedAt <= T`;
- `provenance = OBSERVED`;
- the linked snapshot is current or was retired after `T`.

Each stable Jira issue ID contributes at most one row. The winner is ordered by Jira
update time descending, observation time descending, and version ID descending. This is
the same stale-write rule used by the A1 current projection. A ticket with 100 eligible
versions therefore contributes one record, not 100.

The winner is mapped from typed columns into the unchanged A2/B1 evaluator. Its public
record ID is the current-projection snapshot ID. Event collections are empty. The
Critical/Blocker tracking flag is derived from the shared bug, SLA-start, and end-priority
rule rather than trusted from a mutable projection.

`observedAt` is the historical boundary because A1 stores states actually seen by this
system. `jiraUpdatedAt` participates in winner ordering but is not presented as an
observation. C1 does not manufacture old Jira states from changelog. No
`RECONSTRUCTED` row is written to the database; reconstruction is a response label only.

Retirement history has one known limitation: `JiraIssueSnapshot.retiredAt` stores the
latest retirement, not a complete sequence of scope membership changes. Tickets retired
after `T` are included and reported separately, which means a historical result can show
a ticket that is no longer visible in the current projection to the same authorized
project reader. Reactivation before and after `T` cannot be reconstructed until
scope-membership history exists.

The completeness denominator counts distinct non-null stable Jira IDs whose Jira-created
time is not later than `T` and whose snapshot is current or retired after `T`. This avoids
false gaps from tickets created later and double counting after a Jira key rename.

## API contract

The optional ISO timestamp `asOf` is accepted only by:

- `POST /api/projects/{projectId}/jira/aggregates/preview`;
- `GET /api/projects/{projectId}/jira/aggregates/{aggregateId}/result`.

The API rejects a future timestamp, simultaneous `asOf` and `evaluatedAt`, and as-of use
with transition or development sources. In as-of mode the evaluator's `now` is exactly
`asOf`, so unresolved Critical/Blocker duration ends at the selected instant.

Responses retain the existing evaluation shape and add `reconstruction`. Logs contain
only project ID, instant, aggregate ticket counts, missing-observation count, and version
row count. They contain no issue-level data.

## Bounds and storage

| Resource | Limit |
| --- | ---: |
| Eligible observed version rows | 200,000 |
| Reconstructed tickets | 5,000 |
| Ticket IDs per database page | 250 |
| Groups | 5,000 |
| Requested page window | 10,000 |
| Response page | 100 |

The version-row and ticket limits fail with HTTP 413 before returning a partial result.
The version preflight materializes at most 200,001 eligible rows, so the guard itself is
bounded. Ticket IDs and winning rows are read in bounded pages, and the ticket cap is
rechecked while the pages are drained. SQL uses explicit typed columns and excludes
archived JSON.

C1 adds no table, column, index, materialized view, trigger, backfill, or retained data.
The global 5 GiB A1 history allocation is unchanged. The existing project/Jira-ID
constraint provides the initial access path; a new index is deferred until a measured
production-shaped query plan demonstrates that one is required.

## Verification

Before delivery:

```sh
npm run prisma:generate
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
export JIRA_HISTORY_TEST_DATABASE_URL='postgresql://.../pms_history_test?schema=public'
npm run test:history:postgres
```

The PostgreSQL gate must cover real `DISTINCT ON` winner ordering. On a disposable
production-shaped copy, record `EXPLAIN (ANALYZE, BUFFERS)` for the candidate-ID and
winner queries. Abort rollout if an unbounded sequential scan dominates at the measured
history volume.

The delivery gate was measured on PostgreSQL 18.6 at the exact caps: 5,000 tickets with
40 observed versions each (200,000 typed history rows). Six complete parameterized Prisma
evaluations, including all 20 ID/winner pages, took 3.59-3.94 seconds; the warm median was
3.64 seconds. With PostgreSQL forced to a generic plan, page 2 of the cursor query used
the existing `(projectId, jiraIssueId, contentHash)` unique index and completed in 24.3 ms;
the 250-ID winner page used the same index and completed in 23.7 ms. This does not justify
an additional production index or migration at the current limits. Re-measure before
raising either limit.

After deployment, compare a current preview with an as-of preview at the latest
observation, verify a historical date, verify the explicit pre-history warning, and
confirm that an event source disables the control and a forged request is rejected.
`Данные Jira` must report unchanged stored bytes.

## Explicit exclusions

C1 does not add dashboard-wide history, event-source history, time series, trends,
deltas, alerts, formulas, forecasts, exports, reconstruction from changelog, or any Jira
write path. Those require separate contracts after C1 query accuracy and performance are
verified.
