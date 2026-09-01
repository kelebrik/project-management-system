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
  // The semantic v5 cutover intentionally removes unused analytics
  // definitions and dashboard presentation only; Jira datalake rows remain.
  "20260826190000_jira_semantic_aggregates_v5",
  // Marks only the untouched empty v5 dashboard configuration for one-time
  // bootstrap; Jira datalake and project-planning rows are not changed.
  "20260827090000_jira_default_analytics_widgets",
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

test("Jira labels history migration is additive and project-scoped through snapshots", () => {
  const migration = migrationSql("20260827180000_jira_issue_label_history");

  assert.match(migration, /CREATE\s+TABLE\s+"JiraIssueLabelChange"/i);
  assert.match(migration, /ALTER\s+TABLE\s+"JiraIssueSnapshot"[\s\S]*ADD\s+COLUMN\s+"labels"\s+TEXT\[\]/i);
  assert.match(migration, /CREATE\s+INDEX\s+"JiraIssueSnapshot_labels_idx"[\s\S]*USING\s+GIN/i);
  assert.match(migration, /REFERENCES\s+"JiraIssueSnapshot"\("id"\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(migration, /UNIQUE\s+INDEX\s+"JiraIssueLabelChange_snapshotId_changeKey_key"/i);
  assert.match(migration, /UPDATE\s+"JiraIssueSnapshot"[\s\S]*FROM\s+"JiraIssueVersion"/i);
  assert.match(migration, /snapshot\."projectionUnversionedSince"\s+IS\s+NULL/i);
  assert.doesNotMatch(migration, /\b(?:INSERT\s+INTO|DELETE\s+FROM|DROP|TRUNCATE)\b/i);
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

test("Jira aggregate dataset v3 migration is additive and preserves legacy query columns", () => {
  const migration = migrationSql("20260825143000_jira_aggregate_datasets_v3");
  assert.match(migration, /ADD COLUMN "definitionSchemaVersion"/);
  assert.match(migration, /ADD COLUMN "exposedFields" JSONB/);
  assert.match(migration, /ADD COLUMN "baseFilterLogic" TEXT/);
  assert.match(migration, /ADD COLUMN "baseFilters" JSONB/);
  assert.match(migration, /DROP INDEX IF EXISTS "JiraAggregateDefinition_projectId_fingerprint_key"/);
  assert.match(migration, /CREATE INDEX "JiraAggregateDefinition_projectId_fingerprint_idx"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /UPDATE\s+"JiraAggregateDefinition"/i);
});

test("Jira status interval aggregates add row configuration without rewriting data", () => {
  const migration = migrationSql("20260826130000_jira_status_interval_aggregates");
  assert.match(migration, /ADD COLUMN "rowConfig" JSONB/);
  assert.match(migration, /statusIntervals/);
  assert.match(migration, /JiraAggregateDefinition_rowConfig_check/);
  assert.match(migration, /reporter/);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /ALTER TABLE "JiraIssue(?:Version|Snapshot|HistoryRetry)"/i);
});

test("Jira goal issue source migration expands only the aggregate source constraint", () => {
  const migration = migrationSql("20260829130000_jira_goal_issue_source");

  assert.match(migration, /DROP\s+CONSTRAINT\s+"JiraAggregateDefinition_source_check"/i);
  assert.match(migration, /CHECK\s*\(\s*"source"\s+IN\s*\([^)]*'goalIssues'/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)/i);
});

test("GitLab branch commit migration is additive and project-scoped", () => {
  const migration = migrationSql("20260829160000_gitlab_branch_commits");

  assert.match(migration, /CREATE\s+TABLE\s+"GitlabBranchSyncRun"/i);
  assert.match(migration, /CREATE\s+TABLE\s+"GitlabBranchCommit"/i);
  assert.match(migration, /CHECK\s*\(\s*"jiraLinkState"\s+IN\s*\('linked',\s*'unlinked',\s*'undetermined'\)\s*\)/i);
  assert.match(migration, /CHECK\s*\(\s*"source"\s+IN\s*\([^)]*'gitlabCommits'/i);
  assert.match(migration, /GitlabBranchCommit_projectId_scopeKey_commitSha_key/i);
  assert.match(migration, /REFERENCES\s+"Project"\("id"\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(migration, /REFERENCES\s+"GitlabBranchSyncRun"\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/i);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    "",
  );
  assert.doesNotMatch(withoutForeignKeyActions, /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE)\b/i);
});

test("open issue inline register migration is additive and preserves existing questions", () => {
  const migration = migrationSql("20260831120000_open_issue_inline_table");
  assert.match(migration, /ALTER\s+TABLE\s+"Issue"/i);
  assert.match(migration, /ADD\s+COLUMN\s+"category"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'Без раздела'/i);
  assert.match(migration, /ADD\s+COLUMN\s+"referenceUrl"\s+TEXT/i);
  assert.match(migration, /ADD\s+COLUMN\s+"readiness"\s+"RagStatus"\s+NOT\s+NULL\s+DEFAULT\s+'RED'/i);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});

test("open issue phase work package migration is additive and keeps existing questions", () => {
  const migration = migrationSql("20260831180000_open_issue_phase_work_package");
  assert.match(migration, /ADD\s+COLUMN\s+"phaseId"\s+TEXT/i);
  assert.match(migration, /ADD\s+COLUMN\s+"workPackageId"\s+TEXT/i);
  assert.match(migration, /REFERENCES\s+"WbsItem"\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/i);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    "",
  );
  assert.doesNotMatch(withoutForeignKeyActions, /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});

test("open issue thread and risk migration is additive and keeps test links untouched", () => {
  const migration = migrationSql("20260901110000_open_issue_thread_links_and_risk");
  assert.match(migration, /CREATE\s+TABLE\s+"IssueThreadLink"/i);
  assert.match(migration, /ADD\s+COLUMN\s+"riskId"\s+TEXT/i);
  assert.match(migration, /REFERENCES\s+"Issue"\("id"\)\s+ON\s+DELETE\s+CASCADE/i);
  assert.match(migration, /REFERENCES\s+"RaidItem"\("id"\)\s+ON\s+DELETE\s+SET\s+NULL/i);
  const withoutForeignKeyActions = migration.replace(
    /ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION)/gi,
    "",
  );
  assert.doesNotMatch(
    withoutForeignKeyActions,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+(?:TABLE|COLUMN)|TRUNCATE)\b/i,
  );
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

test("Jira semantic v5 cutover removes only replaceable analytics configuration", () => {
  const migration = migrationSql("20260826190000_jira_semantic_aggregates_v5");

  assert.match(migration, /DELETE FROM "JiraAnalyticsDashboardConversion"/);
  assert.match(migration, /DELETE FROM "JiraAggregateDefinition"/);
  assert.doesNotMatch(migration, /DELETE FROM "JiraIssue(?:Snapshot|Version|StatusTransition|HistoryRetry)"/i);
  assert.doesNotMatch(migration, /DELETE FROM "JiraDevelopmentActivity"/i);
  assert.doesNotMatch(migration, /DELETE FROM "Project"/i);
});

test("default Jira widget migration only marks untouched empty dashboards for bootstrap", () => {
  const migration = migrationSql("20260827090000_jira_default_analytics_widgets");
  assert.match(migration, /UPDATE "JiraAnalyticsSettings"/u);
  assert.match(migration, /SET "dashboardConfig" = NULL/u);
  assert.doesNotMatch(migration, /DELETE FROM/iu);
  assert.doesNotMatch(migration, /JiraIssue(?:Snapshot|Version|StatusTransition)/iu);
});

test("default Jira widget seed version is additive and preserves dashboard data", () => {
  const migration = migrationSql("20260827093000_jira_default_widget_seed_version");
  assert.match(migration, /ADD COLUMN "semanticDefaultWidgetsVersion" INTEGER NOT NULL DEFAULT 0/u);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/iu);
  assert.doesNotMatch(migration, /JiraIssue(?:Snapshot|Version|StatusTransition)/iu);
});
