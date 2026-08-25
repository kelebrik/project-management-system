import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, "prisma/migrations");
const migrationLockPath = path.join(migrationsDir, "migration_lock.toml");

const allowedDataRewriteMigrations = new Set([
  "20260609180000_jira_work_sections_three_defaults",
  "20260703130000_remove_admin_jira_settings",
  "20260703165000_remove_admin_import_permission",
]);

const protectedProjectTables = [
  "Project",
  "WbsItem",
  "WbsDependency",
  "Milestone",
  "WbsCommand",
  "WbsBaseline",
  "WbsBaselineItem",
];

function protectedDeletePattern(table: string) {
  return new RegExp(
    `\\bDELETE\\s+FROM\\s+(?:"?public"?\\s*\\.\\s*)?"${table}"(?=\\s|;|$)`,
    "i",
  );
}

const destructivePatterns = [
  { label: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { label: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { label: "TRUNCATE", pattern: /\bTRUNCATE\b/i },
  { label: "DROP TYPE", pattern: /\bDROP\s+TYPE\b/i },
  { label: "DROP SCHEMA", pattern: /\bDROP\s+SCHEMA\b/i },
  { label: "ALTER TYPE DROP VALUE", pattern: /\bALTER\s+TYPE\b[\s\S]*\bDROP\s+VALUE\b/i },
];

function migrationNames() {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string) {
  return fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
}

test("Prisma migrations are present, ordered, and locked to PostgreSQL", () => {
  const names = migrationNames();

  assert.ok(names.length > 0, "Expected at least one Prisma migration");
  assert.deepEqual(names, [...names].sort(), "Migration directory names must be lexicographically ordered");
  for (const name of names) {
    assert.match(name, /^\d{14}_[a-z0-9_]+$/, `Unexpected migration name format: ${name}`);
    assert.ok(
      fs.existsSync(path.join(migrationsDir, name, "migration.sql")),
      `Migration ${name} must contain migration.sql`,
    );
  }

  const lockFile = fs.readFileSync(migrationLockPath, "utf8");
  assert.match(lockFile, /provider\s*=\s*"postgresql"/, "Migration lock must use PostgreSQL provider");
});

test("Migrations avoid destructive operations outside explicit historical data imports", () => {
  const violations: string[] = [];

  for (const name of migrationNames()) {
    const sql = migrationSql(name);

    for (const { label, pattern } of destructivePatterns) {
      if (pattern.test(sql)) {
        violations.push(`${name}: ${label}`);
      }
    }

    if (/\bDELETE\s+FROM\b/i.test(sql) && !allowedDataRewriteMigrations.has(name)) {
      violations.push(`${name}: DELETE FROM without allow-list`);
    }
  }

  assert.deepEqual(violations, [], `Unsafe migration operations found:\n${violations.join("\n")}`);
});

test("Migrations never delete live project planning data", () => {
  const violations: string[] = [];

  assert.match('DELETE FROM "WbsItem"\nWHERE "projectId" = 1;', protectedDeletePattern("WbsItem"));
  assert.match(
    'DELETE FROM public."WbsDependency" WHERE true;',
    protectedDeletePattern("WbsDependency"),
  );

  for (const name of migrationNames()) {
    const sql = migrationSql(name);
    for (const table of protectedProjectTables) {
      if (protectedDeletePattern(table).test(sql)) {
        violations.push(`${name}: DELETE FROM ${table}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Migrations must not rewrite live project planning data:\n${violations.join("\n")}`,
  );
});

test("Jira filter URL migration preserves existing section data", () => {
  const migration = migrationSql("20260717100000_jira_work_section_filter_url");

  assert.match(
    migration,
    /ADD\s+COLUMN\s+"filterUrl"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+''/i,
  );
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});

test("WBS Excel fields migration changes schema without rewriting project data", () => {
  const excelMigration = migrationSql("20260514093000_wbs_excel_fields_schema_only");

  assert.match(
    excelMigration,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"calendarDays"\s+INTEGER/i,
    "Excel planning fields must remain available on a fresh database",
  );
  assert.doesNotMatch(
    excelMigration,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i,
    "Schema migration must not rewrite project data",
  );
});

test("Jira history A1 migration is additive and keeps existing snapshots intact", () => {
  const migration = migrationSql("20260821200000_jira_issue_history_a1");

  assert.match(migration, /CREATE TABLE "JiraIssueVersion"/);
  assert.match(migration, /CREATE TABLE "JiraIssueHistoryRetry"/);
  assert.match(migration, /ADD COLUMN "currentVersionId" TEXT/);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    '',
  );
  assert.doesNotMatch(withoutForeignKeyActions, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});

test("Jira analytics A2 migration is DDL-only and leaves A1 history untouched", () => {
  const migration = migrationSql("20260822200000_jira_aggregate_definitions_a2");

  assert.match(migration, /CREATE TABLE "JiraAggregateDefinition"/);
  assert.match(migration, /CREATE TABLE "JiraAnalyticsDashboardConversion"/);
  assert.match(migration, /JiraAggregateDefinition_projectId_fingerprint_key/);
  assert.match(migration, /JiraAnalyticsDashboardConversion_projectId_key/);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    '',
  );
  assert.doesNotMatch(
    withoutForeignKeyActions,
    /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "JiraIssue(?:Version|Snapshot|HistoryRetry)"/i);
});

test("Jira analytics C1 as-of reconstruction adds no database migration", () => {
  const c1Migrations = migrationNames().filter((name) =>
    /jira.*(?:asof|as_of|reconstruct)|(?:asof|as_of).*jira/i.test(name),
  );
  assert.deepEqual(c1Migrations, []);
});

test("Jira aggregate revisions are additive and backfill immutable definitions", () => {
  const migration = migrationSql("20260825090000_jira_aggregate_definition_revisions");
  assert.match(migration, /CREATE TABLE "JiraAggregateDefinitionRevision"/);
  assert.match(migration, /INSERT INTO "JiraAggregateDefinitionRevision"/);
  assert.match(migration, /FROM "JiraAggregateDefinition"/);
  assert.match(migration, /JiraAggregateDefinitionRevision_aggregateId_version_key/);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    "",
  );
  assert.doesNotMatch(withoutForeignKeyActions, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE "JiraIssue(?:Version|Snapshot|HistoryRetry)"/i);
});

test("Durable Jira runs migration is additive and leaves existing history rows untouched", () => {
  const migration = migrationSql("20260823180000_jira_sync_runs_backfill");
  assert.match(migration, /CREATE TABLE "JiraSyncRun"/);
  assert.match(migration, /ADD COLUMN "syncRunId" TEXT/);
  assert.match(migration, /ADD COLUMN "projectionUnversionedSince" TIMESTAMP\(3\)/);
  assert.match(migration, /JiraIssueVersion_projectId_syncRunId_idx/);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    "",
  );
  assert.doesNotMatch(withoutForeignKeyActions, /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});
