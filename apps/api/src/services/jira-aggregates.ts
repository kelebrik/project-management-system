import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  createJiraAnalyticsEvaluationAccumulator,
  isJiraCancelledStatus,
  isJiraUnresolvedResolution,
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsDashboardV2Schema,
  jiraAnalyticsInlineWidgetReadSchema,
  jiraAnalyticsReferencedWidgetSchema,
  jiraAnalyticsSemanticKey,
  jiraAnalyticsSourceUsesPeriod,
  normalizeJiraAnalyticsDashboardV1,
  normalizeJiraAnalyticsInlineWidget,
  normalizeJiraAnalyticsName,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsDashboardV1,
  type JiraAnalyticsDashboardV2,
  type JiraAnalyticsDataQuality,
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsInlineWidget,
  type JiraAnalyticsIssueData,
} from '@pms/shared';
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  prepareJiraAsOfIssueBatches,
  type JiraAsOfReconstruction,
} from './jira-history-asof.js';

export const JIRA_AGGREGATE_MAX_BATCH_WIDGETS = 100;
export const JIRA_AGGREGATE_MAX_ISSUES = 5_000;
export const JIRA_AGGREGATE_MAX_EVENTS = 100_000;
export const JIRA_AGGREGATE_MAX_GROUPS = 5_000;
export const JIRA_AGGREGATE_MAX_PAGE_WINDOW = 10_000;
export const JIRA_AGGREGATE_ISSUE_BATCH_SIZE = 250;
export const JIRA_ANALYTICS_MAX_ASSIGNEES = 500;

export class JiraAggregatePopulationLimitError extends Error {
  constructor(public readonly limit: number) {
    super('JIRA_AGGREGATE_POPULATION_LIMIT');
  }
}

export class JiraAggregateEventLimitError extends Error {
  constructor(public readonly limit: number) {
    super('JIRA_AGGREGATE_EVENT_LIMIT');
  }
}

export class JiraAggregateExportLimitError extends Error {
  constructor(public readonly limit: number) {
    super('JIRA_AGGREGATE_EXPORT_LIMIT');
  }
}

