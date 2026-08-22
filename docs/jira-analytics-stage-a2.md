# Jira analytics: stage A2 governed constructor

Status: implemented on the A2 feature branch. Deploy only after the A1 production gate.

Stage A2 introduces reusable, project-scoped aggregate definitions and authoritative
server-side dashboard evaluation. It does not add Jira write operations. Jira remains
strictly read-only, and A2 does not import or call the Jira transport module.

## Release boundary

A2 is deployed in two explicit steps:

1. Deploy the additive migration, API, and UI. Existing `NULL` dashboard settings use
   the stable default v1 layout at read time. Existing saved v1 layouts continue to run
   inline on the server. The migration creates empty A2 tables and does not rewrite A1
   history, current projections, or saved dashboards.
2. A system administrator opens `Работы в Jira` -> `Агрегаты`, runs the import dry-run,
   imports reusable definitions, runs the v2 conversion dry-run, and then explicitly
   converts the dashboard. Import and conversion are separate operations. Neither is
   performed during deployment.

The conversion stores the exact original v1 JSON and both configuration hashes. Rollback
is allowed only while the current v2 hash still matches the converted hash; it restores
the original v1 document byte-for-byte at the JSON value level. Aggregate definitions
are retained after rollback and can be removed separately when unused.

## Data model

`JiraAggregateDefinition` stores one managed definition per project:

- source, metric, grouping, active/retro scope, AND/OR filters;
- period policy (`NONE`, `FIXED`, or `DASHBOARD`) and timezone;
- normalized name, semantic fingerprint, display order, and optimistic version;
- unique project/name and project/fingerprint constraints.

`JiraAnalyticsDashboardConversion` stores the reversible v1-to-v2 conversion record.
Each valid v2 dashboard save refreshes the conversion hash in the same project-locked
transaction, so rollback remains available after ordinary widget presentation edits.
Saving a v1 dashboard closes any active conversion record and permits a later conversion.
The catalog exposes the expected converted hash and disables rollback when an out-of-band
change makes the current configuration incompatible with the recorded conversion.
The dashboard v2 document contains presentation only: widget title, aggregate reference,
visualization, width, and placement. Aggregate rules no longer live in each v2 widget.

## Authoritative query path

The browser never calculates aggregate values. It sends runtime period, assignee,
pagination, optional stable group key, and an optional fixed `evaluatedAt` to the API.
The API reads only current, non-retired `JiraIssueSnapshot` rows and the normalized
transition/development event tables. It selects explicit typed columns and cannot select
`JiraIssueVersion.payload` or the version relation.

The general project DTO no longer includes transition or development event collections.
Dashboard cards, drill-down, and CSV export all use the server result. The batch endpoint
loads the project population once for the visible dashboard. Drill-down and later export
pages can request one `widgetId`, avoiding recalculation of unrelated widgets. Every page
of one export reuses the first response's `evaluatedAt`; widgets with additional pages
are loaded sequentially to avoid multiplying full-population reads.

Input population is exactly the current projection rows where `retiredAt IS NULL` for
the selected PMS project. Jira scope selection (label or epic) is applied during the
read-only synchronization that maintains those projections; A2 does not independently
query Jira or widen that population.

One evaluation accepts at most 5,000 active projection rows. A larger population is
rejected explicitly with HTTP 413 and is never truncated silently. The limit protects
API memory until aggregate sources are backed by database-side materialization.

## Semantics

- `active` keeps only unresolved issues and excludes cancelled statuses. `retro` does
  not apply that current-work restriction.
- Issue and Critical/Blocker sources do not use an event period. Transition and
  development sources require a fixed or dashboard period.
- An incomplete transition history contributes no transition records. A baseline
  development observation contributes no development event.
- Critical/Blocker duration starts at the verified `criticalPriorityAt` and ends at
  `resolutionAt` or the explicit server evaluation time. The A1 projection remains
  responsible for verifying issue type and priority at Resolution.
- Empty groups have reserved stable keys. Other scalar groups use a stable value key.
  Week grouping uses ISO week-year keys such as `2026-W01`, not a locale-dependent week
  label. Display labels use the configured timezone.
- With `groupKey`, `value`, `records`, and `totalRecords` all describe the selected
  group; the unfiltered `groups` collection remains available for navigation.
- Ordering uses Unicode code-point comparison. Text matching, normalized names, and
  semantic fingerprints use NFKC normalization and `ru-RU` case folding. The API fails
  closed if its runtime lacks the required ICU locale.
- Numeric filters reject an empty value. `Number("")` is never accepted as zero.
- The fingerprint excludes names, descriptions, display order, filter IDs, and inert
  period fields. It includes active/retro scope and normalized semantic filters.

These ISO-week, code-point-order, and strict numeric rules are deliberate compatibility
corrections relative to the former browser evaluator.

## Compatibility and invalid data

Writes are strict and accept only the shared v1/v2 schemas and allowed source/metric,
source/grouping, source/filter, operator, and period combinations. Reads are tolerant:
an invalid non-empty saved widget, missing definition, or scope/placement mismatch is
returned as an explicit `UNAVAILABLE` widget. It is never silently replaced by zero or
by a default report. Only a `NULL` dashboard configuration gets the stable default v1
layout.

Legacy v1 widgets that predate the `section` field remain readable. Their placement is
normalized with the former client rule: Critical/Blocker and duration transition
widgets go to `retro`; all other widgets go to `active`. New v1 writes remain strict
and must include `section`.

Definition updates use `expectedVersion`. Dashboard conversion operations use the
expected configuration SHA-256. Referenced definitions and dashboard settings are row
locked, and all definition/dashboard mutations also take one project-scoped PostgreSQL
transaction lock. Deleting an in-use definition is rejected and audited.
If the stored dashboard cannot be parsed well enough to prove non-use, deletion fails
closed with a configuration conflict.

Only a system administrator can create, edit, delete, preview, import, convert, roll
back, or change dashboard widgets. Project readers can view saved definitions and
server-calculated results. Closed projects reject all A2 mutations.

## Verification

Before merging or deploying:

```sh
npm run prisma:generate
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

The A2 migration must also be applied to a disposable PostgreSQL copy of production and
verified as DDL-only. When no disposable database is configured locally, this remains a
mandatory deployment gate rather than an implied pass.

After the first A2 deployment, verify that existing v1 dashboards produce server results
before importing definitions. After conversion, compare card values and drill-down counts
against the v1 result at the same `evaluatedAt`, test one optimistic-version conflict, and
perform a rollback dry-run. Do not convert production dashboards in the same change window
as the A1 production migration.
