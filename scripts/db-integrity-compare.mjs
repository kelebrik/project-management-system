#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_MIGRATION = process.env.TARGET_MIGRATION
  || '20260821200000_jira_issue_history_a1';
const exactMetaKeys = [
  'system_identifier',
  'timeline_id',
  'database_name',
  'database_oid',
  'server_address',
  'server_port',
  'server_version_num',
  'server_encoding',
  'datcollate',
  'datctype',
  'datcollversion',
  'postmaster_started_at',
  'current_role',
];
const exactEvidenceKeys = [
  'tool_sha256',
  'migration_sha256',
  'image_migration_sha256',
  'image_id',
  'git_commit',
  'backup_evidence_sha256',
  'allowed_roles',
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readManifest(directory) {
  const completePath = path.join(directory, 'COMPLETE');
  const manifestPath = path.join(directory, 'manifest.tsv');
  const checksumPath = path.join(directory, 'manifest.sha256');
  for (const file of [completePath, manifestPath, checksumPath]) {
    if (!fs.existsSync(file)) fail(`incomplete manifest directory: missing ${file}`);
  }
  const manifest = fs.readFileSync(manifestPath);
  const checksumLine = fs.readFileSync(checksumPath, 'utf8').trim();
  const completeLine = fs.readFileSync(completePath, 'utf8').trim();
  const expected = checksumLine.split(/\s+/)[0];
  const completeHash = completeLine.split('\t')[1];
  const actual = sha256(manifest);
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== actual || completeHash !== actual) {
    fail(`manifest checksum mismatch: ${directory}`);
  }

  const singleton = new Map();
  const collections = new Map();
  const migrations = [];
  const lines = manifest.toString('utf8').trimEnd().split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const fields = lines[index].split('\t');
    const kind = fields[0];
    if (!kind) fail(`empty record kind at ${directory}:${index + 1}`);
    if (kind === 'META' || kind === 'EVIDENCE' || kind === 'A1_CHECK') {
      if (fields.length !== 3) fail(`invalid ${kind} record at ${directory}:${index + 1}`);
      const key = `${kind}\t${fields[1]}`;
      if (singleton.has(key)) fail(`duplicate record ${key} in ${directory}`);
      singleton.set(key, fields[2]);
      continue;
    }
    if (kind === 'TABLE') {
      if (fields.length !== 5) fail(`invalid TABLE record at ${directory}:${index + 1}`);
      addCollection(collections, kind, `${fields[1]}.${fields[2]}`, `${fields[3]}\t${fields[4]}`, directory);
      continue;
    }
    if (kind === 'SEQUENCE') {
      if (fields.length !== 5) fail(`invalid SEQUENCE record at ${directory}:${index + 1}`);
      addCollection(collections, kind, `${fields[1]}.${fields[2]}`, `${fields[3]}\t${fields[4]}`, directory);
      continue;
    }
    if (kind === 'CATALOG') {
      if (fields.length !== 4) fail(`invalid CATALOG record at ${directory}:${index + 1}`);
      addCollection(collections, `${kind}:${fields[1]}`, fields[2], fields[3], directory);
      continue;
    }
    if (kind === 'A1_MIGRATION') {
      if (fields.length !== 9) fail(`invalid A1_MIGRATION record at ${directory}:${index + 1}`);
      migrations.push({
        id: fields[1],
        checksum: fields[2],
        startedAt: fields[3],
        finishedAt: fields[4],
        appliedSteps: fields[5],
        rolledBackAt: fields[6],
        logsNull: fields[7],
        migrationName: fields[8],
      });
      continue;
    }
    fail(`unknown record kind ${kind} at ${directory}:${index + 1}`);
  }
  return { directory, singleton, collections, migrations };
}

function addCollection(collections, group, key, value, directory) {
  let entries = collections.get(group);
  if (!entries) {
    entries = new Map();
    collections.set(group, entries);
  }
  if (entries.has(key)) fail(`duplicate ${group} key ${key} in ${directory}`);
  entries.set(key, value);
}

function singletonValue(manifest, kind, key) {
  const value = manifest.singleton.get(`${kind}\t${key}`);
  if (value === undefined) fail(`missing ${kind} ${key} in ${manifest.directory}`);
  return value;
}

