import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function read(filePath: string) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("Docker runtime packages API, Web UI, migrations, and readiness probe", () => {
  const dockerfile = read("Dockerfile");
  const compose = read("docker-compose.yml");

  assert.match(dockerfile, /npm run prisma:generate/, "Docker build must generate Prisma client");
  assert.match(dockerfile, /npm run build/, "Docker build must compile workspaces");
  assert.match(dockerfile, /apps\/web\/dist/, "Runtime image must include built Web UI");
  assert.match(dockerfile, /EXPOSE 3000/, "Runtime image must expose application port");
  assert.match(dockerfile, /npm run prisma:deploy/, "Container start must deploy migrations");
  assert.match(dockerfile, /npm run start --workspace @pms\/api/, "Container start must run the API");

  assert.match(compose, /^\s+app:/m, "docker-compose must define app service");
  assert.match(compose, /^\s+postgres:/m, "docker-compose must define postgres service");
  assert.match(compose, /DATABASE_URL:\s*postgresql:\/\/pms_user:pms_password@postgres:5432/, "app must use postgres service DATABASE_URL");
  assert.match(compose, /\/api\/ready/, "app healthcheck must call readiness endpoint");
  assert.match(compose, /^\s+backup:/m, "docker-compose must define backup ops profile");
  assert.match(compose, /^\s+restore:/m, "docker-compose must define restore ops profile");
});

test("Operations shell scripts are syntactically valid", () => {
  const scripts = [
    "scripts/backup-db.sh",
    "scripts/restore-db.sh",
    "scripts/migration-dry-run.sh",
    "scripts/restore-drill.sh",
    "scripts/security-smoke.sh",
    "scripts/performance-smoke.sh",
  ];

  for (const script of scripts) {
    execFileSync("sh", ["-n", path.join(repoRoot, script)], { stdio: "pipe" });
  }
});

test("Backup and restore scripts enforce production safety checks", () => {
  const backup = read("scripts/backup-db.sh");
  const restore = read("scripts/restore-db.sh");
  const drill = read("scripts/restore-drill.sh");

  assert.match(backup, /pg_dump[\s\S]+--format=custom/, "Backup must use pg_dump custom format");
  assert.match(backup, /sha256(sum| utility)|shasum -a 256/, "Backup must create checksum when possible");
  assert.match(backup, /BACKUP_RETENTION_DAYS/, "Backup must support retention");

  assert.match(restore, /RESTORE_CONFIRM:-/, "Restore must require an explicit confirmation flag");
  assert.match(restore, /RESTORE_CONFIRM:-.*!= "yes"/, "Restore must refuse unsafe default execution");
  assert.match(restore, /sha256sum -c|shasum -a 256/, "Restore must verify checksum when present");
  assert.match(restore, /pg_restore[\s\S]+--clean[\s\S]+--if-exists/, "Restore must replace existing schema objects safely");

  assert.match(drill, /RESTORE_DRILL_DATABASE_URL/, "Restore drill must target a separate database");
  assert.match(drill, /npx prisma migrate deploy/, "Restore drill must validate migrations after restore");
});

test("Smoke scripts cover security, performance, and migration checks", () => {
  const security = read("scripts/security-smoke.sh");
  const performance = read("scripts/performance-smoke.sh");
  const migration = read("scripts/migration-dry-run.sh");

  assert.match(security, /GET \/api\/projects/, "Security smoke must verify public read-only projects");
  assert.match(security, /GET \/api\/openapi\.json/, "Security smoke must verify OpenAPI availability");
  assert.match(security, /GET \/api\/ready/, "Security smoke must verify readiness");
  assert.match(security, /POST \/api\/projects without auth/, "Security smoke must verify write protection");

  assert.match(performance, /PERF_REQUESTS/, "Performance smoke must support configurable request count");
  assert.match(performance, /PERF_MAX_AVG_MS/, "Performance smoke must enforce configurable latency budget");
  assert.match(performance, /\/api\/ready/, "Performance smoke must measure a stable readiness endpoint");

  assert.match(migration, /prisma migrate diff/, "Migration dry-run must produce Prisma schema diff");
  assert.match(migration, /MIGRATION_DRY_RUN_OUTPUT/, "Migration dry-run output must be configurable");
});
