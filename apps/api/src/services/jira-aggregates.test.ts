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
  editableJiraDashboardV3,
  inspectJiraDashboardDefinitionUse,
  jiraAggregateFingerprint,
  jiraAggregateDatasetFingerprint,
  jiraAggregateDatasetRevisionCreateData,
  jiraAggregateIssueSelect,
  jiraAggregateResultCsv,
  jiraDashboardReconciliationConfigs,
  jiraDashboardConfigHash,
  JIRA_AGGREGATE_ISSUE_BATCH_SIZE,
  JIRA_AGGREGATE_MAX_EVENTS,
  JiraAggregateEventLimitError,
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

test('aggregate schema rejects source/metric/group/filter drift and empty numeric values', () => {
  assert.equal(jiraAnalyticsAggregateDraftSchema.safeParse(definition({
    metric: 'p95Duration',
    groupBy: 'week',
    filters: [{ id: 'f', field: 'durationHours', operator: 'greaterThan', value: '' }],
  })).success, false);
});

test('dataset exposes row fields while widget owns metric, grouping and presentation', () => {
  const dataset = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Critical SLA rows',
    description: '',
    source: 'criticalBugs',
    exposedFields: ['issueKey', 'project', 'durationHours'],
    baseFilterLogic: 'and',
    baseFilters: [{ id: 'base', field: 'durationHours', operator: 'greaterThan', value: '720' }],
    timeZone: 'Europe/Moscow',
    sortOrder: 0,
  });
  const widget = {
    id: 'sla-by-project', title: 'SLA по проектам', aggregateId: 'aggregate', aggregateVersion: 1,
    placement: 'retro', metric: 'count', groupBy: 'project', filterLogic: 'and', filters: [],
    periodMode: 'NONE', periodDays: null, sortBy: 'durationHours', sortDirection: 'desc',
    visualization: 'bar', width: 'full',
  } as const;
  assert.equal(jiraAnalyticsWidgetDatasetError(widget, dataset), null);
  assert.equal(jiraAnalyticsWidgetDatasetError({ ...widget, groupBy: 'assignee' }, dataset), 'Поле группировки не опубликовано агрегатом');
});

test('legacy aggregate filters become mandatory dataset base filters', () => {
  const legacy = definition({
    filterLogic: 'or',
    filters: [
      { id: 'critical', field: 'priority', operator: 'equals', value: 'Critical' },
      { id: 'blocker', field: 'priority', operator: 'equals', value: 'Blocker' },
    ],
  });
  const dataset = jiraAnalyticsDatasetFromLegacy(legacy);
  assert.equal(dataset.baseFilterLogic, 'or');
  assert.deepEqual(dataset.baseFilters, legacy.filters);
});

test('dataset base filters are always ANDed with widget filters', () => {
  const result = evaluateJiraAnalyticsAggregate({
    ...definition({ filters: [{ id: 'widget', field: 'status', operator: 'equals', value: 'Open' }] }),
    baseFilterLogic: 'and',
    baseFilters: [{ id: 'base', field: 'priority', operator: 'equals', value: 'Critical' }],
  }, [
    issue({ id: 'one', issueKey: 'P-1', status: 'Open', priority: 'Critical' }),
    issue({ id: 'two', issueKey: 'P-2', status: 'Open', priority: 'Major' }),
    issue({ id: 'three', issueKey: 'P-3', status: 'Done', priority: 'Critical' }),
  ], { now: '2026-02-01T00:00:00.000Z', assignee: '', page: 1, pageSize: 20 });
  assert.deepEqual(result.records.map((record) => record.issue.issueKey), ['P-1']);
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

test('dataset fingerprint identifies row semantics independently of its display name', () => {
  const first = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Первое имя', description: 'One', source: 'issues',
    exposedFields: ['issueKey', 'status'], baseFilterLogic: 'and',
    baseFilters: [{ id: 'one', field: 'status', operator: 'equals', value: 'Open' }],
    timeZone: 'Europe/Moscow', sortOrder: 1,
  });
  const second = jiraAnalyticsDatasetDraftSchema.parse({
    ...first,
    name: 'Другое имя',
    description: 'Two',
    sortOrder: 99,
    baseFilters: [{ id: 'two', field: 'status', operator: 'equals', value: 'open' }],
  });

  assert.equal(jiraAggregateDatasetFingerprint(first), jiraAggregateDatasetFingerprint(second));
});

