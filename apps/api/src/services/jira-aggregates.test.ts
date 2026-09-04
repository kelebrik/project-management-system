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

test('aggregate schema rejects source/metric/group/filter drift and empty numeric values', () => {
  assert.equal(jiraAnalyticsAggregateDraftSchema.safeParse(definition({
    metric: 'p95Duration',
    groupBy: 'week',
    filters: [{ id: 'f', field: 'durationHours', operator: 'greaterThan', value: '' }],
  })).success, false);
});

test('aggregate builds rows while widget owns fields, filters, metric, grouping and presentation', () => {
  const dataset = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Critical SLA rows',
    description: '',
    source: 'criticalBugs',
    timeZone: 'Europe/Moscow',
    sortOrder: 0,
  });
  const widget = {
    id: 'sla-by-project', title: 'SLA по проектам', aggregateId: 'aggregate', aggregateVersion: 1,
    selectedFields: ['issueKey', 'project', 'durationHours'],
    baseFilterLogic: 'and',
    baseFilters: [{ id: 'base', field: 'durationHours', operator: 'greaterThan', value: '720' }],
    placement: 'retro', metric: 'count', groupBy: 'project', filterLogic: 'and', filters: [],
    periodMode: 'NONE', periodDays: null, sortBy: 'durationHours', sortDirection: 'desc',
    visualization: 'bar', width: 'full',
  } as const;
  assert.equal(jiraAnalyticsWidgetDatasetError(widget, dataset), null);
  assert.equal(jiraAnalyticsWidgetDatasetError({ ...widget, groupBy: 'assignee' }, dataset), 'Поле группировки не выбрано в виджете');
});

test('legacy aggregate filters migrate to the widget contract, not the v4 aggregate', () => {
  const legacy = definition({
    filterLogic: 'or',
    filters: [
      { id: 'critical', field: 'priority', operator: 'equals', value: 'Critical' },
      { id: 'blocker', field: 'priority', operator: 'equals', value: 'Blocker' },
    ],
  });
  const dataset = jiraAnalyticsDatasetFromLegacy(legacy);
  assert.equal('baseFilterLogic' in dataset, false);
  assert.equal('baseFilters' in dataset, false);
  const normalized = normalizeJiraAnalyticsDatasetRevision(legacy);
  assert.equal(normalized?.legacyContract?.baseFilterLogic, 'or');
  assert.deepEqual(normalized?.legacyContract?.baseFilters, legacy.filters);
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
    timeZone: 'Europe/Moscow', sortOrder: 1,
  });
  const second = jiraAnalyticsDatasetDraftSchema.parse({
    ...first,
    name: 'Другое имя',
    description: 'Two',
    sortOrder: 99,
  });

  assert.equal(jiraAggregateDatasetFingerprint(first), jiraAggregateDatasetFingerprint(second));
});

