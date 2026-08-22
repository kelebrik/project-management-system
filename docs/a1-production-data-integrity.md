# A1 production data-integrity procedure

This runbook proves one deliberately narrow statement:

> In the same PostgreSQL cluster and database, every row and normalized catalog
> object that existed immediately before A1 is unchanged immediately after A1,
> and exactly one successful A1 migration was added.

It does not replace a backup, certify PITR, certify Jira permissions, or prove that
history can never be deleted later. Jira is strictly read-only. The commands below
never call Jira and the database scripts open `REPEATABLE READ READ ONLY`
transactions only.

## Hard prerequisites

Do not begin the maintenance window until all of these are true:

1. A restorable backup or a tested PITR restore point exists outside the production
   database. Record the backup ID, timestamp, database identity, checksum, restore
   drill result, RPO, and responsible DBA in a local evidence file. A capture
   manifest is not restorable and is not backup evidence.
2. The deployed image is immutable and identified by its image ID/digest, not a
   mutable tag. Its A1 `migration.sql` SHA-256 equals the file in this checkout.
3. The checkout commit is the commit represented by that image.
4. The database capture role has explicit `EXECUTE` on `pg_control_system()` and
   `pg_control_checkpoint()` (or is superuser), is a member of `pg_read_all_stats`, and can select
   every column and sequence. No user table has RLS. Missing access is a hard FAIL.
5. The application and every worker/cron importer can be stopped for the entire
   baseline, migration, and post-capture window. Monitoring roles may remain only
   when named in `DB_INTEGRITY_ALLOWED_ROLES`; the capture verifies that those roles
   have no table-write or elevated cluster privileges.

The production database observed before this runbook was written was
`tv_management`, with newest successful pre-A1 migration
`20260821150000_jira_analytics_shared_dashboard_scope` and no A1 tables. The
preflight verifies this again and refuses any older/different migration state.

## 1. Prepare external evidence

On the operator workstation, create a directory outside the repository and record
the verified backup/PITR evidence. Do not put database passwords into this file.

Obtain the image evidence from the exact image that will run the migration. For a
Docker runtime, the equivalent checks are:

```sh
docker image inspect --format '{{.Id}}' IMAGE_DIGEST
docker run --rm --entrypoint sha256sum IMAGE_DIGEST \
  /app/prisma/migrations/20260821200000_jira_issue_history_a1/migration.sql
shasum -a 256 prisma/migrations/20260821200000_jira_issue_history_a1/migration.sql
```

The two migration hashes must be identical. Keep the command output with the change
record.

Export non-secret evidence and connection settings. The SSH transport uses Kerberos
and the PostgreSQL local socket on the database host; it does not store or print a
password.

```sh
export DB_INTEGRITY_SSH_HOST='<database-host>'
export DB_INTEGRITY_SSH_USER='<integrity-reader>'
export DB_INTEGRITY_DB_NAME=tv_management
export DB_INTEGRITY_ALLOWED_ROLES=postgres_exporter
export DB_INTEGRITY_BACKUP_EVIDENCE_FILE=/absolute/path/a1-run/backup-evidence.txt
export DB_INTEGRITY_IMAGE_ID='sha256:...'
export DB_INTEGRITY_IMAGE_MIGRATION_SHA256='...'
```

A direct `DATABASE_URL` is also supported, but it must contain `sslmode=require`,
`verify-ca`, or `verify-full`. Never place a URL containing credentials in shell
history or the evidence directory.

## 2. Open the exclusive maintenance window

1. Put the service behind its maintenance page.
2. Scale the deployment to zero or stop `tv-management.service`.
3. Stop scheduled jobs and workers that connect to this database.
4. At the database/network layer, prevent application-role connections for the
   window. Keep a separate migration role/path available.
5. Confirm no automatic rollout, liveness restart, or image entrypoint can execute a
   second `prisma migrate deploy`.

The capture repeats the `pg_stat_activity` check at the beginning and end of each
snapshot. Any unexpected client makes the run `ABORTED`; do not override it.

## 3. Capture the pre-A1 baseline

```sh
npm run integrity:capture -- baseline /absolute/path/a1-run/baseline
```

The command refuses to produce `COMPLETE` unless:

