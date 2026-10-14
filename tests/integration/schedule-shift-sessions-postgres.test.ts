import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import {
  closeShiftSession,
  pendingShiftSessions,
  recordInSession,
  reviewShiftSessions,
  SESSION_GAP_MS,
  withReasonRows,
  type ShiftRow,
} from '../../apps/api/src/services/schedule-shifts.js';

const enabled = process.env.SCHEDULE_SHIFT_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 9, 0) + minutes * 60_000);

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `ss-${suffix}`, name: 'Session test' } });
  const project = await prisma.project.create({
    data: { code: `SS-${suffix}`, name: 'Session test', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const milestone = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '1', title: 'Готово', type: 'MILESTONE', status: 'NOT_STARTED', owner: '', startDate: day('2026-11-01'), dueDate: day('2026-11-01'), baselineDueDate: day('2026-11-01'), workDays: 0, sortOrder: 10, wbsLevel: 1 },
  });
  // A move of the milestone as the journal would record it.
  const move = (operationId: string, from: string, to: string, actorId: string | null): ShiftRow => ({
    projectId: project.id, kind: 'SHIFT', checkpointId: milestone.id, checkpointCode: '1', checkpointTitle: 'Готово', checkpointType: 'MILESTONE',
    previousDate: day(from), newDate: day(to), deltaDays: Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000), baselineDate: day('2026-11-01'),
    trigger: 'MANUAL_EDIT', sourceItemId: null, sourceCode: null, sourceTitle: null, sourceIssueId: null, sourceNote: null, actorId, actorName: actorId, operationId,
  });
  const cleanup = async () => {
    await prisma.project.deleteMany({ where: { id: project.id } });
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } });
  };
  return { unit, project, milestone, move, cleanup };
}

const sessionsOf = (projectId: string) => prisma.scheduleShiftSession.findMany({ where: { projectId }, orderBy: { startedAt: 'asc' } });

test('sessions follow the project: A, B, A are three; the system and failures stand alone; a pause over 30 minutes starts another', { skip: !enabled }, async () => {
  const { project, move, cleanup } = await fixture();
  const A = { id: 'user-a', name: 'Анна' };
  const B = { id: 'user-b', name: 'Борис' };
  try {
    const s1 = await recordInSession(project.id, A, 'succeeded', [move('o1', '2026-11-01', '2026-11-03', A.id)], at(0));
    // A save with no move extends the session; exactly 30 minutes later still does.
    assert.equal(await recordInSession(project.id, A, 'succeeded', [], at(10)), s1);
    assert.equal(await recordInSession(project.id, A, 'succeeded', [], at(40)), s1);
    const s2 = await recordInSession(project.id, B, 'succeeded', [move('o2', '2026-11-03', '2026-11-05', B.id)], at(41));
    const s3 = await recordInSession(project.id, A, 'succeeded', [move('o3', '2026-11-05', '2026-11-06', A.id)], at(42));
    assert.equal(new Set([s1, s2, s3]).size, 3);
    let sessions = await sessionsOf(project.id);
    assert.deepEqual(sessions.map((session) => [session.actorId, session.closedAt?.getTime() ?? null]), [[A.id, at(40).getTime()], [B.id, at(41).getTime()], [A.id, null]]);

    // The system's move stands alone and ends the open session; so does a failure that still moved a date.
    assert.equal(await recordInSession(project.id, null, 'succeeded', [move('o4', '2026-11-06', '2026-11-07', null)], at(43)), null);
    assert.ok((await prisma.scheduleShiftSession.findUniqueOrThrow({ where: { id: s3! } })).closedAt);
    const s4 = await recordInSession(project.id, A, 'succeeded', [], at(44));
    assert.equal(await recordInSession(project.id, A, 'failed', [move('o5', '2026-11-07', '2026-11-08', A.id)], at(45)), null);
    assert.ok((await prisma.scheduleShiftSession.findUniqueOrThrow({ where: { id: s4! } })).closedAt);
    // A refusal, a failure or a repeat without moves touches no session.
    const s5 = await recordInSession(project.id, A, 'succeeded', [], at(46));
    for (const outcome of ['failed', 'replayed'] as const) assert.equal(await recordInSession(project.id, B, outcome, [], at(47)), null);
    assert.equal((await prisma.scheduleShiftSession.findUniqueOrThrow({ where: { id: s5! } })).closedAt, null);
    // A pause of more than 30 minutes starts another session of the same person.
    const s6 = await recordInSession(project.id, A, 'succeeded', [], new Date(at(46).getTime() + SESSION_GAP_MS + 1));
    assert.notEqual(s6, s5);
    sessions = await sessionsOf(project.id);
    assert.equal(sessions.filter((session) => !session.closedAt).length, 1);
    const rows = await prisma.scheduleShift.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(rows.map((row) => [row.operationId, row.sessionId]), [['o1', s1], ['o2', s2], ['o3', s3], ['o4', null], ['o5', null]]);
  } finally {
    await cleanup();
  }
});