export type JiraAggregatePublicDefinition = JiraAnalyticsAggregateDraft & {
  id: string;
  projectId: string;
  fingerprint: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type JiraAggregateWidgetResult = {
  widgetId: string;
  title: string;
  visualization: 'number' | 'bar' | 'table';
  width: 'half' | 'full';
  placement: 'active' | 'retro';
  aggregateId: string | null;
  aggregateName: string;
  source: JiraAnalyticsAggregateDraft['source'];
  metric: JiraAnalyticsAggregateDraft['metric'];
  groupBy: JiraAnalyticsAggregateDraft['groupBy'];
  status: 'OK' | 'UNAVAILABLE';
  error?: string;
  result?: JiraAnalyticsEvaluationResult;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function jiraDashboardConfigHash(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function jiraAggregateFingerprint(definition: JiraAnalyticsAggregateDraft) {
  return createHash('sha256').update(jiraAnalyticsSemanticKey(definition)).digest('hex');
}

export function jiraAggregateDraftFromRow(row: JiraAggregateDefinition): JiraAnalyticsAggregateDraft {
  return jiraAnalyticsAggregateDraftSchema.parse({
    name: row.name,
    description: row.description,
    source: row.source,
    metric: row.metric,
    groupBy: row.groupBy,
    scope: row.scope,
    filterLogic: row.filterLogic,
    filters: row.filters,
    periodMode: row.periodMode,
    periodDays: row.periodDays,
    timeZone: row.timeZone,
    sortOrder: row.sortOrder,
  });
}

export function jiraAggregatePublicDefinition(row: JiraAggregateDefinition): JiraAggregatePublicDefinition {
  return {
    id: row.id,
    projectId: row.projectId,
    fingerprint: row.fingerprint,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...jiraAggregateDraftFromRow(row),
  };
}

export function jiraAggregateCreateData(
  projectId: string,
  definition: JiraAnalyticsAggregateDraft,
): Prisma.JiraAggregateDefinitionUncheckedCreateInput {
  return {
    projectId,
    name: definition.name.trim(),
    nameKey: normalizeJiraAnalyticsName(definition.name),
    description: definition.description.trim(),
    source: definition.source,
    metric: definition.metric,
    groupBy: definition.groupBy,
    scope: definition.scope,
    filterLogic: definition.filterLogic,
    filters: definition.filters as Prisma.InputJsonValue,
    periodMode: definition.periodMode,
    periodDays: definition.periodDays,
    timeZone: definition.timeZone,
    fingerprint: jiraAggregateFingerprint(definition),
    sortOrder: definition.sortOrder,
  };
}

export function jiraAggregateUpdateData(
  definition: JiraAnalyticsAggregateDraft,
): Prisma.JiraAggregateDefinitionUncheckedUpdateManyInput {
  const create = jiraAggregateCreateData('', definition);
  const { projectId: _projectId, ...data } = create;
  return { ...data, version: { increment: 1 } };
}

export const jiraAggregateIssueSelect = {
  id: true,
  issueKey: true,
  issueUrl: true,
  summary: true,
  status: true,
  priority: true,
  assignee: true,
  reporter: true,
  issueType: true,
  resolution: true,
  sprint: true,
  issueCreatedAt: true,
  criticalPriorityAt: true,
  criticalEndPriority: true,
  resolutionAt: true,
  criticalSlaTracked: true,
  commitCount: true,
  mergeRequestCount: true,
  developmentDataAvailable: true,
  transitionHistoryComplete: true,
  syncedAt: true,
  updatedAt: true,
  statusTransitions: {
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      transitionedAt: true,
    },
    orderBy: [{ transitionedAt: 'asc' as const }, { id: 'asc' as const }],
  },
  developmentActivities: {
    select: {
      id: true,
      activityAt: true,
      commitCount: true,
      mergeRequestCount: true,
      sprintAtObservation: true,
      isBaseline: true,
    },
    orderBy: [{ activityAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.JiraIssueSnapshotSelect;

type SelectedIssue = Prisma.JiraIssueSnapshotGetPayload<{ select: typeof jiraAggregateIssueSelect }>;

function serializeIssue(issue: SelectedIssue): JiraAnalyticsIssueData {
  return {
    ...issue,
    issueCreatedAt: issue.issueCreatedAt?.toISOString() ?? null,
    criticalPriorityAt: issue.criticalPriorityAt?.toISOString() ?? null,
    criticalEndPriority: issue.criticalEndPriority,
    resolutionAt: issue.resolutionAt?.toISOString() ?? null,
    dataObservedAt: issue.syncedAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    statusTransitions: issue.statusTransitions.map((transition) => ({
      ...transition,
      transitionedAt: transition.transitionedAt.toISOString(),
    })),
    developmentActivities: issue.developmentActivities.map((activity) => ({
      ...activity,
      activityAt: activity.activityAt.toISOString(),
    })),
  };
}

type JiraAggregateReadClient = Pick<
  PrismaClient,
  '$queryRaw' | 'jiraIssueSnapshot' | 'jiraIssueStatusTransition' | 'jiraDevelopmentActivity'
>;

async function ensureJiraAggregatePopulationWithinLimits(
  client: JiraAggregateReadClient,
  projectId: string,
) {
  const [issueCount, transitionCount, developmentCount] = await Promise.all([
    client.jiraIssueSnapshot.count({ where: { projectId, retiredAt: null } }),
    client.jiraIssueStatusTransition.count({
      where: { snapshot: { projectId, retiredAt: null } },
    }),
    client.jiraDevelopmentActivity.count({
      where: { snapshot: { projectId, retiredAt: null } },
    }),
  ]);
  if (issueCount > JIRA_AGGREGATE_MAX_ISSUES) {
    throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
  }
  if (transitionCount + developmentCount > JIRA_AGGREGATE_MAX_EVENTS) {
    throw new JiraAggregateEventLimitError(JIRA_AGGREGATE_MAX_EVENTS);
  }
}

export async function* loadJiraAggregateIssueBatches(
  client: JiraAggregateReadClient,
  projectId: string,
): AsyncGenerator<JiraAnalyticsIssueData[]> {
  await ensureJiraAggregatePopulationWithinLimits(client, projectId);
  let cursorIssueKey: string | null = null;
  let loadedIssues = 0;
  let loadedEvents = 0;
  while (true) {
    const issues: SelectedIssue[] = await client.jiraIssueSnapshot.findMany({
      where: { projectId, retiredAt: null },
      select: jiraAggregateIssueSelect,
      orderBy: { issueKey: 'asc' },
      take: JIRA_AGGREGATE_ISSUE_BATCH_SIZE,
      ...(cursorIssueKey
        ? {
            cursor: { projectId_issueKey: { projectId, issueKey: cursorIssueKey } },
            skip: 1,
          }
        : {}),
    });
    if (issues.length === 0) return;
    loadedIssues += issues.length;
    loadedEvents += issues.reduce(
      (total, issue) => total + issue.statusTransitions.length + issue.developmentActivities.length,
      0,
    );
    if (loadedIssues > JIRA_AGGREGATE_MAX_ISSUES) {
      throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
    }
    if (loadedEvents > JIRA_AGGREGATE_MAX_EVENTS) {
      throw new JiraAggregateEventLimitError(JIRA_AGGREGATE_MAX_EVENTS);
    }
    yield issues.map(serializeIssue);
    cursorIssueKey = issues.at(-1)?.issueKey ?? null;
    if (issues.length < JIRA_AGGREGATE_ISSUE_BATCH_SIZE) return;
  }
}

export type JiraAnalyticsFacets = {
  issueCount: number;
  activeIssueCount: number;
  transitionHistoryCompleteCount: number;
  developmentDataAvailableCount: number;
  criticalSlaTrackedCount: number;
  criticalSlaReadyCount: number;
  latestSyncedAt: string | null;
  assignees: string[];
  assigneesTruncated: boolean;
};

export const jiraAnalyticsFacetSelect = {
  status: true,
  resolution: true,
  assignee: true,
  transitionHistoryComplete: true,
  developmentDataAvailable: true,
  criticalSlaTracked: true,
  criticalPriorityAt: true,
  syncedAt: true,
} satisfies Prisma.JiraIssueSnapshotSelect;

export async function loadJiraAnalyticsFacets(
  client: Pick<PrismaClient, 'jiraIssueSnapshot'>,
  projectId: string,
): Promise<JiraAnalyticsFacets> {
  const issues = await client.jiraIssueSnapshot.findMany({
    where: { projectId, retiredAt: null },
    select: jiraAnalyticsFacetSelect,
    orderBy: { issueKey: 'asc' },
    take: JIRA_AGGREGATE_MAX_ISSUES + 1,
  });
  if (issues.length > JIRA_AGGREGATE_MAX_ISSUES) {
    throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
  }
  const assignees = [...new Set(issues.flatMap((issue) => issue.assignee ? [issue.assignee] : []))]
    .sort((left, right) => left.localeCompare(right, 'ru-RU'));
  const latestSyncedAt = issues.reduce<Date | null>(
    (latest, issue) => !latest || issue.syncedAt > latest ? issue.syncedAt : latest,
    null,
  );
  return {
    issueCount: issues.length,
    activeIssueCount: issues.filter(
      (issue) => isJiraUnresolvedResolution(issue.resolution) && !isJiraCancelledStatus(issue.status),
    ).length,
    transitionHistoryCompleteCount: issues.filter((issue) => issue.transitionHistoryComplete).length,
    developmentDataAvailableCount: issues.filter((issue) => issue.developmentDataAvailable).length,
    criticalSlaTrackedCount: issues.filter((issue) => issue.criticalSlaTracked).length,
    criticalSlaReadyCount: issues.filter(
      (issue) => issue.criticalSlaTracked && issue.criticalPriorityAt !== null,
    ).length,
    latestSyncedAt: latestSyncedAt?.toISOString() ?? null,
    assignees: assignees.slice(0, JIRA_ANALYTICS_MAX_ASSIGNEES),
    assigneesTruncated: assignees.length > JIRA_ANALYTICS_MAX_ASSIGNEES,
  };
}

export async function lockJiraAggregateProject(
  transaction: Prisma.TransactionClient,
  projectId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`jira-aggregates:${projectId}`}, 0))::text AS lock`,
  );
}

export function inlineWidgetDefinition(
  widget: JiraAnalyticsInlineWidget,
  sortOrder: number,
): JiraAnalyticsAggregateDraft {
  return jiraAnalyticsAggregateDraftSchema.parse({
    name: widget.title.trim() || 'Агрегат без названия',
    description: '',
    source: widget.source,
    metric: widget.metric,
    groupBy: widget.groupBy,
    scope: widget.section,
    filterLogic: widget.filterLogic,
    filters: widget.filters,
    periodMode: jiraAnalyticsSourceUsesPeriod(widget.source) ? 'DASHBOARD' : 'NONE',
    periodDays: null,
    timeZone: 'Europe/Moscow',
    sortOrder,
  });
}

const jiraAggregateEvaluationLimits = {
  maxGroups: JIRA_AGGREGATE_MAX_GROUPS,
  maxPageWindow: JIRA_AGGREGATE_MAX_PAGE_WINDOW,
} as const;

const jiraAggregateExportEvaluationLimits = {
  ...jiraAggregateEvaluationLimits,
  maxPageSize: JIRA_AGGREGATE_MAX_PAGE_WINDOW,
} as const;

export function mergeJiraAsOfDataQuality(
  quality: JiraAnalyticsDataQuality,
  reconstruction: JiraAsOfReconstruction,
): JiraAnalyticsDataQuality {
  const unknown = reconstruction.ticketsWithoutObservation;
  const warnings = [...quality.warnings];
  if (unknown > 0) {
    warnings.push({
      code: 'MISSING_HISTORICAL_OBSERVATION',
      count: unknown,
    });
  }
  if (reconstruction.beforeHistoryStart) {
    warnings.push({ code: 'BEFORE_HISTORY_START', count: reconstruction.ticketsWithoutObservation });
  }
  if (reconstruction.quality === 'UNAVAILABLE_HISTORY_WRITE_GAP') {
    warnings.push({ code: 'HISTORY_WRITE_GAP', count: reconstruction.historyWriteGap.runs });
  }
  return {
    ...quality,
    basis: 'OBSERVED_VERSIONS',
    status: reconstruction.quality === 'UNAVAILABLE_HISTORY_WRITE_GAP'
      ? 'UNAVAILABLE'
      : reconstruction.beforeHistoryStart
        ? 'NO_DATA'
        : quality.status,
    warnings,
  };
}

export async function evaluateJiraAggregateFromDatabase(
  client: JiraAggregateReadClient,
  projectId: string,
  definition: JiraAnalyticsAggregateDraft,
  options: JiraAnalyticsEvaluationOptions,
  asOf?: Date,
  limits: JiraAnalyticsEvaluationLimits = jiraAggregateEvaluationLimits,
) {
  const accumulator = createJiraAnalyticsEvaluationAccumulator(
    definition,
    options,
    limits,
  );
  if (asOf) {
    if (jiraAnalyticsSourceUsesPeriod(definition.source)) {
      throw new Error('JIRA_ASOF_EVENT_SOURCE_UNSUPPORTED');
    }
    const prepared = await prepareJiraAsOfIssueBatches(client, projectId, asOf);
    if (prepared.reconstruction.tickets > JIRA_AGGREGATE_MAX_ISSUES) {
      throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
    }
    let loadedIssues = 0;
    for await (const issues of prepared.batches) {
      loadedIssues += issues.length;
      if (loadedIssues > JIRA_AGGREGATE_MAX_ISSUES) {
        throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
      }
      accumulator.addIssues(issues);
    }
    const result = accumulator.finish();
    return {
      ...result,
      quality: mergeJiraAsOfDataQuality(result.quality, prepared.reconstruction),
      reconstruction: prepared.reconstruction,
    };
  }
  for await (const issues of loadJiraAggregateIssueBatches(client, projectId)) {
    accumulator.addIssues(issues);
  }
  return accumulator.finish();
}

function unavailableWidget(
  widgetId: string,
  title: string,
  visualization: 'number' | 'bar' | 'table',
  width: 'half' | 'full',
  placement: 'active' | 'retro',
  error: string,
  aggregateId: string | null = null,
): JiraAggregateWidgetResult {
  return {
    widgetId,
    title,
    visualization,
    width,
    placement,
    aggregateId,
    aggregateName: '',
    source: 'issues',
    metric: 'count',
    groupBy: 'none',
    status: 'UNAVAILABLE',
    error,
  };
}

type JiraAggregateWidgetPlan = {
  widget: JiraAggregateWidgetResult;
  definition: JiraAnalyticsAggregateDraft | null;
};

function savedDashboardPlan(
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  selectedWidgetId?: string,
): { configVersion: 1 | 2; configHash: string; widgets: JiraAggregateWidgetPlan[] } {
  const configHash = jiraDashboardConfigHash(rawConfig);
  const config = rawConfig ?? JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1;
  const record = config && typeof config === 'object' ? config as Record<string, unknown> : {};
  const rawWidgets = Array.isArray(record.widgets) ? record.widgets : [];
  const version = record.version === 2 ? 2 : 1;
  if (rawWidgets.length === 0 || rawWidgets.length > JIRA_AGGREGATE_MAX_BATCH_WIDGETS) {
    return {
      configVersion: version,
      configHash,
      widgets: [{
        widget: unavailableWidget(
          '__dashboard__',
          'Конфигурация дашборда недоступна',
          'number',
          'full',
          'active',
          'Конфигурация не содержит допустимого списка виджетов',
        ),
        definition: null,
      }],
    };
  }
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const indexedWidgets = rawWidgets.map((rawWidget, index) => ({ rawWidget, index }));
  const selectedWidgets = selectedWidgetId
    ? indexedWidgets.filter(({ rawWidget }) => rawWidget && typeof rawWidget === 'object' &&
        (rawWidget as Record<string, unknown>).id === selectedWidgetId)
    : indexedWidgets;
  const widgets = selectedWidgets.map(({ rawWidget, index }): JiraAggregateWidgetPlan => {
    if (version === 1) {
      const parsed = jiraAnalyticsInlineWidgetReadSchema.safeParse(rawWidget);
      if (!parsed.success) {
        const fallback = rawWidget && typeof rawWidget === 'object' ? rawWidget as Record<string, unknown> : {};
        return {
          widget: unavailableWidget(
            typeof fallback.id === 'string' ? fallback.id : `invalid-v1-${index}`,
            typeof fallback.title === 'string' ? fallback.title : 'Недоступный виджет',
            'number',
            'half',
            fallback.section === 'retro' ? 'retro' : 'active',
            'Сохранённый виджет v1 не соответствует управляемому контракту',
          ),
          definition: null,
        };
      }
      const widget = normalizeJiraAnalyticsInlineWidget(parsed.data);
      const definition = inlineWidgetDefinition(widget, index);
      return {
        widget: {
          widgetId: widget.id,
          title: widget.title,
          visualization: widget.visualization,
          width: widget.width,
          placement: widget.section,
          aggregateId: null,
          aggregateName: definition.name,
          source: definition.source,
          metric: definition.metric,
          groupBy: definition.groupBy,
          status: 'OK',
        },
        definition,
      };
    }
    const parsed = jiraAnalyticsReferencedWidgetSchema.safeParse(rawWidget);
    if (!parsed.success) {
      const fallback = rawWidget && typeof rawWidget === 'object' ? rawWidget as Record<string, unknown> : {};
      return {
        widget: unavailableWidget(
          typeof fallback.id === 'string' ? fallback.id : `invalid-v2-${index}`,
          typeof fallback.title === 'string' ? fallback.title : 'Недоступный виджет',
          'number',
          'half',
          fallback.placement === 'retro' ? 'retro' : 'active',
          'Сохранённая ссылка v2 имеет некорректный формат',
          typeof fallback.aggregateId === 'string' ? fallback.aggregateId : null,
        ),
        definition: null,
      };
    }
    const row = definitionsById.get(parsed.data.aggregateId);
    if (!row) {
      return {
        widget: unavailableWidget(
          parsed.data.id,
          parsed.data.title,
          parsed.data.visualization,
          parsed.data.width,
          parsed.data.placement,
          'Определение агрегата удалено или недоступно',
          parsed.data.aggregateId,
        ),
        definition: null,
      };
    }
    const definition = jiraAggregateDraftFromRow(row);
    if (definition.scope !== parsed.data.placement) {
      return {
        widget: unavailableWidget(
          parsed.data.id,
          parsed.data.title,
          parsed.data.visualization,
          parsed.data.width,
          parsed.data.placement,
          'Размещение виджета не соответствует области агрегата',
          parsed.data.aggregateId,
        ),
        definition: null,
      };
    }
    return {
      widget: {
        widgetId: parsed.data.id,
        title: parsed.data.title,
        visualization: parsed.data.visualization,
        width: parsed.data.width,
        placement: parsed.data.placement,
        aggregateId: row.id,
        aggregateName: row.name,
        source: definition.source,
        metric: definition.metric,
        groupBy: definition.groupBy,
        status: 'OK',
      },
      definition,
    };
  });
  return { configVersion: version, configHash, widgets };
}

export function createSavedDashboardAccumulator(
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  options: JiraAnalyticsEvaluationOptions,
  selectedWidgetId?: string,
  limits: JiraAnalyticsEvaluationLimits = jiraAggregateEvaluationLimits,
): {
  addIssues: (issues: readonly JiraAnalyticsIssueData[]) => void;
  finish: () => { configVersion: 1 | 2; configHash: string; widgets: JiraAggregateWidgetResult[] };
} {
  const plan = savedDashboardPlan(rawConfig, definitions, selectedWidgetId);
  const accumulators = plan.widgets.map((item) => item.definition
    ? createJiraAnalyticsEvaluationAccumulator(item.definition, options, limits)
    : null);
  return {
    addIssues(issues) {
      accumulators.forEach((accumulator) => accumulator?.addIssues(issues));
    },
    finish() {
      return {
        configVersion: plan.configVersion,
        configHash: plan.configHash,
        widgets: plan.widgets.map((item, index) => {
          const accumulator = accumulators[index];
          return accumulator
            ? { ...item.widget, result: accumulator.finish() }
            : item.widget;
        }),
      };
    },
  };
}

export function resolveSavedDashboard(
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  issues: JiraAnalyticsIssueData[],
  options: JiraAnalyticsEvaluationOptions,
  selectedWidgetId?: string,
): { configVersion: 1 | 2; configHash: string; widgets: JiraAggregateWidgetResult[] } {
  const accumulator = createSavedDashboardAccumulator(
    rawConfig,
    definitions,
    options,
    selectedWidgetId,
    {},
  );
  accumulator.addIssues(issues);
  return accumulator.finish();
}

export async function evaluateSavedDashboardFromDatabase(
  client: JiraAggregateReadClient,
  projectId: string,
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  options: JiraAnalyticsEvaluationOptions,
  selectedWidgetId?: string,
  limits: JiraAnalyticsEvaluationLimits = jiraAggregateEvaluationLimits,
) {
  const accumulator = createSavedDashboardAccumulator(
    rawConfig,
    definitions,
    options,
    selectedWidgetId,
    limits,
  );
  for await (const issues of loadJiraAggregateIssueBatches(client, projectId)) {
    accumulator.addIssues(issues);
  }
  return accumulator.finish();
}

function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function jiraAggregateResultCsv(result: JiraAnalyticsEvaluationResult) {
  if (result.totalRecords > JIRA_AGGREGATE_MAX_PAGE_WINDOW) {
    throw new JiraAggregateExportLimitError(JIRA_AGGREGATE_MAX_PAGE_WINDOW);
  }
  if (result.records.length !== result.totalRecords) {
    throw new Error('JIRA_AGGREGATE_EXPORT_INCOMPLETE');
  }
  const header = [
    'Evaluated at',
    'Quality status',
    'Quality basis',
    'Record ID',
    'Source',
    'Key',
    'Summary',
    'Assignee',
    'Status',
    'Priority',
    'Issue type',
    'Resolution',
    'Sprint',
    'From status',
    'To status',
    'Duration hours',
    'Commits',
    'Merge requests',
    'Event at',
    'Jira URL',
  ];
  const rows = result.records.map((record) => [
    result.evaluatedAt,
    result.quality.status,
    result.quality.basis,
    record.id,
    record.source,
    record.issue.issueKey,
    record.issue.summary,
    record.issue.assignee,
    record.issue.status,
    record.issue.priority,
    record.issue.issueType,
    record.issue.resolution,
    record.sprint,
    record.fromStatus,
    record.toStatus,
    record.durationHours,
    record.commitCount,
    record.mergeRequestCount,
    record.eventAt,
    record.issue.issueUrl,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function jiraAggregateExportOptions(
  options: Omit<JiraAnalyticsEvaluationOptions, 'page' | 'pageSize'>,
): JiraAnalyticsEvaluationOptions {
  return {
    ...options,
    page: 1,
    pageSize: JIRA_AGGREGATE_MAX_PAGE_WINDOW,
  };
}

export function jiraAggregateExportLimits(): JiraAnalyticsEvaluationLimits {
  return jiraAggregateExportEvaluationLimits;
}

export type JiraAggregateImportPlanItem = {
  fingerprint: string;
  definition: JiraAnalyticsAggregateDraft;
  existingId: string | null;
};

function uniqueImportedName(base: string, occupied: Set<string>) {
  const normalizedBase = base.trim() || 'Агрегат без названия';
  let candidate = normalizedBase;
  let suffix = 2;
  while (occupied.has(normalizeJiraAnalyticsName(candidate))) {
    candidate = `${normalizedBase} (${suffix})`;
    suffix += 1;
  }
  occupied.add(normalizeJiraAnalyticsName(candidate));
  return candidate;
}

export function buildJiraAggregateImportPlan(
  rawConfig: unknown,
  existing: JiraAggregateDefinition[],
): { config: JiraAnalyticsDashboardV1 | null; items: JiraAggregateImportPlanItem[] } {
  if (rawConfig === null || rawConfig === undefined) return { config: null, items: [] };
  if (rawConfig && typeof rawConfig === 'object' && (rawConfig as Record<string, unknown>).version === 2) {
    throw new Error('DASHBOARD_NOT_V1');
  }
  const config = normalizeJiraAnalyticsDashboardV1(rawConfig);
  if (!config) throw new Error('DASHBOARD_V1_INVALID');
  const byFingerprint = new Map(existing.map((row) => [row.fingerprint, row]));
  const occupiedNames = new Set(existing.map((row) => row.nameKey));
  const planned = new Map<string, JiraAggregateImportPlanItem>();
  config.widgets.forEach((widget, index) => {
    const draft = inlineWidgetDefinition(widget, index);
    const fingerprint = jiraAggregateFingerprint(draft);
    if (planned.has(fingerprint)) return;
    const current = byFingerprint.get(fingerprint);
    planned.set(fingerprint, {
      fingerprint,
      definition: current
        ? { ...draft, name: current.name, description: current.description, sortOrder: current.sortOrder }
        : { ...draft, name: uniqueImportedName(draft.name, occupiedNames) },
      existingId: current?.id ?? null,
    });
  });
  return { config, items: [...planned.values()] };
}

export function inspectJiraDashboardDefinitionUse(
  rawConfig: unknown,
  aggregateId: string,
): { verifiable: boolean; widgetIds: string[] } {
  if (rawConfig === null || rawConfig === undefined) return { verifiable: true, widgetIds: [] };
  if (normalizeJiraAnalyticsDashboardV1(rawConfig)) return { verifiable: true, widgetIds: [] };
  const parsedV2 = jiraAnalyticsDashboardV2Schema.safeParse(rawConfig);
  if (parsedV2.success) {
    return {
      verifiable: true,
      widgetIds: parsedV2.data.widgets
        .filter((widget) => widget.aggregateId === aggregateId)
        .map((widget) => widget.id),
    };
  }
  const record = rawConfig && typeof rawConfig === 'object'
    ? rawConfig as Record<string, unknown>
    : {};
  const widgets = Array.isArray(record.widgets) ? record.widgets : [];
  const widgetIds = widgets.flatMap((rawWidget, index) => {
    if (!rawWidget || typeof rawWidget !== 'object') return [];
    const widget = rawWidget as Record<string, unknown>;
    if (widget.aggregateId !== aggregateId) return [];
    return [typeof widget.id === 'string' ? widget.id : `invalid-v2-${index}`];
  });
  return { verifiable: false, widgetIds };
}

export function convertJiraDashboardToV2(
  config: JiraAnalyticsDashboardV1,
  definitionIdByFingerprint: ReadonlyMap<string, string>,
): JiraAnalyticsDashboardV2 {
  return jiraAnalyticsDashboardV2Schema.parse({
    version: 2,
    periodDays: config.periodDays,
    assignee: config.assignee,
    widgets: config.widgets.map((widget, index) => {
      const definition = inlineWidgetDefinition(widget, index);
      const aggregateId = definitionIdByFingerprint.get(jiraAggregateFingerprint(definition));
      if (!aggregateId) throw new Error(`AGGREGATE_DEFINITION_MISSING:${widget.id}`);
      return {
        id: widget.id,
        title: widget.title,
        aggregateId,
        visualization: widget.visualization,
        width: widget.width,
        placement: widget.section,
      };
    }),
  });
}

export function jiraDashboardReferencedAggregateIds(config: JiraAnalyticsDashboardConfig) {
  return config.version === 2 ? [...new Set(config.widgets.map((widget) => widget.aggregateId))] : [];
}

export type JiraDashboardReconciliationWidget = {
  widgetId: string;
  title: string;
  status: 'MATCH' | 'MISMATCH';
  semanticMatch: boolean;
  valueMatch: boolean;
  totalRecordsMatch: boolean;
  groupsMatch: boolean;
  qualityMatch: boolean;
  orderedRecordSampleMatch: boolean;
  recordSampleSize: number;
  legacy: {
    status: JiraAggregateWidgetResult['status'] | 'MISSING';
    value: number | null;
    totalRecords: number | null;
    error: string | null;
  };
  managed: {
    status: JiraAggregateWidgetResult['status'] | 'MISSING';
    value: number | null;
    totalRecords: number | null;
    error: string | null;
  };
};

export type JiraDashboardReconciliationResult = {
  status: 'MATCH' | 'MISMATCH';
  evaluatedAt: string;
  legacyEngine: 'V1_INLINE_WIDGETS';
  managedEngine: 'V2_REFERENCED_AGGREGATES';
  legacyConfigHash: string;
  managedConfigHash: string;
  comparedWidgets: number;
  matchedWidgets: number;
  mismatchedWidgets: number;
  caveat: string;
  widgets: JiraDashboardReconciliationWidget[];
};

export function jiraDashboardReconciliationConfigs(
  currentConfig: unknown,
  conversionOriginalConfig: unknown,
  definitions: JiraAggregateDefinition[],
): { legacy: JiraAnalyticsDashboardV1; managed: JiraAnalyticsDashboardV2 } {
  const currentV1 = normalizeJiraAnalyticsDashboardV1(currentConfig);
  if (currentV1) {
    const plan = buildJiraAggregateImportPlan(currentV1, definitions);
    const idsByFingerprint = new Map(
      plan.items.flatMap((item) => item.existingId ? [[item.fingerprint, item.existingId] as const] : []),
    );
    return {
      legacy: currentV1,
      managed: convertJiraDashboardToV2(currentV1, idsByFingerprint),
    };
  }
  const currentV2 = jiraAnalyticsDashboardV2Schema.safeParse(currentConfig);
  const originalV1 = normalizeJiraAnalyticsDashboardV1(conversionOriginalConfig);
  if (!currentV2.success || !originalV1) {
    throw new Error('DASHBOARD_RECONCILIATION_SOURCE_MISSING');
  }
  return { legacy: originalV1, managed: currentV2.data };
}

function reconciliationWidgetSummary(widget: JiraAggregateWidgetResult | undefined) {
  return {
    status: widget?.status ?? 'MISSING' as const,
    value: widget?.result?.value ?? null,
    totalRecords: widget?.result?.totalRecords ?? null,
    error: widget?.error ?? null,
  };
}

function compareReconciliationWidgets(
  legacyConfig: JiraAnalyticsDashboardV1,
  managedConfig: JiraAnalyticsDashboardV2,
  definitions: JiraAggregateDefinition[],
  legacyWidgets: JiraAggregateWidgetResult[],
  managedWidgets: JiraAggregateWidgetResult[],
) {
  const legacyById = new Map(legacyWidgets.map((widget) => [widget.widgetId, widget]));
  const managedById = new Map(managedWidgets.map((widget) => [widget.widgetId, widget]));
  const legacyConfigById = new Map(legacyConfig.widgets.map((widget) => [widget.id, widget]));
  const managedConfigById = new Map(managedConfig.widgets.map((widget) => [widget.id, widget]));
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const ids = [...new Set([
    ...legacyConfig.widgets.map((widget) => widget.id),
    ...managedConfig.widgets.map((widget) => widget.id),
  ])].sort(codePointStringCompare);

  return ids.map((widgetId): JiraDashboardReconciliationWidget => {
    const legacyWidget = legacyById.get(widgetId);
    const managedWidget = managedById.get(widgetId);
    const legacyLayout = legacyConfigById.get(widgetId);
    const managedLayout = managedConfigById.get(widgetId);
    const legacyFingerprint = legacyLayout
      ? jiraAggregateFingerprint(inlineWidgetDefinition(legacyLayout, legacyConfig.widgets.indexOf(legacyLayout)))
      : null;
    const managedFingerprint = managedLayout
      ? definitionsById.get(managedLayout.aggregateId)?.fingerprint ?? null
      : null;
    const legacyResult = legacyWidget?.result;
    const managedResult = managedWidget?.result;
    const semanticMatch = legacyFingerprint !== null && legacyFingerprint === managedFingerprint;
    const valueMatch = legacyResult !== undefined && managedResult !== undefined &&
      Object.is(legacyResult.value, managedResult.value);
    const totalRecordsMatch = legacyResult !== undefined && managedResult !== undefined &&
      legacyResult.totalRecords === managedResult.totalRecords;
    const groupsMatch = legacyResult !== undefined && managedResult !== undefined &&
      stableJson(legacyResult.groups) === stableJson(managedResult.groups);
    const qualityMatch = legacyResult !== undefined && managedResult !== undefined &&
      stableJson(legacyResult.quality) === stableJson(managedResult.quality);
    const legacyRecordIds = legacyResult?.records.map((record) => record.id) ?? [];
    const managedRecordIds = managedResult?.records.map((record) => record.id) ?? [];
    const orderedRecordSampleMatch = stableJson(legacyRecordIds) === stableJson(managedRecordIds);
    const status = legacyWidget?.status === 'OK' && managedWidget?.status === 'OK' &&
      semanticMatch && valueMatch && totalRecordsMatch && groupsMatch && qualityMatch && orderedRecordSampleMatch
      ? 'MATCH'
      : 'MISMATCH';
    return {
      widgetId,
      title: managedLayout?.title ?? legacyLayout?.title ?? widgetId,
      status,
      semanticMatch,
      valueMatch,
      totalRecordsMatch,
      groupsMatch,
      qualityMatch,
      orderedRecordSampleMatch,
      recordSampleSize: Math.max(legacyRecordIds.length, managedRecordIds.length),
      legacy: reconciliationWidgetSummary(legacyWidget),
      managed: reconciliationWidgetSummary(managedWidget),
    };
  });
}

function codePointStringCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export async function reconcileJiraDashboardFromDatabase(
  client: JiraAggregateReadClient,
  projectId: string,
  legacyConfig: JiraAnalyticsDashboardV1,
  managedConfig: JiraAnalyticsDashboardV2,
  definitions: JiraAggregateDefinition[],
  options: JiraAnalyticsEvaluationOptions,
): Promise<JiraDashboardReconciliationResult> {
  const legacyAccumulator = createSavedDashboardAccumulator(legacyConfig, [], options);
  const managedAccumulator = createSavedDashboardAccumulator(managedConfig, definitions, options);
  for await (const issues of loadJiraAggregateIssueBatches(client, projectId)) {
    legacyAccumulator.addIssues(issues);
    managedAccumulator.addIssues(issues);
  }
  const legacy = legacyAccumulator.finish();
  const managed = managedAccumulator.finish();
  const widgets = compareReconciliationWidgets(
    legacyConfig,
    managedConfig,
    definitions,
    legacy.widgets,
    managed.widgets,
  );
  const matchedWidgets = widgets.filter((widget) => widget.status === 'MATCH').length;
  return {
    status: matchedWidgets === widgets.length && widgets.length > 0 ? 'MATCH' : 'MISMATCH',
    evaluatedAt: options.now,
    legacyEngine: 'V1_INLINE_WIDGETS',
    managedEngine: 'V2_REFERENCED_AGGREGATES',
    legacyConfigHash: legacy.configHash,
    managedConfigHash: managed.configHash,
    comparedWidgets: widgets.length,
    matchedWidgets,
    mismatchedWidgets: widgets.length - matchedWidgets,
    caveat: 'Сверка подтверждает совпадение конфигураций v1/v2 на одном наборе данных. Формулы используют общее арифметическое ядро, поэтому MATCH не является независимой проверкой корректности формул.',
    widgets,
  };
}
