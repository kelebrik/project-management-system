import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.SCHEDULE_SHIFT_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

test('any open goal moves with its history, an agreed move is no delay, and the project target is the last goal', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `gt-${suffix}`, name: 'Goal target test' } });
  const user = await prisma.user.create({
    data: { email: `gt-${suffix}@example.test`, name: 'Петров', role: 'ADMIN', passwordHash: await hashPassword('test-goals-only') },
  });
  const projectData = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...projectData, code: `GT-${suffix}`, name: 'Goal target test' } });
  const done = await prisma.project.create({ data: { ...projectData, code: `GD-${suffix}`, name: 'Goals done' } });
  const bare = await prisma.project.create({ data: { ...projectData, code: `GB-${suffix}`, name: 'No goals' } });
  const goal = (projectId: string, code: string, date: string, extra: Record<string, unknown> = {}) =>
    prisma.wbsItem.create({
      data: { projectId, code, title: `Цель ${code}`, type: 'GOAL', status: 'NOT_STARTED', owner: '', startDate: day(date), dueDate: day(date), baselineStartDate: day(date), baselineDueDate: day(date), workDays: 0, calendarDays: 1, wbsLevel: 1, sortOrder: Number(code) * 10, ...extra },
    });
  const task = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '1', title: 'Сборка', type: 'TASK', status: 'IN_PROGRESS', owner: 'Петров', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 10, wbsLevel: 1 },
  });
  const first = await goal(project.id, '2', '2026-11-10');
  const last = await goal(project.id, '3', '2026-12-20');
  await goal(done.id, '1', '2026-11-10', { status: 'DONE' });
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
  const moveGoal = (projectId: string, body: Record<string, unknown>) =>
    request(`/api/projects/${projectId}/target-date`, { method: 'PATCH', body: JSON.stringify({ reason: 'Перенос поставки', ...body }) });
  const read = (id: string) => prisma.wbsItem.findUniqueOrThrow({ where: { id } });
  const targetOf = async (id: string) => iso((await prisma.project.findUniqueOrThrow({ where: { id } })).targetDate);
  const ladderOf = async (checkpointId: string) =>
    ((await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints as any[]).find((ladder) => ladder.id === checkpointId);
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: user.email, password: 'test-goals-only' }) });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

    // The last goal, not the active one, moves; the project's target follows it and keeps the first as initial.
    const moved = await moveGoal(project.id, { goalId: last.id, targetDate: '2027-01-15' });
    assert.equal(moved.status, 200, await moved.clone().text());
    assert.equal(iso((await read(last.id)).dueDate), '2027-01-15');
    assert.equal(iso((await read(first.id)).dueDate), '2026-11-10');
    const afterMove = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.deepEqual([iso(afterMove.targetDate), iso(afterMove.initialTargetDate)], ['2027-01-15', '2026-12-01']);
    assert.equal(iso(new Date((await moved.json()).targetDate)), '2027-01-15');
    const [lastChange] = await prisma.projectTargetDateChange.findMany({ where: { projectId: project.id } });
    assert.deepEqual(
      [lastChange.goalId, lastChange.goalCode, lastChange.goalTitle, iso(lastChange.previousDate), iso(lastChange.newDate), lastChange.notDelay],
      [last.id, '3', 'Цель 3', '2026-12-20', '2027-01-15', false],
    );
    const auditFields = async () => {
      const event = await prisma.auditEvent.findFirstOrThrow({ where: { projectId: project.id, action: 'project.target_date.update' }, orderBy: { createdAt: 'desc' }, include: { changes: true } });
      return event.changes.map((change) => change.field).sort();
    };
    assert.deepEqual(await auditFields(), ['goal.3.dueDate', 'targetDate']);

    // An agreed move needs who agreed.
    const unnamed = await moveGoal(project.id, { goalId: first.id, targetDate: '2026-11-20', notDelay: true });
    assert.equal(unnamed.status, 400);
    const blank = await moveGoal(project.id, { goalId: first.id, targetDate: '2026-11-20', notDelay: true, approvedBy: '   ' });
    assert.equal(blank.status, 400);

    // An agreed move sets the goal's baseline too: no delay, no reason asked, its history starts again.
    const agreed = await moveGoal(project.id, { goalId: first.id, targetDate: '2026-11-20', notDelay: true, approvedBy: 'Комитет' });
    assert.equal(agreed.status, 200, await agreed.clone().text());
    assert.equal(agreed.headers.get('x-schedule-shift-reason-needed'), '0');
    const rebased = await read(first.id);
    assert.deepEqual([iso(rebased.dueDate), iso(rebased.baselineDueDate), iso(rebased.baselineStartDate)], ['2026-11-20', '2026-11-20', '2026-11-20']);
    const agreedOperation = agreed.headers.get('x-schedule-shift-operation-id')!;
    const agreedRows = await prisma.scheduleShift.findMany({ where: { operationId: agreedOperation, checkpointId: first.id } });
    assert.deepEqual(agreedRows.map((row) => row.kind).sort(), ['BASELINE', 'SHIFT']);
    const ladder = await ladderOf(first.id);
    assert.deepEqual([ladder?.varianceDays ?? 0, ladder?.steps?.length ?? 0], [0, 0]);
    assert.equal(await targetOf(project.id), '2027-01-15');
    assert.deepEqual(await auditFields(), ['goal.2.baselineDueDate', 'goal.2.dueDate']);

    // Agreeing the date the goal already has is still a move: the baseline is set anew and the history says so.
    const again = await moveGoal(project.id, { goalId: first.id, targetDate: '2026-11-20', notDelay: true, approvedBy: 'Комитет' });
    assert.equal(again.status, 200, await again.clone().text());
    const againRows = await prisma.scheduleShift.findMany({ where: { operationId: again.headers.get('x-schedule-shift-operation-id')!, checkpointId: first.id } });
    assert.deepEqual(againRows.map((row) => row.kind), ['BASELINE']);
    const sameDay = await prisma.projectTargetDateChange.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' } });
    assert.deepEqual([iso(sameDay.previousDate), iso(sameDay.newDate), sameDay.notDelay, sameDay.approvedBy], ['2026-11-20', '2026-11-20', true, 'Комитет']);
    // Without the mark the same date is no change.
    const unchanged = await moveGoal(project.id, { goalId: first.id, targetDate: '2026-11-20' });
    assert.equal(unchanged.status, 200);
    assert.equal(await prisma.projectTargetDateChange.count({ where: { projectId: project.id } }), 3);

    // A date the goal's links do not allow is refused, and nothing of it stays: no date, no history, no journal.
    // A finish-to-finish link sets the goal's date to its predecessor's finish.
    await prisma.wbsItem.update({ where: { id: task.id }, data: { dueDate: day('2026-12-04'), workDays: 45 } });
    const link = await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: task.id, successorId: first.id, type: 'FF', lagDays: 0 } });
    const shiftsBefore = await prisma.scheduleShift.count({ where: { projectId: project.id } });
    const conflict = await moveGoal(project.id, { goalId: first.id, targetDate: '2026-11-25', notDelay: true, approvedBy: 'Комитет' });
    assert.equal(conflict.status, 409, await conflict.clone().text());
    assert.match((await conflict.json()).error, /не может стоять на 25\.11\.2026/);
    const untouched = await read(first.id);
    assert.deepEqual([iso(untouched.dueDate), iso(untouched.baselineDueDate)], ['2026-11-20', '2026-11-20']);
    assert.equal(await prisma.projectTargetDateChange.count({ where: { projectId: project.id } }), 3);
    assert.equal(await prisma.scheduleShift.count({ where: { projectId: project.id } }), shiftsBefore);
    assert.deepEqual([(await ladderOf(first.id))?.steps?.length ?? 0], [0]);
    await prisma.wbsDependency.delete({ where: { id: link.id } });
    await prisma.wbsItem.update({ where: { id: task.id }, data: { dueDate: day('2026-10-09'), workDays: 5 } });

    // A done or missing goal is not moved; a project whose goals are all done has none to move.
    assert.equal((await moveGoal(project.id, { goalId: randomUUID(), targetDate: '2026-11-25' })).status, 409);
    assert.equal((await moveGoal(done.id, { targetDate: '2026-11-25' })).status, 409);
    // Without goals the project's own date moves; an agreed move needs a goal.
    assert.equal((await moveGoal(bare.id, { targetDate: '2026-12-15', notDelay: true, approvedBy: 'Комитет' })).status, 400);
    const bareMove = await moveGoal(bare.id, { targetDate: '2026-12-15' });
    assert.equal(bareMove.status, 200, await bareMove.clone().text());
    assert.equal(await targetOf(bare.id), '2026-12-15');

    // The project's own date is set by hand only without goals, and a refused change leaves every field.
    const handSet = await request(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Новое имя', targetDate: '2027-03-01' }) });
    assert.equal(handSet.status, 409, await handSet.clone().text());
    const kept = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.deepEqual([kept.name, iso(kept.targetDate)], ['Goal target test', '2027-01-15']);
    // A goal without a date is a goal too: the project's date is not set by hand then either.
    const undated = await goal(bare.id, '1', '2026-12-10', { startDate: null, dueDate: null, baselineStartDate: null, baselineDueDate: null });
    const undatedHandSet = await request(`/api/projects/${bare.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Без целей', summary: 'Новое', targetDate: '2027-03-01' }) });
    assert.equal(undatedHandSet.status, 409, await undatedHandSet.clone().text());
    const bareKept = await prisma.project.findUniqueOrThrow({ where: { id: bare.id } });
    assert.deepEqual([bareKept.name, bareKept.summary, iso(bareKept.targetDate)], ['No goals', '', '2026-12-15']);
    await prisma.wbsItem.delete({ where: { id: undated.id } });
    const bareHandSet = await request(`/api/projects/${bare.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Без целей', targetDate: '2027-03-01' }) });
    assert.equal(bareHandSet.status, 200, await bareHandSet.clone().text());
    assert.equal(await targetOf(bare.id), '2027-03-01');

    // Any Structure edit that moves the last goal moves the project's target.
    const edit = await request(`/api/wbs-items/${last.id}`, { method: 'PATCH', body: JSON.stringify({ startDate: '2027-02-01', dueDate: '2027-02-01' }) });
    assert.equal(edit.status, 200, await edit.clone().text());
    assert.equal(await targetOf(project.id), iso((await read(last.id)).dueDate));
    assert.equal(await targetOf(project.id), '2027-02-01');
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: [project.id, done.id, bare.id] } } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { id: { in: [project.id, done.id, bare.id] } } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.businessUnit.delete({ where: { id: unit.id } }).catch(() => undefined);
  }
});

