import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const comparator = path.join(repoRoot, 'scripts/db-integrity-compare.mjs');
const psqlWrapper = path.join(repoRoot, 'scripts/db-integrity-psql.mjs');
const a1Migration = '20260821200000_jira_issue_history_a1';
const hash = 'a'.repeat(64);

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function records(phase: 'baseline' | 'post') {
  const timestamp = phase === 'baseline' ? '2026-08-22 08:00:00+00' : '2026-08-22 08:05:00+00';
  const lsn = phase === 'baseline' ? '1000' : '2000';
  const meta = {
    capture_phase: phase,
    system_identifier: '7654321',
    timeline_id: '1',
    database_name: 'tv_management',
    database_oid: '16384',
    server_address: 'local-socket',
    server_port: 'local-socket',
    server_version_num: '170010',
    server_encoding: 'UTF8',
    datcollate: 'C.UTF-8',
    datctype: 'C.UTF-8',
    datcollversion: '',
    postmaster_started_at: '2026-08-22 07:00:00+00',
    server_timestamp: timestamp,
    wal_lsn_bytes: lsn,
    current_role: 'integrity_reader',
  };
  const evidence = {
    tool_sha256: hash,
    migration_sha256: hash,
    image_migration_sha256: hash,
    image_id: 'sha256:immutable-image',
    git_commit: 'deadbeef',
    backup_evidence_sha256: 'b'.repeat(64),
    allowed_roles: 'postgres_exporter',
  };
  const lines = [
    ...Object.entries(meta).map(([key, value]) => `META\t${key}\t${value}`),
    'TABLE\tpublic\tProject\t7\tproject-table-hash',
    'TABLE\tpublic\t_prisma_migrations\t42\tmigration-table-hash',
    'SEQUENCE\tpublic\tExample_id_seq\t12\ttrue',
    'CATALOG\trelation\tpublic.Project\trelation-hash',
    'CATALOG\tcolumn\tpublic.Project.id\tcolumn-hash',
    ...[
      'new_tables',
      'new_table_rows',
      'new_columns_null',
      'expected_columns',
      'expected_types',
      'expected_constraints',
      'expected_indexes',
    ].map((key) => `A1_CHECK\t${key}\ttrue`),
  ];
  if (phase === 'post') {
    lines.push(
      `A1_MIGRATION\tmigration-id\t${hash}\t2026-08-22 08:01:00+00\t2026-08-22 08:02:00+00\t1\t\ttrue\t${a1Migration}`,
    );
  }
  lines.push(...Object.entries(evidence).map(([key, value]) => `EVIDENCE\t${key}\t${value}`));
  return lines;
}

function writeManifest(directory: string, lines: string[], complete = true) {
  fs.mkdirSync(directory, { recursive: true });
  const body = `${lines.join('\n')}\n`;
  fs.writeFileSync(path.join(directory, 'manifest.tsv'), body);
  const digest = sha256(body);
  fs.writeFileSync(path.join(directory, 'manifest.sha256'), `${digest}  manifest.tsv\n`);
  if (complete) fs.writeFileSync(path.join(directory, 'COMPLETE'), `complete\t${digest}\n`);
}