test('status interval fingerprint normalizes status lists while legacy datasets stay v2-shaped', () => {
  const base = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Creation to work', description: '', source: 'statusIntervals',
    exposedFields: ['issueKey', 'intervalStartAt', 'intervalEndAt', 'durationHours'],
    baseFilterLogic: 'and', baseFilters: [], rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'issueCreated' },
      end: { anchor: 'firstStatusEntry', statuses: ['IN PROGRESS', 'В работе'] },
      openIntervals: 'include', periodAnchor: 'start',
    },
    timeZone: 'Europe/Moscow', sortOrder: 0,
  });
  const reordered = jiraAnalyticsDatasetDraftSchema.parse({
    ...base,
    rowConfig: {
      ...base.rowConfig!,
      end: { anchor: 'firstStatusEntry', statuses: [' в РАБОТЕ ', 'in progress'] },
    },
  });
  const ordinary = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Issues', description: '', source: 'issues', exposedFields: ['issueKey'],
    baseFilterLogic: 'and', baseFilters: [], timeZone: 'Europe/Moscow', sortOrder: 0,
  });

  assert.equal(jiraAggregateDatasetFingerprint(base), jiraAggregateDatasetFingerprint(reordered));
  assert.equal('rowConfig' in jiraAnalyticsDatasetSemanticDocument(ordinary), false);

  const intervalRevision = jiraAggregateDatasetRevisionCreateData('project', 'aggregate', 1, base);
  const ordinaryRevision = jiraAggregateDatasetRevisionCreateData('project', 'aggregate-2', 1, ordinary);
  assert.equal((intervalRevision.definition as { schemaVersion: number }).schemaVersion, 3);
  assert.equal((ordinaryRevision.definition as { schemaVersion: number }).schemaVersion, 2);
  assert.equal('rowConfig' in (ordinaryRevision.definition as object), false);
  assert.deepEqual(normalizeJiraAnalyticsDatasetRevision(intervalRevision.definition)?.dataset, base);
  assert.deepEqual(normalizeJiraAnalyticsDatasetRevision(ordinaryRevision.definition)?.dataset, ordinary);
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

test('status interval measures creation to the first matching status entry', () => {
  const result = evaluateJiraAnalyticsAggregate(
    statusIntervalDefinition({
      filters: [{ id: 'slow', field: 'durationHours', operator: 'greaterThan', value: '288' }],
    }),
    [issue({
      status: 'In Progress',
      statusTransitions: [
        { id: 't1', fromStatus: 'Open', toStatus: 'Analysis', transitionedAt: '2026-01-03T00:00:00.000Z' },
        { id: 't2', fromStatus: 'Analysis', toStatus: 'In Progress', transitionedAt: '2026-01-15T00:00:00.000Z' },
        { id: 't3', fromStatus: 'In Progress', toStatus: 'QA', transitionedAt: '2026-01-20T00:00:00.000Z' },
        { id: 't4', fromStatus: 'QA', toStatus: 'In Progress', transitionedAt: '2026-02-01T00:00:00.000Z' },
      ],
    })],
    options,
  );

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.intervalStartAt, '2026-01-01T00:00:00.000Z');
  assert.equal(result.records[0]?.intervalEndAt, '2026-01-15T00:00:00.000Z');
  assert.equal(result.records[0]?.durationHours, 336);
  assert.equal(result.records[0]?.toStatus, 'In Progress');
});

test('status interval is zero when a ticket is created in the target status', () => {
  const result = evaluateJiraAnalyticsAggregate(
    statusIntervalDefinition(),
    [issue({ status: 'In Progress', statusTransitions: [] })],
    options,
  );

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.intervalStartAt, '2026-01-01T00:00:00.000Z');
  assert.equal(result.records[0]?.intervalEndAt, '2026-01-01T00:00:00.000Z');
  assert.equal(result.records[0]?.durationHours, 0);
});

test('status interval never substitutes the current status for a missing initial status', () => {
  const result = evaluateJiraAnalyticsAggregate(
    statusIntervalDefinition(),
    [issue({
      status: 'In Progress',
      statusTransitions: [{
        id: 't1', fromStatus: null, toStatus: 'In Progress', transitionedAt: '2026-01-15T00:00:00.000Z',
      }],
    })],
    options,
  );

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.fromStatus, null);
  assert.equal(result.records[0]?.intervalEndAt, '2026-01-15T00:00:00.000Z');
  assert.equal(result.records[0]?.durationHours, 336);
});

