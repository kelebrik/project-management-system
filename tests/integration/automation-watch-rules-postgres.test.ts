import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { runAutomationRule } from '../../apps/api/src/services/automation/engine.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const DAY_MS = 86_400_000;
// 10:00 UTC is 13:00 in Moscow: past the morning hour the daily rules wait for.
const NOW = new Date(Date.UTC(2026, 9, 5, 10));
const day = (offset: number) => new Date(Date.UTC(2026, 9, 5) + offset * DAY_MS);

test('the watching rules tell once a day about waiting decisions, open gaps and close dates', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `wr-${suffix}`, name: 'Watch rules' } });
  const pm = await prisma.user.create({ data: { email: `wpm-${suffix}@example.test`, name: 'РП', role: 'ADMIN' } });
  const approver = await prisma.user.create({ data: { email: `wap-${suffix}@example.test`, name: 'Согласующий', role: 'EXECUTIVE_VIEWER' } });
  const owner = await prisma.user.create({ data: { email: `wow-${suffix}@example.test`, name: 'Исполнитель', role: 'EXECUTIVE_VIEWER' } });
  const employee = await prisma.leaveEmployee.create({ data: { name: `Исполнитель ${suffix}`, userId: owner.id } });
  const project = await prisma.project.create({
    data: { code: `WR-${suffix}`, name: 'Watch', businessUnitId: unit.id, portfolio: 'TEST', sponsor: '', projectManager: 'РП', startDate: day(-30), targetDate: day(90), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  try {
    await prisma.decision.create({ data: { projectId: project.id, title: 'Выбрать поставщика', status: 'PENDING_APPROVAL', approverUserId: approver.id, approverName: 'Согласующий', requestedAt: day(-4) } });
    await prisma.raidItem.create({ data: { projectId: project.id, type: 'RISK', title: 'Ничей риск', description: '', owner: '', status: 'OPEN', probability: 2, impact: 2, riskScore: 4 } as never });
    const milestone = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Образцы', type: 'MILESTONE', status: 'NOT_STARTED', owner: '', dueDate: day(5), sortOrder: 10, wbsLevel: 1 } });
    const feeder = await prisma.wbsItem.create({ data: { projectId: project.id, code: '2', title: 'Сборка', type: 'TASK', status: 'NOT_STARTED', owner: `исполнитель ${suffix}`, dueDate: day(2), sortOrder: 20, wbsLevel: 1 } });
    await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: feeder.id, successorId: milestone.id } });

    const rule = (template: string, params: Record<string, unknown> = {}) =>
      prisma.automationRule.create({ data: { projectId: project.id, template, enabled: true, params, recipientIds: [pm.id], state: { since: day(-1).toISOString() } } });
    const rules = {
      decision: await rule('DECISION_WAITING', { days: 3 }),
      risk: await rule('RISK_INCOMPLETE'),
      due: await rule('WORK_DUE_SOON', { days: 3 }),
      milestone: await rule('MILESTONE_AT_RISK', { days: 7, minProgress: 50 }),
    };
    for (const created of Object.values(rules)) assert.equal(await runAutomationRule(created.id, NOW), 'ran');
    // A second run the same day says nothing new.
    for (const created of Object.values(rules)) assert.equal(await runAutomationRule(created.id, new Date(NOW.getTime() + 3_600_000)), 'ran');

    const notes = await prisma.notification.findMany({ where: { projectId: project.id }, select: { userId: true, kind: true } });
    const kinds = (userId: string) => notes.filter((note) => note.userId === userId).map((note) => note.kind).sort();
    assert.deepEqual(kinds(pm.id), ['DECISION_WAITING', 'MILESTONE_AT_RISK', 'RISK_INCOMPLETE', 'WORK_DUE_SOON_SUMMARY']);
    assert.deepEqual(kinds(approver.id), ['DECISION_WAITING']);
    assert.deepEqual(kinds(owner.id), ['WORK_DUE_SOON']);

    // The next morning the same risk is not told again.
    assert.equal(await runAutomationRule(rules.risk.id, new Date(NOW.getTime() + DAY_MS)), 'ran');
    assert.equal(await prisma.notification.count({ where: { projectId: project.id, kind: 'RISK_INCOMPLETE' } }), 1);
  } finally {
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.leaveEmployee.deleteMany({ where: { id: employee.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [pm.id, approver.id, owner.id] } } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});