test('closing is addressed: a leave closes, an idle close waits for the server pause, a repeat does nothing', { skip: !enabled }, async () => {
  const { project, cleanup } = await fixture();
  const A = { id: 'user-a', name: 'Анна' };
  try {
    const now = new Date();
    const s1 = (await recordInSession(project.id, A, 'succeeded', [], now))!;
    // Another tab kept editing: an idle close from the first does not end the session.
    assert.deepEqual(await closeShiftSession(project.id, s1, A.id, 'idle', { now: new Date(now.getTime() + 5 * 60_000) }), { found: true, closed: false });
    assert.deepEqual(await closeShiftSession(project.id, s1, 'someone-else', 'leave'), { found: false });
    assert.deepEqual(await closeShiftSession(project.id, s1, A.id, 'leave'), { found: true, closed: true });
    const s2 = (await recordInSession(project.id, A, 'succeeded', [], new Date(now.getTime() + 60_000)))!;
    // Closing the old session again leaves the new one open.
    assert.deepEqual(await closeShiftSession(project.id, s1, A.id, 'leave'), { found: true, closed: true });
    assert.equal((await prisma.scheduleShiftSession.findUniqueOrThrow({ where: { id: s2 } })).closedAt, null);
    assert.deepEqual(await closeShiftSession(project.id, s2, A.id, 'idle', { now: new Date(now.getTime() + 60_000 + SESSION_GAP_MS + 1) }), { found: true, closed: true });
  } finally {
    await cleanup();
  }
});

test('the session lock orders a write and a close: a closed session never gains rows', { skip: !enabled }, async () => {
  const { project, move, cleanup } = await fixture();
  const A = { id: 'user-a', name: 'Анна' };
  try {
    const now = new Date();
    const s1 = (await recordInSession(project.id, A, 'succeeded', [move('o1', '2026-11-01', '2026-11-03', A.id)], now))!;
    // A write holding the lock first: the close waits for its commit, and then closes the session with its row in it.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const writer = prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shift-session:${project.id}`}))`;
      locked();
      await held;
      await db.scheduleShiftSession.update({ where: { id: s1 }, data: { lastActivityAt: new Date() } });
      await db.scheduleShift.create({ data: { ...move('o2', '2026-11-03', '2026-11-04', A.id), sessionId: s1 } });
    }, { timeout: 20_000 });
    await lockTaken;
    let closeDone = false;
    const closing = closeShiftSession(project.id, s1, A.id, 'leave').then((result) => {
      closeDone = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(closeDone, false, 'the close waits for the write');
    release();
    await writer;
    assert.deepEqual(await closing, { found: true, closed: true });
    assert.equal(await prisma.scheduleShift.count({ where: { sessionId: s1 } }), 2);

    // The close first: a write that waits for its lock opens a new session instead of joining the closed one.
    const s2 = (await recordInSession(project.id, A, 'succeeded', [move('o3', '2026-11-04', '2026-11-05', A.id)]))!;
    let releaseClose!: () => void;
    const closeHeld = new Promise<void>((resolve) => (releaseClose = resolve));
    let closeLocked!: () => void;
    const closeLockTaken = new Promise<void>((resolve) => (closeLocked = resolve));
    const closer = prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shift-session:${project.id}`}))`;
      closeLocked();
      await closeHeld;
      await db.scheduleShiftSession.update({ where: { id: s2 }, data: { closedAt: new Date() } });
    }, { timeout: 20_000 });
    await closeLockTaken;
    let writeDone = false;
    const writing = recordInSession(project.id, A, 'succeeded', [move('o4', '2026-11-05', '2026-11-06', A.id)]).then((sessionId) => {
      writeDone = true;
      return sessionId;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(writeDone, false, 'the write waits for the close');
    releaseClose();
    await closer;
    const s3 = await writing;
    assert.notEqual(s3, s2);
    assert.equal(await prisma.scheduleShift.count({ where: { sessionId: s2 } }), 1);
    assert.equal(await prisma.scheduleShift.count({ where: { sessionId: s3! } }), 1);
  } finally {
    await cleanup();
  }
});

