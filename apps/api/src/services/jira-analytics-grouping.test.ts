import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateJiraAnalyticsAggregate, type JiraAnalyticsExecutableDefinition, type JiraAnalyticsIssueData } from '@pms/shared';

const base = { name: 'Тест', description: '', source: 'issues', metric: 'count', groupBy: 'none', scope: 'retro', filterLogic: 'and', filters: [], periodMode: 'NONE', periodDays: null, timeZone: 'Europe/Moscow', sortOrder: 0 } as const;
const definition = (patch: Partial<JiraAnalyticsExecutableDefinition>) => ({ ...base, ...patch }) as JiraAnalyticsExecutableDefinition;
const options = { now: '2026-10-04T12:00:00.000Z', assignee: '', page: 1, pageSize: 100 };

function issue(id: string, patch: Partial<JiraAnalyticsIssueData>, attributes: Partial<NonNullable<JiraAnalyticsIssueData['attributes']>> = {}): JiraAnalyticsIssueData {
  return {
    id, issueKey: `TV-${id}`, issueUrl: '', summary: id, status: 'In Progress', priority: 'Major', assignee: 'Иванов', reporter: null, issueType: 'Task',
    resolution: null, sprint: null, sprintCount: 0, labels: [], issueCreatedAt: '2026-09-30T12:00:00.000Z', criticalPriorityAt: null, resolutionAt: null,
    criticalSlaTracked: false, commitCount: 0, mergeRequestCount: 0, developmentDataAvailable: false, transitionHistoryComplete: true, updatedAt: '2026-10-01T00:00:00.000Z',
    statusTransitions: [], developmentActivities: [],
    attributes: { statusCategoryKey: 'indeterminate', parentKey: null, epicKey: null, components: [], fixVersions: [], storyPoints: null, dueDate: null, assigneeLogin: null, custom: {}, ...attributes },
    ...patch,
  };
}

const issues = [
  issue('1', {}, { epicKey: 'E1', components: ['Плата', 'ПО'], storyPoints: 5, statusCategoryKey: 'indeterminate' }),
  issue('2', { assignee: 'Петров', issueCreatedAt: '2026-06-01T00:00:00.000Z' }, { epicKey: 'E1', components: ['ПО'], storyPoints: 3, statusCategoryKey: 'new' }),
  issue('3', { issueCreatedAt: '2026-09-01T00:00:00.000Z', resolution: 'Done', resolutionAt: '2026-09-20T00:00:00.000Z' }, { epicKey: null, storyPoints: null, statusCategoryKey: 'done' }),
];

test('story points add up once per issue, also by group', () => {
  const result = evaluateJiraAnalyticsAggregate(definition({ metric: 'storyPoints', groupBy: 'epic' }), issues, options);
  assert.equal(result.value, 8);
  assert.deepEqual(result.groups.map((group) => [group.label, group.value]), [['E1', 8], ['Без эпика', 0]]);
});

test('a second grouping breaks each group down, and components count in each of their values', () => {
  const result = evaluateJiraAnalyticsAggregate(definition({ groupBy: 'component', groupBy2: 'statusCategory' }), issues, options);
  assert.equal(result.multiValued, true);
  const byLabel = Object.fromEntries(result.groups.map((group) => [group.label, Object.fromEntries((group.breakdown ?? []).map((cell) => [cell.label, cell.value]))]));
  assert.deepEqual(byLabel, { 'ПО': { 'В работе': 1, 'К выполнению': 1 }, 'Плата': { 'В работе': 1 }, 'Без компонента': { 'Готово': 1 } });
  assert.deepEqual(result.breakdownKeys?.map((key) => key.label).sort(), ['В работе', 'Готово', 'К выполнению']);
  // Drilling into a component finds the issues that have it among others.
  const drilled = evaluateJiraAnalyticsAggregate(definition({ groupBy: 'component' }), issues, { ...options, groupKey: 'value:ПО' });
  assert.deepEqual(drilled.records.map((record) => record.issue.id).sort(), ['1', '2']);
});

test('age buckets count to resolution or to now, and the new fields filter like the others', () => {
  const ages = evaluateJiraAnalyticsAggregate(definition({ groupBy: 'ageBucket' }), issues, options);
  assert.deepEqual(Object.fromEntries(ages.groups.map((group) => [group.label, group.value])), { '0–7 дней': 1, 'Больше 90 дней': 1, '8–30 дней': 1 });
  const byComponent = evaluateJiraAnalyticsAggregate(definition({ filters: [{ id: 'f', field: 'components', operator: 'equals', value: 'плата' }] }), issues, options);
  assert.equal(byComponent.value, 1);
  const bigOnes = evaluateJiraAnalyticsAggregate(definition({ filters: [{ id: 'f', field: 'storyPoints', operator: 'atLeast', value: '4' }] }), issues, options);
  assert.equal(bigOnes.value, 1);
  assert.equal(evaluateJiraAnalyticsAggregate(definition({ groupBy: 'epic', groupBy2: 'epic' }), issues, options).breakdownKeys, undefined, 'the same grouping twice is ignored');
});

test('groups and pairs of two groupings share one limit', async () => {
  const { createJiraAnalyticsEvaluationAccumulator } = await import('@pms/shared');
  const accumulator = createJiraAnalyticsEvaluationAccumulator(definition({ groupBy: 'epic', groupBy2: 'statusCategory' }), options, { maxGroups: 2 });
  // One epic group and one pair fit; the second pair (another category) is past the limit.
  assert.throws(() => accumulator.addIssues(issues.slice(0, 2)), /GROUPS_LIMIT/);
});

