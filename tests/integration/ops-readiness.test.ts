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
  assert.match(dockerfile, /USER node/, "Runtime image must run as a non-root user");
  assert.match(dockerfile, /--chown=node:node/, "Runtime files must be owned by the non-root user");

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

test("Kubernetes manifest follows corporate restricted-pod policies", () => {
  const manifest = read("deploy/k8s/project-management-system.yaml");

  assert.match(manifest, /kind: Deployment/, "Application must be deployed by a controller, not a bare Pod");
  assert.doesNotMatch(manifest, /kind: Pod\b/, "Manifest must not define bare Pods");
  assert.match(manifest, /kind: ServiceAccount/, "Manifest must define a dedicated ServiceAccount");
  assert.match(manifest, /automountServiceAccountToken: false/, "ServiceAccount token automount must be disabled");
  assert.match(manifest, /runAsNonRoot: true/, "Pod/container must require non-root execution");
  assert.match(manifest, /runAsUser: 1000/, "Pod/container must set a non-root user");
  assert.match(manifest, /allowPrivilegeEscalation: false/, "Container must disable privilege escalation");
  assert.match(manifest, /capabilities:\s*\n\s*drop:\s*\n\s*- ALL/, "Container must drop Linux capabilities");
  assert.match(manifest, /seccompProfile:\s*\n\s*type: RuntimeDefault/, "Pod must use RuntimeDefault seccomp");
});

test("GitLab CI avoids restricted Kubernetes runner patterns", () => {
  const gitlabCi = read(".gitlab-ci.yml");
  const dockerfile = read("Dockerfile");

  assert.match(gitlabCi, /PMS_CI_NODE_IMAGE/, "CI must use a configurable corporate Node image");
  assert.match(gitlabCi, /PMS_CI_BUILDER_IMAGE/, "Container build must use a configurable corporate builder image");
  assert.match(gitlabCi, /kubernetes:\s*\n\s*user: "1000:1000"/, "CI jobs must request a non-root Kubernetes user");
  assert.match(gitlabCi, /CORPORATE_IMAGE_BUILD_COMMAND/, "Container build command must be supplied by corporate CI variables");
  assert.doesNotMatch(gitlabCi, /docker:dind|docker:\d+/, "CI must not require Docker-in-Docker or Docker Hub images");
  assert.doesNotMatch(gitlabCi, /^\s*services:/m, "CI must not create service pods in restricted clusters");
  assert.doesNotMatch(gitlabCi, /apt-get/, "CI job scripts must not require root package installation");

  assert.match(dockerfile, /ARG NODE_IMAGE/, "Docker build must allow replacing the base image with an approved registry image");
  assert.match(dockerfile, /FROM \$\{NODE_IMAGE\}/, "Docker stages must use the configurable base image");
});