test("the reasons asked: a person's closed sessions with net moves past the baseline, given by session, looked at once", { skip: !enabled }, async () => {
  const { project, milestone, move, cleanup } = await fixture();
  const A = { id: 'user-a', name: 'Анна' };
  const B = { id: 'user-b', name: 'Борис' };
  try {
    const now = new Date();
    const minute = (count: number) => new Date(now.getTime() + count * 60_000);
    // A sends the date away and back, then later: one net move of +3.
    const s1 = (await recordInSession(project.id, A, 'succeeded', [move('o1', '2026-11-01', '2026-11-10', A.id)], minute(0)))!;
    await recordInSession(project.id, A, 'succeeded', [move('o2', '2026-11-10', '2026-11-01', A.id)], minute(1));
    await recordInSession(project.id, A, 'succeeded', [move('o3', '2026-11-01', '2026-11-04', A.id)], minute(2));
    // Still open: nothing to ask, it is named as the person's open session, and cannot be named by the session yet.
    const open = await pendingShiftSessions(project.id, A.id, { now: minute(3) });
    assert.deepEqual(open.sessions, []);
    assert.deepEqual(open.ownOpen, { id: s1, lastActivityAt: minute(2).toISOString() });
    const early = await withReasonRows(project.id, { sessionId: s1, checkpointIds: [milestone.id] }, async () => 0);
    assert.deepEqual(early, { ok: false, error: 'Причину можно указать, когда правки закончены' });
    // A new tab ends it as left only if nothing was saved in it since the page looked.
    assert.deepEqual(await closeShiftSession(project.id, s1, A.id, 'stale', { lastActivityAt: minute(1) }), { found: true, closed: false });
    assert.deepEqual(await closeShiftSession(project.id, s1, A.id, 'stale', { lastActivityAt: minute(2) }), { found: true, closed: true });
    const pending = await pendingShiftSessions(project.id, A.id, { now: minute(4) });
    assert.equal(pending.ownOpen, null);
    assert.deepEqual(pending.sessions.map((session) => [session.id, session.steps.map((step) => [step.checkpointId, step.deltaDays, step.previousDate, step.newDate])]), [[s1, [[milestone.id, 3, '2026-11-01', '2026-11-04']]]]);
    // B sees nothing of A's.
    assert.deepEqual((await pendingShiftSessions(project.id, B.id, { now: minute(4) })).sessions, []);
    const given = await withReasonRows(project.id, { sessionId: s1, checkpointIds: [milestone.id] }, async (db, ids) => {
      await db.scheduleShift.updateMany({ where: { id: { in: ids } }, data: { reasonCategory: 'CUSTOMER' } });
      return ids.length;
    });
    assert.deepEqual(given, { ok: true, value: 3 });
    // B cannot mark A's session looked at; A can.
    assert.equal(await reviewShiftSessions(project.id, B.id, [s1]), 0);
    assert.equal(await reviewShiftSessions(project.id, A.id, [s1]), 1);
    // A new session with a move back only asks nothing, and is marked looked at by itself.
    const s2 = (await recordInSession(project.id, A, 'succeeded', [move('o4', '2026-11-04', '2026-11-02', A.id)], minute(5)))!;
    assert.deepEqual((await pendingShiftSessions(project.id, A.id, { now: new Date(minute(5).getTime() + SESSION_GAP_MS + 1) })).sessions, []);
    assert.ok((await prisma.scheduleShiftSession.findUniqueOrThrow({ where: { id: s2 } })).reviewedAt);
  } finally {
    await cleanup();
  }
});

