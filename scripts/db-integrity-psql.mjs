#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(2);
}

let parsed;
try {
  parsed = new URL(connectionUrl);
} catch {
  console.error('ERROR: DATABASE_URL is not a valid PostgreSQL URL');
  process.exit(2);
}

if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  console.error('ERROR: DATABASE_URL must use postgres:// or postgresql://');
  process.exit(2);
}

const sslMode = parsed.searchParams.get('sslmode');
if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
  console.error('ERROR: DATABASE_URL must enforce sslmode=require, verify-ca, or verify-full');
  process.exit(2);
}

const parameterEnvironment = new Map([
  ['sslmode', 'PGSSLMODE'],
  ['sslcert', 'PGSSLCERT'],
  ['sslkey', 'PGSSLKEY'],
  ['sslrootcert', 'PGSSLROOTCERT'],
  ['sslcrl', 'PGSSLCRL'],
  ['sslcrldir', 'PGSSLCRLDIR'],
  ['ssl_min_protocol_version', 'PGSSLMINPROTOCOLVERSION'],
  ['ssl_max_protocol_version', 'PGSSLMAXPROTOCOLVERSION'],
  ['channel_binding', 'PGCHANNELBINDING'],
  ['gssencmode', 'PGGSSENCMODE'],
  ['krbsrvname', 'PGKRBSRVNAME'],
  ['target_session_attrs', 'PGTARGETSESSIONATTRS'],
  ['connect_timeout', 'PGCONNECT_TIMEOUT'],
  ['application_name', 'PGAPPNAME'],
]);

const childEnvironment = { ...process.env };
delete childEnvironment.DATABASE_URL;
childEnvironment.PGHOST = parsed.hostname.replace(/^\[(.*)]$/, '$1');
childEnvironment.PGPORT = parsed.port || '5432';
childEnvironment.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (parsed.username) childEnvironment.PGUSER = decodeURIComponent(parsed.username);
if (parsed.password) childEnvironment.PGPASSWORD = decodeURIComponent(parsed.password);
childEnvironment.PGAPPNAME = parsed.searchParams.get('application_name') ?? 'pms-db-integrity';

if (!childEnvironment.PGHOST || !childEnvironment.PGDATABASE) {
  console.error('ERROR: DATABASE_URL must include a host and database name');
  process.exit(2);
}

for (const [name, value] of parsed.searchParams) {
  if (name === 'schema') continue;
  const environmentName = parameterEnvironment.get(name);
  if (!environmentName) {
    console.error(`ERROR: unsupported DATABASE_URL parameter: ${name}`);
    process.exit(2);
  }
  childEnvironment[environmentName] = value;
}

const result = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1'], {
  env: childEnvironment,
  stdio: 'inherit',
});
if (result.error) {
  console.error('ERROR: failed to execute psql');
  process.exit(1);
}
process.exit(result.status ?? 1);

