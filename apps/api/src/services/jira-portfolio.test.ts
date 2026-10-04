import assert from 'node:assert/strict';
import test from 'node:test';
import { jiraAnalyticsSliceSchema } from '@pms/shared';
import { jiraPortfolioLines, moscowToday, type JiraPortfolioIssue } from './jira-portfolio.js';

const now = new Date('2026-10-04T21:30:00Z'); // 00:30 on 5 October in Moscow
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const issue = (projectId: string, patch: Partial<JiraPortfolioIssue>): JiraPortfolioIssue => ({ projectId, status: 'In Progress', resolution: null, resolutionAt: null, issueCreatedAt: daysAgo(40), assignee: 'Иванов', issueType: 'Task', priority: 'Major', sprint: null, labels: [], attributes: { statusCategoryKey: 'indeterminate', storyPoints: 3, dueDate: '2026-10-04' }, ...patch });

test('lines count open work like the widgets do, cancelled issues count nowhere, and the total adds the lines', () => {
  assert.equal(moscowToday(now), '2026-10-05');
  const { lines, total, assigneeHints } = jiraPortfolioLines([
    issue('p1', {}),
    issue('p1', { assignee: null, issueCreatedAt: daysAgo(3), attributes: { statusCategoryKey: 'new', storyPoints: null, dueDate: '2026-10-05' } }),
    issue('p1', { status: 'Done', resolution: 'Done', resolutionAt: daysAgo(2) }),
    issue('p1', { status: 'Отменено', issueCreatedAt: daysAgo(1) }),
    issue('p2', { attributes: null, issueCreatedAt: daysAgo(100) }),
  ], { now, periodDays: 30, slice: null });
  assert.deepEqual(lines.get('p1'), { openIssues: 2, inProgress: 1, overdue: 1, unassigned: 1, openStoryPoints: 3, createdInPeriod: 1, resolvedInPeriod: 1, oldestOpenDays: 40, withoutAttributes: 0 });
  assert.deepEqual([lines.get('p2')!.openIssues, lines.get('p2')!.withoutAttributes, lines.get('p2')!.overdue], [1, 1, 0]);
  assert.deepEqual([total.openIssues, total.oldestOpenDays, total.withoutAttributes], [3, 100, 1]);
  assert.deepEqual(assigneeHints, ['Иванов']);
});

test('a slice narrows every line', () => {
  const { total } = jiraPortfolioLines([issue('p1', {}), issue('p2', { assignee: 'Петров' })], { now, periodDays: 30, slice: jiraAnalyticsSliceSchema.parse({ assignees: ['Петров'] }) });
  assert.equal(total.openIssues, 1);
});
