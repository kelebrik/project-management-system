import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { loadPortfolioReport } from '../../apps/api/src/services/portfolio-reports.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('the portfolio report sums up open projects, shifts, upcoming checkpoints, red risks and waiting decisions', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pr-${suffix}`, name: `Unit ${suffix}` } });
  const base = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: '', projectManager: 'Анна', startDate: day('2026-09-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const open = await prisma.project.create({ data: { ...base, code: `PR-${suffix}`, name: 'Открытый', initialTargetDate: day('2026-12-01'), targetDate: day('2026-12-15'), rag: 'AMBER' } });
  const closed = await prisma.project.create({ data: { ...base, code: `PRC-${suffix}`, name: 'Закрытый', targetDate: day('2026-12-01'), status: 'CLOSED' } });
  try {
    const item = (data: Record<string, unknown>) => prisma.wbsItem.create({ data: { projectId: open.id, owner: '', ...data } as never });
    await item({ code: '1', title: 'Образцы', type: 'MILESTONE', status: 'NOT_STARTED', dueDate: day('2026-10-17'), forecastDueDate: day('2026-10-17'), baselineDueDate: day('2026-10-10') });
    await item({ code: '2', title: 'Запуск', type: 'GOAL', status: 'NOT_STARTED', dueDate: day('2027-03-01'), forecastDueDate: day('2027-03-01') });
    await item({ code: '3', title: 'Просроченная', type: 'TASK', status: 'IN_PROGRESS', dueDate: day('2026-09-20') });
    await item({ code: '4', title: 'Готовая', type: 'TASK', status: 'DONE', dueDate: day('2026-09-20') });
    await prisma.raidItem.create({ data: { projectId: open.id, type: 'RISK', title: 'Платы', description: '', owner: 'Иван', status: 'OPEN', probability: 4, impact: 5, riskScore: 20 } as never });
    await prisma.raidItem.create({ data: { projectId: open.id, type: 'RISK', title: 'Мелочь', description: '', owner: '', status: 'OPEN', probability: 1, impact: 2, riskScore: 2 } as never });
    await prisma.scheduleShift.create({ data: { projectId: open.id, checkpointCode: '1', checkpointTitle: 'Образцы', checkpointType: 'MILESTONE', previousDate: day('2026-10-10'), newDate: day('2026-10-17'), deltaDays: 7, trigger: 'EDIT', operationId: `op-${suffix}`, reasonCategory: 'SUPPLIER', reasonText: 'Задержка плат', createdAt: day('2026-10-01') } });
    await prisma.decision.create({ data: { projectId: open.id, title: 'Выбрать поставщика', status: 'PENDING_APPROVAL', approverName: 'Спонсор', requestedAt: day('2026-09-25') } });
    await prisma.decision.create({ data: { projectId: open.id, title: 'Черновик решения', status: 'PROPOSED' } });
    await prisma.raidItem.create({ data: { projectId: open.id, type: 'DEPENDENCY', title: 'Зависимость', description: '', owner: '', status: 'OPEN', probability: 5, impact: 5, riskScore: 25 } as never });
    await prisma.raidItem.create({ data: { projectId: closed.id, type: 'RISK', title: 'Из закрытого', description: '', owner: '', status: 'OPEN', probability: 5, impact: 5, riskScore: 25 } as never });

    const report = await loadPortfolioReport({ businessUnitId: unit.id }, { now: day('2026-10-03'), horizonDays: 28, periodDays: 30 });
    assert.deepEqual(report.summary.map((row) => row.projectCode), [`PR-${suffix}`]);
    const [line] = report.summary;
    assert.equal(line.targetShiftDays, 14);
    assert.deepEqual(line.nextCheckpoint, { code: '1', title: 'Образцы', type: 'MILESTONE', plannedDate: '2026-10-10', forecastDate: '2026-10-17' });
    assert.equal(line.redRisks, 1);
    assert.equal(line.overdueWork, 1);
    assert.equal(line.lastShift?.reasonCategory, 'SUPPLIER');
    assert.deepEqual(report.shifts.map((shift) => [shift.checkpointTitle, shift.deltaDays]), [['Образцы', 7]]);
    assert.deepEqual(report.upcoming.map((row) => [row.code, row.slipDays]), [['1', 7]]);
    assert.deepEqual(report.risks.map((risk) => risk.title), ['Платы']);
    assert.deepEqual(report.decisions.map((decision) => [decision.title, decision.waitingDays]), [['Выбрать поставщика', 8]]);

    // A shorter period leaves the shift out; the summary still names it.
    const week = await loadPortfolioReport({ businessUnitId: unit.id }, { now: day('2026-10-10'), horizonDays: 14, periodDays: 7 });
    assert.equal(week.shifts.length, 0);
    assert.equal(week.summary[0].lastShift?.checkpointTitle, 'Образцы');
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: [open.id, closed.id] } } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});
