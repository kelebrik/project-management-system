import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  createJiraAnalyticsEvaluationAccumulator,
  evaluateJiraAnalyticsAggregate,
  JiraAnalyticsEvaluationLimitError,
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsDatasetDraftSchema,
  jiraAnalyticsDatasetFromLegacy,
  jiraAnalyticsLegacyDatasetDraftSchema,
  jiraAnalyticsDatasetSemanticDocument,
  jiraAnalyticsWidgetDatasetError,
  normalizeJiraAnalyticsDatasetRevision,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsExecutableDefinition,
  type JiraAnalyticsIssueData,
} from '@pms/shared';
import type { JiraAggregateDefinition } from '@prisma/client';
import {
  buildJiraAggregateImportPlan,
  buildJiraDashboardSwitchPlan,
  convertJiraDashboardToV2,
  convertJiraDashboardV3ToV4,
  editableJiraDashboardV3,
  inspectJiraDashboardDefinitionUse,
  jiraAggregateFingerprint,
  jiraAggregateDatasetFingerprint,
  jiraAggregateDatasetRevisionCreateData,
  jiraAggregateIssueSelect,
  jiraAggregateResultCsv,
  jiraAggregateResultProjection,
  jiraDashboardReconciliationConfigs,
  jiraDashboardConfigHash,
  JIRA_AGGREGATE_ISSUE_BATCH_SIZE,
  JIRA_AGGREGATE_MAX_EVENTS,
  JiraAggregateEventLimitError,
  evaluateJiraAggregatesFromDatabase,
  loadJiraAggregateIssueBatches,
  loadJiraAnalyticsFacets,
  lockJiraAggregateProject,
  mergeJiraAsOfDataQuality,
  reconcileJiraDashboardFromDatabase,
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
    sprintCount: 0,
    labels: [],
    issueCreatedAt: '2026-01-01T00:00:00.000Z',
    criticalPriorityAt: null,
    criticalEndPriority: null,
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

function statusIntervalDefinition(
  patch: Partial<JiraAnalyticsExecutableDefinition> = {},
): JiraAnalyticsExecutableDefinition {
  return {
    ...definition({ source: 'statusIntervals', periodMode: 'NONE' }),
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'issueCreated' },
      end: { anchor: 'firstStatusEntry', statuses: ['In Progress'] },
      openIntervals: 'include',
      periodAnchor: 'start',
    },
    ...patch,
  };
}

function storedIssue(issueKey: string) {
  return {
    id: `snapshot-${issueKey}`,
    issueKey,
    issueUrl: `https://jira.example/browse/${issueKey}`,
    summary: issueKey,
    status: 'In Progress',
    priority: 'Major',
    assignee: 'User',
    reporter: 'Reporter',
    issueType: 'Bug',
    resolution: null,
    sprint: null,
    currentVersion: { sprintIds: [] },
    issueCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    criticalPriorityAt: null,
    resolutionAt: null,
    criticalSlaTracked: false,
    commitCount: 0,
    mergeRequestCount: 0,
    developmentDataAvailable: false,
    transitionHistoryComplete: true,
    syncedAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    statusTransitions: [],
    developmentActivities: [],
  };
}

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

test('retro dashboard evaluates the pinned aggregate revision instead of the current definition', () => {
  const current = definition({
    name: 'Priority aggregate',
    scope: 'retro',
    filters: [{ id: 'current', field: 'priority', operator: 'equals', value: 'Minor' }],
  });
  const pinned = definition({
    name: 'Priority aggregate',
    scope: 'retro',
    filters: [{ id: 'pinned', field: 'priority', operator: 'equals', value: 'Major' }],
  });
  const row = {
    id: 'aggregate-1', projectId: 'project-1', name: current.name, nameKey: 'priority aggregate',
    description: current.description, source: current.source, metric: current.metric,
    groupBy: current.groupBy, scope: current.scope, filterLogic: current.filterLogic,
    filters: current.filters, periodMode: current.periodMode, periodDays: current.periodDays,
    timeZone: current.timeZone, fingerprint: jiraAggregateFingerprint(current), sortOrder: 0,
    version: 2, createdAt: new Date(), updatedAt: new Date(),
  } satisfies JiraAggregateDefinition;
  const result = resolveSavedDashboard({
    version: 2,
    periodDays: 90,
    assignee: '',
    widgets: [{
      id: 'retro-widget', title: 'Pinned', aggregateId: row.id, aggregateVersion: 1,
      visualization: 'number', width: 'half', placement: 'retro',
    }],
  }, [row], [issue({ priority: 'Major' })], options, undefined, new Map([[`${row.id}:1`, pinned]]));

  assert.equal(result.widgets[0]?.status, 'OK');
  assert.equal(result.widgets[0]?.result?.totalRecords, 1);
});

