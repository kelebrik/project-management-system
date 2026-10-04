import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('project shares are set by project editors, capacity by administrators, and other units are summed unnamed', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `al-${suffix}`, name: 'Allocations test' } });
  const otherUnit = await prisma.businessUnit.create({ data: { code: `alo-${suffix}`, name: 'Other unit' } });
  const password = await hashPassword('test-allocations-only');
  const users = await Promise.all(
    (['ed', 'vw', 'ad'] as const).map((tag) =>
      prisma.user.create({ data: { email: `${tag}-${suffix}@example.test`, name: tag, role: tag === 'ad' ? 'ADMIN' : 'PROJECT_MANAGER', passwordHash: password } }),
    ),
  );
  const [editor, viewer, admin] = users;
  const projectData = (code: string, businessUnitId: string) => ({
    code, name: code, businessUnitId, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-09-01'), targetDate: day('2026-12-31'), budgetPlanned: 0, budgetForecast: 0, summary: '',
  });
  const project = await prisma.project.create({ data: projectData(`AL-${suffix}`, unit.id) });
  const hiddenProject = await prisma.project.create({ data: projectData(`ALH-${suffix}`, otherUnit.id) });
  await prisma.projectAccess.createMany({ data: [{ projectId: project.id, userId: editor.id, level: 'EDIT' }, { projectId: project.id, userId: viewer.id, level: 'VIEW' }] });
  const person = await prisma.leaveEmployee.create({ data: { name: `Доля ${suffix}` } });
  await prisma.projectAllocation.create({ data: { employeeId: person.id, projectId: hiddenProject.id, percent: 40, startsOn: day('2026-10-01') } });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-allocations-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asEditor = await session(editor.email);
    const asViewer = await session(viewer.email);
    const asAdmin = await session(admin.email);
    const share = { employeeId: person.id, projectId: project.id, percent: 70, startsOn: '2026-10-05', endsOn: '2026-10-30' };

    assert.equal((await asViewer('/api/workload/allocations', 'PUT', share)).status, 403);
    const created = await asEditor('/api/workload/allocations', 'PUT', share);
    assert.equal(created.status, 200);
    const { id } = await created.json();
    assert.equal((await asEditor('/api/workload/allocations', 'PUT', { ...share, startsOn: '2026-10-20', endsOn: null })).status, 409, 'periods of the same pair may not overlap');
    assert.equal((await asEditor('/api/workload/allocations', 'PUT', { ...share, percent: 0 })).status, 400);
    assert.equal((await asEditor('/api/workload/allocations', 'PUT', { ...share, startsOn: '2026-11-01' })).status, 400, 'the end before the start');
    assert.equal((await asEditor('/api/workload/allocations', 'PUT', { ...share, id, percent: 60 })).status, 200);

    const workload = await (await asViewer('/api/workload?from=2026-10-01&to=2026-10-31')).json();
    const own = workload.allocations.filter((entry: { employeeId: string }) => entry.employeeId === person.id);
    assert.deepEqual(
      own.map((entry: { id: string | null; project: { code: string } | null; percent: number; editable: boolean }) => [entry.id, entry.project?.code ?? null, entry.percent, entry.editable]).sort(),
      [[id, project.code, 60, false], [null, null, 40, false]].sort(),
    );
    assert.equal(workload.canEditCapacity, false);
    assert.equal(workload.employees.find((entry: { id: string }) => entry.id === person.id).capacityPercent, 100);

    assert.equal((await asEditor(`/api/workload/employees/${person.id}/capacity`, 'PATCH', { capacityPercent: 50 })).status, 403);
    assert.equal((await asAdmin(`/api/workload/employees/${person.id}/capacity`, 'PATCH', { capacityPercent: 50 })).status, 200);
    assert.equal((await prisma.leaveEmployee.findUniqueOrThrow({ where: { id: person.id } })).capacityPercent, 50);

    // Two overlapping shares sent at once: one is saved, the other refused.
    const racing = await Promise.all([
      asEditor('/api/workload/allocations', 'PUT', { ...share, startsOn: '2026-11-02', endsOn: '2026-11-20', percent: 10 }),
      asEditor('/api/workload/allocations', 'PUT', { ...share, startsOn: '2026-11-10', endsOn: null, percent: 20 }),
    ]);
    assert.deepEqual(racing.map((response) => response.status).sort(), [200, 409]);
    await prisma.projectAllocation.deleteMany({ where: { employeeId: person.id, startsOn: { gte: day('2026-11-01') } } });

    assert.equal((await asViewer(`/api/workload/allocations/${id}`, 'DELETE')).status, 403);
    assert.equal((await asEditor(`/api/workload/allocations/${id}`, 'DELETE')).status, 204);
    assert.equal(await prisma.projectAllocation.count({ where: { employeeId: person.id } }), 1);
    assert.ok(await prisma.auditEvent.findFirst({ where: { objectType: 'ProjectAllocation', objectId: id, action: 'allocation.delete' } }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.project.deleteMany({ where: { id: { in: [project.id, hiddenProject.id] } } });
    await prisma.leaveEmployee.delete({ where: { id: person.id } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.businessUnit.deleteMany({ where: { id: { in: [unit.id, otherUnit.id] } } });
  }
});
