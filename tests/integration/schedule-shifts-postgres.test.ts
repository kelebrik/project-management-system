import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';

const enabled = process.env.SCHEDULE_SHIFT_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('structure edits, calendar days and baselines are journaled against the checkpoints they move', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `sh-${suffix}`, name: 'Shift test' } });
  const user = await prisma.user.create({
    data: { email: `sh-${suffix}@example.test`, name: 'Иванов', role: 'ADMIN', passwordHash: await hashPassword('test-shifts-only') },
  });
  const project = await prisma.project.create({
    data: { code: `SH-${suffix}`, name: 'Shift test', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const task = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '1', title: 'Прошивка', type: 'TASK', status: 'IN_PROGRESS', owner: 'Иванов', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 10, wbsLevel: 1 },
  });
  const milestone = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '2', title: 'Готово', type: 'MILESTONE', status: 'NOT_STARTED', owner: '', startDate: day('2026-10-09'), dueDate: day('2026-10-09'), workDays: 0, sortOrder: 20, wbsLevel: 1, predecessor1: '1' },
  });
  const other = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '3', title: 'Другая веха', type: 'MILESTONE', status: 'NOT_STARTED', owner: '', startDate: day('2026-11-02'), dueDate: day('2026-11-02'), workDays: 0, sortOrder: 30, wbsLevel: 1 },
  });
  await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: task.id, successorId: milestone.id, type: 'FS', lagDays: 0 } });
  await recalculateProjectWbsSchedule(project.id);
  const settled = await prisma.wbsItem.findUniqueOrThrow({ where: { id: milestone.id } });
  await prisma.$executeRaw`UPDATE "WbsItem" SET "baselineDueDate" = "dueDate" WHERE "projectId" = ${project.id}`;
  await prisma.wbsBaseline.create({ data: { projectId: project.id, version: 1, title: 'Базовый план v1' } });

  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  const request = (url: string, options: RequestInit = {}) =>
    fetch(base + url, { ...options, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', ...options.headers } });
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: user.email, password: 'test-shifts-only' }) });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

    // A longer task pushes the milestone through its link: journaled as an edit of the task.
    const edit = await request(`/api/wbs-items/${task.id}`, { method: 'PATCH', body: JSON.stringify({ workDays: 8 }) });
    assert.equal(edit.status, 200, await edit.clone().text());
    const operationId = edit.headers.get('x-schedule-shift-operation-id');
    assert.ok(operationId);
    assert.equal(edit.headers.get('x-schedule-shift-reason-needed'), '1');
    const [shift] = await prisma.scheduleShift.findMany({ where: { operationId } });
    assert.deepEqual([shift.checkpointId, shift.kind, shift.trigger, shift.sourceCode, shift.actorName], [milestone.id, 'SHIFT', 'MANUAL_EDIT', '1', 'Иванов']);
    assert.ok((shift.deltaDays ?? 0) > 0);
    assert.equal(shift.previousDate?.toISOString().slice(0, 10), settled.dueDate?.toISOString().slice(0, 10));

    const ladders = (await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints;
    assert.deepEqual(ladders.map((ladder: any) => ladder.id), [milestone.id]);
    assert.equal(ladders[0].steps[0].needsReason, true);
    assert.equal(ladders[0].unexplainedDays, 0);

    // The page asks why, and the reason is kept on the move and counted by category.
    const operation = await (await request(`/api/schedule-shifts/operations/${operationId}`)).json();
    assert.deepEqual([operation.projectId, operation.shifts.map((row: any) => row.id)], [project.id, [shift.id]]);
    const reason = await request(`/api/projects/${project.id}/schedule-shifts/reason`, {
      method: 'PATCH',
      body: JSON.stringify({ shiftIds: [shift.id], category: 'SUPPLIER', text: 'Платы пришли позже' }),
    });
    assert.equal(reason.status, 200, await reason.clone().text());
    const reasoned = (await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints[0];
    assert.deepEqual(reasoned.reasonDays, { SUPPLIER: shift.deltaDays });
    assert.equal(reasoned.steps[0].needsReason, false);
    assert.deepEqual((await (await request(`/api/schedule-shifts/operations/${operationId}`)).json()).shifts, []);
    const foreign = await request(`/api/projects/${project.id}/schedule-shifts/reason`, {
      method: 'PATCH',
      body: JSON.stringify({ shiftIds: [shift.id, 'not-in-project'], category: 'OTHER' }),
    });
    assert.equal(foreign.status, 400);

    // Two edits at once: both are journaled, each as its own operation.
    const [a, b] = await Promise.all([
      request(`/api/wbs-items/${task.id}`, { method: 'PATCH', body: JSON.stringify({ workDays: 10 }) }),
      request(`/api/wbs-items/${other.id}`, { method: 'PATCH', body: JSON.stringify({ dueDate: '2026-11-05', startDate: '2026-11-05' }) }),
    ]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.notEqual(a.headers.get('x-schedule-shift-operation-id'), b.headers.get('x-schedule-shift-operation-id'));
    const own = await prisma.scheduleShift.findFirstOrThrow({ where: { operationId: b.headers.get('x-schedule-shift-operation-id')!, checkpointId: other.id } });
    assert.equal(own.deltaDays, 3);

    // A day off inside the task moves the milestone again; the calendar answers 204 and is journaled too.
    const beforeCalendar = await prisma.scheduleShift.count({ where: { projectId: project.id } });
    const calendar = await request(`/api/projects/${project.id}/calendar-overrides`, { method: 'PUT', body: JSON.stringify({ calendarCode: 'RU', date: '2026-10-07', isWorkingDay: false }) });
    assert.equal(calendar.status, 200, await calendar.clone().text());
    const calendarShift = await prisma.scheduleShift.findFirst({ where: { projectId: project.id, trigger: 'CALENDAR' } });
    assert.ok(calendarShift, 'calendar shift journaled');
    assert.ok((await prisma.scheduleShift.count({ where: { projectId: project.id } })) > beforeCalendar);
    const reset = await request(`/api/projects/${project.id}/calendar-overrides`, { method: 'DELETE', body: JSON.stringify({ calendarCode: 'RU', date: '2026-10-07' }) });
    assert.equal(reset.status, 204);

    // A baseline saved for the milestone only restarts its history; the other one keeps its steps.
    const baseline = await request(`/api/projects/${project.id}/wbs-baseline`, { method: 'POST', body: JSON.stringify({ itemIds: [milestone.id] }) });
    assert.ok(baseline.status < 300, await baseline.clone().text());
    const marker = await prisma.scheduleShift.findFirst({ where: { checkpointId: milestone.id, kind: 'BASELINE' } });
    assert.ok(marker, 'baseline marker journaled');
    const after = (await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints;
    assert.deepEqual(after.map((ladder: any) => ladder.id), [other.id]);
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
  }
});

test('before the plan is first fixed nothing counts: no journal, no ladders, no reasons; after it, moves count from there', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `nb-${suffix}`, name: 'No baseline test' } });
  const user = await prisma.user.create({
    data: { email: `nb-${suffix}@example.test`, name: 'Тарасов', role: 'ADMIN', passwordHash: await hashPassword('test-shifts-only') },
  });
  const project = await prisma.project.create({
    data: { code: `NB-${suffix}`, name: 'No baseline test', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const task = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '1', title: 'Кикофф', type: 'TASK', status: 'NOT_STARTED', owner: 'Тарасов', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 10, wbsLevel: 1 },
  });
  // A baseline date on the row (as an import gives) is not a fixed plan.
  const milestone = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '2', title: 'Проект запущен', type: 'MILESTONE', status: 'NOT_STARTED', owner: '', startDate: day('2026-10-09'), dueDate: day('2026-10-09'), baselineDueDate: day('2026-10-09'), workDays: 0, sortOrder: 20, wbsLevel: 1 },
  });
  await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: task.id, successorId: milestone.id, type: 'FS', lagDays: 0 } });
  await recalculateProjectWbsSchedule(project.id);
  await prisma.$executeRaw`UPDATE "WbsItem" SET "baselineDueDate" = "dueDate" WHERE "projectId" = ${project.id}`;

  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  const request = (url: string, options: RequestInit = {}) =>
    fetch(base + url, { ...options, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', ...options.headers } });
  const ladders = async () => (await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints as any[];
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: user.email, password: 'test-shifts-only' }) });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

    // Drafting the plan pushes the milestone far: nothing is journaled or asked.
    const draft = await request(`/api/wbs-items/${task.id}`, { method: 'PATCH', body: JSON.stringify({ workDays: 200 }) });
    assert.equal(draft.status, 200, await draft.clone().text());
    assert.equal(draft.headers.get('x-schedule-shift-reason-needed'), '0');
    assert.equal(await prisma.scheduleShift.count({ where: { projectId: project.id } }), 0);
    assert.deepEqual(await ladders(), []);
    // Rows written before the plan was fixed (by an older version) do not count either.
    const oldOperation = randomUUID();
    await prisma.scheduleShift.create({
      data: { projectId: project.id, kind: 'SHIFT', checkpointId: milestone.id, checkpointCode: '2', checkpointTitle: 'Проект запущен', checkpointType: 'MILESTONE', previousDate: day('2026-10-09'), newDate: day('2027-08-06'), deltaDays: 301, baselineDate: day('2026-10-09'), trigger: 'MANUAL_EDIT', operationId: oldOperation, createdAt: new Date(Date.now() - 60_000) },
    });
    assert.deepEqual(await ladders(), []);
    const asked = async () => (await (await request(`/api/schedule-shifts/operations/${oldOperation}`)).json()).shifts;
    assert.deepEqual(await asked(), []);
    const pending = await (await request(`/api/projects/${project.id}/schedule-shifts/pending`)).json();
    assert.deepEqual(pending.sessions, []);

    // The plan is fixed: from now on a move later than it counts and asks why.
    const fixed = await request(`/api/projects/${project.id}/wbs-baseline`, { method: 'POST', body: JSON.stringify({}) });
    assert.ok(fixed.status < 300, await fixed.clone().text());
    assert.deepEqual(await ladders(), []);
    assert.deepEqual(await asked(), []);
    const late = await request(`/api/wbs-items/${task.id}`, { method: 'PATCH', body: JSON.stringify({ workDays: 205 }) });
    assert.equal(late.status, 200, await late.clone().text());
    assert.equal(late.headers.get('x-schedule-shift-reason-needed'), '1');
    const after = await ladders();
    assert.deepEqual(after.map((ladder) => [ladder.id, ladder.steps.length, ladder.unexplainedDays]), [[milestone.id, 1, 0]]);
    assert.ok(after[0].varianceDays > 0 && after[0].varianceDays < 10);
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.businessUnit.delete({ where: { id: unit.id } }).catch(() => undefined);
  }
});