test('status interval includes or excludes an unfinished target according to its definition', () => {
  const openIssue = issue({
    status: 'Open',
    statusTransitions: [{
      id: 't1', fromStatus: 'Open', toStatus: 'Analysis', transitionedAt: '2026-01-10T00:00:00.000Z',
    }],
  });
  const included = evaluateJiraAnalyticsAggregate(statusIntervalDefinition(), [openIssue], options);
  const excluded = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'issueCreated' },
      end: { anchor: 'firstStatusEntry', statuses: ['In Progress'] },
      openIntervals: 'exclude',
      periodAnchor: 'end',
    },
  }), [openIssue], options);

  assert.equal(included.totalRecords, 1);
  assert.equal(included.records[0]?.intervalEndAt, null);
  assert.equal(included.records[0]?.durationHours, 1_416);
  assert.equal(excluded.totalRecords, 0);
});

test('status interval ordering is deterministic and period filtering uses its configured anchor', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    periodMode: 'DASHBOARD',
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'firstStatusEntry', statuses: ['Analysis'] },
      end: { anchor: 'firstStatusEntry', statuses: ['In Progress'] },
      openIntervals: 'exclude',
      periodAnchor: 'start',
    },
  }), [issue({
    issueCreatedAt: '2026-02-01T00:00:00.000Z',
    statusTransitions: [
      { id: 'a', fromStatus: 'Open', toStatus: 'Analysis', transitionedAt: '2026-02-15T00:00:00.000Z' },
      { id: 'b', fromStatus: 'Analysis', toStatus: 'In Progress', transitionedAt: '2026-02-15T00:00:00.000Z' },
    ],
  })], { ...options, periodDays: 30 });

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.durationHours, 0);
  assert.equal(result.records[0]?.fromStatus, 'Analysis');
  assert.equal(result.records[0]?.toStatus, 'In Progress');
});

test('status interval fails closed for missing creation or incomplete transition history', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition(), [
    issue({ id: 'missing-created', issueCreatedAt: null }),
    issue({ id: 'partial', transitionHistoryComplete: false }),
  ], options);

  assert.equal(result.totalRecords, 0);
  assert.equal(result.quality.status, 'PARTIAL');
  assert.equal(result.quality.population, 2);
  assert.equal(result.quality.complete, 0);
  assert.deepEqual(result.quality.warnings, [
    { code: 'INCOMPLETE_TRANSITION_HISTORY', count: 1 },
    { code: 'MISSING_ISSUE_CREATED_AT', count: 1 },
  ]);
});

test('aggregate result reports source-aware measured completeness', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ source: 'transitions', metric: 'count', periodMode: 'DASHBOARD' }),
    [
      issue({ id: 'complete', transitionHistoryComplete: true, dataObservedAt: '2026-02-28T10:00:00.000Z' }),
      issue({ id: 'incomplete', transitionHistoryComplete: false, dataObservedAt: '2026-02-28T11:00:00.000Z' }),
    ],
    options,
  );
  assert.deepEqual(result.quality, {
    status: 'PARTIAL',
    basis: 'CURRENT_PROJECTION',
    source: 'transitions',
    population: 2,
    complete: 1,
    incomplete: 1,
    coveragePercent: 50,
    oldestObservedAt: '2026-02-28T10:00:00.000Z',
    latestObservedAt: '2026-02-28T11:00:00.000Z',
    warnings: [{ code: 'INCOMPLETE_TRANSITION_HISTORY', count: 1 }],
  });
});

test('critical quality includes candidates whose SLA start is unavailable', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ source: 'criticalBugs', scope: 'retro' }),
    [
      issue({
        id: 'ready', priority: 'Blocker', criticalEndPriority: 'Blocker',
        criticalPriorityAt: '2026-02-01T00:00:00.000Z', criticalSlaTracked: true,
      }),
      issue({
        id: 'missing-start', priority: 'Critical', criticalEndPriority: 'Critical',
        criticalPriorityAt: null, criticalSlaTracked: false,
      }),
      issue({ id: 'major', priority: 'Major', criticalEndPriority: 'Major' }),
    ],
    options,
  );
  assert.equal(result.quality.population, 2);
  assert.equal(result.quality.complete, 1);
  assert.equal(result.quality.status, 'PARTIAL');
  assert.deepEqual(result.quality.warnings, [{ code: 'INCOMPLETE_CRITICAL_SLA', count: 1 }]);
});