test('status interval fingerprint normalizes status lists while v4 revisions keep row config explicit', () => {
  const base = jiraAnalyticsDatasetDraftSchema.parse({
    name: 'Creation to work', description: '', source: 'statusIntervals',
    rowConfig: {
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
    name: 'Issues', description: '', source: 'issues', timeZone: 'Europe/Moscow', sortOrder: 0,
  });

  assert.equal(jiraAggregateDatasetFingerprint(base), jiraAggregateDatasetFingerprint(reordered));
  assert.equal(
    jiraAggregateDatasetFingerprint(base),
    '8c18d0e3051918c859d4ac1a2e59a27eb1fdef091092cf03a7c18ef8044f81b2',
  );
  assert.equal('rowConfig' in jiraAnalyticsDatasetSemanticDocument(ordinary), false);

  const intervalRevision = jiraAggregateDatasetRevisionCreateData('project', 'aggregate', 1, base);
  const ordinaryRevision = jiraAggregateDatasetRevisionCreateData('project', 'aggregate-2', 1, ordinary);
  assert.equal((intervalRevision.definition as { schemaVersion: number }).schemaVersion, 4);
  assert.equal((ordinaryRevision.definition as { schemaVersion: number }).schemaVersion, 4);
  assert.equal('rowConfig' in (ordinaryRevision.definition as object), true);
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

test('status interval measures between two exact status transitions', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'statusTransition', fromStatuses: ['Open'], toStatuses: ['In Progress'] },
      end: { anchor: 'statusTransition', fromStatuses: ['In Progress'], toStatuses: ['Resolved'] },
      openIntervals: 'exclude',
      periodAnchor: 'start',
    },
  }), [issue({
    issueCreatedAt: null,
    statusTransitions: [
      { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-05T00:00:00.000Z' },
      { id: 't2', fromStatus: 'In Progress', toStatus: 'Resolved', transitionedAt: '2026-01-20T00:00:00.000Z' },
    ],
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.durationHours, 360);
  assert.equal(result.records[0]?.intervalStartFromStatus, 'Open');
  assert.equal(result.records[0]?.intervalStartToStatus, 'In Progress');
  assert.equal(result.records[0]?.intervalEndFromStatus, 'In Progress');
  assert.equal(result.records[0]?.intervalEndToStatus, 'Resolved');
  assert.equal(result.quality.status, 'COMPLETE');
  assert.deepEqual(result.quality.warnings, []);
});

test('status transition endpoints support a wildcard on either side', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'statusTransition', fromStatuses: [], toStatuses: ['In Progress'] },
      end: { anchor: 'statusTransition', fromStatuses: ['In Progress'], toStatuses: [] },
      openIntervals: 'exclude',
      periodAnchor: 'end',
    },
  }), [issue({
    statusTransitions: [
      { id: 't1', fromStatus: 'Analysis', toStatus: 'In Progress', transitionedAt: '2026-01-05T00:00:00.000Z' },
      { id: 't2', fromStatus: 'In Progress', toStatus: 'QA', transitionedAt: '2026-01-06T12:00:00.000Z' },
    ],
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.durationHours, 36);
  assert.equal(result.records[0]?.intervalEndToStatus, 'QA');
});

test('status transition endpoint never matches the synthetic creation event', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'statusTransition', fromStatuses: [], toStatuses: ['In Progress'] },
      end: { anchor: 'firstStatusEntry', statuses: ['Resolved'] },
      openIntervals: 'include',
      periodAnchor: 'start',
    },
  }), [issue({ status: 'In Progress', statusTransitions: [] })], options);

  assert.equal(result.totalRecords, 0);
});

