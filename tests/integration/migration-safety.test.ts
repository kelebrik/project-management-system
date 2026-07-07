import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, "prisma/migrations");
const migrationLockPath = path.join(migrationsDir, "migration_lock.toml");

const allowedDataRewriteMigrations = new Set([
  "20260513183000_import_test001_project_plan",
  "20260514093000_wbs_excel_fields",
  "20260518110000_restore_cvte_structure_from_excel",
  "20260609180000_jira_work_sections_three_defaults",
  "20260703130000_remove_admin_jira_settings",
  "20260703165000_remove_admin_import_permission",
]);

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

test("Historical Excel migrations keep numeric casts explicit", () => {
  const excelMigration = migrationSql("20260514093000_wbs_excel_fields");
  const restoreMigration = migrationSql("20260518110000_restore_cvte_structure_from_excel");

  assert.match(
    excelMigration,
    /"calendarDays"\s*=\s*excel_data\."calendarDays"::integer/,
    "Excel import migration must cast calendarDays to integer on update",
  );
  assert.doesNotMatch(
    excelMigration,
    /"calendarDays"\s*=\s*excel_data\."calendarDays"\s*,/,
    "Excel import migration must not assign text calendarDays directly",
  );
  assert.match(
    restoreMigration,
    /NULL::timestamp,\s*NULL::timestamp,\s*\d+::integer,\s*\d+::integer/,
    "Restore migration should preserve typed date placeholders before explicitly typed integer day fields",
  );
});
