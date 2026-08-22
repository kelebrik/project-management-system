import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function read(filePath: string) {
  return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
}

test("Docker runtime packages API, Web UI, startup migrations, and readiness probe", () => {
  const dockerfile = read("Dockerfile");
  const runtimeDockerfile = dockerfile.split("FROM ${NODE_IMAGE} AS runtime")[1] ?? "";
  const compose = read("docker-compose.yml");

  assert.match(dockerfile, /(npm|scripts\/ci-npm\.sh) run prisma:generate/, "Docker build must generate Prisma client");
  assert.match(dockerfile, /docker-prisma-engines\.sh/, "Docker build must bootstrap Prisma engines during image build");
  assert.match(dockerfile, /PRISMA_ENGINES_BASE_URL=/, "Docker build must download Prisma engines from the internal package registry");
  assert.match(dockerfile, /ARG CI_JOB_TOKEN/, "Docker build must accept CI_JOB_TOKEN for authenticated engine downloads");
  assert.match(dockerfile, /debian-openssl-3\.0\.x/, "Docker build must target Debian Bookworm OpenSSL 3 engines");
  assert.match(dockerfile, /PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1/, "Docker build must skip prisma.sh checksum verification in isolated environments");
  assert.match(dockerfile, /ARG NPM_VERSION=11\.18\.0/, "Docker build must pin npm with fixed bundled sigstore");
  assert.match(dockerfile, /npm install -g --ignore-scripts "npm@\$\{NPM_VERSION\}"/, "Docker build must pin npm in the build stage");
  assert.match(dockerfile, /(npm|scripts\/ci-npm\.sh) ci --include=dev --ignore-scripts|scripts\/ci-install\.sh/, "Docker build must install npm packages without prisma.sh postinstall downloads");
  assert.match(dockerfile, /(npm|scripts\/ci-npm\.sh) run build/, "Docker build must compile workspaces");
  assert.match(dockerfile, /apps\/web\/dist/, "Runtime image must include built Web UI");
  assert.match(dockerfile, /EXPOSE 3000/, "Runtime image must expose application port");
  assert.match(dockerfile, /docker-entrypoint\.sh/, "Runtime image must ship a startup entrypoint");
  assert.match(dockerfile, /ENTRYPOINT \["\/app\/docker-entrypoint\.sh"\]/, "Container start must run through the migration entrypoint");
  assert.match(read("scripts/docker-entrypoint.sh"), /node \/app\/node_modules\/prisma\/build\/index\.js migrate deploy/, "Startup entrypoint must deploy migrations without npm");
  assert.doesNotMatch(runtimeDockerfile, /npm install -g/, "Runtime stage must not install npm");
  assert.match(runtimeDockerfile, /rm -rf \/usr\/local\/lib\/node_modules\/npm/, "Runtime image must remove the global npm toolchain");
  assert.match(runtimeDockerfile, /CMD \["node", "apps\/api\/dist\/server\.js"\]/, "Container start must run the API directly with Node.js");
  assert.match(dockerfile, /USER node/, "Runtime image must run as a non-root user");
  assert.match(dockerfile, /--chown=node:node/, "Runtime files must be owned by the non-root user");

  assert.match(compose, /^\s+app:/m, "docker-compose must define app service");
  assert.doesNotMatch(compose, /^\s+migrate:/m, "docker-compose must not define a separate migration service");
  assert.match(compose, /^\s+postgres:/m, "docker-compose must define postgres service");
  assert.match(compose, /env_file:\s*\n\s*- \.env/, "app must load runtime settings from .env");
  assert.match(compose, /DATABASE_URL: \$\{DATABASE_URL:\?Set DATABASE_URL in \.env\}/, "app must take DATABASE_URL from .env");
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
    "scripts/db-integrity-common.sh",
    "scripts/db-integrity-capture.sh",
    "scripts/db-integrity-verify.sh",
    "scripts/jira-history-a1-diagnostics.sh",
    "scripts/test-jira-history-postgres.sh",
    "scripts/security-smoke.sh",
    "scripts/performance-smoke.sh",
    "scripts/docker-prisma-engines.sh",
    "scripts/docker-entrypoint.sh",
    "scripts/ci-prisma-setup.sh",
    "scripts/ci-prisma-generate.sh",
    "scripts/ci-prisma-env.sh",
  ];

  for (const script of scripts) {
    execFileSync("sh", ["-n", path.join(repoRoot, script)], { stdio: "pipe" });
  }

  execFileSync(process.execPath, ["--check", path.join(repoRoot, "scripts/db-integrity-psql.mjs")], {
    stdio: "pipe",
  });
});

