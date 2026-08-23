# Jira analytics: stage B1 bounded evaluation and transport

Status: implemented on the B1 cloud feature branch. B1 follows the verified A2
production deployment and does not require a database migration.

B1 bounds API memory and browser transport without changing A2 aggregate semantics.
Jira remains strictly read-only. This stage does not import the Jira transport module,
call Jira, or read immutable `JiraIssueVersion.payload` documents.

## Release boundary

B1 is one application release with no DDL and no data backfill:

- remove the top-level current Jira snapshot population from the general project DTO;
- expose compact project-scoped analytics facets through a read-only endpoint;
- evaluate aggregates in stable issue-key batches using the existing shared evaluator;
- reject oversized issue, event, group, and result-window populations explicitly.

The nested snapshot attached to a configured Jira work-section row is retained because
the `Данные Jira` workflow uses it. Executive-overview queries keep their own explicit
server-side snapshot selection and are outside the analytics transport contract.

## Compact facets

`GET /api/projects/{projectId}/jira/analytics-facets` follows normal project read access
and returns only:

- current projection count and active-work count;
- transition-history, development-data, and Critical/Blocker SLA coverage counts;
- latest synchronization timestamp;
- at most 500 sorted distinct assignee names plus a truncation flag.

It does not return issue keys, summaries, URLs, events, raw payloads, or full snapshots.
The dashboard and managed aggregate builder use this endpoint for coverage indicators
and assignee selectors.

## Bounded evaluation

Before reading an evaluation batch, the API counts current non-retired projections and
their normalized transition/development events. It then reads projections in batches of
250 using the project/issue-key unique cursor. One dashboard pass feeds every requested
widget accumulator from the same batches; it does not retain the full project population.

Hard fail-closed limits:

| Resource | Limit |
| --- | ---: |
| Current projection rows | 5,000 |
| Transition plus development rows | 100,000 |
| Groups in one aggregate | 5,000 |
| Requested page window (`offset + pageSize`) | 10,000 |
| Dashboard widgets | 100 |

Exceeding a limit returns HTTP 413 with `kind` and `limit`. No partial aggregate is
returned and no result is silently truncated. Ordinary response pages remain capped at
100 rows.

## Semantic compatibility

The shared A2 evaluator remains authoritative. Its one-shot entry point delegates to the
same accumulator used by the batched API. B1 preserves:

- active/retro scope, unresolved and cancelled-status handling;
- period boundaries and explicit evaluation time;
- NFKC and `ru-RU` text folding;
- source filters, ISO week grouping, stable group keys, and code-point ordering;
- average and percentile calculations;
- drill-down value, count, sort order, and pagination behavior;
- v1/v2 dashboard compatibility, fingerprints, locking, authorization, and rollback.

The accumulator retains metric counters and required duration samples per group. For
record output it retains only the globally ordered prefix needed by the requested page.
Tests compare one-shot and multi-batch results as complete response objects.

## Explicit exclusions

B1 adds no tables, indexes, materialized views, formulas, alerts, trend reports, or
as-of history queries. It does not move A2 semantics into SQL. Reading the immutable A1
history for retrospective BI remains a separate product stage after B1 is verified.

## Verification

Before merge or deployment:

```sh
npm run prisma:generate
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

After deployment, verify both `В работе` and `Ретро`, assignee selection, group
drill-down, CSV export, and the `Агрегаты` preview. Compare at least one duration widget
and one grouped widget with the A2 production values at the same filters. Confirm that
the project-details response has no top-level `jiraSnapshots` field and that the facets
response contains no issue-level business data.
