import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  evaluateJiraAnalyticsAggregate,
  jiraAnalyticsAggregateDraftSchema,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsIssueData,
} from '@pms/shared';
import type { JiraAggregateDefinition } from '@prisma/client';
import {
  buildJiraAggregateImportPlan,
  convertJiraDashboardToV2,
  inspectJiraDashboardDefinitionUse,
  jiraAggregateFingerprint,
  jiraAggregateIssueSelect,
  jiraDashboardConfigHash,
  JIRA_AGGREGATE_MAX_ISSUES,
  JiraAggregatePopulationLimitError,
  loadJiraAggregateIssues,
  lockJiraAggregateProject,
  resolveSavedDashboard,
} from './jira-aggregates.js';

function definition(
  patch: Partial<JiraAnalyticsAggregateDraft> = {},
): JiraAnalyticsAggregateDraft {
  return {
    name: 'Тестовый агрегат',
    description: '',
    source: 'issues',
    metric: 'count',
    groupBy: 'none',
    scope: 'retro',
    filterLogic: 'and',
    filters: [],
    periodMode: 'NONE',
    periodDays: null,
    timeZone: 'Europe/Moscow',
    sortOrder: 0,
    ...patch,
  };
}

function issue(patch: Partial<JiraAnalyticsIssueData> = {}): JiraAnalyticsIssueData {
  return {
    id: 'snapshot-1',
    issueKey: 'CVTE-1',
    issueUrl: 'https://jira.example/browse/CVTE-1',
    summary: 'Issue',
    status: 'In Progress',
    priority: 'Major',
    assignee: 'User',
    reporter: 'Reporter',
    issueType: 'Bug',
    resolution: null,
    sprint: null,
    issueCreatedAt: '2026-01-01T00:00:00.000Z',
    criticalPriorityAt: null,
    resolutionAt: null,
    criticalSlaTracked: false,
    commitCount: 0,
    mergeRequestCount: 0,
    developmentDataAvailable: false,
    transitionHistoryComplete: true,
    updatedAt: '2026-02-01T00:00:00.000Z',
    statusTransitions: [],
    developmentActivities: [],
    ...patch,
  };
}

const options = {
  now: '2026-03-01T00:00:00.000Z',
  periodDays: 90 as const,
  assignee: '',
  page: 1,
  pageSize: 100,
};

test('aggregate schema rejects source/metric/group/filter drift and empty numeric values', () => {
  assert.equal(jiraAnalyticsAggregateDraftSchema.safeParse(definition({
    metric: 'p95Duration',
    groupBy: 'week',
    filters: [{ id: 'f', field: 'durationHours', operator: 'greaterThan', value: '' }],
  })).success, false);
});

test('semantic fingerprint ignores presentation and inert issue periods but includes scope', () => {
  const first = definition({
    name: 'First',
    description: 'One',
    sortOrder: 1,
    filters: [
      { id: 'a', field: 'status', operator: 'equals', value: 'IN PROGRESS' },
      { id: 'b', field: 'priority', operator: 'equals', value: 'Major' },
    ],
  });
  const second = definition({
    name: 'Second',
    description: 'Two',
    sortOrder: 99,
    filters: [
      { id: 'other-b', field: 'priority', operator: 'equals', value: 'major' },
      { id: 'other-a', field: 'status', operator: 'equals', value: 'in progress' },
    ],
  });
  assert.equal(jiraAggregateFingerprint(first), jiraAggregateFingerprint(second));
  assert.notEqual(
    jiraAggregateFingerprint(first),
    jiraAggregateFingerprint({ ...first, scope: 'active' }),
  );
});

test('active scope keeps unresolved non-cancelled issues only', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ scope: 'active' }),
    [
      issue({ id: 'open' }),
      issue({ id: 'resolved', resolution: 'Fixed' }),
      issue({ id: 'cancelled', status: 'Cancelled' }),
    ],
    options,
  );
  assert.equal(result.value, 1);
  assert.equal(result.records[0]?.issue.id, 'open');
});

test('transition source excludes issues with incomplete history', () => {
  const transitionDefinition = definition({
    source: 'transitions',
    metric: 'count',
    periodMode: 'DASHBOARD',
  });
  const transition = {
    id: 'transition-1',
    fromStatus: 'Open',
    toStatus: 'In Progress',
    transitionedAt: '2026-02-01T00:00:00.000Z',
  };
  const result = evaluateJiraAnalyticsAggregate(
    transitionDefinition,
    [
      issue({ id: 'complete', statusTransitions: [transition] }),
      issue({ id: 'partial', transitionHistoryComplete: false, statusTransitions: [transition] }),
    ],
    options,
  );
  assert.equal(result.value, 1);
});