test("Jira history PostgreSQL race gate is explicit and fail-closed", () => {
  const packageJson = read("package.json");
  const gate = read("scripts/test-jira-history-postgres.sh");
  const contract = read("docs/jira-analytics-stage-1a.md");

  assert.match(packageJson, /"test:history:postgres": "scripts\/test-jira-history-postgres\.sh"/);
  assert.match(gate, /JIRA_HISTORY_TEST_DATABASE_URL is required/);
  assert.match(gate, /databaseName[\s\S]*\/test\/i/);
  assert.match(gate, /prisma migrate deploy/);
  assert.match(gate, /jira-history-race\.test\.ts/);
  assert.match(contract, /npm run test:history:postgres/);
  assert.match(contract, /skipped result does not satisfy[\s\S]*pre-merge gate/);
});

test("A1 production integrity tooling is read-only and fail-closed", () => {
  const common = read("scripts/db-integrity-common.sh");
  const capture = read("scripts/db-integrity-capture.sh");
  const verify = read("scripts/db-integrity-verify.sh");
  const diagnostics = read("scripts/jira-history-a1-diagnostics.sh");

  assert.match(common, /default_transaction_read_only=on/);
  assert.match(capture, /REPEATABLE READ READ ONLY/);
  assert.match(capture, /pg_control_system\(\)/);
  assert.match(capture, /pg_current_wal_lsn\(\)/);
  assert.match(capture, /has_column_privilege/);
  assert.match(capture, /pg_stat_activity/);
  assert.match(capture, /pg_stat_clear_snapshot/);
  assert.match(capture, /SELECT 1 \/ 0/);
  assert.doesNotMatch(capture, /\\{2}quit\s+\d+/);
  assert.match(capture, /has_function_privilege/);
  assert.match(capture, /DB_INTEGRITY_BACKUP_EVIDENCE_FILE/);
  assert.match(capture, /DB_INTEGRITY_IMAGE_MIGRATION_SHA256/);
  assert.match(capture, /A1_CHECK/);
  assert.match(verify, /db-integrity-compare\.mjs/);
  assert.match(diagnostics, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(diagnostics, /SELECT 1 \/ 0/);
  assert.match(diagnostics, /NOT_CERTIFIED_CASCADE_DELETE/);
  assert.match(common, /db-integrity-psql\.mjs/);
  assert.doesNotMatch(common, /psql[^\n]*"\$DATABASE_URL"/);
  assert.doesNotMatch(`${common}\n${capture}\n${verify}\n${diagnostics}`, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|TABLE)\b/i);
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
  assert.match(
    drill,
    /RESTORE_DRILL_DATABASE_URL" = "\$DATABASE_URL/,
    "Restore drill must reject the production database as its target",
  );
  assert.match(drill, /npx prisma migrate deploy/, "Restore drill must validate migrations after restore");
  assert.match(drill, /npx prisma migrate diff/, "Restore drill must verify the restored schema");
  assert.match(drill, /--exit-code/, "Restore drill must fail when the restored schema differs");
  assert.doesNotMatch(drill, /prisma migrate status/, "Restore drill must tolerate retired data migrations");
});

test("Smoke scripts cover security, performance, and migration checks", () => {
  const security = read("scripts/security-smoke.sh");
  const performance = read("scripts/performance-smoke.sh");
  const migration = read("scripts/migration-dry-run.sh");

  assert.match(security, /GET \/api\/projects without auth/, "Security smoke must verify read protection");
  assert.match(security, /GET \/api\/openapi\.json/, "Security smoke must verify OpenAPI availability");
  assert.match(security, /GET \/api\/ready/, "Security smoke must verify readiness");
  assert.match(security, /POST \/api\/projects without auth/, "Security smoke must verify write protection");

  assert.match(performance, /PERF_REQUESTS/, "Performance smoke must support configurable request count");
  assert.match(performance, /PERF_MAX_AVG_MS/, "Performance smoke must enforce configurable latency budget");
  assert.match(performance, /\/api\/ready/, "Performance smoke must measure a stable readiness endpoint");

  assert.match(migration, /prisma migrate diff/, "Migration dry-run must produce Prisma schema diff");
  assert.match(migration, /MIGRATION_DRY_RUN_OUTPUT/, "Migration dry-run output must be configurable");
  assert.doesNotMatch(migration, /prisma migrate status/, "Migration dry-run must tolerate retired data migrations");
});

