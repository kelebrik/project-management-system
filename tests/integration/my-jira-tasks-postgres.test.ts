import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('my Jira tasks: the login comes from the e-mail, can be set and reset, and without Jira nothing is asked', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { email: `ivan.${suffix}@example.test`, name: 'Иван', role: 'PROJECT_MANAGER', passwordHash: await hashPassword('test-jira-tasks-only') } });
  const saved = { JIRA_BASE_URL: process.env.JIRA_BASE_URL, JIRA_API_TOKEN: process.env.JIRA_API_TOKEN };
  delete process.env.JIRA_BASE_URL;
  delete process.env.JIRA_API_TOKEN;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-jira-tasks-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const call = (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

    const first = await (await call('/api/my-work/jira')).json();
    assert.deepEqual([first.login, first.defaultLogin, first.customLogin, first.status, first.groups], [`ivan.${suffix}`, `ivan.${suffix}`, false, 'NOT_CONFIGURED', []]);

    assert.equal((await call('/api/my-work/jira-login', 'PUT', { login: 'x" OR 1=1' })).status, 400);
    assert.equal((await call('/api/my-work/jira-login', 'PUT', { login: 'i.ivanov' })).status, 200);
    const custom = await (await call('/api/my-work/jira')).json();
    assert.deepEqual([custom.login, custom.customLogin], ['i.ivanov', true]);
    assert.equal((await call('/api/my-work/jira-login', 'PUT', { login: '' })).status, 200);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).jiraLogin, null);
    // Each person asks at most 10 times a minute, login changes included (5 requests so far).
    const statuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) statuses.push((await call('/api/my-work/jira')).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    Object.assign(process.env, Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined)));
    await prisma.auditEvent.deleteMany({ where: { actorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
