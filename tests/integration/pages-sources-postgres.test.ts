import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PAGE_TEMPLATES, pageFromTemplate } from '@pms/shared';
import { prisma } from '../../apps/api/src/db.js';
import { forgetPageQueryCache, runPageQueries } from '../../apps/api/src/services/pages/query.js';
import { PAGE_SOURCE_ADAPTERS } from '../../apps/api/src/services/pages/registry.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('my page: issues, changes, lessons, workload, check-ins and Jira snapshots as page sources', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  forgetPageQueryCache();
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `ps-${suffix}`, name: `Page sources ${suffix}` } });
  const base = { businessUnitId: unit.id, portfolio: 'TV', sponsor: '', projectManager: 'Анна', startDate: day('2026-09-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...base, code: `PS-${suffix}`, name: 'Источники' } });
  const other = await prisma.project.create({ data: { ...base, code: `PSO-${suffix}`, name: 'Чужой проект' } });
  const user = await prisma.user.create({ data: { email: `ps-${suffix}@example.test`, name: 'Иван', role: 'PROJECT_MANAGER' } });
  const employee = await prisma.leaveEmployee.create({ data: { name: `Иван ${suffix}`, department: 'Платы', capacityPercent: 100 } });
  const idle = await prisma.leaveEmployee.create({ data: { name: `Пётр ${suffix}`, capacityPercent: 100 } });
  try {
    const task = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Плата', type: 'TASK', status: 'IN_PROGRESS', owner: 'Иван' } as never });
    await prisma.issue.create({ data: { projectId: project.id, source: 'INTERNAL', title: 'Нет поставщика', owner: '', impact: '', severity: 'CRITICAL', status: 'Open', dueDate: day('2026-10-01') } as never });
    await prisma.issue.create({ data: { projectId: project.id, source: 'INTERNAL', title: 'Решён', owner: 'Иван', impact: '', severity: 'LOW', status: 'Resolved', dueDate: day('2026-09-01') } as never });
    await prisma.changeRequest.create({ data: { projectId: project.id, type: 'SCHEDULE', title: 'Сдвинуть Beta', description: '', owner: 'Анна', status: 'IN_REVIEW', impactAnalysis: '', affectedBaseline: '', scheduleImpactDays: 7 } as never });
    await prisma.changeRequest.create({ data: { projectId: project.id, type: 'SCOPE', title: 'Черновик', description: '', owner: '', status: 'DRAFT', impactAnalysis: '', affectedBaseline: '', scheduleImpactDays: 30 } as never });
    await prisma.lesson.create({ data: { projectId: project.id, category: 'Поставки', title: 'Заказывать платы заранее', createdAt: day('2026-10-02') } });
    await prisma.projectAllocation.createMany({ data: [
      { employeeId: employee.id, projectId: project.id, percent: 80, startsOn: day('2026-09-01') },
      { employeeId: employee.id, projectId: other.id, percent: 40, startsOn: day('2026-09-01') },
      { employeeId: idle.id, projectId: other.id, percent: 50, startsOn: day('2026-09-01') },
    ] });
    await prisma.leave.create({ data: { employeeId: employee.id, startDate: day('2026-10-06'), endDate: day('2026-10-08') } as never }).catch(async () => {
      const type = await prisma.leaveType.findFirst();
      if (type) await prisma.leave.create({ data: { employeeId: employee.id, typeId: type.id, startDate: day('2026-10-06'), endDate: day('2026-10-08') } as never });
    });
    await prisma.workCheckIn.create({ data: { projectId: project.id, wbsItemId: task.id, userId: user.id, personName: 'Иван', weekStart: day('2026-10-05'), confidence: 'AT_RISK', blocker: 'Нет стенда' } });
    const snapshot = (key: string, patch: Record<string, unknown>) => prisma.jiraIssueSnapshot.create({ data: { projectId: project.id, issueKey: key, issueUrl: `https://jira.example.test/browse/${key}`, summary: key, status: 'Open', priority: 'Major', issueType: 'Bug', updatedAt: new Date(), ...patch } as never });
    await snapshot('TV-1', { priority: 'Blocker', issueCreatedAt: new Date('2026-10-04T22:30:00.000Z'), attributes: { statusCategoryKey: 'indeterminate', dueDate: '2026-10-01', components: ['Плата'] } });
    await snapshot('TV-2', { status: 'Done', resolution: 'Done', resolutionAt: new Date('2026-10-03T10:00:00.000Z'), issueCreatedAt: new Date('2026-09-20T10:00:00.000Z') });
    await snapshot('TV-3', { status: 'Cancelled', issueCreatedAt: new Date('2026-10-01T10:00:00.000Z') });

    const now = new Date('2026-10-07T10:00:00.000Z');
    const context = { projects: [{ id: project.id, code: project.code, name: project.name, portfolio: 'TV' }], now, today: '2026-10-07' };
    const issues = await PAGE_SOURCE_ADAPTERS.issues(context);
    const open = issues.find((row) => row.values.title === 'Нет поставщика')!;
    assert.deepEqual([open.values.open, open.values.owner, open.values.overdue, open.values.overdueDays], [true, null, true, 6]);
    assert.equal(issues.find((row) => row.values.title === 'Решён')!.values.open, false);

    const changes = await PAGE_SOURCE_ADAPTERS.changes(context);
    assert.deepEqual(changes.filter((row) => row.values.waiting).map((row) => row.values.title), ['Сдвинуть Beta']);

    const people = await PAGE_SOURCE_ADAPTERS.workload(context);
    assert.equal(people.length, 1, 'only people with a share in the scope');
    assert.deepEqual([people[0].values.planned, people[0].values.inScope, people[0].values.overloaded, people[0].values.free], [120, 80, true, -20]);
    assert.deepEqual(people[0].values.projects, [project.code]);

    const checkins = await PAGE_SOURCE_ADAPTERS.checkins(context);
    assert.deepEqual([checkins[0].values.confidence, checkins[0].values.hasBlocker, checkins[0].values.weekStart], ['AT_RISK', true, '2026-10-05']);

    const jira = await PAGE_SOURCE_ADAPTERS.jira(context);
    assert.deepEqual(jira.map((row) => row.values.issueKey).sort(), ['TV-1', 'TV-2'], 'cancelled issues do not count');
    const blocker = jira.find((row) => row.values.issueKey === 'TV-1')!;
    assert.deepEqual([blocker.values.open, blocker.values.critical, blocker.values.overdue, blocker.values.createdAt], [true, true, true, '2026-10-05'], 'a Moscow day, as in the Jira widgets');
    assert.equal(jira.find((row) => row.values.issueKey === 'TV-2')!.values.resolvedAt, '2026-10-03');

    const lessons = await PAGE_SOURCE_ADAPTERS.lessons(context);
    assert.equal(lessons[0].values.createdAt, '2026-10-02');

    // Every template answers without errors on these sources.
    for (const template of PAGE_TEMPLATES) {
      const page = pageFromTemplate(template, { mode: 'projects', projectIds: [project.id] }, 'ru');
      const answer = await runPageQueries({ businessUnitId: unit.id }, { scope: page.document.scope, periodDays: page.document.periodDays, queries: page.document.widgets.filter((widget) => widget.data).map((widget) => ({ id: widget.id, widget: { type: widget.type, data: widget.data } })) }, now);
      for (const [id, result] of Object.entries(answer.results)) assert.notEqual(result.kind, 'error', `${template.id}/${id}: ${'error' in result ? result.error : ''}`);
    }
    // A widget with its own scope reads its own projects.
    const own = await runPageQueries({ businessUnitId: unit.id }, { scope: { mode: 'projects', projectIds: [project.id] }, periodDays: 30, queries: [{ id: 'x', widget: { type: 'kpi', data: { metric: 'projects.count', filters: [] } }, scope: { mode: 'all' } }] }, now);
    assert.equal((own.results.x as { value: number }).value, 2);
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: [project.id, other.id] } } }).catch(() => undefined);
    await prisma.leaveEmployee.deleteMany({ where: { id: { in: [employee.id, idle.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});
