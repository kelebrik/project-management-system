import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const DAY_MS = 86_400_000;
const inDays = (days: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * DAY_MS);
};

test('my work lists my rows, takes check-ins on them only, and the project sees who has not checked in', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `mw-${suffix}`, name: 'My work test' } });
  const password = await hashPassword('test-mywork-only');
  const me = await prisma.user.create({ data: { email: `me-${suffix}@example.test`, name: 'Зуева', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const loner = await prisma.user.create({ data: { email: `ln-${suffix}@example.test`, name: 'Без связи', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  await prisma.leaveEmployee.create({ data: { name: `Алёна Зуева ${suffix}`, userId: me.id } });
  const project = await prisma.project.create({
    data: { code: `MW-${suffix}`, name: 'My work', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: inDays(-30), targetDate: inDays(60), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const mine = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Моя задача', type: 'TASK', status: 'IN_PROGRESS', owner: `алена  зуева ${suffix}`, startDate: inDays(-3), dueDate: inDays(3), sortOrder: 10, wbsLevel: 1 } });
  const theirs = await prisma.wbsItem.create({ data: { projectId: project.id, code: '2', title: 'Чужая', type: 'TASK', status: 'IN_PROGRESS', owner: 'Петров', startDate: inDays(-3), dueDate: inDays(3), sortOrder: 20, wbsLevel: 1 } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-mywork-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asMe = await session(me.email);
    const asLoner = await session(loner.email);
    assert.deepEqual(await (await asLoner('/api/my-work')).json().then((row: { reason: string; items: unknown[] }) => [row.reason, row.items.length]), ['NOT_LINKED', 0]);

    const mineList = await (await asMe('/api/my-work')).json();
    assert.deepEqual(mineList.items.map((row: { id: string }) => row.id), [mine.id]);
    assert.equal((await asMe('/api/my-work/check-ins', 'PUT', { wbsItemId: theirs.id, confidence: 'ON_TRACK' })).status, 403);
    assert.equal((await asLoner('/api/my-work/check-ins', 'PUT', { wbsItemId: mine.id, confidence: 'ON_TRACK' })).status, 403);
    assert.equal((await asMe('/api/my-work/check-ins', 'PUT', { wbsItemId: mine.id, confidence: 'AT_RISK', blocker: 'Нет стенда' })).status, 200);
    assert.equal((await asMe('/api/my-work/check-ins', 'PUT', { wbsItemId: mine.id, confidence: 'ON_TRACK', done: 'Стенд нашли' })).status, 200);
    assert.equal(await prisma.workCheckIn.count({ where: { wbsItemId: mine.id } }), 1);

    assert.equal((await asMe(`/api/projects/${project.id}/check-ins?week=2026-99-99`)).status, 400);
    assert.equal((await asMe(`/api/projects/${project.id}/check-ins?week=2026-02-31`)).status, 400);
    const week = await (await asMe(`/api/projects/${project.id}/check-ins`)).json();
    assert.deepEqual(week.checkIns.map((row: { confidence: string; done: string }) => [row.confidence, row.done]), [['ON_TRACK', 'Стенд нашли']]);
    assert.deepEqual(week.notCheckedIn, ['Петров']);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.leaveEmployee.deleteMany({ where: { userId: me.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [me.id, loner.id] } } }).catch(() => undefined);
  }
});