test('the session routes: saves join one session, a leave closes it, the reason goes to all its moves', { skip: !enabled }, async () => {
  const { unit, project, milestone, cleanup } = await fixture();
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { email: `ssr-${suffix}@example.test`, name: 'Анна', role: 'ADMIN', passwordHash: await hashPassword('test-sessions-only') } });
  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  let cookie = '';
  const request = (url: string, options: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${address.port}${url}`, { ...options, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', ...options.headers } });
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: user.email, password: 'test-sessions-only' }) });
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const save = async (due: string) => {
      const answer = await request(`/api/wbs-items/${milestone.id}`, { method: 'PATCH', body: JSON.stringify({ dueDate: due, startDate: due }) });
      assert.equal(answer.status, 200, await answer.clone().text());
      return { sessionId: answer.headers.get('x-schedule-shift-session-id'), projectId: answer.headers.get('x-schedule-shift-project-id') };
    };
    const first = await save('2026-11-08');
    const second = await save('2026-11-03');
    const third = await save('2026-11-05');
    assert.ok(first.sessionId);
    assert.deepEqual([second.sessionId, third.sessionId, first.projectId], [first.sessionId, first.sessionId, project.id]);
    // One step on the Status page while editing goes on.
    const ladder = (await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints[0];
    assert.deepEqual(ladder.steps.map((step: any) => [step.deltaDays, step.operations, step.sessionOpen]), [[4, 3, true]]);

    assert.equal((await request(`/api/projects/${project.id}/schedule-shifts/sessions/${first.sessionId}/close`, { method: 'POST', body: JSON.stringify({ mode: 'leave' }) })).status, 200);
    const pending = await (await request(`/api/projects/${project.id}/schedule-shifts/pending`)).json();
    assert.deepEqual(pending.sessions.map((session: any) => [session.id, session.steps.map((step: any) => step.deltaDays)]), [[first.sessionId, [4]]]);
    const reason = await request(`/api/projects/${project.id}/schedule-shifts/reason`, { method: 'PATCH', body: JSON.stringify({ sessionId: first.sessionId, checkpointIds: [milestone.id], category: 'ESTIMATE', text: 'Оценка была занижена' }) });
    assert.equal(reason.status, 200, await reason.clone().text());
    assert.deepEqual(await reason.json(), { updated: 3 });
    assert.equal((await request(`/api/projects/${project.id}/schedule-shifts/sessions/review`, { method: 'POST', body: JSON.stringify({ sessionIds: [first.sessionId] }) })).status, 200);
    assert.deepEqual((await (await request(`/api/projects/${project.id}/schedule-shifts/pending`)).json()).sessions, []);
    const explained = (await (await request(`/api/projects/${project.id}/schedule-shifts`)).json()).checkpoints[0];
    assert.deepEqual(explained.reasonDays, { ESTIMATE: 4 });

    // A new save after the leave is a new session.
    const again = await save('2026-11-06');
    assert.notEqual(again.sessionId, first.sessionId);
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.user.deleteMany({ where: { id: user.id } });
    await cleanup();
  }
});
