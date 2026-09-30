import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('plan snapshots are taken, compared with the plan today, limited and kept to their project', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `ps-${suffix}`, name: 'Snapshot test' } });
  const pm = await prisma.user.create({ data: { email: `ps-${suffix}@example.test`, name: 'РП', role: 'ADMIN', passwordHash: await hashPassword('test-snapshots-only') } });
  const base = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...base, code: `PS-${suffix}`, name: 'Snapshots' } });
  const other = await prisma.project.create({ data: { ...base, code: `PO-${suffix}`, name: 'Other' } });
  const milestone = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '1', title: 'Комитет', type: 'MILESTONE', status: 'NOT_STARTED', owner: '', startDate: day('2026-11-02'), dueDate: day('2026-11-02'), baselineDueDate: day('2026-11-02'), workDays: 0, sortOrder: 10, wbsLevel: 1 },
  });
  const foreign = await prisma.planSnapshot.create({ data: { projectId: other.id, name: 'Чужой', rowCount: 0, rows: [] } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pm.email, password: 'test-snapshots-only' }) });
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const call = (path: string, method = 'GET', body?: unknown) =>
    fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    const taken = await call(`/api/projects/${project.id}/plan-snapshots`, 'POST', { name: 'Комитет 01.10' });
    assert.equal(taken.status, 201, await taken.clone().text());
    const snapshot = await taken.json();
    assert.equal(snapshot.rowCount, 1);
    const baselineBefore = (await prisma.wbsItem.findUniqueOrThrow({ where: { id: milestone.id } })).baselineDueDate;

    await prisma.wbsItem.update({ where: { id: milestone.id }, data: { dueDate: day('2026-11-09'), startDate: day('2026-11-09') } });
    const compared = await (await call(`/api/projects/${project.id}/plan-snapshots/compare?from=${snapshot.id}&to=current`)).json();
    assert.deepEqual(compared.changes.map((change: { code: string; dueDays: number; checkpoint: boolean }) => [change.code, change.dueDays, change.checkpoint]), [['1', 7, true]]);
    // Taking a snapshot touches neither the baseline nor the plan.
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: milestone.id } })).baselineDueDate?.toISOString(), baselineBefore?.toISOString());

    assert.equal((await call(`/api/projects/${project.id}/plan-snapshots/compare?from=${foreign.id}&to=current`)).status, 400);
    assert.equal((await call(`/api/projects/${project.id}/plan-snapshots`, 'POST', { name: 'x' })).status, 400);

    await prisma.planSnapshot.createMany({ data: Array.from({ length: 49 }, (_, index) => ({ projectId: project.id, name: `Старый ${index}`, rowCount: 0, rows: [] })) });
    assert.equal((await call(`/api/projects/${project.id}/plan-snapshots`, 'POST', { name: 'Пятьдесят первый' })).status, 409);
    const list = await (await call(`/api/projects/${project.id}/plan-snapshots`)).json();
    assert.equal(list.length, 50);
    assert.equal('rows' in list[0], false);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { id: { in: [project.id, other.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: pm.id } }).catch(() => undefined);
  }
});
