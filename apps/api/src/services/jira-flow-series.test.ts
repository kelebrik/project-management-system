import assert from 'node:assert/strict';
import test from 'node:test';
import { jiraFlowSeries, jiraStatusCategoryMap, type JiraFlowIssue } from './jira-flow-series.js';

const at = (iso: string) => new Date(iso);
const issue = (key: string, patch: Partial<JiraFlowIssue>): JiraFlowIssue => ({ issueKey: key, status: 'In Progress', resolutionAt: null, issueCreatedAt: at('2026-09-29T10:00:00Z'), transitionHistoryComplete: true, weight: 1, category: 'indeterminate', transitions: [], ...patch });

// 2026-10-05 is a Monday; Moscow is UTC+3.
const now = at('2026-10-14T12:00:00Z');

test('weekly flow counts created, resolved and open work, and the categories at the end of each week', () => {
  const issues = [
    issue('TV-1', { status: 'Done', category: 'done', resolutionAt: at('2026-10-07T10:00:00Z'), transitions: [{ fromStatus: 'Open', toStatus: 'In Progress', at: at('2026-10-01T10:00:00Z') }, { fromStatus: 'In Progress', toStatus: 'Done', at: at('2026-10-07T10:00:00Z') }] }),
    issue('TV-2', { status: 'In Progress', issueCreatedAt: at('2026-10-06T10:00:00Z'), transitions: [{ fromStatus: 'Open', toStatus: 'In Progress', at: at('2026-10-13T10:00:00Z') }] }),
    issue('TV-3', { status: 'Open', category: 'new', issueCreatedAt: at('2026-10-13T10:00:00Z'), weight: 5 }),
  ];
  const { buckets, unknownStatuses } = jiraFlowSeries(issues, { now, periodDays: 14, step: 'week', timeZone: 'Europe/Moscow' });
  assert.deepEqual(buckets.map((bucket) => bucket.start), ['2026-09-27T21:00:00.000Z', '2026-10-04T21:00:00.000Z', '2026-10-11T21:00:00.000Z']);
  const [first, second, third] = buckets;
  assert.deepEqual([first.created, first.resolved, first.open, first.byCategory], [1, 0, 1, { new: 0, indeterminate: 1, done: 0 }]);
  // In the second week TV-1 is done and TV-2 is still Open, which is "new" now.
  assert.deepEqual([second.created, second.resolved, second.open, second.byCategory], [1, 1, 1, { new: 1, indeterminate: 0, done: 1 }]);
  assert.deepEqual([third.created, third.open, third.byCategory, third.scope, third.done], [5, 6, { new: 5, indeterminate: 1, done: 1 }, 7, 1]);
  assert.deepEqual(unknownStatuses, []);
});

test('a status no issue carries now is counted in progress and reported', () => {
  const { lookup, unknown } = jiraStatusCategoryMap([{ issueKey: 'TV-1', status: 'Review', category: 'indeterminate' }, { issueKey: 'AU-1', status: 'Review', category: 'new' }]);
  assert.equal(lookup('TV-9', 'Review'), 'indeterminate');
  assert.equal(lookup('AU-9', 'Review'), 'new', 'per Jira project first');
  assert.equal(lookup('XX-1', 'Review'), 'indeterminate', 'then by name');
  assert.equal(lookup('TV-9', 'Archived'), 'indeterminate');
  assert.deepEqual([...unknown], ['Archived']);
});

test('daily steps over a year stay within the limit, months follow the calendar', () => {
  assert.equal(jiraFlowSeries([], { now, periodDays: 365, step: 'day', timeZone: 'Europe/Moscow' }).buckets.length, 366);
  const months = jiraFlowSeries([], { now, periodDays: 90, step: 'month', timeZone: 'UTC' }).buckets.map((bucket) => bucket.start.slice(0, 10));
  assert.deepEqual(months, ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01']);
});

test('the category of a status is known from issues outside the slice too', () => {
  const inSlice = [issue('TV-1', { status: 'Review', category: null, transitions: [] })];
  const outside = [{ issueKey: 'TV-2', status: 'Review', category: 'new' as const }];
  const { buckets, unknownStatuses } = jiraFlowSeries(inSlice, { now, periodDays: 7, step: 'week', timeZone: 'UTC', categorySource: [...inSlice, ...outside] });
  assert.deepEqual(unknownStatuses, []);
  assert.equal(buckets.at(-1)!.byCategory.new, 1);
});
