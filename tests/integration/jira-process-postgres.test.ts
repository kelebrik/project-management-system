import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { loadJiraProcessMining } from '../../apps/api/src/services/jira-process-mining.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('the process is read from the stored snapshots only, leaving out cancelled and retired issues', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `jp-${suffix}`, name: 'Process' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `JP-${suffix}`, name: 'Process', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-01-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const now = new Date('2026-10-10T00:00:00.000Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const snapshot = (key: string, status: string, extra: Record<string, unknown> = {}) => prisma.jiraIssueSnapshot.create({
    data: { projectId: project.id, issueKey: key, issueUrl: `https://jira.example.test/browse/${key}`, summary: key, status, priority: 'Major', issueType: 'Task', labels: [], issueCreatedAt: daysAgo(20), updatedAt: now, syncedAt: now, transitionHistoryComplete: true, ...extra },
  });
  try {
    const done = await snapshot(`JP-1-${suffix}`, 'Done', { resolution: 'Done', resolutionAt: daysAgo(2) });
    const cancelled = await snapshot(`JP-2-${suffix}`, 'Cancelled');
    const retired = await snapshot(`JP-3-${suffix}`, 'In Progress', { retiredAt: daysAgo(1) });
    for (const [snapshotId, moves] of [
      [done.id, [['Open', 'In Progress', 10], ['In Progress', 'Done', 2]]],
      [cancelled.id, [['Open', 'Cancelled', 5]]],
      [retired.id, [['Open', 'In Progress', 4]]],
    ] as const) {
      await prisma.jiraIssueStatusTransition.createMany({
        data: moves.map(([fromStatus, toStatus, days], index) => ({ snapshotId, transitionKey: `${index}`, fromStatus, toStatus, transitionedAt: daysAgo(days) })),
      });
    }
    const result = await loadJiraProcessMining(prisma, project.id, { now, periodDays: 30, slice: null });
    assert.equal(result.quality.issues, 1);
    assert.deepEqual(result.variants, [{ path: ['Open', 'In Progress', 'Done'], count: 1, medianLeadDays: 18 }]);
    assert.deepEqual(result.edges.map((edge) => [edge.from, edge.to, edge.count]), [['Open', 'In Progress', 1], ['In Progress', 'Done', 1]]);
    assert.equal(result.statusStats.find((stat) => stat.status === 'In Progress')?.medianHours, 192);
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