- target cluster/database identity is readable and this is a primary;
- every committed pre-A1 migration is successfully applied and A1 is the only
  pending committed migration;
- A1 tables, columns, constraints, indexes, types, and a successful A1 migration row
  are absent;
- the role can see all old data, RLS is absent, and no application connection exists.

The manifest contains only counts and SHA-256 fingerprints. Jira issue content, WBS
content, migration logs, and credentials never leave PostgreSQL.

Archive the complete baseline directory before running the migration. Do not edit it:
`COMPLETE` and `manifest.sha256` make tampering or partial copies fail closed.

## 4. Apply A1 once

Use the exact immutable image ID recorded above. Run only:

```text
prisma migrate deploy --schema /app/prisma/schema.prisma
```

Do not use `migrate dev`, `migrate reset`, `db push`, or `db execute`. Disable job
retry (`backoffLimit: 0`) and do not start an application container whose entrypoint
also runs migrations. Keep the service stopped after the command exits.

## 5. Capture and compare post-A1

```sh
npm run integrity:verify -- \
  /absolute/path/a1-run/baseline \
  /absolute/path/a1-run/post
```

The command first captures the post state and then compares:

- cluster system ID, timeline, database OID/name, address, server version,
  collation, postmaster start, role, image, commit, tooling, backup evidence, and
  migration hash;
- monotonically advancing server WAL LSN and a migration timestamp inside the
  server-time baseline/post window;
- row count and order-independent row hash for every pre-A1 table, using only the
  pre-A1 columns on the two tables extended by A1;
- state of every pre-A1 sequence;
- bidirectional normalized catalog inventory: relations and relfilenodes, columns,
  defaults, identity/generated flags, constraints and FK actions, indexes, triggers,
  policies, rules/views, enums, functions, extensions, default ACLs, owners, ACLs,
  comments, and relation options;
- exact A1 allowlist, empty new tables, NULL new columns, and exactly one successful
  `_prisma_migrations` row whose checksum matches the image.

Only the final `PASS:` line authorizes starting the application. `FAIL`, missing
output, a partial directory, a timeout, or any NULL/unknown evidence means: keep the
application stopped and preserve both directories.

## 6. Start and diagnose the first Jira import

After a migration-integrity PASS, restore application-role connectivity and start the
service. Jira remains strictly read-only: the importer may read Jira and write only to
this application's PostgreSQL database.

Run one controlled Jira import, then execute:

```sh
npm run integrity:a1 -- /absolute/path/a1-run/a1-after-first-sync.tsv
```

This diagnostic checks version shape, hydration completeness, relationships, the
typed current projection, structural attachment exclusion, retry state, and cursor
state without outputting payloads. Its structural `PASS` is not a lifetime
immutability certificate. The report deliberately contains:

- `NOT_CERTIFIED_CASCADE_DELETE` while project deletion can cascade into version
  history;
- `NOT_RUN_NO_PROCESSED_ISSUE_EVIDENCE` until full reconciliation reports which
  anchored Jira IDs it actually reprocessed;
- separate `NOT_CHECKED` statuses for Jira credential permissions and backup restore.

Those items require product/operations decisions outside this migration-integrity
gate and must not be presented as green checks.

## Failure handling

Never repair automatically and never start the application after a failed run.

If `migrate deploy` failed, first preserve database logs, `_prisma_migrations` evidence,
server timestamps, and LSN. A DBA then determines which branch applies:

- **Transaction rolled back and every A1 object is absent:** the DBA may explicitly
  run `prisma migrate resolve --rolled-back 20260821200000_jira_issue_history_a1`.
  This run remains `ABORTED`, not PASS. The rolled-back row becomes part of a newly
  captured baseline before a separate attempt.
- **Any A1 object exists, or the state is partial/unknown:** do not run `resolve`, do
  not drop objects, and do not retry. Preserve evidence and choose a reviewed
  forward-fix or restore/PITR procedure.

Before the first sync, a reviewed rollback may remove only verified-empty A1 objects.
After the first sync, dropping A1 objects would destroy history: use a forward fix or
the tested restore/PITR path. Full-cluster PITR also rolls back non-Jira business data
written after the restore point; the DBA must evaluate that RPO explicitly.
