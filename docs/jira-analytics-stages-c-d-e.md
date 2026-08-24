# Jira analytics: stages C, D and E

The Jira integration is strictly read-only. These stages read synchronized local data and never mutate Jira.

## C. Managed BI execution

Saved aggregate definitions are executed by the API against the local analytical projection. The server applies the same limits to preview, drill-down and CSV export:

- definitions use the allow-listed source, metric, grouping, period and filter vocabulary from `@pms/shared`;
- result records are typed projections and never expose immutable raw Jira payloads;
- drill-down is paginated and deterministic;
- CSV export is bounded to 10,000 records, quotes every field and neutralizes spreadsheet formulas;
- every result includes server-calculated source coverage: status, population, complete record count, percentage and warning codes.

`COMPLETE` means that the synchronized source fields required by this aggregate are present. It does not independently prove that Jira itself is correct or complete. Historical results additionally report missing observations, requests before history collection began and known history write gaps.

The count of tickets without a historical observation is project-wide because their historical scope and assignee are unknowable. It is reported as a warning and is not mixed into a definition's scope/assignee population or coverage percentage.

## D. Administrator constructor

The `Aggregates` page is the system-administrator surface for creating and maintaining managed definitions. Administrators can:

- configure the source, metric, grouping, period, filters and scope;
- preview the server result and inspect its quality report;
- drill into typed source records;
- download the same evaluated result as CSV;
- import legacy dashboard widgets into saved definitions.

Project readers can execute saved definitions through dashboards, but cannot change the catalogue. The v1/v2 diagnostic remains available to a system administrator for a closed project; ordinary definition and dashboard mutations still obey project write-state checks.

## E. v1/v2 reconciliation

The migration panel compares a legacy dashboard (`v1`) with its managed-definition form (`v2`) using the same project population and evaluation timestamp.

The API:

1. builds the import plan with `buildJiraAggregateImportPlan`;
2. converts the dashboard with `convertJiraDashboardToV2`;
3. resolves separate v1 and v2 accumulators;
4. feeds both sides from one ordered database batch pass;
5. compares record counts, scalar values, groups and a deterministic sample of record identifiers;
6. returns mismatches without modifying definitions, dashboards or Jira.

The shared arithmetic kernel makes this a migration parity check, not an independent validation of the formulas. A clean result proves that v1 and v2 interpreted the same synchronized input identically; it does not prove the source data or business definition is correct.

## Release verification

Before enabling managed definitions for a project:

1. synchronize Jira and confirm the existing completeness badges are green;
2. preview representative issue, transition, development and Critical/Blocker SLA definitions;
3. inspect the server quality report and resolve unexpected partial coverage;
4. export a drill-down and confirm the row count matches the preview;
5. run v1/v2 reconciliation for the current dashboard configuration;
6. accept the migration only when the API reports no mismatches, or document each intentional difference.

All reconciliation metadata written to the audit log is compact operational metadata. Evaluated issue records and raw Jira payloads are not stored in audit events.

The controlled production switch and rollback window are specified in [`jira-analytics-stage-f.md`](./jira-analytics-stage-f.md).