test('v3 active widgets follow the current dataset while retro widgets keep their pinned dataset', () => {
  const legacy = definition({ name: 'Priority rows', scope: 'active' });
  const currentLegacyDataset = jiraAnalyticsLegacyDatasetDraftSchema.parse({
    name: 'Priority rows', description: '', source: 'issues',
    exposedFields: ['issueKey', 'priority'], baseFilterLogic: 'and',
    baseFilters: [{ id: 'current', field: 'priority', operator: 'equals', value: 'Minor' }],
    timeZone: 'Europe/Moscow', sortOrder: 0,
  });
  const pinnedLegacyDataset = jiraAnalyticsLegacyDatasetDraftSchema.parse({
    ...currentLegacyDataset,
    baseFilters: [{ id: 'pinned', field: 'priority', operator: 'equals', value: 'Major' }],
  });
  const {
    exposedFields: _currentFields,
    baseFilterLogic: _currentLogic,
    baseFilters: _currentFilters,
    ...currentDataset
  } = currentLegacyDataset;
  const {
    exposedFields: pinnedFields,
    baseFilterLogic: pinnedLogic,
    baseFilters: pinnedFilters,
    ...pinnedDataset
  } = pinnedLegacyDataset;
  const row = {
    id: 'aggregate-v3', projectId: 'project-1', name: currentDataset.name,
    nameKey: 'priority rows', description: '', source: 'issues',
    metric: legacy.metric, groupBy: legacy.groupBy, scope: legacy.scope,
    filterLogic: legacy.filterLogic, filters: legacy.filters,
    periodMode: legacy.periodMode, periodDays: legacy.periodDays,
    timeZone: currentDataset.timeZone, fingerprint: 'a'.repeat(64), sortOrder: 0,
    definitionSchemaVersion: 2, exposedFields: currentLegacyDataset.exposedFields,
    baseFilterLogic: currentLegacyDataset.baseFilterLogic, baseFilters: currentLegacyDataset.baseFilters,
    version: 2, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;
  const widget = {
    title: 'Priority', aggregateId: row.id, metric: 'count' as const,
    groupBy: 'none' as const, filterLogic: 'and' as const, filters: [],
    periodMode: 'NONE' as const, periodDays: null, sortBy: 'default' as const,
    sortDirection: 'desc' as const, visualization: 'number' as const, width: 'half' as const,
  };
  const result = resolveSavedDashboard({
    version: 3,
    periodDays: 90,
    assignee: '',
    widgets: [
      { ...widget, id: 'active', placement: 'active', aggregateVersion: null },
      { ...widget, id: 'retro', placement: 'retro', aggregateVersion: 1 },
    ],
  }, [row], [issue({ priority: 'Major' })], options, undefined, new Map(), new Map([
    [`${row.id}:1`, {
      dataset: pinnedDataset,
      legacyContract: {
        exposedFields: pinnedFields,
        baseFilterLogic: pinnedLogic,
        baseFilters: pinnedFilters,
      },
    }],
  ]));

  assert.equal(result.configVersion, 3);
  assert.equal(result.widgets.find((item) => item.widgetId === 'active')?.result?.totalRecords, 0);
  assert.equal(result.widgets.find((item) => item.widgetId === 'retro')?.result?.totalRecords, 1);
});

test('v3 to v4 migration preserves aggregate and widget filter groups without changing results', () => {
  const legacyDataset = jiraAnalyticsLegacyDatasetDraftSchema.parse({
    name: 'Filtered issues', description: '', source: 'issues',
    exposedFields: ['issueKey', 'status'],
    baseFilterLogic: 'or',
    baseFilters: [
      { id: 'major', field: 'priority', operator: 'equals', value: 'Major' },
      { id: 'critical', field: 'priority', operator: 'equals', value: 'Critical' },
    ],
    timeZone: 'Europe/Moscow', sortOrder: 0,
  });
  const legacy = definition({ name: legacyDataset.name });
  const row = {
    id: 'aggregate-filtered', projectId: 'project-1', name: legacyDataset.name,
    nameKey: 'filtered issues', description: '', source: 'issues',
    metric: legacy.metric, groupBy: legacy.groupBy, scope: legacy.scope,
    filterLogic: legacy.filterLogic, filters: legacy.filters,
    periodMode: legacy.periodMode, periodDays: legacy.periodDays,
    timeZone: legacyDataset.timeZone, fingerprint: 'b'.repeat(64), sortOrder: 0,
    definitionSchemaVersion: 2, exposedFields: legacyDataset.exposedFields,
    baseFilterLogic: legacyDataset.baseFilterLogic, baseFilters: legacyDataset.baseFilters,
    version: 1, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;
  const v3 = {
    version: 3 as const, periodDays: 90 as const, assignee: '',
    widgets: [{
      id: 'filtered', title: 'Filtered', aggregateId: row.id, aggregateVersion: null,
      placement: 'active' as const, metric: 'count' as const, groupBy: 'none' as const,
      filterLogic: 'or' as const,
      filters: [
        { id: 'progress', field: 'status' as const, operator: 'equals' as const, value: 'In Progress' },
        { id: 'reopened', field: 'status' as const, operator: 'equals' as const, value: 'Reopened' },
      ],
      periodMode: 'NONE' as const, periodDays: null, sortBy: 'default' as const,
      sortDirection: 'desc' as const, visualization: 'number' as const, width: 'half' as const,
    }],
  };
  const v4 = convertJiraDashboardV3ToV4(v3, [row]);

  assert.deepEqual(v4.widgets[0]?.selectedFields, ['issueKey', 'status', 'priority']);
  assert.equal(v4.widgets[0]?.baseFilterLogic, 'or');
  assert.deepEqual(v4.widgets[0]?.baseFilters, legacyDataset.baseFilters);
  assert.equal(v4.widgets[0]?.filterLogic, 'or');
  assert.deepEqual(v4.widgets[0]?.filters, v3.widgets[0]?.filters);

  const issues = [
    issue({ id: 'match', issueKey: 'CVTE-1', priority: 'Major', status: 'In Progress' }),
    issue({ id: 'wrong-status', issueKey: 'CVTE-2', priority: 'Major', status: 'Done' }),
    issue({ id: 'wrong-priority', issueKey: 'CVTE-3', priority: 'Minor', status: 'Reopened' }),
  ];
  const before = resolveSavedDashboard(v3, [row], issues, options);
  const after = resolveSavedDashboard(v4, [row], issues, options);
  assert.equal(before.widgets[0]?.result?.totalRecords, 1);
  assert.equal(after.widgets[0]?.result?.totalRecords, 1);
  assert.deepEqual(
    after.widgets[0]?.result?.records.map((record) => record.issue.issueKey),
    before.widgets[0]?.result?.records.map((record) => record.issue.issueKey),
  );

  const diagnostics: string[] = [];
  const partial = convertJiraDashboardV3ToV4({
    ...v3,
    widgets: [
      ...v3.widgets,
      { ...v3.widgets[0], id: 'missing', title: 'Missing', aggregateId: 'missing-aggregate' },
    ],
  }, [row], new Map(), diagnostics);
  assert.deepEqual(partial.widgets.map((widget) => widget.id), ['filtered']);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0] ?? '', /Missing/u);
});