test("Kubernetes manifest follows corporate restricted-pod policies", () => {
  const manifest = read("deploy/k8s/project-management-system.yaml");
  const migrateJob = read("deploy/k8s/project-management-system-migrate-job.yaml");
  const combinedManifest = `${manifest}\n${migrateJob}`;

  assert.match(migrateJob, /kind: Job/, "Kubernetes deployment must provide a one-shot migration Job");
  assert.match(migrateJob, /command: \["node", "\/app\/node_modules\/prisma\/build\/index\.js", "migrate", "deploy"\]/, "Migration Job must run Prisma without npm");
  assert.match(manifest, /kind: Deployment/, "Application must be deployed by a controller, not a bare Pod");
  assert.doesNotMatch(combinedManifest, /kind: Pod\b/, "Manifest must not define bare Pods");
  assert.match(combinedManifest, /kind: ServiceAccount/, "Manifest must define a dedicated ServiceAccount");
  assert.match(combinedManifest, /automountServiceAccountToken: false/, "ServiceAccount token automount must be disabled");
  assert.match(combinedManifest, /runAsNonRoot: true/, "Pod/container must require non-root execution");
  assert.match(combinedManifest, /runAsUser: 1000/, "Pod/container must set a non-root user");
  assert.match(combinedManifest, /allowPrivilegeEscalation: false/, "Container must disable privilege escalation");
  assert.match(combinedManifest, /capabilities:\s*\n\s*drop:\s*\n\s*- ALL/, "Container must drop Linux capabilities");
  assert.match(combinedManifest, /seccompProfile:\s*\n\s*type: RuntimeDefault/, "Pod must use RuntimeDefault seccomp");
});