function compare(baseline: string, post: string) {
  return spawnSync(process.execPath, [comparator, baseline, post], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('A1 comparator accepts unchanged old data and the exact A1 delta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pms-integrity-pass-'));
  try {
    const baseline = path.join(root, 'baseline');
    const post = path.join(root, 'post');
    writeManifest(baseline, records('baseline'));
    writeManifest(post, records('post'));
    const result = compare(baseline, post);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^PASS:/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A1 comparator rejects a changed pre-existing row hash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pms-integrity-data-'));
  try {
    const baseline = path.join(root, 'baseline');
    const post = path.join(root, 'post');
    writeManifest(baseline, records('baseline'));
    writeManifest(post, records('post').map((line) =>
      line.startsWith('TABLE\tpublic\tProject\t')
        ? 'TABLE\tpublic\tProject\t7\tdifferent-hash'
        : line));
    const result = compare(baseline, post);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pre-existing TABLE object changed: public\.Project/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A1 comparator rejects missing and unexpected catalog objects', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pms-integrity-catalog-'));
  try {
    const baseline = path.join(root, 'baseline');
    const post = path.join(root, 'post');
    writeManifest(baseline, records('baseline'));
    writeManifest(post, [
      ...records('post').filter((line) => !line.startsWith('CATALOG\tcolumn\tpublic.Project.id')),
      'CATALOG\ttrigger\tpublic.Project.unexpected\ttrigger-hash',
    ]);
    const result = compare(baseline, post);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /disappeared|unexpected/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A1 comparator rejects incomplete or tampered manifests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pms-integrity-incomplete-'));
  try {
    const baseline = path.join(root, 'baseline');
    const post = path.join(root, 'post');
    writeManifest(baseline, records('baseline'), false);
    writeManifest(post, records('post'));
    const incomplete = compare(baseline, post);
    assert.equal(incomplete.status, 1);
    assert.match(incomplete.stderr, /incomplete manifest/);

    fs.writeFileSync(path.join(baseline, 'COMPLETE'), `complete\t${'0'.repeat(64)}\n`);
    const tampered = compare(baseline, post);
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /checksum mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('A1 comparator rejects target identity, WAL, and migration evidence regressions', async (t) => {
  const cases: Array<{
    name: string;
    mutate: (lines: string[]) => string[];
    error: RegExp;
  }> = [
    {
      name: 'cluster system identifier changed',
      mutate: (lines) => lines.map((line) => line === 'META\tsystem_identifier\t7654321'
        ? 'META\tsystem_identifier\t9999999' : line),
      error: /database identity changed \(system_identifier\)/,
    },
    {
      name: 'database OID changed',
      mutate: (lines) => lines.map((line) => line === 'META\tdatabase_oid\t16384'
        ? 'META\tdatabase_oid\t32768' : line),
      error: /database identity changed \(database_oid\)/,
    },
    {
      name: 'WAL did not advance',
      mutate: (lines) => lines.map((line) => line === 'META\twal_lsn_bytes\t2000'
        ? 'META\twal_lsn_bytes\t1000' : line),
      error: /WAL LSN did not advance/,
    },
    {
      name: 'successful A1 row is missing',
      mutate: (lines) => lines.filter((line) => !line.startsWith('A1_MIGRATION\t')),
      error: /exactly one successful A1 migration/,
    },
    {
      name: 'successful A1 row is duplicated',
      mutate: (lines) => {
        const migration = lines.find((line) => line.startsWith('A1_MIGRATION\t'))!;
        return [...lines, migration.replace('migration-id', 'second-migration-id')];
      },
      error: /exactly one successful A1 migration/,
    },
    {
      name: 'database migration checksum differs',
      mutate: (lines) => lines.map((line) => line.startsWith('A1_MIGRATION\t')
        ? line.replace(`\t${hash}\t`, `\t${'c'.repeat(64)}\t`) : line),
      error: /database A1 checksum differs/,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pms-integrity-evidence-'));
      try {
        const baseline = path.join(root, 'baseline');
        const post = path.join(root, 'post');
        writeManifest(baseline, records('baseline'));
        writeManifest(post, scenario.mutate(records('post')));
        const result = compare(baseline, post);
        assert.equal(result.status, 1);
        assert.match(result.stderr, scenario.error);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('direct PostgreSQL wrapper keeps credentials out of argv and applies URL settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pms-integrity-psql-'));
  try {
    const fakeBin = path.join(root, 'bin');
    const evidence = path.join(root, 'psql-env.tsv');
    fs.mkdirSync(fakeBin);
    const fakePsql = path.join(fakeBin, 'psql');
    fs.writeFileSync(fakePsql, `#!/bin/sh
printf 'argv\\t%s\\n' "$*" > "$PMS_TEST_PSQL_EVIDENCE"
printf 'host\\t%s\\nport\\t%s\\nuser\\t%s\\ndb\\t%s\\nssl\\t%s\\npassword\\t%s\\n' \\
  "$PGHOST" "$PGPORT" "$PGUSER" "$PGDATABASE" "$PGSSLMODE" "$PGPASSWORD" >> "$PMS_TEST_PSQL_EVIDENCE"
`);
    fs.chmodSync(fakePsql, 0o700);

    const secret = 'do-not-place-in-argv';
    const result = spawnSync(process.execPath, [psqlWrapper], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        PMS_TEST_PSQL_EVIDENCE: evidence,
        DATABASE_URL: `postgresql://integrity:${secret}@db.example:5433/tv_management?sslmode=verify-full&schema=public`,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const captured = fs.readFileSync(evidence, 'utf8');
    assert.match(captured, /argv\t-X -q -v ON_ERROR_STOP=1/);
    assert.doesNotMatch(captured.split('\n')[0] ?? '', new RegExp(secret));
    assert.match(captured, /host\tdb\.example/);
    assert.match(captured, /port\t5433/);
    assert.match(captured, /user\tintegrity/);
    assert.match(captured, /db\ttv_management/);
    assert.match(captured, /ssl\tverify-full/);
    assert.match(captured, new RegExp(`password\\t${secret}`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
