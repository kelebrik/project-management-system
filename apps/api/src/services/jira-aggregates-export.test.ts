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

  const validV4 = inspectJiraDashboardDefinitionUse({
    version: 4,
    periodDays: 90,
    assignee: '',
    widgets: [{
      id: 'used-v4', title: 'Used v4', aggregateId: 'aggregate-1', aggregateVersion: null,
      placement: 'active', selectedFields: ['issueKey'], baseFilterLogic: 'and', baseFilters: [],
      metric: 'count', groupBy: 'none', filterLogic: 'and', filters: [],
      periodMode: 'NONE', periodDays: null, sortBy: 'default', sortDirection: 'desc',
      visualization: 'number', width: 'half',
    }],
  }, 'aggregate-1');
  assert.deepEqual(validV4, { verifiable: true, widgetIds: ['used-v4'] });

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
  const csv = jiraAggregateResultCsv(result, ['issueKey', 'summary']);
  assert.match(csv, /^"Ключ тикета","Название"/u);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/u);
  assert.doesNotMatch(csv, /Текущий статус/u);
  assert.doesNotMatch(csv, /payload/u);
});

test('semantic JSON projection returns only selected aggregate fields', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ scope: 'retro' }),
    [issue({ summary: 'Selected', priority: 'Secret priority' })],
    options,
  );
  const projected = jiraAggregateResultProjection(result, ['issueKey', 'summary']);
  assert.deepEqual(Object.keys(projected.records[0]?.values ?? {}), ['issueKey', 'summary']);
  assert.equal(projected.records[0]?.values.summary, 'Selected');
  assert.equal('issue' in (projected.records[0] ?? {}), false);
});

test('semantic JSON projection normalizes Jira unresolved resolution to empty', () => {
  const result = evaluateJiraAnalyticsAggregate(
    definition({ scope: 'retro' }),
    [issue({ resolution: 'Unresolved' })],
    options,
  );
  const projected = jiraAggregateResultProjection(result, ['issueKey', 'resolution']);
  assert.equal(projected.records[0]?.values.resolution, null);
});

test('dashboard configuration hash is stable across JSONB key reordering', () => {
  const clientOrder = { version: 5, periodDays: 180, assignee: '', widgets: [] };
  const databaseOrder = { version: 5, widgets: [], assignee: '', periodDays: 180 };
  assert.equal(jiraDashboardConfigHash(clientOrder), jiraDashboardConfigHash(databaseOrder));
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
  const serviceSource = [
    './jira-aggregates-core.ts',
    './jira-aggregates-dashboard.ts',
    './jira-aggregates-export.ts',
  ]
    .map((fileName) => fs.readFileSync(new URL(fileName, import.meta.url), 'utf8'))
    .join('\n');
  const historySource = fs.readFileSync(new URL('./jira-history-asof.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(serviceSource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(historySource, /from\s+['"][^'"]*jira(?:\.js)?['"]/u);
  assert.doesNotMatch(serviceSource, /\bpayload\s*:\s*true\b/u);
  assert.doesNotMatch(historySource, /"payload"|"validationWarnings"/u);
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