test('a transition start and first-entry end cannot use the same event', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'statusTransition', fromStatuses: ['Open'], toStatuses: ['In Progress'] },
      end: { anchor: 'firstStatusEntry', statuses: ['In Progress'] },
      openIntervals: 'exclude',
      periodAnchor: 'start',
    },
  }), [issue({
    statusTransitions: [
      { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-05T00:00:00.000Z' },
      { id: 't2', fromStatus: 'In Progress', toStatus: 'QA', transitionedAt: '2026-01-06T00:00:00.000Z' },
      { id: 't3', fromStatus: 'QA', toStatus: 'In Progress', transitionedAt: '2026-01-10T00:00:00.000Z' },
    ],
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.durationHours, 120);
  assert.equal(result.records[0]?.intervalEndFromStatus, 'QA');
});

test('status transition interval uses the first matching pair across repeated cycles', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'statusTransition', fromStatuses: ['Open'], toStatuses: ['In Progress'] },
      end: { anchor: 'statusTransition', fromStatuses: ['In Progress'], toStatuses: ['Resolved'] },
      openIntervals: 'exclude',
      periodAnchor: 'start',
    },
  }), [issue({
    statusTransitions: [
      { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-02T00:00:00.000Z' },
      { id: 't2', fromStatus: 'In Progress', toStatus: 'Resolved', transitionedAt: '2026-01-03T00:00:00.000Z' },
      { id: 't3', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-10T00:00:00.000Z' },
      { id: 't4', fromStatus: 'In Progress', toStatus: 'Resolved', transitionedAt: '2026-01-20T00:00:00.000Z' },
    ],
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.durationHours, 24);
  assert.equal(result.records[0]?.id, 'status-interval:snapshot-1:t1:t2');
});

test('status interval emits one stable row for every repeated start cycle', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'firstStatusEntry', statuses: ['In Progress'], occurrence: 'all' },
      end: { anchor: 'firstStatusEntry', statuses: ['Resolved'], occurrence: 'first' },
      openIntervals: 'exclude',
      periodAnchor: 'start',
    },
  }), [issue({
    statusTransitions: [
      { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-02T00:00:00.000Z' },
      { id: 't2', fromStatus: 'In Progress', toStatus: 'Resolved', transitionedAt: '2026-01-03T00:00:00.000Z' },
      { id: 't3', fromStatus: 'Resolved', toStatus: 'In Progress', transitionedAt: '2026-01-10T00:00:00.000Z' },
      { id: 't4', fromStatus: 'In Progress', toStatus: 'Resolved', transitionedAt: '2026-01-20T00:00:00.000Z' },
    ],
  })], options);

  assert.equal(result.totalRecords, 2);
  assert.deepEqual([...result.records].sort((left, right) => (left.occurrenceIndex ?? 0) - (right.occurrenceIndex ?? 0)).map((record) => ({
    id: record.id,
    durationHours: record.durationHours,
    occurrenceIndex: record.occurrenceIndex,
    occurrenceCount: record.occurrenceCount,
  })), [
    { id: 'status-interval:snapshot-1:t1:t2', durationHours: 24, occurrenceIndex: 1, occurrenceCount: 2 },
    { id: 'status-interval:snapshot-1:t3:t4', durationHours: 240, occurrenceIndex: 2, occurrenceCount: 2 },
  ]);
});

