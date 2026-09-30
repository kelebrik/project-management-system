import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('a RACI row keeps one Accountable, names match whatever their spelling, and roles can be cleared', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `rc-${suffix}`, name: 'RACI test' } });
  const admin = await prisma.user.create({ data: { email: `rc-${suffix}@example.test`, name: 'РП', role: 'ADMIN', passwordHash: await hashPassword('test-raci-only') } });
  const project = await prisma.project.create({
    data: { code: `RC-${suffix}`, name: 'RACI', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Разработка', type: 'PHASE', status: 'NOT_STARTED', owner: 'Алёна Зуева', sortOrder: 10, wbsLevel: 1 } });
  const task = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1.1', title: 'Задача', type: 'TASK', status: 'NOT_STARTED', owner: 'Петров', sortOrder: 20, wbsLevel: 2, parentId: phase.id } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'test-raci-only' }) });
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const call = (path: string, method = 'GET', body?: unknown) =>
    fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const cell = (personName: string, role: string | null, wbsItemId = phase.id) => call(`/api/projects/${project.id}/raci/cell`, 'PUT', { wbsItemId, personName, role });
  try {
    const initial = await (await call(`/api/projects/${project.id}/raci`)).json();
    assert.deepEqual(initial.rows.map((row: { code: string }) => row.code), ['1']);
    assert.deepEqual(initial.people.sort(), ['Алёна Зуева', 'Петров']);

    assert.equal((await cell('Алена  Зуева', 'A')).status, 200);
    const second = await cell('Петров', 'A');
    assert.equal(second.status, 409);
    assert.match((await second.json()).error, /Алена {2}Зуева|Алена Зуева/);
    // The same person written differently is the same cell.
    assert.equal((await cell('алёна зуева', 'R')).status, 200);
    assert.equal(await prisma.raciAssignment.count({ where: { wbsItemId: phase.id } }), 1);

    // Two people made Accountable at once: one wins.
    const both = await Promise.all([cell('Петров', 'A'), cell('Сидоров', 'A')]);
    assert.deepEqual(both.map((answer) => answer.status).sort(), [200, 409]);
    assert.equal(await prisma.raciAssignment.count({ where: { wbsItemId: phase.id, role: 'A' } }), 1);

    // The same cell written twice at once: both succeed, one row remains.
    const same = await Promise.all([cell('Кузнецова', 'C'), cell('кузнецова', 'I')]);
    assert.deepEqual(same.map((answer) => answer.status), [200, 200]);
    assert.equal(await prisma.raciAssignment.count({ where: { wbsItemId: phase.id, personKey: 'кузнецова' } }), 1);

    assert.equal((await cell('Петров', 'R', task.id)).status, 400);
    assert.equal((await cell('Петров', null)).status, 200);
    assert.equal((await cell('Сидоров', null)).status, 200);
    assert.equal(await prisma.raciAssignment.count({ where: { wbsItemId: phase.id, role: 'A' } }), 0);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: admin.id } }).catch(() => undefined);
  }
});
