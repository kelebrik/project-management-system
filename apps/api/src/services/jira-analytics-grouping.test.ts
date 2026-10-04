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
