import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
// Resolve the installed tsx rather than going through npx: the corporate CI
// wraps npm with its own registry, and npx there may reach for the network.
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

// The demo seed upserts fixed project codes (ERP, BU2-*, BU3-*, TEST-*) over any
// row that already uses them, so it must never run against a corporate database.
// DATABASE_URL is deliberately left unset: the guard has to reject the run before
// the seed reaches Prisma, so an unsafe configuration cannot touch data at all.
const unsafeConfigurations = [
  { DEPLOYMENT_PROFILE: 'corporate', PUBLIC_DEMO_MODE: 'true', SEED_DEMO_DATA: 'true' },
  { PUBLIC_DEMO_MODE: 'true', SEED_DEMO_DATA: 'true' },
  { DEPLOYMENT_PROFILE: 'cloud', SEED_DEMO_DATA: 'true' },
  { DEPLOYMENT_PROFILE: 'cloud', PUBLIC_DEMO_MODE: 'false', SEED_DEMO_DATA: 'true' },
  { DEPLOYMENT_PROFILE: 'cloud', PUBLIC_DEMO_MODE: 'true' },
];

for (const configuration of unsafeConfigurations) {
  const label = Object.entries(configuration).map(([key, value]) => `${key}=${value}`).join(' ');
  test(`demo seed refuses to run with ${label}`, async () => {
    const env = { ...process.env, ...configuration };
    delete env.DATABASE_URL;
    for (const key of ['DEPLOYMENT_PROFILE', 'PUBLIC_DEMO_MODE', 'SEED_DEMO_DATA']) {
      if (!(key in configuration)) delete env[key];
    }

    const failure = await run(process.execPath, [tsxCli, 'prisma/seed.ts'], { env }).then(
      () => null,
      (error: { stderr?: string }) => error,
    );

    assert.ok(failure, 'the seed must fail instead of writing demo data');
    assert.match(String(failure.stderr), /Demo seed requires DEPLOYMENT_PROFILE=cloud/);
    assert.doesNotMatch(String(failure.stderr), /PrismaClient|DATABASE_URL/);
  });
}
