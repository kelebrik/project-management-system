import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { runAutomationRule, runAutomationTick } from '../../apps/api/src/services/automation/engine.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const DAY_MS = 86_400_000;
const day = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offset * DAY_MS);
};
/**
 * The next Friday 10:00 UTC (13:00 in Moscow), so the weekly and daily checks
 * are due; on a Friday it is a week ahead, so data the rules require to be
 * fresh is dated relative to it.
 */
function nextFridayNoon() {
  const now = new Date();
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((5 - now.getUTCDay() + 7) % 7 || 7), 10));
  return friday;
}

test('rules fire once on recorded events and schedules, tell recipients, and prepare changes a person applies', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `auto-${suffix}`, name: 'Automation test' } });
  const password = await hashPassword('test-automation-only');
  const pm = await prisma.user.create({ data: { email: `pm-${suffix}@example.test`, name: 'РП', role: 'ADMIN', passwordHash: password } });
  const owner = await prisma.user.create({ data: { email: `ow-${suffix}@example.test`, name: 'Сидоров', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const employee = await prisma.leaveEmployee.create({ data: { name: `Сидоров ${suffix}`, userId: owner.id } });
  const project = await prisma.project.create({
    data: { code: `AU-${suffix}`, name: 'Automation', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Руководитель', startDate: day(-30), targetDate: day(90), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const milestone = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '1', title: 'Пилот', type: 'MILESTONE', owner: `сидоров  ${suffix}`, dueDate: day(20), baselineDueDate: day(10), sortOrder: 10, wbsLevel: 1 },
  });
  const task = await prisma.wbsItem.create({
    data: { projectId: project.id, code: '2', title: 'Сборка', type: 'TASK', status: 'IN_PROGRESS', owner: 'Петров', startDate: day(-5), dueDate: day(5), workDays: 5, jiraTicketKey: 'AU-1', sortOrder: 20, wbsLevel: 1 },
  });
  await prisma.wbsItem.create({ data: { projectId: project.id, code: '3', title: 'Тесты', type: 'TASK', status: 'NOT_STARTED', owner: 'Иванов', startDate: day(-2), dueDate: day(8), workDays: 5, sortOrder: 30, wbsLevel: 1 } });
  const ticketUpdatedAt = new Date();
  await prisma.jiraIssueSnapshot.create({
    data: { projectId: project.id, issueKey: 'AU-1', issueUrl: 'https://jira.example.test/browse/AU-1', summary: 'Сборка', status: 'Done', priority: 'High', issueType: 'Task', updatedAt: ticketUpdatedAt, syncedAt: new Date(nextFridayNoon().getTime() - 3_600_000) },
  });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-automation-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asPm = await session(pm.email);
    const asOwner = await session(owner.email);
    for (const template of ['MILESTONE_SHIFT', 'MISSING_CHECK_IN', 'CHECK_IN_BLOCKER', 'FLOAT_EXHAUSTED', 'JIRA_DONE']) {
      const saved = await asPm(`/api/projects/${project.id}/automation-rules/${template}`, 'PUT', { enabled: true, params: template === 'MILESTONE_SHIFT' ? { minDays: 3 } : {}, recipientIds: [pm.id] });
      assert.equal(saved.status, 200, template);
    }
    assert.equal((await asOwner(`/api/projects/${project.id}/automation-rules/JIRA_DONE`, 'PUT', { enabled: false, params: {}, recipientIds: [] })).status, 403);
    assert.equal((await asPm(`/api/projects/${project.id}/automation-rules/JIRA_DONE`, 'PUT', { enabled: true, params: {}, recipientIds: [pm.id], version: 7 })).status, 409);
    assert.equal((await asPm(`/api/projects/${project.id}/automation-rules/MILESTONE_SHIFT`, 'PUT', { enabled: true, params: { minDays: 0 }, recipientIds: [] })).status, 400);

    // Events recorded after the rules were switched on.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const biggest = await prisma.scheduleShift.create({
      data: { projectId: project.id, kind: 'SHIFT', checkpointId: milestone.id, checkpointCode: '1', checkpointTitle: 'Пилот', checkpointType: 'MILESTONE', previousDate: day(15), newDate: day(20), deltaDays: 5, baselineDate: day(10), trigger: 'MANUAL_EDIT', operationId: randomUUID() },
    });
    await prisma.scheduleShift.create({
      data: { projectId: project.id, kind: 'SHIFT', checkpointId: milestone.id, checkpointCode: '1', checkpointTitle: 'Пилот', checkpointType: 'MILESTONE', previousDate: day(19), newDate: day(20), deltaDays: 1, baselineDate: day(10), trigger: 'MANUAL_EDIT', operationId: randomUUID() },
    });
    const now = nextFridayNoon();
    // A smaller move read first does not hide a bigger one of the same day.
    await prisma.scheduleShift.create({
      data: { projectId: project.id, kind: 'SHIFT', checkpointId: milestone.id, checkpointCode: '1', checkpointTitle: 'Пилот', checkpointType: 'MILESTONE', previousDate: day(16), newDate: day(20), deltaDays: 4, baselineDate: day(10), trigger: 'MANUAL_EDIT', operationId: randomUUID(), createdAt: new Date(biggest.createdAt.getTime() - 1) },
    });
    await prisma.workCheckIn.create({ data: { projectId: project.id, wbsItemId: task.id, userId: owner.id, personName: 'Петров', weekStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 4)), confidence: 'OFF_TRACK', blocker: 'Нет стенда' } });

    const shiftRule = await prisma.automationRule.findFirstOrThrow({ where: { projectId: project.id, template: 'MILESTONE_SHIFT' } });
    assert.equal(await runAutomationRule(shiftRule.id, now, { batch: 1 }), 'ran');
    await runAutomationTick(now);
    const kinds = async (userId: string) => (await prisma.notification.findMany({ where: { userId, projectId: project.id }, orderBy: { kind: 'asc' } })).map((row) => row.kind);
    assert.deepEqual(await kinds(pm.id), ['CHECK_IN_BLOCKER', 'CHECK_IN_MISSING_SUMMARY', 'JIRA_DONE', 'MILESTONE_SHIFTED']);
    assert.deepEqual(await kinds(owner.id), ['SHIFT_REASON_ASKED']);
    const summary = await prisma.notification.findFirstOrThrow({ where: { userId: pm.id, projectId: project.id, kind: 'CHECK_IN_MISSING_SUMMARY' } });
    assert.deepEqual((summary.params as { people: string[] }).people, ['Иванов']);
    const shifted = await prisma.notification.findFirstOrThrow({ where: { userId: pm.id, projectId: project.id, kind: 'MILESTONE_SHIFTED' } });
    assert.equal((shifted.params as { days: number }).days, 5);
    assert.equal(shifted.href, `/AU-${suffix}/overview#schedule-shifts`);
    // The first float look only remembers what is critical now.
    const floatRule = await prisma.automationRule.findFirstOrThrow({ where: { projectId: project.id, template: 'FLOAT_EXHAUSTED' } });
    assert.ok(Array.isArray((floatRule.state as { floatIds?: string[] }).floatIds));

    // Running again, or an hour later, repeats nothing.
    await runAutomationTick(now);
    await runAutomationTick(new Date(now.getTime() + 3_600_000));
    assert.equal(await prisma.notification.count({ where: { projectId: project.id } }), 5);
    assert.equal(await prisma.automationProposal.count({ where: { projectId: project.id } }), 2);
    assert.equal(await runAutomationRule('missing-rule', now), 'skipped');

    const preview = await (await asPm(`/api/projects/${project.id}/automation-rules/MILESTONE_SHIFT/preview?minDays=3`)).json();
    assert.deepEqual([preview.mode, preview.total], ['HISTORY', 1]);

    const proposals = await (await asPm(`/api/projects/${project.id}/automation/proposals`)).json();
    const issueProposal = proposals.find((row: { kind: string }) => row.kind === 'CREATE_ISSUE');
    const statusProposal = proposals.find((row: { kind: string }) => row.kind === 'SET_WBS_STATUS');
    assert.equal(issueProposal.payload.owner, 'Руководитель');
    assert.equal((await asOwner(`/api/projects/${project.id}/automation/proposals/${issueProposal.id}/apply`, 'POST', { version: issueProposal.version })).status, 403);
    const applied = await asPm(`/api/projects/${project.id}/automation/proposals/${issueProposal.id}/apply`, 'POST', { version: issueProposal.version, severity: 'CRITICAL' });
    assert.equal(applied.status, 200);
    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: (await applied.json()).issueId } });
    assert.deepEqual([issue.title, issue.severity, issue.impact, issue.status], ['2 Сборка: Нет стенда', 'CRITICAL', 'Нет стенда', 'Open']);
    assert.equal((await asPm(`/api/projects/${project.id}/automation/proposals/${issueProposal.id}/apply`, 'POST', { version: issueProposal.version })).status, 409);

    const done = await asPm(`/api/projects/${project.id}/automation/proposals/${statusProposal.id}/apply`, 'POST', { version: statusProposal.version });
    assert.equal(done.status, 200);
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: task.id } })).status, 'DONE');
    assert.equal((await prisma.automationProposal.findUniqueOrThrow({ where: { id: statusProposal.id } })).status, 'APPLIED');

    // A proposal whose ticket moved on is closed as stale instead of applying an old picture.
    const stale = await prisma.automationProposal.create({
      data: { projectId: project.id, ruleId: (await prisma.automationRule.findFirstOrThrow({ where: { projectId: project.id, template: 'JIRA_DONE' } })).id, firingId: (await prisma.automationFiring.findFirstOrThrow({ where: { projectId: project.id } })).id, kind: 'SET_WBS_STATUS', wbsItemId: task.id, payload: { status: 'DONE', expectedUpdatedAt: new Date(0).toISOString(), expectedJira: { key: 'AU-1', updatedAt: ticketUpdatedAt.toISOString() } } },
    });
    const staleAnswer = await asPm(`/api/projects/${project.id}/automation/proposals/${stale.id}/apply`, 'POST', { version: 1 });
    assert.equal(staleAnswer.status, 409);
    assert.equal((await prisma.automationProposal.findUniqueOrThrow({ where: { id: stale.id } })).status, 'STALE');

    const bell = await (await asOwner('/api/notifications')).json();
    assert.deepEqual([bell.unread, bell.items[0].kind], [1, 'SHIFT_REASON_ASKED']);
    assert.equal((await (await asOwner('/api/notifications/read', 'POST', { all: true })).json()).marked, 1);
    assert.equal((await (await asOwner('/api/notifications')).json()).unread, 0);
    // Rows sharing one timestamp are read across pages without being skipped.
    const blockerRule = await prisma.automationRule.findFirstOrThrow({ where: { projectId: project.id, template: 'CHECK_IN_BLOCKER' } });
    const sameTime = new Date();
    const extra = await Promise.all(
      [1, 2, 3].map((index) =>
        prisma.wbsItem.create({ data: { projectId: project.id, code: `9.${index}`, title: `Пачка ${index}`, type: 'TASK', owner: 'Петров', sortOrder: 900 + index, wbsLevel: 2 } }),
      ),
    );
    for (const item of extra) {
      await prisma.workCheckIn.create({ data: { projectId: project.id, wbsItemId: item.id, userId: owner.id, personName: 'Петров', weekStart: new Date('2026-09-28T00:00:00Z'), confidence: 'OFF_TRACK', blocker: '', updatedAt: sameTime } });
    }
    assert.equal(await runAutomationRule(blockerRule.id, now, { batch: 1 }), 'ran');
    assert.equal(await prisma.automationProposal.count({ where: { projectId: project.id, kind: 'CREATE_ISSUE', wbsItemId: { in: extra.map((item) => item.id) } } }), 3);

    const journal = await (await asPm(`/api/projects/${project.id}/automation/firings`)).json();
    assert.ok(journal.length >= 5);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.leaveEmployee.delete({ where: { id: employee.id } });
    await prisma.user.deleteMany({ where: { id: { in: [pm.id, owner.id] } } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