test('project-wide historical gaps do not distort scoped aggregate coverage', () => {
  const quality = evaluateJiraAnalyticsAggregate(
    definition(),
    [issue({ assignee: 'Selected user', dataObservedAt: '2026-02-28T10:00:00.000Z' })],
    { ...options, assignee: 'Selected user' },
  ).quality;
  const merged = mergeJiraAsOfDataQuality(quality, {
    mode: 'AS_OF',
    provenance: 'RECONSTRUCTED',
    basis: 'OBSERVED_VERSIONS',
    asOf: options.now,
    tickets: 1,
    ticketsWithoutObservation: 25,
    ticketsRetiredAfterAsOf: 0,
    versionRowsScanned: 1,
    earliestObservationAt: '2026-02-28T10:00:00.000Z',
    stalenessHours: { p50: 1, p95: 1, max: 1 },
    beforeHistoryStart: false,
    historyWriteGap: { includesAsOf: false, runs: 0, firstAt: null, lastAt: null },
    quality: 'AVAILABLE',
  });
  assert.equal(merged.status, 'COMPLETE');
  assert.equal(merged.population, 1);
  assert.equal(merged.complete, 1);
  assert.equal(merged.coveragePercent, 100);
  assert.deepEqual(merged.warnings, [{ code: 'MISSING_HISTORICAL_OBSERVATION', count: 25 }]);
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

test('batched accumulator preserves one-shot aggregate semantics', () => {
  const issues = [
    issue({
      id: 'one',
      issueKey: 'CVTE-1',
      statusTransitions: [
        { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-02-01T00:00:00.000Z' },
        { id: 't2', fromStatus: 'In Progress', toStatus: 'QA', transitionedAt: '2026-02-10T00:00:00.000Z' },
      ],
    }),
    issue({
      id: 'two',
      issueKey: 'CVTE-2',
      issueCreatedAt: '2026-01-15T00:00:00.000Z',
      statusTransitions: [
        { id: 't3', fromStatus: 'Open', toStatus: 'QA', transitionedAt: '2026-02-20T00:00:00.000Z' },
      ],
    }),
  ];
  const aggregate = definition({
    source: 'transitions',
    metric: 'p85Duration',
    groupBy: 'toStatus',
    periodMode: 'DASHBOARD',
  });
  const pagedOptions = { ...options, page: 2, pageSize: 1 };
  const oneShot = evaluateJiraAnalyticsAggregate(aggregate, issues, pagedOptions);
  const batched = createJiraAnalyticsEvaluationAccumulator(aggregate, pagedOptions, {
    maxGroups: 10,
    maxPageWindow: 10,
  });
  batched.addIssues(issues.slice(0, 1));
  batched.addIssues(issues.slice(1));
  assert.deepEqual(batched.finish(), oneShot);
});

test('batched accumulator fails closed on group and page-window limits', () => {
  assert.throws(
    () => createJiraAnalyticsEvaluationAccumulator(definition(), { ...options, page: 2, pageSize: 10 }, {
      maxPageWindow: 10,
    }),
    JiraAnalyticsEvaluationLimitError,
  );
  const grouped = createJiraAnalyticsEvaluationAccumulator(definition({ groupBy: 'status' }), options, {
    maxGroups: 1,
  });
  assert.throws(
    () => grouped.addIssues([issue({ id: 'one', status: 'Open' }), issue({ id: 'two', status: 'QA' })]),
    JiraAnalyticsEvaluationLimitError,
  );
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
  const currentDataset = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Priority rows', description: '', source: 'issues',
    exposedFields: ['issueKey', 'priority'], baseFilterLogic: 'and',
    baseFilters: [{ id: 'current', field: 'priority', operator: 'equals', value: 'Minor' }],
    timeZone: 'Europe/Moscow', sortOrder: 0,
  });
  const pinnedDataset = jiraAnalyticsDatasetDraftSchema.parse({
    ...currentDataset,
    baseFilters: [{ id: 'pinned', field: 'priority', operator: 'equals', value: 'Major' }],
  });
  const row = {
    id: 'aggregate-v3', projectId: 'project-1', name: currentDataset.name,
    nameKey: 'priority rows', description: '', source: 'issues',
    metric: legacy.metric, groupBy: legacy.groupBy, scope: legacy.scope,
    filterLogic: legacy.filterLogic, filters: legacy.filters,
    periodMode: legacy.periodMode, periodDays: legacy.periodDays,
    timeZone: currentDataset.timeZone, fingerprint: 'a'.repeat(64), sortOrder: 0,
    definitionSchemaVersion: 2, exposedFields: currentDataset.exposedFields,
    baseFilterLogic: currentDataset.baseFilterLogic, baseFilters: currentDataset.baseFilters,
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
    [`${row.id}:1`, pinnedDataset],
  ]));

  assert.equal(result.configVersion, 3);
  assert.equal(result.widgets.find((item) => item.widgetId === 'active')?.result?.totalRecords, 0);
  assert.equal(result.widgets.find((item) => item.widgetId === 'retro')?.result?.totalRecords, 1);
});