test('development source excludes baseline observations', () => {
  const developmentDefinition = definition({
    source: 'development',
    metric: 'commits',
    periodMode: 'DASHBOARD',
  });
  const result = evaluateJiraAnalyticsAggregate(
    developmentDefinition,
    [issue({
      developmentActivities: [
        {
          id: 'baseline',
          activityAt: '2026-02-01T00:00:00.000Z',
          commitCount: 100,
          mergeRequestCount: 10,
          sprintAtObservation: null,
          isBaseline: true,
        },
        {
          id: 'delta',
          activityAt: '2026-02-02T00:00:00.000Z',
          commitCount: 2,
          mergeRequestCount: 1,
          sprintAtObservation: 'Sprint 1',
          isBaseline: false,
        },
      ],
    })],
    options,
  );
  assert.equal(result.value, 2);
  assert.equal(result.totalRecords, 1);
});

test('week grouping uses year-qualified ISO keys in the configured timezone', () => {
  const weekDefinition = definition({
    source: 'development',
    metric: 'count',
    groupBy: 'week',
    periodMode: 'DASHBOARD',
    timeZone: 'Europe/Moscow',
  });
  const result = evaluateJiraAnalyticsAggregate(
    weekDefinition,
    [issue({
      developmentActivities: [{
        id: 'new-year',
        activityAt: '2025-12-31T22:30:00.000Z',
        commitCount: 1,
        mergeRequestCount: 0,
        sprintAtObservation: null,
        isBaseline: false,
      }],
    })],
    { ...options, now: '2026-01-10T00:00:00.000Z' },
  );
  assert.equal(result.groups[0]?.key, '2026-W01');
  assert.match(result.groups[0]?.label ?? '', /2025|2026/);
});

test('group drill-down scopes both records and aggregate value', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ groupBy: 'status' }),
    [issue({ id: 'one', status: 'Open' }), issue({ id: 'two', status: 'In Progress' })],
    { ...options, groupKey: 'value:Open' },
  );
  assert.equal(result.value, 1);
  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.issue.id, 'one');
  assert.equal(result.groups.length, 2);
});

test('saved invalid non-empty config produces unavailable widget instead of defaults', () => {
  const result = resolveSavedDashboard(
    { version: 1, periodDays: 90, assignee: '', widgets: [{ id: 'broken', title: 'Broken' }] },
    [],
    [issue()],
    options,
  );
  assert.equal(result.widgets.length, 1);
  assert.equal(result.widgets[0]?.widgetId, 'broken');
  assert.equal(result.widgets[0]?.status, 'UNAVAILABLE');
});

test('dashboard batch can evaluate one selected widget for paged drill-down', () => {
  const baseWidget = {
    title: 'Count', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'retro' as const,
  };
  const result = resolveSavedDashboard({
    version: 1,
    periodDays: 90,
    assignee: '',
    widgets: [
      { ...baseWidget, id: 'one' },
      { ...baseWidget, id: 'two' },
    ],
  }, [], [issue()], options, 'two');
  assert.deepEqual(result.widgets.map((widget) => widget.widgetId), ['two']);
  assert.equal(result.widgets[0]?.result?.totalRecords, 1);
});

test('NULL dashboard uses default widgets but retains the NULL configuration hash', () => {
  const result = resolveSavedDashboard(null, [], [issue()], options);
  assert.equal(result.configHash, jiraDashboardConfigHash(null));
  assert.ok(result.widgets.some((widget) => widget.widgetId === 'unplanned-count'));
});

test('legacy v1 widget without section keeps the former placement rule', () => {
  const result = resolveSavedDashboard({
    version: 1,
    periodDays: 90,
    assignee: '',
    widgets: [{
      id: 'legacy', title: 'Legacy', source: 'transitions', metric: 'p50Duration',
      groupBy: 'none', visualization: 'number', filterLogic: 'and', filters: [], width: 'half',
      legacyPresentationField: true,
    }],
  }, [], [issue()], options);
  assert.equal(result.widgets[0]?.status, 'OK');
  assert.equal(result.widgets[0]?.placement, 'retro');
});