test('repeated interval starts cannot reuse one end event', () => {
  const result = evaluateJiraAnalyticsAggregate(statusIntervalDefinition({
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'firstStatusEntry', statuses: ['In Progress'], occurrence: 'all' },
      end: { anchor: 'firstStatusEntry', statuses: ['Resolved'], occurrence: 'first' },
      openIntervals: 'exclude',
      periodAnchor: 'start',
    },
  }), [issue({
    statusTransitions: [
      { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-02T00:00:00.000Z' },
      { id: 't2', fromStatus: 'QA', toStatus: 'In Progress', transitionedAt: '2026-01-03T00:00:00.000Z' },
      { id: 't3', fromStatus: 'In Progress', toStatus: 'Resolved', transitionedAt: '2026-01-04T00:00:00.000Z' },
    ],
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.id, 'status-interval:snapshot-1:t1:t3');
});

test('status transition endpoints require at least one constrained side', () => {
  const parsed = jiraAnalyticsDatasetDraftSchema.safeParse({
    name: 'Invalid transition', description: '', source: 'statusIntervals',
    exposedFields: ['issueKey', 'durationHours'], baseFilterLogic: 'and', baseFilters: [],
    rowConfig: {
      kind: 'statusInterval',
      start: { anchor: 'statusTransition', fromStatuses: [], toStatuses: [] },
      end: { anchor: 'firstStatusEntry', statuses: ['Resolved'] },
      openIntervals: 'exclude', periodAnchor: 'start',
    },
    timeZone: 'Europe/Moscow', sortOrder: 0,
  });

  assert.equal(parsed.success, false);
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

test('configured SLA issue type matching is identical for rows and quality', () => {
  const executable: JiraAnalyticsExecutableDefinition = {
    ...definition({ source: 'criticalBugs', scope: 'retro' }),
    criticalSlaConfig: {
      issueTypes: ['Bug', 'Defect'],
      priorities: ['Critical', 'Blocker'],
      requirePriorityAtResolution: true,
      openIntervals: 'include',
    },
  };
  const result = evaluateJiraAnalyticsAggregate(executable, [issue({
    issueType: 'Bug: Production',
    priority: 'Critical',
    criticalEndPriority: 'Critical',
    criticalPriorityAt: '2026-02-01T00:00:00.000Z',
    criticalSlaTracked: true,
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.quality.population, 1);
  assert.equal(result.quality.complete, 1);
});

test('configured task SLA uses the typed Critical/Blocker start without the bug-only projection flag', () => {
  const executable: JiraAnalyticsExecutableDefinition = {
    ...definition({ source: 'criticalBugs', scope: 'retro' }),
    criticalSlaConfig: {
      issueTypes: ['Task', 'Задача'],
      priorities: ['Critical', 'Blocker'],
      requirePriorityAtResolution: true,
      openIntervals: 'include',
    },
  };
  const result = evaluateJiraAnalyticsAggregate(executable, [issue({
    issueType: 'Task',
    priority: 'Blocker',
    criticalEndPriority: 'Blocker',
    criticalPriorityAt: '2026-01-01T00:00:00.000Z',
    resolutionAt: '2026-02-20T00:00:00.000Z',
    resolution: 'Resolved',
    criticalSlaTracked: false,
  })], options);

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.durationHours, 1_200);
  assert.equal(result.quality.complete, 1);
});

test('Critical/Blocker risk applies the bug warning window and the task age independently', () => {
  const executable: JiraAnalyticsExecutableDefinition = {
    ...definition({ source: 'criticalBugs', scope: 'retro' }),
    criticalRiskConfig: {
      priorities: ['Critical', 'Blocker'],
      bugIssueTypes: ['Bug'],
      bugSlaHours: 720,
      bugWarningHours: 168,
      taskIssueTypes: ['Task'],
      taskRiskHours: 672,
    },
  };
  const result = evaluateJiraAnalyticsAggregate(executable, [
    issue({ id: 'bug-risk', issueKey: 'BUG-1', priority: 'Critical', criticalPriorityAt: '2026-02-05T00:00:00.000Z' }),
    issue({ id: 'bug-too-early', issueKey: 'BUG-2', priority: 'Critical', criticalPriorityAt: '2026-02-07T00:00:00.000Z' }),
    issue({ id: 'bug-breached', issueKey: 'BUG-3', priority: 'Critical', criticalPriorityAt: '2026-01-29T00:00:00.000Z' }),
    issue({ id: 'task-risk', issueKey: 'TASK-1', issueType: 'Task', priority: 'Blocker', criticalPriorityAt: '2026-02-01T00:00:00.000Z' }),
    issue({ id: 'task-too-early', issueKey: 'TASK-2', issueType: 'Task', priority: 'Blocker', criticalPriorityAt: '2026-02-02T00:00:00.000Z' }),
    issue({ id: 'task-resolved', issueKey: 'TASK-3', issueType: 'Task', priority: 'Blocker', criticalPriorityAt: '2026-01-01T00:00:00.000Z', resolution: 'Resolved', resolutionAt: '2026-02-01T00:00:00.000Z' }),
    issue({ id: 'task-cancelled', issueKey: 'TASK-4', issueType: 'Task', priority: 'Blocker', status: 'Cancelled', criticalPriorityAt: '2026-01-01T00:00:00.000Z' }),
  ], options);

  assert.deepEqual(result.records.map((record) => record.issue.issueKey).sort(), ['BUG-1', 'TASK-1']);
  assert.equal(result.quality.population, 5);
  assert.equal(result.quality.complete, 5);
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
  const rowLimited = createJiraAnalyticsEvaluationAccumulator({
    ...definition({ source: 'transitions' }),
    maximumRowsPerIssue: 1,
  }, options);
  assert.throws(() => rowLimited.addIssues([issue({ statusTransitions: [
    { id: 't1', fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: '2026-01-02T00:00:00.000Z' },
    { id: 't2', fromStatus: 'In Progress', toStatus: 'QA', transitionedAt: '2026-01-03T00:00:00.000Z' },
  ] })]), JiraAnalyticsEvaluationLimitError);
});
