# Jira analytics: stage 0.1 capacity gate

Stage 0 measures the storage and request cost of full Jira issue history before the
versioned snapshot schema is introduced. It does not persist Jira payloads.

## Safety boundary

- Jira is strictly read-only. Every request still passes through
  `fetchJiraReadOnly` and its endpoint/method allowlist.
- The sampler is available only to a system administrator.
- The report contains aggregate numbers only. Issue keys, summaries, descriptions,
  comments, worklogs, users, and raw custom-field values are never returned.
- `attachment` is explicitly excluded from Jira search fields. The report separately
  verifies that Jira honored this field exclusion, recursively removes structured
  attachment metadata and ADF media nodes before byte measurement, then audits the
  sanitized result. Removed references are reported as non-blocking diagnostics.
- The sampler does not write to the application database.

## Sampling

The scope is generated from one controlled selector:

- label: `labels = "value"`;
- epic: `(key = "KEY" OR "Epic Link" = "KEY")`.

Half of the requested sample is selected from the oldest issues and half from the
newest issues. Ordering is deterministic by `created` and `key`. Duplicate Jira IDs
are removed before aggregation.

For each observed issue the sampler requests all accessible fields except attachments,
hydrates the complete changelog when Jira exposes it, and reads remote links through
the existing read-only integration. Embedded comment and worklog pages are measured;
when Jira reports more records than it embeds, their size is extrapolated from the
observed records. The completeness percentages remain visible in the report.

## Projections

The report shows scenarios for 10, 50, and 100 versions per ticket. Projections use
the sample P95 rather than the average.

- Raw JSON: `tickets * versions * full_snapshot_p95`.
- Database: raw JSON multiplied by `1.5` for conservative row and index overhead.
- Gzip archive: extrapolated from the observed per-issue compression ratio.
- Three database copies: database estimate multiplied by three total copies. This is
  a reference scenario only; it does not mean the primary database plus three backups.

The capacity gate evaluates the 100-version scenario against the budget entered by the
administrator. The approved default is 5 GiB allocated to Jira history in the primary
database. It excludes WBS and other application data, and it excludes backups. Forecasts
for multiple Jira scopes are additive because the 5 GiB allocation is global rather than
repeated for every project. Before measuring another scope, enter the database amount
already allocated or observed for earlier scopes in
`Учтено ранее без текущей области, ГиБ`; the capacity badge evaluates their sum rather
than giving every scope a fresh 5 GiB budget. Do not include the scope currently being
measured in this value.

Budget levels are `WARNING` at 70%, `HIGH` at 85%, `CRITICAL` at 95%, and `EXCEEDED`
above 100%. A critical or exceeded forecast, missing sample, incomplete changelog, or
attachment leakage requires review before the versioned schema phase starts. Alerts do
not delete history and do not stop synchronization for an already enabled scope; storage
must be expanded before the physical limit is reached.

## Running the gate

Open a project, go to `Работы в Jira` -> `Данные Jira`, and use
`Ёмкость полной истории`. Start with the real project label (for example `cvte968`),
20 issues, and the storage budget allocated to Jira history in the primary database.
Download the JSON report and attach it to the schema decision record. The capacity badge
shows global utilization for the 100-version scenario. Capacity report schema version 2
uses `threeDatabaseCopiesGiB` for three total database instances and
`referenceDatabaseCopies: 3`; reports without `reportVersion` are legacy version 1.

The measurement is marked `OBSERVED`. Future reconstructed history must be marked
separately and must not be presented as an observed Jira snapshot.

## Accepted baseline

The stage 0.1 planning baseline is 400 tickets and 100 observed versions per ticket.
The `cvte968` sample measured on 2026-08-21 produced a 57.4 KiB snapshot P95. With the
1.5 database multiplier, the baseline projects approximately 3.282 GiB in the primary
database, or 65.6% of the 5 GiB Jira-history allocation. This is a planning estimate,
not a storage guarantee; A1 must report actual database bytes after ingestion begins.

The implementation contract for the next phase is recorded in
[`jira-analytics-stage-1a.md`](./jira-analytics-stage-1a.md).
