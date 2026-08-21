# Jira analytics: stage 0 capacity gate

Stage 0 measures the storage and request cost of full Jira issue history before the
versioned snapshot schema is introduced. It does not persist Jira payloads.

## Safety boundary

- Jira is strictly read-only. Every request still passes through
  `fetchJiraReadOnly` and its endpoint/method allowlist.
- The sampler is available only to a system administrator.
- The report contains aggregate numbers only. Issue keys, summaries, descriptions,
  comments, worklogs, users, and raw custom-field values are never returned.
- `attachment` is explicitly excluded from Jira search fields and recursively removed
  before byte measurement.
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
- Database with backups: database estimate multiplied by three retained copies.

The capacity gate evaluates the 50-version scenario against the budget entered by the
administrator. A missing sample, incomplete changelog, attachment leakage, or budget
overrun requires review before the versioned schema phase starts.

## Running the gate

Open a project, go to `Работы в Jira` -> `Данные Jira`, and use
`Ёмкость полной истории`. Start with the real project label (for example `cvte968`),
20 issues, and the storage budget allocated to the primary database. Download the JSON
report and attach it to the schema decision record.

The measurement is marked `OBSERVED`. Future reconstructed history must be marked
separately and must not be presented as an observed Jira snapshot.