function compareMaps(label, baseline, post) {
  const allGroups = new Set([...baseline.collections.keys(), ...post.collections.keys()]);
  for (const group of [...allGroups].sort()) {
    const before = baseline.collections.get(group) ?? new Map();
    const after = post.collections.get(group) ?? new Map();
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const key of [...keys].sort()) {
      if (!before.has(key)) fail(`${label}: unexpected ${group} object after target migration: ${key}`);
      if (!after.has(key)) fail(`${label}: pre-existing ${group} object disappeared: ${key}`);
      if (before.get(key) !== after.get(key)) {
        fail(`${label}: pre-existing ${group} object changed: ${key}`);
      }
    }
  }
}

function parseTimestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`invalid ${label} timestamp: ${value}`);
  return parsed;
}

function compare(baseline, post) {
  if (singletonValue(baseline, 'META', 'capture_phase') !== 'baseline') {
    fail('first manifest is not a baseline capture');
  }
  if (singletonValue(post, 'META', 'capture_phase') !== 'post') {
    fail('second manifest is not a post capture');
  }
  for (const key of exactMetaKeys) {
    const before = singletonValue(baseline, 'META', key);
    const after = singletonValue(post, 'META', key);
    if (before !== after) fail(`database identity changed (${key}): ${before} != ${after}`);
  }
  for (const key of exactEvidenceKeys) {
    const before = singletonValue(baseline, 'EVIDENCE', key);
    const after = singletonValue(post, 'EVIDENCE', key);
    if (before !== after) fail(`capture evidence changed (${key})`);
  }
  const migrationSha = singletonValue(post, 'EVIDENCE', 'migration_sha256');
  if (migrationSha !== singletonValue(post, 'EVIDENCE', 'image_migration_sha256')) {
    fail('deployed image migration checksum differs from gate checksum');
  }

  const beforeLsn = BigInt(singletonValue(baseline, 'META', 'wal_lsn_bytes'));
  const afterLsn = BigInt(singletonValue(post, 'META', 'wal_lsn_bytes'));
  if (afterLsn <= beforeLsn) fail('post WAL LSN did not advance after migration');

  compareMaps('integrity failure', baseline, post);

  for (const manifest of [baseline, post]) {
    const expectedChecks = [
      'new_tables',
      'new_table_rows',
      'new_columns_null',
      'expected_columns',
      'expected_types',
      'expected_constraints',
      'expected_indexes',
    ];
    for (const check of expectedChecks) {
      if (singletonValue(manifest, 'A1_CHECK', check) !== 'true') {
        fail(`${manifest.directory}: A1 check failed: ${check}`);
      }
    }
  }

  if (baseline.migrations.length !== 0) fail('baseline already contains the successful target migration');
  if (post.migrations.length !== 1) fail('post capture must contain exactly one successful target migration');
  const migration = post.migrations[0];
  if (migration.checksum !== migrationSha) fail('database migration checksum differs from the configured target file');
  if (migration.appliedSteps !== '1') fail('target applied_steps_count must be 1');
  if (migration.rolledBackAt !== '') fail('successful target migration must not be rolled back');
  if (migration.logsNull !== 'true') fail('successful target migration unexpectedly contains error logs');
  if (migration.migrationName !== TARGET_MIGRATION) fail('unexpected migration name in integrity evidence');

  const windowStart = parseTimestamp(singletonValue(baseline, 'META', 'server_timestamp'), 'baseline server');
  const windowEnd = parseTimestamp(singletonValue(post, 'META', 'server_timestamp'), 'post server');
  const migrationStart = parseTimestamp(migration.startedAt, 'migration start');
  const migrationEnd = parseTimestamp(migration.finishedAt, 'migration finish');
  if (windowStart > migrationStart || migrationStart > migrationEnd || migrationEnd > windowEnd) {
    fail('target migration timestamps fall outside the captured server-time window');
  }
}

if (process.argv.length !== 4) {
  console.error('Usage: db-integrity-compare.mjs BASELINE_DIR POST_DIR');
  process.exit(2);
}

try {
  const baseline = readManifest(process.argv[2]);
  const post = readManifest(process.argv[3]);
  compare(baseline, post);
  console.log('PASS: every pre-target row and normalized catalog object is unchanged; exactly one target migration was added.');
  console.log(`Baseline: ${path.resolve(process.argv[2])}`);
  console.log(`Post: ${path.resolve(process.argv[3])}`);
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