test('v2 dashboard reports missing, mismatched, and malformed references explicitly', () => {
  const base = {
    version: 2 as const,
    periodDays: 90 as const,
    assignee: '',
    widgets: [{
      id: 'widget', title: 'Widget', aggregateId: 'missing',
      visualization: 'number' as const, width: 'half' as const, placement: 'active' as const,
    }],
  };
  const missing = resolveSavedDashboard(base, [], [issue()], options);
  assert.equal(missing.widgets[0]?.status, 'UNAVAILABLE');
  assert.match(missing.widgets[0]?.error ?? '', /удалено|недоступно/);

  const draft = definition({ scope: 'retro' });
  const row = {
    id: 'missing', projectId: 'project-1', name: draft.name, nameKey: 'test',
    description: draft.description, source: draft.source, metric: draft.metric,
    groupBy: draft.groupBy, scope: draft.scope, filterLogic: draft.filterLogic,
    filters: draft.filters, periodMode: draft.periodMode, periodDays: draft.periodDays,
    timeZone: draft.timeZone, fingerprint: jiraAggregateFingerprint(draft), sortOrder: 0,
    version: 1, createdAt: new Date(), updatedAt: new Date(),
  } satisfies JiraAggregateDefinition;
  const mismatch = resolveSavedDashboard(base, [row], [issue()], options);
  assert.equal(mismatch.widgets[0]?.status, 'UNAVAILABLE');
  assert.match(mismatch.widgets[0]?.error ?? '', /Размещение/);

  const malformed = resolveSavedDashboard({ ...base, widgets: [{ ...base.widgets[0], extra: true }] }, [row], [issue()], options);
  assert.equal(malformed.widgets[0]?.status, 'UNAVAILABLE');
  assert.match(malformed.widgets[0]?.error ?? '', /некорректный формат/);
});

test('aggregate DB selector cannot read immutable raw payloads', () => {
  assert.equal('payload' in jiraAggregateIssueSelect, false);
  assert.equal('versions' in jiraAggregateIssueSelect, false);
});

test('aggregate loader rejects an oversized project population without truncating', async () => {
  let take = 0;
  const client = {
    jiraIssueSnapshot: {
      findMany: async (query: { take: number }) => {
        take = query.take;
        return Array.from({ length: JIRA_AGGREGATE_MAX_ISSUES + 1 }, () => ({}));
      },
    },
  } as unknown as Parameters<typeof loadJiraAggregateIssues>[0];
  await assert.rejects(
    () => loadJiraAggregateIssues(client, 'project-1'),
    JiraAggregatePopulationLimitError,
  );
  assert.equal(take, JIRA_AGGREGATE_MAX_ISSUES + 1);
});

test('dashboard import is empty for NULL and deduplicates identical widget semantics', () => {
  assert.deepEqual(buildJiraAggregateImportPlan(null, []), { config: null, items: [] });
  const config = {
    version: 1 as const,
    periodDays: 90 as const,
    assignee: '',
    widgets: [
      {
        id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
        groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
        filters: [], width: 'half' as const, section: 'active' as const,
      },
      {
        id: 'two', title: 'Two', source: 'issues' as const, metric: 'count' as const,
        groupBy: 'none' as const, visualization: 'table' as const, filterLogic: 'and' as const,
        filters: [], width: 'full' as const, section: 'active' as const,
      },
    ],
  };
  assert.equal(buildJiraAggregateImportPlan(config, []).items.length, 1);
});

test('dashboard import normalizes legacy placement and rejects v2 with an accurate code', () => {
  const plan = buildJiraAggregateImportPlan({
    version: 1,
    periodDays: 90,
    assignee: '',
    widgets: [{
      id: 'legacy', title: 'Legacy', source: 'criticalBugs', metric: 'count',
      groupBy: 'none', visualization: 'number', filterLogic: 'and', filters: [], width: 'half',
    }],
  }, []);
  assert.equal(plan.config?.widgets[0]?.section, 'retro');
  assert.throws(
    () => buildJiraAggregateImportPlan({ version: 2, periodDays: 90, assignee: '', widgets: [] }, []),
    /DASHBOARD_NOT_V1/,
  );
});