test('aggregate DB selector cannot read immutable raw payloads', () => {
  assert.equal('payload' in jiraAggregateIssueSelect, false);
  assert.equal('versions' in jiraAggregateIssueSelect, false);
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
    name: 'Dataset', description: '', source: 'issues', exposedFields: ['issueKey', 'status'],
    baseFilterLogic: 'and', baseFilters: [], timeZone: 'Europe/Moscow', sortOrder: 0,
  });
  const legacy = definition({ name: dataset.name, scope: 'retro' });
  const row = {
    id: 'aggregate-1', projectId: 'project-1', name: dataset.name, nameKey: 'dataset',
    description: '', source: dataset.source, metric: legacy.metric, groupBy: legacy.groupBy,
    scope: legacy.scope, filterLogic: legacy.filterLogic, filters: legacy.filters,
    periodMode: legacy.periodMode, periodDays: legacy.periodDays, timeZone: dataset.timeZone,
    fingerprint: 'a'.repeat(64), sortOrder: 0, version: 2,
    definitionSchemaVersion: 2, exposedFields: dataset.exposedFields,
    baseFilterLogic: dataset.baseFilterLogic, baseFilters: dataset.baseFilters,
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;
  const client = {
    jiraAggregateDefinitionRevision: {
      findMany: async () => [{
        aggregateId: row.id,
        version: 1,
        definition: { schemaVersion: 2, ...dataset },
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

test('dashboard import reuses an edited legacy definition by its unique name', () => {
  const widget = {
    id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'active' as const,
  };
  const draft = definition({ name: widget.title, scope: 'active' });
  const existing = {
    id: 'aggregate-1', projectId: 'project-1', name: 'One', nameKey: 'one', description: '',
    source: draft.source, metric: draft.metric, groupBy: draft.groupBy, scope: draft.scope,
    filterLogic: draft.filterLogic, filters: draft.filters, periodMode: draft.periodMode,
    periodDays: draft.periodDays, timeZone: draft.timeZone,
    fingerprint: 'dataset-fingerprint', sortOrder: 0, version: 2,
    definitionSchemaVersion: 1, exposedFields: null, baseFilterLogic: null, baseFilters: null,
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;
  const plan = buildJiraAggregateImportPlan({
    version: 1, periodDays: 90, assignee: '', widgets: [widget],
  }, [existing]);
  assert.equal(plan.items[0]?.existingId, existing.id);
  assert.equal(plan.items[0]?.definition.name, existing.name);
});

test('dashboard import never name-matches a v3 dataset through placeholder legacy columns', () => {
  const widget = {
    id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'active' as const,
  };
  const existing = {
    id: 'aggregate-v3', projectId: 'project-1', name: 'One', nameKey: 'one', description: '',
    source: 'issues', metric: 'count', groupBy: 'none', scope: 'active', filterLogic: 'and',
    filters: [], periodMode: 'NONE', periodDays: null, timeZone: 'Europe/Moscow',
    fingerprint: 'dataset-fingerprint', sortOrder: 0, version: 1,
    definitionSchemaVersion: 2, exposedFields: ['issueKey', 'priority'], baseFilterLogic: 'and',
    baseFilters: [{ id: 'major', field: 'priority', operator: 'equals', value: 'Major' }],
    createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;

  const plan = buildJiraAggregateImportPlan({
    version: 1, periodDays: 90, assignee: '', widgets: [widget],
  }, [existing]);

  assert.equal(plan.items[0]?.existingId, null);
  assert.equal(plan.items[0]?.definition.name, 'One (2)');
});

test('dashboard import never reuses a same-name aggregate with different legacy semantics', () => {
  const widget = {
    id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'active' as const,
  };
  const different = definition({ name: 'One', scope: 'active', groupBy: 'priority' });
  const existing = {
    id: 'aggregate-1', projectId: 'project-1', name: 'One', nameKey: 'one', description: '',
    source: different.source, metric: different.metric, groupBy: different.groupBy,
    scope: different.scope, filterLogic: different.filterLogic, filters: different.filters,
    periodMode: different.periodMode, periodDays: different.periodDays,
    timeZone: different.timeZone, fingerprint: 'dataset-fingerprint', sortOrder: 0,
    version: 2, definitionSchemaVersion: 1, exposedFields: null, baseFilterLogic: null,
    baseFilters: null, createdAt: new Date(), updatedAt: new Date(),
  } as unknown as JiraAggregateDefinition;

  const plan = buildJiraAggregateImportPlan({
    version: 1, periodDays: 90, assignee: '', widgets: [widget],
  }, [existing]);

  assert.equal(plan.items[0]?.existingId, null);
  assert.equal(plan.items[0]?.definition.name, 'One (2)');
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
      aggregateVersion: null,
      visualization: 'table',
      width: 'full',
      placement: 'active',
    }],
  });
});

test('dashboard conversion pins retro widgets to the aggregate revision', () => {
  const config = {
    version: 1 as const,
    periodDays: 90 as const,
    assignee: '',
    widgets: [{
      id: 'retro', title: 'Retro', source: 'issues' as const, metric: 'count' as const,
      groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
      filters: [], width: 'half' as const, section: 'retro' as const,
    }],
  };
  const plan = buildJiraAggregateImportPlan(config, []);
  const references = new Map(plan.items.map((item) => [item.fingerprint, 'aggregate-1']));
  const converted = convertJiraDashboardToV2(config, references, new Map([['aggregate-1', 3]]));
  assert.equal(converted.widgets[0]?.aggregateVersion, 3);
});

test('stage F switch materializes the default v1 dashboard without changing its raw null hash', () => {
  const first = buildJiraDashboardSwitchPlan('project-1', null, []);
  assert.equal(first.sourceStored, false);
  assert.equal(first.sourceConfigHash, jiraDashboardConfigHash(null));
  assert.equal(first.legacy.version, 1);
  assert.equal(first.managed.version, 2);
  assert.ok(first.legacy.widgets.length > 0);
  assert.ok(first.items.length > 0);

  const persistedDefinitions = first.definitions.map((definition, index) => ({
    ...definition,
    id: `aggregate-${index + 1}`,
  }));
  const second = buildJiraDashboardSwitchPlan('project-1', null, persistedDefinitions);
  assert.equal(second.planHash, first.planHash);
  assert.equal(second.effectiveConfigHash, first.effectiveConfigHash);
  assert.notEqual(jiraDashboardConfigHash(second.managed), jiraDashboardConfigHash(first.managed));
});

test('bounded aggregate CSV escapes spreadsheet formulas and exports typed records', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ scope: 'retro' }),
    [issue({ summary: '=HYPERLINK("https://example.invalid")' })],
    options,
  );
  const csv = jiraAggregateResultCsv(result);
  assert.match(csv, /"Quality status","Quality basis"/u);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/u);
  assert.doesNotMatch(csv, /payload/u);
});

