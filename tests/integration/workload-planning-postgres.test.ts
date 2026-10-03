import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('work is added from the Workload page under a phase in the project calendar, and planners stay project-free', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `wl-${suffix}`, name: 'Workload test' } });
  const password = await hashPassword('test-workload-only');
  const editor = await prisma.user.create({ data: { email: `ed-${suffix}@example.test`, name: 'Редактор', role: 'PROJECT_MANAGER', passwordHash: password } });
  const viewer = await prisma.user.create({ data: { email: `vw-${suffix}@example.test`, name: 'Зритель', role: 'PROJECT_MANAGER', passwordHash: password } });
  const project = await prisma.project.create({
    data: { code: `WL-${suffix}`, name: 'Workload', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-09-01'), targetDate: day('2026-12-31'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  await prisma.projectAccess.createMany({ data: [{ projectId: project.id, userId: editor.id, level: 'EDIT' }, { projectId: project.id, userId: viewer.id, level: 'VIEW' }] });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Фаза', type: 'PHASE', owner: '', sortOrder: 10, wbsLevel: 1, calendarCode: 'CN' } });
  const first = await prisma.wbsItem.create({ data: { projectId: project.id, parentId: phase.id, code: '1.1', title: 'Первая', type: 'TASK', owner: 'Петров', startDate: day('2026-09-21'), dueDate: day('2026-09-25'), workDays: 5, sortOrder: 20, wbsLevel: 2, calendarCode: 'CN' } });
  const next = await prisma.wbsItem.create({ data: { projectId: project.id, code: '2', title: 'Вторая фаза', type: 'PHASE', owner: '', sortOrder: 30, wbsLevel: 1 } });
  // The Chinese holiday week.
  await prisma.projectCalendarOverride.createMany({ data: ['2026-10-01', '2026-10-02'].map((date) => ({ projectId: project.id, calendarCode: 'CN' as const, date: day(date), isWorkingDay: false, description: 'Праздник' })) });
  // A day off far outside the period: long work moved by a day still has to count it.
  await prisma.projectCalendarOverride.create({ data: { projectId: project.id, calendarCode: 'CN', date: day('2026-01-08'), isWorkingDay: false, description: 'Давний праздник' } });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-workload-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asEditor = await session(editor.email);
    const asViewer = await session(viewer.email);

    const workload = await (await asEditor('/api/workload?from=2026-09-01&to=2026-10-31')).json();
    assert.equal(workload.items.find((item: { id: string }) => item.id === first.id).calendarCode, 'CN');
    assert.deepEqual(workload.projectCalendars[project.id].map((override: { date: string }) => override.date), ['2026-01-08', '2026-10-01', '2026-10-02']);
    assert.ok(workload.editableProjects.some((entry: { id: string }) => entry.id === project.id));

    const parents = await (await asEditor(`/api/workload/parents?projectId=${project.id}&from=2026-09-01&to=2026-10-31`)).json();
    assert.deepEqual(parents.parents.map((row: { code: string; calendarCode: string }) => [row.code, row.calendarCode]), [['1', 'CN'], ['2', 'RU']]);
    assert.equal(parents.defaultCalendarCode, 'CN');
    assert.equal((await asViewer(`/api/workload/parents?projectId=${project.id}&from=2026-09-01&to=2026-10-31`)).status, 403);

    // Asked for 1–5 October: the Chinese days off move the start to the 5th.
    const appended = await asEditor(`/api/projects/${project.id}/wbs-items/append`, 'POST', { parentId: phase.id, title: 'Новая из Загрузки', owner: 'Сидоров', startDate: '2026-10-01', dueDate: '2026-10-07' });
    assert.equal(appended.status, 201);
    const created = (await appended.json()).item;
    assert.deepEqual([created.code, created.parentId, created.wbsLevel, created.calendarCode, created.owner], ['1.2', phase.id, 2, 'CN', 'Сидоров']);
    assert.equal(created.startDate.slice(0, 10), '2026-10-05');
    assert.ok(appended.headers.get('x-schedule-shift-operation-id'), 'the write queue journalled the operation');
    const order = await prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, code: true } });
    assert.deepEqual(order.map((row) => row.code), ['1', '1.1', '1.2', '2']);
    // No other row was rewritten.
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: next.id } })).updatedAt.getTime(), next.updatedAt.getTime());

    assert.equal((await asEditor(`/api/projects/${project.id}/wbs-items/append`, 'POST', { parentId: first.id, title: 'Под задачей', startDate: '2026-10-05', dueDate: '2026-10-06' })).status, 409);
    assert.equal((await asEditor(`/api/projects/${project.id}/wbs-items/append`, 'POST', { parentId: null, title: 'Наоборот', startDate: '2026-10-07', dueDate: '2026-10-05' })).status, 400);
    assert.equal((await asViewer(`/api/projects/${project.id}/wbs-items/append`, 'POST', { parentId: null, title: 'Чужая', startDate: '2026-10-05', dueDate: '2026-10-06' })).status, 403);
    const top = await asEditor(`/api/projects/${project.id}/wbs-items/append`, 'POST', { parentId: null, title: 'Верхний уровень', startDate: '2026-10-05', dueDate: '2026-10-06', type: 'DELIVERABLE' });
    assert.equal((await top.json()).item.code, '3');

    const withProject = await asEditor('/api/saved-views', 'POST', { viewType: 'workload', projectId: project.id, name: 'Не так', config: {} });
    assert.equal(withProject.status, 400);
    const planner = await asEditor('/api/saved-views', 'POST', { viewType: 'workload', projectId: null, name: 'Команда', config: { version: 1, people: ['петров'] }, isShared: true });
    assert.equal(planner.status, 201);
    const plannerId = (await planner.json()).id;
    assert.equal((await asEditor(`/api/saved-views/${plannerId}`, 'PATCH', { projectId: project.id })).status, 400);
    assert.equal((await asViewer(`/api/saved-views/${plannerId}`, 'DELETE')).status, 403);
    const shared = await (await asViewer('/api/saved-views?viewType=workload')).json();
    assert.ok(shared.some((view: { id: string }) => view.id === plannerId));
    await prisma.savedView.delete({ where: { id: plannerId } });

    await prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    assert.equal((await asEditor(`/api/projects/${project.id}/wbs-items/append`, 'POST', { parentId: null, title: 'Закрыт', startDate: '2026-10-05', dueDate: '2026-10-06' })).status, 423);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [editor.id, viewer.id] } } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