test('definition usage inspection is fail-closed for invalid dashboards', () => {
  const valid = inspectJiraDashboardDefinitionUse({
    version: 2,
    periodDays: 90,
    assignee: '',
    widgets: [{
      id: 'used', title: 'Used', aggregateId: 'aggregate-1',
      visualization: 'number', width: 'half', placement: 'active',
    }],
  }, 'aggregate-1');
  assert.deepEqual(valid, { verifiable: true, widgetIds: ['used'] });

  const invalidWithReference = inspectJiraDashboardDefinitionUse({
    version: 2,
    widgets: [{ id: 'still-used', aggregateId: 'aggregate-1', extra: true }],
  }, 'aggregate-1');
  assert.deepEqual(invalidWithReference, { verifiable: false, widgetIds: ['still-used'] });

  const invalidWithoutReference = inspectJiraDashboardDefinitionUse({ version: 2, widgets: 'broken' }, 'aggregate-1');
  assert.deepEqual(invalidWithoutReference, { verifiable: false, widgetIds: [] });
});

test('dashboard import reuses an existing semantic fingerprint', () => {
  const widget = {
    id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'active' as const,
  };
  const draft = definition({ name: widget.title, scope: 'active' });
  const existing = {
    id: 'aggregate-1',
    projectId: 'project-1',
    name: 'Existing',
    nameKey: 'existing',
    description: '',
    source: draft.source,
    metric: draft.metric,
    groupBy: draft.groupBy,
    scope: draft.scope,
    filterLogic: draft.filterLogic,
    filters: draft.filters,
    periodMode: draft.periodMode,
    periodDays: draft.periodDays,
    timeZone: draft.timeZone,
    fingerprint: jiraAggregateFingerprint(draft),
    sortOrder: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies JiraAggregateDefinition;
  const plan = buildJiraAggregateImportPlan({
    version: 1, periodDays: 90, assignee: '', widgets: [widget],
  }, [existing]);
  assert.equal(plan.items[0]?.existingId, existing.id);
});

test('dashboard conversion keeps presentation and replaces inline rules with references', () => {
  const config = {
    version: 1 as const,
    periodDays: 180 as const,
    assignee: 'User',
    widgets: [{
      id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
      groupBy: 'none' as const, visualization: 'table' as const, filterLogic: 'and' as const,
      filters: [], width: 'full' as const, section: 'active' as const,
    }],
  };
  const plan = buildJiraAggregateImportPlan(config, []);
  const references = new Map(plan.items.map((item) => [item.fingerprint, 'aggregate-1']));
  const converted = convertJiraDashboardToV2(config, references);
  assert.deepEqual(converted, {
    version: 2,
    periodDays: 180,
    assignee: 'User',
    widgets: [{
      id: 'one',
      title: 'One',
      aggregateId: 'aggregate-1',
      visualization: 'table',
      width: 'full',
      placement: 'active',
    }],
  });
});

test('aggregate read path cannot import Jira transport or select raw history payload', () => {
  const serviceSource = fs.readFileSync(new URL('./jira-aggregates.ts', import.meta.url), 'utf8');
  const routeSource = fs.readFileSync(new URL('../routes/jira-aggregates.routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(serviceSource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(routeSource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(serviceSource, /\bpayload\s*:\s*true\b/u);
  assert.doesNotMatch(routeSource, /\bpayload\s*:\s*true\b/u);
});

test('aggregate mutations use a project-scoped advisory transaction lock', async () => {
  let queryText = '';
  let queryValues: unknown[] = [];
  const transaction = {
    $queryRaw: async (query: { text: string; values: unknown[] }) => {
      queryText = query.text;
      queryValues = query.values;
      return [{ lock: '' }];
    },
  } as unknown as Parameters<typeof lockJiraAggregateProject>[0];

  await lockJiraAggregateProject(transaction, 'project-1');

  assert.match(queryText, /pg_advisory_xact_lock\(.+\)::text AS lock/);
  assert.deepEqual(queryValues, ['jira-aggregates:project-1']);
});

test('dashboard writes keep the active conversion hash synchronized under the aggregate lock', () => {
  const routeSource = fs.readFileSync(new URL('../routes/issues.routes.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /lockJiraAggregateProject\(transaction, project\.id\)/u);
  assert.match(
    routeSource,
    /jiraAnalyticsDashboardConversion\.updateMany\([\s\S]*convertedConfigHash:\s*jiraDashboardConfigHash\(parsed\.data\.config\)/u,
  );
  assert.match(
    routeSource,
    /jiraAnalyticsDashboardConversion\.updateMany\([\s\S]*rolledBackAt:\s*new Date\(\)/u,
  );
});