test('v1 and v2 reconciliation resolves existing builders and shares one database pass', async () => {
  const widget = {
    id: 'one', title: 'One', source: 'issues' as const, metric: 'count' as const,
    groupBy: 'none' as const, visualization: 'number' as const, filterLogic: 'and' as const,
    filters: [], width: 'half' as const, section: 'active' as const,
  };
  const legacy = { version: 1 as const, periodDays: 90 as const, assignee: '', widgets: [widget] };
  const draft = definition({ name: 'One', scope: 'active' });
  const storedDefinition = {
    id: 'aggregate-1', projectId: 'project-1', name: 'One', nameKey: 'one', description: '',
    source: draft.source, metric: draft.metric, groupBy: draft.groupBy, scope: draft.scope,
    filterLogic: draft.filterLogic, filters: draft.filters, periodMode: draft.periodMode,
    periodDays: draft.periodDays, timeZone: draft.timeZone,
    fingerprint: jiraAggregateFingerprint(draft), sortOrder: 0, version: 1,
    createdAt: new Date(), updatedAt: new Date(),
  } satisfies JiraAggregateDefinition;
  const configs = jiraDashboardReconciliationConfigs(legacy, null, [storedDefinition]);
  let pageQueries = 0;
  const client = {
    jiraIssueSnapshot: {
      count: async () => 1,
      findMany: async (query: { cursor?: unknown }) => {
        pageQueries += 1;
        return query.cursor ? [] : [storedIssue('CVTE-1')];
      },
    },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as Parameters<typeof reconcileJiraDashboardFromDatabase>[0];
  const result = await reconcileJiraDashboardFromDatabase(
    client,
    'project-1',
    configs.legacy,
    configs.managed,
    [storedDefinition],
    options,
  );
  assert.equal(result.status, 'MATCH');
  assert.equal(result.widgets[0]?.semanticMatch, true);
  assert.equal(result.widgets[0]?.qualityMatch, true);
  assert.equal(pageQueries, 1);
  assert.match(result.caveat, /не является независимой проверкой/u);
});

test('aggregate read path cannot import Jira transport or select raw history payload', () => {
  const serviceSource = fs.readFileSync(new URL('./jira-aggregates.ts', import.meta.url), 'utf8');
  const historySource = fs.readFileSync(new URL('./jira-history-asof.ts', import.meta.url), 'utf8');
  const routeSource = fs.readFileSync(new URL('../routes/jira-aggregates.routes.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(serviceSource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(historySource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(routeSource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(serviceSource, /\bpayload\s*:\s*true\b/u);
  assert.doesNotMatch(historySource, /"payload"|"validationWarnings"/u);
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

test('dashboard writes keep the managed hash synchronized and accept v3 only', () => {
  const routeSource = fs.readFileSync(new URL('../routes/issues.routes.ts', import.meta.url), 'utf8');
  const dashboardRoute = routeSource.slice(routeSource.indexOf("router.patch('/projects/:projectId/jira/analytics-dashboard'"));
  assert.match(routeSource, /config:\s*jiraAnalyticsDashboardV3Schema/u);
  assert.match(routeSource, /expectedConfigHash:\s*z\.string\(\)\.regex/u);
  assert.match(routeSource, /lockJiraAggregateProject\(transaction, project\.id\)/u);
  assert.match(
    routeSource,
    /jiraAnalyticsDashboardConversion\.updateMany\([\s\S]*convertedConfigHash:\s*jiraDashboardConfigHash\(parsed\.data\.config\)/u,
  );
  assert.doesNotMatch(routeSource, /config:\s*jiraAnalyticsDashboardConfigSchema/u);
  assert.match(dashboardRoute, /previousVersion !== 3[\s\S]*jiraAnalyticsDashboardConversion\.create/u);
  assert.match(dashboardRoute, /previousConfigHash !== parsed\.data\.expectedConfigHash/u);
  assert.match(dashboardRoute, /originalConfigStored[\s\S]*originalConfig[\s\S]*rollbackState:\s*'AVAILABLE'/u);
  assert.ok(
    dashboardRoute.indexOf('jiraAnalyticsDashboardConversion.create') <
      dashboardRoute.indexOf('jiraAnalyticsSettings.upsert'),
    'legacy config must be archived before v3 overwrites dashboardConfig',
  );
  assert.doesNotMatch(routeSource, /data:\s*\{\s*rolledBackAt:\s*new Date\(\)\s*\}/u);
});

test('stage F routes bind rollback to the conversion attempt and restore a raw default null', () => {
  const routeSource = fs.readFileSync(new URL('../routes/jira-aggregates.routes.ts', import.meta.url), 'utf8');
  assert.match(routeSource, /conversion\.attempt !== parsed\.data\.attempt/u);
  assert.match(routeSource, /conversion\.originalConfigStored[\s\S]*Prisma\.DbNull/u);
  assert.match(routeSource, /Prisma\.TransactionIsolationLevel\.Serializable/u);
  assert.match(routeSource, /if \(parsed\.data\.dryRun\) \{[\s\S]*res\.json\([\s\S]*return;/u);
  assert.match(routeSource, /rollbackState:\s*'USED'[\s\S]*rolledBackAt:\s*new Date\(\)/u);
});
