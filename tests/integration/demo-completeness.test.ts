import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { completeDemoData } from '../../apps/api/src/demo/complete.js';
import { demoId } from '../../apps/api/src/demo/project.js';
import { jiraSemanticAggregateDefinitionSchema, jiraSemanticDashboardSchema } from '@pms/shared';
import { jiraSemanticExecutableDefinition } from '../../apps/api/src/services/jira-semantic-aggregates.js';
import { evaluateJiraAggregateFromDatabase } from '../../apps/api/src/services/jira-aggregates-core.js';
import { evaluateGitlabBranchCommitAggregateFromDatabase } from '../../apps/api/src/services/gitlab-branch-analytics.js';
import { calculateWbsCriticalPath } from '../../apps/api/src/services/wbs-critical-path/calculate.js';

const url = process.env.DEMO_TEST_DATABASE_URL;
test('existing partly populated demo projects receive all sections and non-empty widgets without duplicates', { skip: !url }, async () => {
  assert.equal(new URL(url!).hostname, '127.0.0.1', 'Use only the disposable localhost demo test database');
  assert.equal(new URL(url!).pathname, '/pms_demo_fixture_test');
  const client = new PrismaClient({ datasources: { db: { url } } });
  const oldFlag = process.env.SEED_DEMO_DATA;
  process.env.SEED_DEMO_DATA = 'true';
  try {
    const unit = await client.businessUnit.create({ data: { code: `test-${Date.now()}`, name: 'BU_1' } });
    const project = await client.project.create({ data: {
      businessUnitId: unit.id, code: `DEMO-005-${Date.now()}`, name: 'Pulse', portfolio: unit.name,
      sponsor: 'Sponsor', projectManager: 'Maria Novikova', startDate: new Date('2026-07-01'),
      targetDate: new Date('2026-12-31'), budgetPlanned: 1000000, budgetForecast: 1100000, summary: 'Existing demo',
      uiState: { customFlag: true, passportRows: [{ id: 'existing', field: 'Customer', description: 'Existing customer' }] },
    } });
    const existingWbs = await client.wbsItem.create({ data: {
      projectId: project.id, code: '1', type: 'TASK', title: 'Existing task', owner: 'User',
    } });
    await client.projectBusinessRequirements.create({ data: {
      projectId: project.id, columns: [{ id: 'custom', title: 'Requirement' }, { id: 'extra', title: 'Comment' }],
      rows: [{ id: 'keep', cells: { custom: 'Existing requirement', extra: 'Do not change' } }, { id: 'empty', cells: { custom: '', extra: '' } }],
    } });
    await completeDemoData(client);
    const fixtureTaskIds = Array.from({ length: 4 }, (_, phase) =>
      Array.from({ length: 9 }, (_, task) => demoId(project.id, `task-${phase}-${task}`))).flat();
    const counts = async () => ({
      phases: await client.wbsItem.count({ where: { projectId: project.id, type: 'PHASE' } }),
      goals: await client.wbsItem.count({ where: { projectId: project.id, type: 'GOAL' } }),
      milestones: await client.wbsItem.count({ where: { projectId: project.id, type: 'MILESTONE' } }),
      risks: await client.raidItem.count({ where: { projectId: project.id } }),
      issues: await client.issue.count({ where: { projectId: project.id } }),
      snapshots: await client.jiraIssueSnapshot.count({ where: { projectId: project.id } }),
      versions: await client.jiraIssueVersion.count({ where: { projectId: project.id } }),
      wbs: await client.wbsItem.count({ where: { projectId: project.id } }),
      overviews: await client.executiveOverview.count({ where: { projectId: project.id } }),
    });
    const before = await counts();
    assert.ok(before.phases >= 4 && before.goals >= 4 && before.milestones >= 16);
    assert.ok(before.risks >= 6 && before.issues >= 8 && before.snapshots >= 16);
    for (let phase = 0; phase < 4; phase++) {
      const phaseId = demoId(project.id, `phase-${phase}`);
      assert.equal(await client.wbsItem.count({ where: { projectId: project.id, parentId: phaseId, type: 'MILESTONE' } }), 4);
      assert.equal(await client.wbsItem.count({ where: { projectId: project.id, parentId: phaseId, type: 'GOAL' } }), 1);
    }
    const fixtureTasks = await client.wbsItem.findMany({ where: { id: { in: fixtureTaskIds } } });
    assert.equal(fixtureTasks.length, 36);
    assert.ok(fixtureTasks.some((row) => row.startDate!.getTime() < row.baselineStartDate!.getTime()));
    assert.ok(fixtureTasks.some((row) => row.startDate!.getTime() > row.baselineStartDate!.getTime()));
    assert.ok(fixtureTasks.some((row) => row.forecastStartDate!.getTime() < row.baselineStartDate!.getTime()));
    assert.ok(fixtureTasks.some((row) => row.forecastStartDate!.getTime() > row.baselineStartDate!.getTime()));
    for (const row of fixtureTasks) {
      assert.ok(row.startDate && row.dueDate && row.baselineStartDate && row.baselineDueDate && row.forecastStartDate && row.forecastDueDate);
      assert.notEqual(row.startDate.getTime(), row.baselineStartDate.getTime());
      assert.notEqual(row.dueDate.getTime(), row.baselineDueDate.getTime());
      assert.notEqual(row.forecastStartDate.getTime(), row.baselineStartDate.getTime());
      assert.notEqual(row.forecastDueDate.getTime(), row.baselineDueDate.getTime());
      assert.notEqual(row.forecastStartDate.getTime(), row.startDate.getTime());
      assert.notEqual(row.forecastDueDate.getTime(), row.dueDate.getTime());
    }
    // A previous demo run has aged: refresh must repair time-sensitive widgets.
    await client.gitlabBranchSyncRun.updateMany({ data: { finishedAt: new Date('2020-01-01') } });
    await client.jiraIssueSnapshot.updateMany({ data: { issueCreatedAt: new Date('2020-01-01'), resolutionAt: null } });
    await client.wbsItem.update({ where: { id: fixtureTaskIds[0] }, data: {
      baselineStartDate: null, baselineDueDate: null, forecastStartDate: null, forecastDueDate: null,
    } });
    await client.wbsDependency.deleteMany({ where: { projectId: project.id,
      predecessorId: demoId(project.id, 'task-0-8'), successorId: demoId(project.id, 'task-1-0'), type: 'FS' } });
    await completeDemoData(client);
    assert.deepEqual(await counts(), before);
    const updated = await client.project.findUniqueOrThrow({ where: { id: project.id } });
    const ui = updated.uiState as { customFlag: boolean; passportRows: Array<{ field: string; description: string }> };
    assert.equal(ui.customFlag, true);
    assert.equal(ui.passportRows.length, 9);
    assert.equal(ui.passportRows.find(row => row.field === 'Customer')?.description, 'Existing customer');
    assert.equal(Number(updated.budgetPlanned), 1000000);
    assert.equal((await client.wbsItem.findUniqueOrThrow({ where: { id: existingWbs.id } })).title, 'Existing task');
    const requirements = await client.projectBusinessRequirements.findUniqueOrThrow({ where: { projectId: project.id } });
    const rows = requirements.rows as Array<{ id: string; cells: Record<string, string> }>;
    assert.equal(rows.find((row) => row.id === 'keep')?.cells.custom, 'Existing requirement');
    assert.ok(rows.length >= 6);
    assert.ok(rows.some((row) => row.cells.custom === 'Single sign-on access'));
    assert.ok(rows.some((row) => row.cells.extra?.includes('Acceptance criteria')));
    assert.equal(rows.filter((row) => !Object.values(row.cells).some(Boolean)).length, 0);
    const planItems = await client.wbsItem.findMany({ where: { projectId: project.id },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: {
        id: true, code: true, title: true, type: true, status: true, startDate: true, dueDate: true,
        workDays: true, calendarCode: true, sortOrder: true, predecessor1: true, predecessor2: true,
        predecessor3: true, predecessor4: true, predecessor5: true, predecessor6: true, leadLagDays: true,
      } });
    const dependencies = await client.wbsDependency.findMany({ where: { projectId: project.id }, select: {
      id: true, predecessorId: true, successorId: true, type: true, lagDays: true,
    } });
    const calendarOverrides = await client.projectCalendarOverride.findMany({ where: { projectId: project.id }, select: {
      calendarCode: true, date: true, isWorkingDay: true,
    } });
    const criticalPath = calculateWbsCriticalPath(planItems, dependencies, calendarOverrides);
    const projectTasks = planItems.filter((row) => row.type === 'TASK' || row.type === 'DELIVERABLE');
    const criticalIds = new Set(criticalPath.criticalItemIds);
    const criticalTaskCount = projectTasks.filter((row) => criticalIds.has(row.id)).length;
    assert.ok(criticalTaskCount >= Math.ceil(projectTasks.length / 2),
      `Only ${criticalTaskCount}/${projectTasks.length} tasks are on the critical path`);
    for (const p of await client.project.findMany()) {
      const settings = await client.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: p.id } });
      const dashboard = jiraSemanticDashboardSchema.parse(settings.dashboardConfig);
      assert.ok(dashboard.widgets.length >= 10);
      for (const widget of dashboard.widgets) {
        const revision = await client.jiraAggregateDefinitionRevision.findUniqueOrThrow({
          where: { aggregateId_version: { aggregateId: widget.aggregateId, version: widget.aggregateVersion } },
        });
        const definition = jiraSemanticAggregateDefinitionSchema.parse(revision.definition);
        const query = { ...widget, periodDays: dashboard.periodDays };
        const options = { now: new Date(), page: 1, pageSize: 100, periodDays: dashboard.periodDays, assignee: '' };
        const result = definition.rowConfig.kind === 'gitlabBranchCommit'
          ? await evaluateGitlabBranchCommitAggregateFromDatabase(client, p.id, definition, query, options)
          : await evaluateJiraAggregateFromDatabase(client, p.id, jiraSemanticExecutableDefinition(definition, query), options);
        assert.ok(result.totalRecords > 0 || result.groups.length > 0, `${p.code}/${widget.id} is empty (${result.quality.status})`);
        console.log(`Verified widget ${p.code}/${widget.id}: ${result.totalRecords} rows`);
      }
    }
  } finally {
    if (oldFlag === undefined) delete process.env.SEED_DEMO_DATA; else process.env.SEED_DEMO_DATA = oldFlag;
    await client.$disconnect();
  }
});