test('aggregate DB selector cannot read immutable raw payloads', () => {
  assert.equal('payload' in jiraAggregateIssueSelect, false);
  assert.equal('versions' in jiraAggregateIssueSelect, false);
  assert.equal(jiraAggregateIssueSelect.labels, true);
  assert.deepEqual(jiraAggregateIssueSelect.currentVersion.select, { sprintIds: true });
});

test('ticket aggregate filters labels by individual membership', () => {
  const issues = [
    issue({ id: 'one', issueKey: 'CVTE-1', labels: ['cvte968', 'release'] }),
    issue({ id: 'two', issueKey: 'CVTE-2', labels: ['other'] }),
    issue({ id: 'three', issueKey: 'CVTE-3', labels: [] }),
  ];
  const equals = evaluateJiraAnalyticsAggregate(definition({
    filters: [{ id: 'labels', field: 'labels', operator: 'equals', value: 'CVTE968' }],
  }), issues, options);
  const notEquals = evaluateJiraAnalyticsAggregate(definition({
    filters: [{ id: 'labels', field: 'labels', operator: 'notEquals', value: 'release' }],
  }), issues, options);
  const empty = evaluateJiraAnalyticsAggregate(definition({
    filters: [{ id: 'labels', field: 'labels', operator: 'empty', value: '' }],
  }), issues, options);
  const contains = evaluateJiraAnalyticsAggregate(definition({
    filters: [{ id: 'labels', field: 'labels', operator: 'contains', value: 'lea' }],
  }), issues, options);
  const notEmpty = evaluateJiraAnalyticsAggregate(definition({
    filters: [{ id: 'labels', field: 'labels', operator: 'notEmpty', value: '' }],
  }), issues, options);

  assert.deepEqual(equals.records.map((record) => record.issue.issueKey), ['CVTE-1']);
  assert.deepEqual(contains.records.map((record) => record.issue.issueKey), ['CVTE-1']);
  assert.deepEqual(notEmpty.records.map((record) => record.issue.issueKey), ['CVTE-1', 'CVTE-2']);
  assert.deepEqual(notEquals.records.map((record) => record.issue.issueKey).sort(), ['CVTE-2', 'CVTE-3']);
  assert.deepEqual(empty.records.map((record) => record.issue.issueKey), ['CVTE-3']);
});