test('a cell of the table drills into the records of both groups', () => {
  const cell = evaluateJiraAnalyticsAggregate(definition({ groupBy: 'epic', groupBy2: 'statusCategory' }), issues, { ...options, groupKey: 'value:E1', groupKey2: 'value:new' });
  assert.deepEqual(cell.records.map((record) => record.issue.id), ['2']);
  assert.equal(cell.totalRecords, 1);
});

test('views fit their groupings, and a comparison looks one period back', async () => {
  const { compareProblem, previousPeriodNow, visualizationProblem } = await import('../routes/jira-semantic-aggregates.support.js');
  assert.equal(visualizationProblem('line', 'month', 'none', null, null), null);
  assert.match(visualizationProblem('line', 'epic', 'none', null, null) ?? '', /неделям или месяцам/);
  assert.match(visualizationProblem('stacked', 'epic', 'none', null, null) ?? '', /две группировки/);
  assert.equal(visualizationProblem('pivot', 'epic', 'statusCategory', null, null), null);
  assert.match(visualizationProblem('kpi', 'none', 'none', null, 30) ?? '', /полем периода/);
  assert.equal(visualizationProblem('kpi', 'none', 'none', 'resolutionAt', 30), null);
  const query = { visualization: 'kpi', periodDays: 30, asOf: '2026-10-31T00:00:00.000Z' } as never;
  assert.equal(previousPeriodNow(query), '2026-10-01T00:00:00.000Z');
  assert.equal(previousPeriodNow({ visualization: 'bar', compare: 'previousPeriod', periodDays: 30 } as never), null, 'only a KPI compares');
  assert.match(compareProblem('previousPeriod', 'bar') ?? '', /только у показателя/);
  assert.equal(compareProblem(undefined, 'kpi'), null);
});

test('Critical and Blocker issues by the week they were created: every week of six months, empty ones as zero, in time order', () => {
  const created = (id: string, priority: string, day: string) => issue(id, { priority, issueCreatedAt: `${day}T10:00:00.000Z`, updatedAt: '2026-10-03T10:00:00.000Z' });
  const weekly = evaluateJiraAnalyticsAggregate(
    definition({ groupBy: 'week', dateField: 'issueCreatedAt', periodMode: 'DASHBOARD', filters: [{ id: 'p', field: 'priority', operator: 'oneOf', value: 'Critical,Blocker' }] }),
    [created('a', 'Critical', '2026-09-29'), created('b', 'Blocker', '2026-10-01'), created('c', 'Critical', '2026-07-14'), created('d', 'Major', '2026-09-30'), created('e', 'Critical', '2025-12-01')],
    { ...options, periodDays: 180 },
  );
  assert.equal(weekly.value, 3, 'only Critical and Blocker created within the period');
  assert.ok(weekly.groups.length >= 26 && weekly.groups.length <= 27, `${weekly.groups.length} weeks`);
  assert.deepEqual(weekly.groups.map((group) => group.key), [...weekly.groups.map((group) => group.key)].sort());
  const byKey = Object.fromEntries(weekly.groups.map((group) => [group.key, group.value]));
  assert.equal(byKey['2026-W40'], 2, 'the week of 29 September');
  assert.equal(byKey['2026-W29'], 1);
  assert.equal(weekly.groups.filter((group) => group.value === 0).length, weekly.groups.length - 2);
});

test('issues without a creation date are reported when a widget counts by it, and a second grouping by month runs in time order', () => {
  const noDate = issue('x', { priority: 'Critical', issueCreatedAt: null });
  const result = evaluateJiraAnalyticsAggregate(definition({ groupBy: 'week', dateField: 'issueCreatedAt', periodMode: 'DASHBOARD' }), [noDate, issue('y', { issueCreatedAt: '2026-09-30T10:00:00.000Z' })], { ...options, periodDays: 30 });
  assert.equal(result.quality.warnings.find((warning) => warning.code === 'MISSING_ISSUE_CREATED_AT')?.count, 1);
  const byMonth = evaluateJiraAnalyticsAggregate(definition({ groupBy: 'epic', groupBy2: 'month', dateField: 'issueCreatedAt' }), [issue('m1', { issueCreatedAt: '2026-09-02T10:00:00.000Z' }, { epicKey: 'E1' }), issue('m2', { issueCreatedAt: '2026-07-02T10:00:00.000Z' }, { epicKey: 'E1' })], options);
  assert.deepEqual(byMonth.groups[0]!.breakdown!.map((cell) => cell.key), ['2026-07', '2026-09']);
});

test('empty weeks added along time share the group limit with the pairs', async () => {
  const { createJiraAnalyticsEvaluationAccumulator } = await import('@pms/shared');
  const accumulator = createJiraAnalyticsEvaluationAccumulator(definition({ groupBy: 'week', groupBy2: 'statusCategory', dateField: 'issueCreatedAt', periodMode: 'DASHBOARD' }), { ...options, periodDays: 90 }, { maxGroups: 6 });
  accumulator.addIssues([issue('w', { issueCreatedAt: '2026-10-01T10:00:00.000Z' })]);
  assert.throws(() => accumulator.finish(), /GROUPS_LIMIT/);
});