test("GitLab CI avoids restricted Kubernetes runner patterns", () => {
  const gitlabCi = read(".gitlab-ci.yml");
  const dockerfile = read("Dockerfile");
  const gitignore = read(".gitignore");
  const ciInstall = read("scripts/ci-install.sh");
  const ciNpm = read("scripts/ci-npm.sh");
  const ciNpmEnv = read("scripts/ci-npm-env.sh");
  const ciPrismaEnv = read("scripts/ci-prisma-env.sh");
  const ciPrismaGenerate = read("scripts/ci-prisma-generate.sh");

  assert.match(
    gitlabCi,
    /(?:harbor\.sberdevices\.ru\/proxy\/node:|docker\.sberdevices\.ru\/skopeo\/docker\.io\/node:)/,
    "CI must use an approved internal Node image",
  );
  assert.match(
    gitlabCi,
    /\.rule_mr_to_master:[\s\S]*CI_PIPELINE_SOURCE == "merge_request_event"[\s\S]*CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "master"/,
    "CI must define merge-request-to-master rules for validation and test jobs",
  );
  assert.match(gitlabCi, /\.mr_to_master:[\s\S]*\*rule_mr_to_master/, "CI must define merge-request-to-master rules for validation and test jobs");
  assert.doesNotMatch(gitlabCi, /^\s*DATABASE_URL:/m, "CI must not define a runtime database URL in global variables");
  assert.match(ciPrismaGenerate, /DATABASE_URL="\$\{DATABASE_URL:-postgresql:\/\/ci:ci@127\.0\.0\.1:5432\/ci\?schema=public\}"/, "CI prisma generate must use a local stub DATABASE_URL when none is provided");
  assert.match(gitlabCi, /\.node_job:[\s\S]*ci-prisma-setup\.sh bootstrap[\s\S]*ci-prisma-generate\.sh/, "CI node jobs must bootstrap Prisma engines before npm install and run an isolated prisma generate");
  assert.match(ciPrismaEnv, /PRISMA_SCHEMA_ENGINE_BINARY=/, "CI Prisma env must point the CLI to the internal schema engine binary");
  assert.match(ciPrismaEnv, /PRISMA_QUERY_ENGINE_LIBRARY=/, "CI Prisma env must point the client to the internal query engine library");
  assert.match(gitlabCi, /static-policy-check:[\s\S]*extends: \.node_job/, "static-policy-check must run on merge requests to master");
  assert.match(gitlabCi, /typecheck:[\s\S]*extends: \.node_job/, "typecheck must run on merge requests to master");
  assert.match(gitlabCi, /unit-tests:[\s\S]*extends: \.node_job/, "unit-tests must run on merge requests to master");
  assert.match(gitlabCi, /integration-contracts:[\s\S]*extends: \.node_job/, "integration-contracts must run on merge requests to master");
  assert.match(gitlabCi, /\.node_job:[\s\S]*stage: check/, "validation and test jobs must run in the same parallel check stage");
  assert.match(gitlabCi, /build_image:[\s\S]*extends: \.master_pipeline/, "build_image must run on merge requests to master and push to master");
  assert.match(gitlabCi, /build_image:[\s\S]*--build-arg CI_JOB_TOKEN="\$\{CI_JOB_TOKEN\}"/, "build_image must pass CI_JOB_TOKEN into the Docker build");
  assert.doesNotMatch(gitlabCi, /name:\s*"node:/, "CI must not default to public Docker Hub Node images");
  assert.match(gitlabCi, /PRISMA_ENGINES_BASE_URL:/, "CI must configure an internal Prisma engines package URL");
  assert.match(gitlabCi, /PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING:/, "CI must skip prisma.sh checksum verification in isolated environments");
  assert.match(gitlabCi, /PMS_CI_NPM_VERSION:\s*"11\.18\.0"/, "CI must pin a known-good npm version");
  assert.match(gitlabCi, /key:[\s\S]*files:[\s\S]*package-lock\.json[\s\S]*\.gitlab-ci\.yml/, "CI npm cache key must include CI config so pinned toolchain changes invalidate cached npm CLI tarballs");
  assert.match(gitlabCi, /--build-arg NPM_VERSION="\$\{PMS_CI_NPM_VERSION\}"/, "Image build must use the same fixed npm version as CI");
  assert.match(gitlabCi, /NPM_CONFIG_CACHE:\s*"\/tmp\/pms-npm-cache"/, "CI must use an isolated npm cache outside the workspace");
  assert.match(gitlabCi, /build_image:[\s\S]*registry\.sberdevices\.ru/, "Container build must use an approved internal builder image");
  assert.match(gitlabCi, /kubernetes:\s*\n\s*user: "1000:1000"/, "CI jobs must request a non-root Kubernetes user");
  assert.match(gitlabCi, /scripts\/ci-install\.sh/, "CI must use the resilient npm install wrapper");
  assert.match(gitlabCi, /scripts\/ci-npm\.sh --version/, "CI must report the pinned npm version");
  assert.match(gitlabCi, /scripts\/ci-npm\.sh run/, "CI must run package scripts through the pinned npm wrapper");
  assert.match(gitlabCi, /reports:\s*\n\s*junit:/, "CI must publish JUnit test reports for merge requests");
  assert.match(gitlabCi, /coverage_report:\s*\n\s*coverage_format: cobertura/, "CI must publish Cobertura coverage for merge requests");
  assert.match(gitlabCi, /coverage:\s*'\/Lines\\s\*:\\s\*\(\[\\d\\\.\]\+\)%\/'/, "CI must extract line coverage percentage for merge requests");
  assert.doesNotMatch(gitlabCi, /docker:dind|docker:\d+/, "CI must not require Docker-in-Docker or Docker Hub images");
  assert.doesNotMatch(gitlabCi, /^\s*services:/m, "CI must not create service pods in restricted clusters");
  assert.doesNotMatch(gitlabCi, /apt-get/, "CI job scripts must not require root package installation");
  assert.doesNotMatch(gitlabCi, /prefer-offline/, "CI must not force npm prefer-offline in empty/unstable runner caches");
  assert.match(ciInstall, /scripts\/ci-npm\.sh ci --include=dev/, "CI install wrapper must run npm ci with dev dependencies through pinned npm");
  assert.match(ciInstall, /scripts\/ci-npm\.sh cache clean --force/, "CI install wrapper must retry after clearing npm cache");
  assert.doesNotMatch(ciInstall, /prefer-offline/, "CI install wrapper must not force npm prefer-offline");
  assert.match(ciNpm, /ci-npm-env\.sh/, "CI npm wrapper must load shared npm registry settings");
  assert.match(ciNpmEnv, /nexus\.sberdevices\.ru\/repository\/npm/, "CI npm wrapper must default to the corporate Nexus npm registry");
  assert.match(ciNpmEnv, /NPM_CONFIG_REPLACE_REGISTRY_HOST=npmjs/, "CI npm wrapper must redirect portable npmjs lock URLs through Nexus");
  assert.doesNotMatch(ciNpm, /registry\.npmjs\.org/, "CI npm wrapper must not default to public npmjs registry");
  assert.match(ciInstall, /ci-npm-env\.sh/, "CI install wrapper must load shared npm registry settings");
  assert.match(ciNpm, /npm-\$VERSION\.tgz/, "CI npm wrapper must bootstrap npm from a tarball");
  assert.match(ciNpm, /falling back to bundled npm/, "CI npm wrapper may use bundled npm when the npm tarball mirror is unavailable");
  assert.match(ciNpm, /sigstore >=4\.1\.1/, "CI npm fallback must reject vulnerable bundled sigstore");
  assert.match(ciNpm, /require\("node:https"\)/, "CI npm wrapper must have a Node.js download fallback when curl/wget are unavailable");
  assert.match(gitignore, /^\.npm$/m, "Local npm cache must not be committed");

  assert.match(dockerfile, /ARG NODE_IMAGE/, "Docker build must allow replacing the base image with an approved registry image");
  assert.match(dockerfile, /FROM \$\{NODE_IMAGE\}/, "Docker stages must use the configurable base image");
});

test("package lock remains portable outside the corporate network", () => {
  const packageLock = read("package-lock.json");

  assert.doesNotMatch(
    packageLock,
    /nexus\.sberdevices\.ru\/repository\/npm/,
    "package-lock.json must not pin package downloads to the corporate Nexus",
  );
  assert.match(
    packageLock,
    /https:\/\/registry\.npmjs\.org\//,
    "package-lock.json must use the portable public npm registry host",
  );
});