test('ticket aggregate filters and sorts by the typed Sprint entry count', () => {
  const result = evaluateJiraAnalyticsAggregate(definition({
    source: 'issues',
    filters: [{ id: 'sprints', field: 'sprintCount', operator: 'greaterThan', value: '3' }],
    sortBy: 'sprintCount',
    sortDirection: 'desc',
  }), [
    issue({ id: 'four', issueKey: 'CVTE-4', sprint: 'Sprint 4', sprintCount: 4 }),
    issue({ id: 'six', issueKey: 'CVTE-6', sprint: 'Sprint 6', sprintCount: 6 }),
    issue({ id: 'three', issueKey: 'CVTE-3', sprint: 'Sprint 3', sprintCount: 3 }),
  ], options);

  assert.equal(result.totalRecords, 2);
  assert.deepEqual(result.records.map((record) => record.issue.issueKey), ['CVTE-6', 'CVTE-4']);
});

test('goal ticket aggregate matches labels exactly and supports Critical/Blocker one-of filtering', () => {
  const result = evaluateJiraAnalyticsAggregate({
    ...definition({
      source: 'goalIssues',
      filters: [
        { id: 'goal', field: 'goalName', operator: 'equals', value: 'Релиз заводской прошивки' },
        { id: 'priority', field: 'priority', operator: 'oneOf', value: 'Critical, Blocker' },
        { id: 'resolution', field: 'resolution', operator: 'empty', value: '' },
      ],
    }),
    goalMappings: [{
      id: 'goal-1', name: 'Релиз заводской прошивки', status: 'IN_PROGRESS',
      date: '2026-09-01T00:00:00.000Z', labels: ['MP'],
    }],
    rowIdentity: ['goalId', 'issueKey'],
  }, [
    issue({ id: 'critical', issueKey: 'CVTE-1', labels: ['mp'], priority: 'Critical' }),
    issue({ id: 'blocker', issueKey: 'CVTE-2', labels: ['MP'], priority: 'Blocker' }),
    issue({ id: 'partial', issueKey: 'CVTE-3', labels: ['MP-extra'], priority: 'Blocker' }),
    issue({ id: 'major', issueKey: 'CVTE-4', labels: ['MP'], priority: 'Major' }),
    issue({ id: 'resolved', issueKey: 'CVTE-5', labels: ['MP'], priority: 'Critical', resolution: 'Fixed' }),
  ], options);

  assert.equal(result.totalRecords, 2);
  assert.deepEqual(result.records.map((record) => record.issue.issueKey).sort(), ['CVTE-1', 'CVTE-2']);
  assert.deepEqual(result.records[0]?.goal?.labels, ['MP']);
});

