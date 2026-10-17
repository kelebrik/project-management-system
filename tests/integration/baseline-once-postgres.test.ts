import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('the plan is fixed once per project, by a manager or an administrator alike; then only an administrator updates rows', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `bo-${suffix}`, name: 'Baseline once test' } });
  const password = await hashPassword('test-baseline-only');
  const admin = await prisma.user.create({ data: { email: `boa-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: password } });
  const manager = await prisma.user.create({ data: { email: `bom-${suffix}@example.test`, name: 'РП', role: 'PROJECT_MANAGER', passwordHash: password } });
  const projectData = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'РП', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...projectData, code: `BO-${suffix}`, name: 'Baseline once' } });
  const raced = await prisma.project.create({ data: { ...projectData, code: `BR-${suffix}`, name: 'Baseline race' } });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: manager.id, level: 'EDIT' } });
  const task = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Задача', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 10, wbsLevel: 1 } });
  await prisma.wbsItem.create({ data: { projectId: raced.id, code: '1', title: 'Задача', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 10, wbsLevel: 1 } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-baseline-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asManager = await session(manager.email);
    const asAdmin = await session(admin.email);
    const fix = (as: typeof asAdmin, projectId: string) => as(`/api/projects/${projectId}/wbs-baseline`, 'POST', {});

    assert.equal((await (await asManager(`/api/projects/${project.id}/overview`)).json()).baselineFixedAt, null);
    const first = await fix(asManager, project.id);
    assert.equal(first.status, 200, await first.clone().text());
    const fixedAt = (await first.json()).baselineFixedAt as string;
    assert.ok(fixedAt);
    assert.equal((await (await asManager(`/api/projects/${project.id}/overview`)).json()).baselineFixedAt, fixedAt);

    // Again, by the manager or by an administrator: refused, the day it was fixed told, nothing written.
    for (const as of [asManager, asAdmin]) {
      const again = await fix(as, project.id);
      assert.equal(again.status, 409);
      const body = await again.json();
      assert.deepEqual([body.code, body.baselineFixedAt], ['BASELINE_ALREADY_FIXED', fixedAt]);
      assert.match(body.error, /Обновить базовый план/);
    }
    assert.equal(await prisma.wbsBaseline.count({ where: { projectId: project.id } }), 1);

    // An administrator moves single rows' baselines; a manager may not.
    await prisma.wbsItem.update({ where: { id: task.id }, data: { dueDate: day('2026-10-14') } });
    assert.equal((await asManager(`/api/projects/${project.id}/wbs-baseline`, 'POST', { itemIds: [task.id] })).status, 403);
    const updated = await asAdmin(`/api/projects/${project.id}/wbs-baseline`, 'POST', { itemIds: [task.id] });
    assert.equal(updated.status, 200, await updated.clone().text());
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: task.id } })).baselineDueDate?.toISOString().slice(0, 10), '2026-10-14');

    // Two at once: one fixes the plan, the other is told it is fixed.
    const answers = await Promise.all([fix(asAdmin, raced.id), fix(asAdmin, raced.id)]);
    assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
    assert.equal(await prisma.wbsBaseline.count({ where: { projectId: raced.id } }), 1);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, manager.id] } } }).catch(() => undefined);
    await prisma.businessUnit.delete({ where: { id: unit.id } }).catch(() => undefined);
  }
});
