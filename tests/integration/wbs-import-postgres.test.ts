import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('a table import plans without writing, writes all or nothing, keeps order under parents, and is not repeated', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `imp-${suffix}`, name: 'Import test' } });
  const password = await hashPassword('test-import-only');
  const admin = await prisma.user.create({ data: { email: `adm-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: password } });
  const viewer = await prisma.user.create({ data: { email: `vw-${suffix}@example.test`, name: 'Зритель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const project = await prisma.project.create({
    data: { code: `IMP-${suffix}`, name: 'Import', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-31'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Фаза', type: 'PHASE', owner: '', sortOrder: 10, wbsLevel: 1 } });
  const task = await prisma.wbsItem.create({
    data: { projectId: project.id, parentId: phase.id, code: '1.1', title: 'Задача', type: 'TASK', owner: 'Петров', startDate: new Date('2026-10-05'), workDays: 2, sortOrder: 20, wbsLevel: 2 },
  });
  const second = await prisma.wbsItem.create({ data: { projectId: project.id, code: '2', title: 'Вторая фаза', type: 'PHASE', owner: '', sortOrder: 30, wbsLevel: 1 } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-import-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (body: unknown) =>
      fetch(`${url}/api/projects/${project.id}/wbs-import`, { method: 'POST', headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  };
  const rows = [
    { id: task.id, code: '1.1', owner: 'Сидоров' },
    { code: '1.2', title: 'Новая', workDays: 3, predecessors: ['1.1'] },
  ];
  try {
    const asAdmin = await session(admin.email);
    const asViewer = await session(viewer.email);
    assert.equal((await asViewer({ rows, importKey: `key-${suffix}` })).status, 403);

    const dry = await asAdmin({ rows, dryRun: true, importKey: `key-${suffix}` });
    assert.equal(dry.status, 200);
    const plan = await dry.json();
    assert.deepEqual([plan.creates.length, plan.updates.length, plan.errors.length], [1, 1, 0]);
    assert.equal(await prisma.wbsItem.count({ where: { projectId: project.id } }), 3);

    const rejected = await asAdmin({ rows: [...rows, { code: '7.1', title: 'Сирота' }], importKey: `bad-${suffix}` });
    assert.equal(rejected.status, 422);
    assert.deepEqual((await rejected.json()).errors.map((error: { kind: string }) => error.kind), ['PARENT_MISSING']);
    assert.equal(await prisma.wbsItem.count({ where: { projectId: project.id } }), 3);
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: task.id } })).owner, 'Петров');

    const applied = await asAdmin({ rows, importKey: `key-${suffix}` });
    assert.equal(applied.status, 201);
    const result = await applied.json();
    assert.equal(result.createdIds.length, 1);
    const items = await prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
    assert.deepEqual(items.map((item) => [item.code, item.parentId, item.owner]), [
      ['1', null, ''],
      ['1.1', phase.id, 'Сидоров'],
      ['1.2', phase.id, ''],
      ['2', null, ''],
    ]);
    const created = items.find((item) => item.code === '1.2')!;
    assert.deepEqual([created.predecessor1, created.workDays, created.wbsLevel, created.calendarCode], ['1.1', 3, 2, 'RU']);
    assert.ok(created.startDate && created.dueDate && created.startDate > new Date('2026-10-05'), 'the schedule placed the new row after its predecessor');
    assert.equal(second.id, items[3].id);

    const replay = await asAdmin({ rows, importKey: `key-${suffix}` });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(await prisma.wbsItem.count({ where: { projectId: project.id } }), 4);
    assert.equal(await prisma.auditEvent.count({ where: { projectId: project.id, action: 'wbs.import' } }), 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, viewer.id] } } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