test('aggregate batch loader uses a stable issue-key cursor and bounded batches', async () => {
  const stored = Array.from(
    { length: JIRA_AGGREGATE_ISSUE_BATCH_SIZE + 1 },
    (_, index) => storedIssue(`CVTE-${String(index + 1).padStart(4, '0')}`),
  );
  let pageQueries = 0;
  const client = {
    jiraIssueSnapshot: {
      count: async () => stored.length,
      findMany: async (query: { cursor?: { projectId_issueKey?: { issueKey?: string } }; take: number }) => {
        pageQueries += 1;
        const cursor = query.cursor?.projectId_issueKey?.issueKey;
        const start = cursor ? stored.findIndex((row) => row.issueKey === cursor) + 1 : 0;
        return stored.slice(start, start + query.take);
      },
    },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as Parameters<typeof loadJiraAggregateIssueBatches>[0];
  const batches: JiraAnalyticsIssueData[][] = [];
  for await (const batch of loadJiraAggregateIssueBatches(client, 'project-1')) batches.push(batch);
  assert.deepEqual(batches.map((batch) => batch.length), [JIRA_AGGREGATE_ISSUE_BATCH_SIZE, 1]);
  assert.equal(pageQueries, 2);
  assert.equal(batches[1]?.[0]?.issueKey, stored.at(-1)?.issueKey);
});

test('semantic widget batch evaluates multiple widgets in one current-state scan', async () => {
  const stored = [storedIssue('CVTE-0001')];
  let pageQueries = 0;
  const client = {
    jiraIssueSnapshot: {
      count: async () => stored.length,
      findMany: async (query: { cursor?: { projectId_issueKey?: { issueKey?: string } }; take: number }) => {
        pageQueries += 1;
        const cursor = query.cursor?.projectId_issueKey?.issueKey;
        return cursor ? [] : stored.slice(0, query.take);
      },
    },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as Parameters<typeof evaluateJiraAggregatesFromDatabase>[0];
  const requests = ['one', 'two'].map((key) => ({
    key,
    definition: definition(),
    options,
  }));

  const result = await evaluateJiraAggregatesFromDatabase(client, 'project-1', requests);
  assert.deepEqual(result.map((item) => item.result?.totalRecords), [1, 1]);
  assert.equal(pageQueries, 1);
});

test('semantic widget batch isolates a row-limit failure to one widget', async () => {
  const stored = [storedIssue('CVTE-0001')];
  const client = {
    jiraIssueSnapshot: {
      count: async () => stored.length,
      findMany: async (query: { cursor?: unknown }) => query.cursor ? [] : stored,
    },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as Parameters<typeof evaluateJiraAggregatesFromDatabase>[0];
  const limited = { ...definition(), maximumRows: 0 };
  const result = await evaluateJiraAggregatesFromDatabase(client, 'project-1', [
    { key: 'limited', definition: limited, options },
    { key: 'healthy', definition: definition(), options },
  ]);

  assert.equal(result[0]?.result, null);
  assert.ok(result[0]?.error instanceof JiraAnalyticsEvaluationLimitError);
  assert.equal(result[1]?.result?.totalRecords, 1);
  assert.equal(result[1]?.error, null);
});

test('semantic widget batch isolates an invalid page window during accumulator creation', async () => {
  const stored = [storedIssue('CVTE-0001')];
  const client = {
    jiraIssueSnapshot: {
      count: async () => stored.length,
      findMany: async (query: { cursor?: unknown }) => query.cursor ? [] : stored,
    },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as Parameters<typeof evaluateJiraAggregatesFromDatabase>[0];
  const result = await evaluateJiraAggregatesFromDatabase(client, 'project-1', [
    { key: 'invalid-window', definition: definition(), options: { ...options, page: 101, pageSize: 100 } },
    { key: 'healthy', definition: definition(), options },
  ]);

  assert.equal(result[0]?.result, null);
  assert.ok(result[0]?.error instanceof JiraAnalyticsEvaluationLimitError);
  assert.equal(result[1]?.result?.totalRecords, 1);
  assert.equal(result[1]?.error, null);
});

test('aggregate batch loader rejects nested event volume before reading snapshots', async () => {
  let loaded = false;
  const client = {
    jiraIssueSnapshot: { count: async () => 1, findMany: async () => { loaded = true; return []; } },
    jiraIssueStatusTransition: { count: async () => JIRA_AGGREGATE_MAX_EVENTS + 1 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as Parameters<typeof loadJiraAggregateIssueBatches>[0];
  await assert.rejects(async () => {
    for await (const _batch of loadJiraAggregateIssueBatches(client, 'project-1')) {
      // The preflight limit must fail before the first batch.
    }
  }, JiraAggregateEventLimitError);
  assert.equal(loaded, false);
});

test('analytics facets preserve active-scope semantics without exposing snapshots', async () => {
  const client = {
    jiraIssueSnapshot: {
      findMany: async () => [
        {
          status: 'In Progress', resolution: null, assignee: 'Бета',
          transitionHistoryComplete: true, developmentDataAvailable: true,
          criticalSlaTracked: true, criticalPriorityAt: new Date('2026-01-01T00:00:00.000Z'),
          syncedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
        {
          status: 'Cancelled', resolution: null, assignee: 'Альфа',
          transitionHistoryComplete: false, developmentDataAvailable: false,
          criticalSlaTracked: false, criticalPriorityAt: null,
          syncedAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          status: 'Done', resolution: 'Fixed', assignee: 'Бета',
          transitionHistoryComplete: true, developmentDataAvailable: false,
          criticalSlaTracked: true, criticalPriorityAt: null,
          syncedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    },
  } as unknown as Parameters<typeof loadJiraAnalyticsFacets>[0];
  const facets = await loadJiraAnalyticsFacets(client, 'project-1');
  assert.deepEqual(facets, {
    issueCount: 3,
    activeIssueCount: 1,
    transitionHistoryCompleteCount: 2,
    developmentDataAvailableCount: 1,
    criticalSlaTrackedCount: 2,
    criticalSlaReadyCount: 1,
    latestSyncedAt: '2026-03-01T00:00:00.000Z',
    assignees: ['Альфа', 'Бета'],
    assigneesTruncated: false,
  });
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

test('editable dashboard always enters v3 even when no aggregate exists yet', async () => {
  const client = {
    jiraAggregateDefinitionRevision: {
      findMany: async () => { throw new Error('revisions must not be read'); },
    },
  } as unknown as Parameters<typeof editableJiraDashboardV3>[0];
  const empty = { version: 3 as const, periodDays: 180 as const, assignee: '', widgets: [] };

  assert.deepEqual(await editableJiraDashboardV3(client, 'project-1', null, []), {
    version: 3,
    periodDays: 90,
    assignee: '',
    widgets: [],
  });
  assert.deepEqual(await editableJiraDashboardV3(client, 'project-1', empty, []), empty);
});

test('editable v3 conversion fails closed for a stored v1 dashboard without aggregates', async () => {
  const client = {
    jiraAggregateDefinitionRevision: {
      findMany: async () => { throw new Error('revisions must not be read'); },
    },
  } as unknown as Parameters<typeof editableJiraDashboardV3>[0];
  const diagnostics: string[] = [];

  await assert.rejects(
    editableJiraDashboardV3(client, 'project-1', {
      version: 1,
      periodDays: 90,
      assignee: '',
      widgets: [{
        id: 'legacy', title: 'Legacy', source: 'issues', metric: 'count', groupBy: 'none',
        visualization: 'number', filterLogic: 'and', filters: [], width: 'half', section: 'active',
      }],
    }, [], diagnostics),
    /DASHBOARD_V3_CONVERSION_EMPTY/u,
  );
  assert.equal(diagnostics.length, 1);
});

test('editable v3 conversion rejects a partial result instead of dropping missing widgets', async () => {
  const matchedWidget = {
    id: 'matched', title: 'Matched', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'active' as const,
  };
  const missingWidget = { ...matchedWidget, id: 'missing', title: 'Missing', groupBy: 'priority' as const };
  const matchedDraft = definition({ name: matchedWidget.title, scope: 'active' });
  const row = {
    id: 'aggregate-1', projectId: 'project-1', name: matchedDraft.name,
    nameKey: 'matched', description: '', source: matchedDraft.source,
    metric: matchedDraft.metric, groupBy: matchedDraft.groupBy, scope: matchedDraft.scope,
    filterLogic: matchedDraft.filterLogic, filters: matchedDraft.filters,
    periodMode: matchedDraft.periodMode, periodDays: matchedDraft.periodDays,
    timeZone: matchedDraft.timeZone, fingerprint: jiraAggregateFingerprint(matchedDraft),
    sortOrder: 0, version: 1, createdAt: new Date(), updatedAt: new Date(),
    definitionSchemaVersion: 1, exposedFields: null, baseFilterLogic: null, baseFilters: null,
  } as unknown as JiraAggregateDefinition;
  const diagnostics: string[] = [];
  const client = {
    jiraAggregateDefinitionRevision: { findMany: async () => [] },
  } as unknown as Parameters<typeof editableJiraDashboardV3>[0];

  await assert.rejects(
    editableJiraDashboardV3(client, 'project-1', {
      version: 1, periodDays: 90, assignee: '', widgets: [matchedWidget, missingWidget],
    }, [row], diagnostics),
    /DASHBOARD_V3_CONVERSION_PARTIAL/u,
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0] ?? '', /Missing/u);
});

test('editable v3 conversion does not invent legacy query settings for a dataset-only revision', async () => {
  const dataset = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Dataset', description: '', source: 'issues', timeZone: 'Europe/Moscow', sortOrder: 0,
  });
  const legacy = definition({ name: dataset.name, scope: 'retro' });
  const row = {
    id: 'aggregate-1', projectId: 'project-1', name: dataset.name, nameKey: 'dataset',
    description: '', source: dataset.source, metric: legacy.metric, groupBy: legacy.groupBy,
    scope: legacy.scope, filterLogic: legacy.filterLogic, filters: legacy.filters,
    periodMode: legacy.periodMode, periodDays: legacy.periodDays, timeZone: dataset.timeZone,
    fingerprint: 'a'.repeat(64), sortOrder: 0, version: 2,
    definitionSchemaVersion: 4, exposedFields: ['issueKey', 'status'],
    baseFilterLogic: 'and', baseFilters: [], rowConfig: null,
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;
  const client = {
    jiraAggregateDefinitionRevision: {
      findMany: async () => [{
        aggregateId: row.id,
        version: 1,
        definition: { schemaVersion: 4, ...dataset },
      }],
    },
  } as unknown as Parameters<typeof editableJiraDashboardV3>[0];

  const diagnostics: string[] = [];
  await assert.rejects(
    editableJiraDashboardV3(client, 'project-1', {
      version: 2,
      periodDays: 90,
      assignee: '',
      widgets: [{
        id: 'retro', title: 'Retro', aggregateId: row.id, aggregateVersion: 1,
        placement: 'retro', visualization: 'number', width: 'half',
      }],
    }, [row], diagnostics),
    /DASHBOARD_V3_CONVERSION_PARTIAL/u,
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0] ?? '', /ревизия недоступны/u);
});