test('the migration sets each project target to its last goal, cancelled goals aside', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `gm-${suffix}`, name: 'Goal migration test' } });
  const projectData = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const withGoals = await prisma.project.create({ data: { ...projectData, code: `GM-${suffix}`, name: 'With goals' } });
  const without = await prisma.project.create({ data: { ...projectData, code: `GN-${suffix}`, name: 'Without goals' } });
  const goalRow = (code: string, date: string, status: string) => ({
    projectId: withGoals.id, code, title: code, type: 'GOAL' as const, status: status as never, owner: '', startDate: day(date), dueDate: day(date), workDays: 0, wbsLevel: 1, sortOrder: Number(code),
  });
  await prisma.wbsItem.createMany({ data: [goalRow('1', '2027-01-10', 'DONE'), goalRow('2', '2027-04-01', 'CANCELLED'), goalRow('3', '2026-12-20', 'NOT_STARTED')] });
  try {
    const sql = readFileSync(new URL('../../prisma/migrations/20261015120000_goal_target_changes/migration.sql', import.meta.url), 'utf8');
    const update = sql.slice(sql.indexOf('UPDATE "Project"'));
    await prisma.$executeRawUnsafe(update.replace(/;\s*$/, '') + ` AND p."businessUnitId" = '${unit.id}'`);
    const [moved, kept] = await Promise.all([withGoals, without].map((item) => prisma.project.findUniqueOrThrow({ where: { id: item.id } })));
    assert.deepEqual([iso(moved.targetDate), iso(moved.initialTargetDate)], ['2027-01-10', '2026-12-01']);
    assert.deepEqual([iso(kept.targetDate), iso(kept.initialTargetDate)], ['2026-12-01', null]);
  } finally {
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
