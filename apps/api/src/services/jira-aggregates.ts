import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  JIRA_SEMANTIC_MAX_AS_OF_SLICES,
  JIRA_SEMANTIC_FIELD_LABELS,
  createJiraAnalyticsEvaluationAccumulator,
  isJiraCancelledStatus,
  isJiraUnresolvedResolution,
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsDatasetDraftSchema,
  jiraAnalyticsLegacyDatasetDraftSchema,
  jiraAnalyticsDatasetFromLegacy,
  jiraAnalyticsDatasetSemanticKey,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsDashboardV4Schema,
  jiraAnalyticsDashboardV2Schema,
  jiraAnalyticsInlineWidgetReadSchema,
  jiraAnalyticsManagedWidgetSchema,
  jiraAnalyticsManagedWidgetV4Schema,
  jiraAnalyticsReferencedWidgetSchema,
  jiraAnalyticsSemanticKey,
  jiraAnalyticsSourcePeriodSupport,
  jiraAnalyticsSourceSupportsAsOf,
  jiraAnalyticsSourceUsesPeriod,
  jiraAnalyticsWidgetDatasetError,
  normalizeJiraAnalyticsDashboardV1,
  normalizeJiraAnalyticsDatasetRevision,
  normalizeJiraAnalyticsInlineWidget,
  normalizeJiraAnalyticsName,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsDashboardV1,
  type JiraAnalyticsDashboardV2,
  type JiraAnalyticsDashboardV3,
  type JiraAnalyticsDashboardV4,
  type JiraAnalyticsExecutableDefinition,
  type JiraAnalyticsManagedWidget,
  type JiraAnalyticsManagedWidgetV3,
  type JiraAnalyticsLegacyDatasetContract,
  type JiraAnalyticsDataQuality,
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsInlineWidget,
  type JiraAnalyticsIssueData,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsResultRecord,
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

export class JiraAggregateAsOfSliceLimitError extends Error {
  constructor(public readonly limit: number) {
    super('JIRA_AGGREGATE_ASOF_SLICE_LIMIT');
  }
}

export type JiraAggregatePublicDefinition = JiraAnalyticsDatasetDraft & {
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

export function jiraAggregateDatasetFingerprint(definition: JiraAnalyticsDatasetDraft) {
  return createHash('sha256').update(jiraAnalyticsDatasetSemanticKey(definition)).digest('hex');
}

export function jiraAggregateDraftFromRow(row: JiraAggregateDefinition): JiraAnalyticsAggregateDraft {
  const definition = safeJiraAggregateDraftFromRow(row);
  if (!definition) throw new Error(`AGGREGATE_LEGACY_QUERY_INVALID:${row.id}`);
  return definition;
}

export function safeJiraAggregateDraftFromRow(row: JiraAggregateDefinition): JiraAnalyticsAggregateDraft | null {
  const parsed = jiraAnalyticsAggregateDraftSchema.safeParse({
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
  return parsed.success ? parsed.data : null;
}

export function jiraAggregatePublicDefinition(row: JiraAggregateDefinition): JiraAggregatePublicDefinition {
  const dataset = jiraAggregateDatasetFromRow(row);
  return jiraAggregatePublicDefinitionFromDataset(row, dataset);
}

export function jiraAggregatePublicDefinitionFromDataset(
  row: JiraAggregateDefinition,
  dataset: JiraAnalyticsDatasetDraft,
): JiraAggregatePublicDefinition {
  return {
    id: row.id,
    projectId: row.projectId,
    fingerprint: row.fingerprint,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...dataset,
  };
}

export function jiraAggregateDatasetFromRow(row: JiraAggregateDefinition): JiraAnalyticsDatasetDraft {
  const dataset = safeJiraAggregateDatasetFromRow(row);
  if (!dataset) throw new Error(`AGGREGATE_DATASET_INVALID:${row.id}`);
  return dataset;
}

export function safeJiraAggregateDatasetFromRow(row: JiraAggregateDefinition): JiraAnalyticsDatasetDraft | null {
  return safeJiraAggregateDatasetContractFromRow(row)?.dataset ?? null;
}

export function safeJiraAggregateDatasetContractFromRow(row: JiraAggregateDefinition): {
  dataset: JiraAnalyticsDatasetDraft;
  legacyContract: JiraAnalyticsLegacyDatasetContract | null;
} | null {
  if (row.definitionSchemaVersion >= 4) {
    const parsed = jiraAnalyticsDatasetDraftSchema.safeParse({
      name: row.name,
      description: row.description,
      source: row.source,
      rowConfig: row.rowConfig ?? null,
      timeZone: row.timeZone,
      sortOrder: row.sortOrder,
    });
    return parsed.success ? { dataset: parsed.data, legacyContract: null } : null;
  }
  if (row.definitionSchemaVersion >= 2) {
    const parsed = jiraAnalyticsLegacyDatasetDraftSchema.safeParse({
      name: row.name,
      description: row.description,
      source: row.source,
      exposedFields: row.exposedFields,
      baseFilterLogic: row.baseFilterLogic,
      baseFilters: row.baseFilters,
      rowConfig: row.rowConfig ?? null,
      timeZone: row.timeZone,
      sortOrder: row.sortOrder,
    });
    if (!parsed.success) return null;
    const {
      exposedFields,
      baseFilterLogic,
      baseFilters,
      ...dataset
    } = parsed.data;
    const parsedDataset = jiraAnalyticsDatasetDraftSchema.safeParse(dataset);
    if (!parsedDataset.success) return null;
    return {
      dataset: parsedDataset.data,
      legacyContract: { exposedFields, baseFilterLogic, baseFilters },
    };
  }
  const legacy = safeJiraAggregateDraftFromRow(row);
  return legacy ? {
    dataset: jiraAnalyticsDatasetFromLegacy(legacy),
    legacyContract: {
      exposedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[legacy.source]],
      baseFilterLogic: legacy.filterLogic,
      baseFilters: legacy.filters,
    },
  } : null;
}

export function jiraAggregateDatasetCreateData(
  projectId: string,
  definition: JiraAnalyticsDatasetDraft,
): Prisma.JiraAggregateDefinitionUncheckedCreateInput {
  return {
    projectId,
    name: definition.name.trim(),
    nameKey: normalizeJiraAnalyticsName(definition.name),
    description: definition.description.trim(),
    source: definition.source,
    definitionSchemaVersion: 4,
    exposedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[definition.source]],
    baseFilterLogic: 'and',
    baseFilters: [],
    rowConfig: definition.rowConfig
      ? definition.rowConfig as Prisma.InputJsonValue
      : undefined,
    // Legacy columns remain populated for one release so v1/v2 stays readable.
    metric: 'count',
    groupBy: 'none',
    scope: 'active',
    filterLogic: 'and',
    filters: [],
    periodMode: jiraAnalyticsSourcePeriodSupport(definition.source) === 'required' ? 'DASHBOARD' : 'NONE',
    periodDays: null,
    timeZone: definition.timeZone,
    fingerprint: jiraAggregateDatasetFingerprint(definition),
    sortOrder: definition.sortOrder,
  };
}

export function jiraAggregateDatasetUpdateData(
  definition: JiraAnalyticsDatasetDraft,
): Prisma.JiraAggregateDefinitionUncheckedUpdateManyInput {
  return {
    name: definition.name.trim(),
    nameKey: normalizeJiraAnalyticsName(definition.name),
    description: definition.description.trim(),
    source: definition.source,
    definitionSchemaVersion: 4,
    exposedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[definition.source]],
    baseFilterLogic: 'and',
    baseFilters: [],
    rowConfig: definition.rowConfig
      ? definition.rowConfig as Prisma.InputJsonValue
      : Prisma.DbNull,
    timeZone: definition.timeZone,
    fingerprint: jiraAggregateDatasetFingerprint(definition),
    sortOrder: definition.sortOrder,
    version: { increment: 1 },
  };
}

export function jiraAggregateDatasetRevisionCreateData(
  projectId: string,
  aggregateId: string,
  version: number,
  definition: JiraAnalyticsDatasetDraft,
): Prisma.JiraAggregateDefinitionRevisionUncheckedCreateInput {
  const revision = { schemaVersion: 4 as const, ...definition };
  return {
    projectId,
    aggregateId,
    version,
    definition: revision as Prisma.InputJsonValue,
    fingerprint: jiraAggregateDatasetFingerprint(definition),
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

export function jiraAggregateRevisionCreateData(
  projectId: string,
  aggregateId: string,
  version: number,
  definition: JiraAnalyticsAggregateDraft,
): Prisma.JiraAggregateDefinitionRevisionUncheckedCreateInput {
  return {
    projectId,
    aggregateId,
    version,
    definition: definition as Prisma.InputJsonValue,
    fingerprint: jiraAggregateFingerprint(definition),
  };
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
  labels: true,
  resolution: true,
  sprint: true,
  currentVersion: {
    select: {
      sprintIds: true,
    },
  },
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
  const { currentVersion, ...snapshot } = issue;
  return {
    ...snapshot,
    sprintCount: currentVersion?.sprintIds.length ?? (issue.sprint ? 1 : 0),
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
  '$queryRaw' | 'jiraIssueSnapshot' | 'jiraIssueStatusTransition' | 'jiraDevelopmentActivity' |
  'jiraAggregateDefinitionRevision'
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
  definition: JiraAnalyticsExecutableDefinition,
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
    if (!jiraAnalyticsSourceSupportsAsOf(definition.source)) {
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

export type JiraAggregateBatchEvaluationRequest = {
  key: string;
  definition: JiraAnalyticsExecutableDefinition;
  options: JiraAnalyticsEvaluationOptions;
  asOf?: Date;
};

export type JiraAggregateBatchEvaluationResult = {
  key: string;
  result: (JiraAnalyticsEvaluationResult & { reconstruction?: JiraAsOfReconstruction }) | null;
  error: Error | null;
};

type JiraAggregateBatchAccumulator = {
  request: JiraAggregateBatchEvaluationRequest;
  accumulator: ReturnType<typeof createJiraAnalyticsEvaluationAccumulator> | null;
  error: Error | null;
};

function evaluationError(error: unknown) {
  return error instanceof Error ? error : new Error('JIRA_AGGREGATE_EVALUATION_FAILED');
}

function createBatchAccumulator(
  request: JiraAggregateBatchEvaluationRequest,
  limits: JiraAnalyticsEvaluationLimits,
): JiraAggregateBatchAccumulator {
  try {
    return {
      request,
      accumulator: createJiraAnalyticsEvaluationAccumulator(request.definition, request.options, limits),
      error: null,
    };
  } catch (error) {
    return { request, accumulator: null, error: evaluationError(error) };
  }
}

export async function evaluateJiraAggregatesFromDatabase(
  client: JiraAggregateReadClient,
  projectId: string,
  requests: readonly JiraAggregateBatchEvaluationRequest[],
  limits: JiraAnalyticsEvaluationLimits = jiraAggregateEvaluationLimits,
) {
  if (requests.length > JIRA_AGGREGATE_MAX_BATCH_WIDGETS) {
    throw new JiraAggregateExportLimitError(JIRA_AGGREGATE_MAX_BATCH_WIDGETS);
  }
  const results = new Map<string, JiraAggregateBatchEvaluationResult>();
  const current = requests.filter((request) => request.asOf === undefined);
  if (current.length > 0) {
    const accumulators = current.map((request) => createBatchAccumulator(request, limits));
    for await (const issues of loadJiraAggregateIssueBatches(client, projectId)) {
      accumulators.forEach((item) => {
        if (item.error || !item.accumulator) return;
        try {
          item.accumulator.addIssues(issues);
        } catch (error) {
          item.error = evaluationError(error);
        }
      });
    }
    accumulators.forEach(({ request, accumulator, error }) => {
      if (error || !accumulator) {
        results.set(request.key, { key: request.key, result: null, error: error ?? new Error('MISSING_ACCUMULATOR') });
        return;
      }
      try {
        results.set(request.key, { key: request.key, result: accumulator.finish(), error: null });
      } catch (finishError) {
        results.set(request.key, { key: request.key, result: null, error: evaluationError(finishError) });
      }
    });
  }

  const historicalGroups = new Map<string, JiraAggregateBatchEvaluationRequest[]>();
  requests.filter((request) => request.asOf !== undefined).forEach((request) => {
    const key = request.asOf!.toISOString();
    historicalGroups.set(key, [...(historicalGroups.get(key) ?? []), request]);
  });
  if (historicalGroups.size > JIRA_SEMANTIC_MAX_AS_OF_SLICES) {
    throw new JiraAggregateAsOfSliceLimitError(JIRA_SEMANTIC_MAX_AS_OF_SLICES);
  }
  for (const [asOf, group] of historicalGroups) {
    if (group.some((request) => !jiraAnalyticsSourceSupportsAsOf(request.definition.source))) {
      throw new Error('JIRA_ASOF_EVENT_SOURCE_UNSUPPORTED');
    }
    const prepared = await prepareJiraAsOfIssueBatches(client, projectId, new Date(asOf));
    if (prepared.reconstruction.tickets > JIRA_AGGREGATE_MAX_ISSUES) {
      throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
    }
    const accumulators = group.map((request) => createBatchAccumulator(request, limits));
    let loadedIssues = 0;
    for await (const issues of prepared.batches) {
      loadedIssues += issues.length;
      if (loadedIssues > JIRA_AGGREGATE_MAX_ISSUES) {
        throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
      }
      accumulators.forEach((item) => {
        if (item.error || !item.accumulator) return;
        try {
          item.accumulator.addIssues(issues);
        } catch (error) {
          item.error = evaluationError(error);
        }
      });
    }
    accumulators.forEach(({ request, accumulator, error }) => {
      if (error || !accumulator) {
        results.set(request.key, { key: request.key, result: null, error: error ?? new Error('MISSING_ACCUMULATOR') });
        return;
      }
      try {
        const result = accumulator.finish();
        results.set(request.key, {
          key: request.key,
          result: {
            ...result,
            quality: mergeJiraAsOfDataQuality(result.quality, prepared.reconstruction),
            reconstruction: prepared.reconstruction,
          },
          error: null,
        });
      } catch (finishError) {
        results.set(request.key, { key: request.key, result: null, error: evaluationError(finishError) });
      }
    });
  }
  return requests.map((request) => {
    const result = results.get(request.key);
    if (!result) throw new Error(`JIRA_AGGREGATE_BATCH_RESULT_MISSING:${request.key}`);
    return result;
  });
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
  definition: JiraAnalyticsExecutableDefinition | null;
};

type JiraAggregateDatasetContract = {
  dataset: JiraAnalyticsDatasetDraft;
  legacyContract: JiraAnalyticsLegacyDatasetContract | null;
};

function executableDefinition(
  dataset: JiraAnalyticsDatasetDraft,
  widget: JiraAnalyticsManagedWidget,
): JiraAnalyticsExecutableDefinition {
  return {
    name: dataset.name,
    description: dataset.description,
    source: dataset.source,
    metric: widget.metric,
    groupBy: widget.groupBy,
    scope: widget.placement,
    filterLogic: widget.filterLogic,
    filters: widget.filters,
    baseFilterLogic: widget.baseFilterLogic,
    baseFilters: widget.baseFilters,
    rowConfig: dataset.rowConfig,
    periodMode: widget.periodMode,
    periodDays: widget.periodDays,
    timeZone: dataset.timeZone,
    sortOrder: dataset.sortOrder,
    sortBy: widget.sortBy,
    sortDirection: widget.sortDirection,
  };
}

function legacyExecutableDefinition(
  dataset: JiraAnalyticsDatasetDraft,
  widget: JiraAnalyticsManagedWidgetV3,
  legacyContract: JiraAnalyticsLegacyDatasetContract,
): JiraAnalyticsExecutableDefinition {
  return {
    name: dataset.name,
    description: dataset.description,
    source: dataset.source,
    metric: widget.metric,
    groupBy: widget.groupBy,
    scope: widget.placement,
    filterLogic: widget.filterLogic,
    filters: widget.filters,
    baseFilterLogic: legacyContract.baseFilterLogic,
    baseFilters: legacyContract.baseFilters,
    rowConfig: dataset.rowConfig,
    periodMode: widget.periodMode,
    periodDays: widget.periodDays,
    timeZone: dataset.timeZone,
    sortOrder: dataset.sortOrder,
    sortBy: widget.sortBy,
    sortDirection: widget.sortDirection,
  };
}

function savedDashboardPlan(
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  selectedWidgetId?: string,
  revisionDefinitions: ReadonlyMap<string, JiraAnalyticsAggregateDraft> = new Map(),
  revisionDatasets: ReadonlyMap<string, JiraAggregateDatasetContract> = new Map(),
): { configVersion: 1 | 2 | 3 | 4; configHash: string; widgets: JiraAggregateWidgetPlan[] } {
  const configHash = jiraDashboardConfigHash(rawConfig);
  const config = rawConfig ?? JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1;
  const record = config && typeof config === 'object' ? config as Record<string, unknown> : {};
  const rawWidgets = Array.isArray(record.widgets) ? record.widgets : [];
  const version = record.version === 4 ? 4 : record.version === 3 ? 3 : record.version === 2 ? 2 : 1;
  if ((version === 3 || version === 4) && rawWidgets.length === 0) {
    const empty = version === 4
      ? jiraAnalyticsDashboardV4Schema.safeParse(config)
      : jiraAnalyticsDashboardV3Schema.safeParse(config);
    if (empty.success) return { configVersion: version, configHash, widgets: [] };
  }
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
    if (version === 4) {
      const parsed = jiraAnalyticsManagedWidgetV4Schema.safeParse(rawWidget);
      if (!parsed.success) {
        const fallback = rawWidget && typeof rawWidget === 'object' ? rawWidget as Record<string, unknown> : {};
        return {
          widget: unavailableWidget(
            typeof fallback.id === 'string' ? fallback.id : `invalid-v4-${index}`,
            typeof fallback.title === 'string' ? fallback.title : 'Недоступный виджет',
            'number',
            'half',
            fallback.placement === 'retro' ? 'retro' : 'active',
            'Сохранённый виджет v4 имеет некорректный формат',
            typeof fallback.aggregateId === 'string' ? fallback.aggregateId : null,
          ),
          definition: null,
        };
      }
      const row = definitionsById.get(parsed.data.aggregateId);
      if (!row) {
        return {
          widget: unavailableWidget(
            parsed.data.id, parsed.data.title, parsed.data.visualization, parsed.data.width,
            parsed.data.placement, 'Агрегат удалён или недоступен', parsed.data.aggregateId,
          ),
          definition: null,
        };
      }
      const revisionKey = parsed.data.aggregateVersion
        ? `${row.id}:${parsed.data.aggregateVersion}`
        : null;
      const contract = revisionKey && parsed.data.aggregateVersion !== row.version
        ? revisionDatasets.get(revisionKey)
        : safeJiraAggregateDatasetContractFromRow(row);
      if (!contract) {
        return {
          widget: unavailableWidget(
            parsed.data.id, parsed.data.title, parsed.data.visualization, parsed.data.width,
            parsed.data.placement, `Ревизия агрегата ${parsed.data.aggregateVersion} недоступна`, row.id,
          ),
          definition: null,
        };
      }
      const contractError = jiraAnalyticsWidgetDatasetError(parsed.data, contract.dataset);
      if (contractError) {
        return {
          widget: unavailableWidget(
            parsed.data.id, parsed.data.title, parsed.data.visualization, parsed.data.width,
            parsed.data.placement, contractError, row.id,
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
          aggregateName: contract.dataset.name,
          source: contract.dataset.source,
          metric: parsed.data.metric,
          groupBy: parsed.data.groupBy,
          status: 'OK',
        },
        definition: executableDefinition(contract.dataset, parsed.data),
      };
    }
    if (version === 3) {
      const parsed = jiraAnalyticsManagedWidgetSchema.safeParse(rawWidget);
      if (!parsed.success) {
        const fallback = rawWidget && typeof rawWidget === 'object' ? rawWidget as Record<string, unknown> : {};
        return {
          widget: unavailableWidget(
            typeof fallback.id === 'string' ? fallback.id : `invalid-v3-${index}`,
            typeof fallback.title === 'string' ? fallback.title : 'Недоступный виджет',
            'number',
            'half',
            fallback.placement === 'retro' ? 'retro' : 'active',
            'Сохранённый виджет v3 имеет некорректный формат',
            typeof fallback.aggregateId === 'string' ? fallback.aggregateId : null,
          ),
          definition: null,
        };
      }
      const row = definitionsById.get(parsed.data.aggregateId);
      if (!row) {
        return {
          widget: unavailableWidget(
            parsed.data.id, parsed.data.title, parsed.data.visualization, parsed.data.width,
            parsed.data.placement, 'Агрегат удалён или недоступен', parsed.data.aggregateId,
          ),
          definition: null,
        };
      }
      const revisionKey = parsed.data.aggregateVersion
        ? `${row.id}:${parsed.data.aggregateVersion}`
        : null;
      const contract = revisionKey && parsed.data.aggregateVersion !== row.version
        ? revisionDatasets.get(revisionKey)
        : safeJiraAggregateDatasetContractFromRow(row);
      if (!contract) {
        return {
          widget: unavailableWidget(
            parsed.data.id, parsed.data.title, parsed.data.visualization, parsed.data.width,
            parsed.data.placement, `Ревизия агрегата ${parsed.data.aggregateVersion} недоступна`, row.id,
          ),
          definition: null,
        };
      }
      const legacyContract = contract.legacyContract ?? {
        exposedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[contract.dataset.source]],
        baseFilterLogic: 'and' as const,
        baseFilters: [],
      };
      const contractError = jiraAnalyticsWidgetDatasetError(parsed.data, contract.dataset, legacyContract);
      if (contractError) {
        return {
          widget: unavailableWidget(
            parsed.data.id, parsed.data.title, parsed.data.visualization, parsed.data.width,
            parsed.data.placement, contractError, row.id,
          ),
          definition: null,
        };
      }
      const definition = legacyExecutableDefinition(contract.dataset, parsed.data, legacyContract);
      return {
        widget: {
          widgetId: parsed.data.id,
          title: parsed.data.title,
          visualization: parsed.data.visualization,
          width: parsed.data.width,
          placement: parsed.data.placement,
          aggregateId: row.id,
          aggregateName: contract.dataset.name,
          source: contract.dataset.source,
          metric: parsed.data.metric,
          groupBy: parsed.data.groupBy,
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
    const revisionKey = parsed.data.aggregateVersion
      ? `${row.id}:${parsed.data.aggregateVersion}`
      : null;
    const currentDefinition = jiraAggregateDraftFromRow(row);
    const definition = revisionKey
      ? parsed.data.aggregateVersion === row.version
        ? currentDefinition
        : revisionDefinitions.get(revisionKey)
      : currentDefinition;
    if (!definition) {
      return {
        widget: unavailableWidget(
          parsed.data.id,
          parsed.data.title,
          parsed.data.visualization,
          parsed.data.width,
          parsed.data.placement,
          `Ревизия агрегата ${parsed.data.aggregateVersion} недоступна`,
          parsed.data.aggregateId,
        ),
        definition: null,
      };
    }
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
  revisionDefinitions: ReadonlyMap<string, JiraAnalyticsAggregateDraft> = new Map(),
  revisionDatasets: ReadonlyMap<string, JiraAggregateDatasetContract> = new Map(),
): {
  addIssues: (issues: readonly JiraAnalyticsIssueData[]) => void;
  finish: () => { configVersion: 1 | 2 | 3 | 4; configHash: string; widgets: JiraAggregateWidgetResult[] };
} {
  const plan = savedDashboardPlan(rawConfig, definitions, selectedWidgetId, revisionDefinitions, revisionDatasets);
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
  revisionDefinitions: ReadonlyMap<string, JiraAnalyticsAggregateDraft> = new Map(),
  revisionDatasets: ReadonlyMap<string, JiraAggregateDatasetContract> = new Map(),
): { configVersion: 1 | 2 | 3 | 4; configHash: string; widgets: JiraAggregateWidgetResult[] } {
  const accumulator = createSavedDashboardAccumulator(
    rawConfig,
    definitions,
    options,
    selectedWidgetId,
    jiraAggregateEvaluationLimits,
    revisionDefinitions,
    revisionDatasets,
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
  const parsedV2 = jiraAnalyticsDashboardV2Schema.safeParse(rawConfig);
  const parsedV3 = jiraAnalyticsDashboardV3Schema.safeParse(rawConfig);
  const parsedV4 = jiraAnalyticsDashboardV4Schema.safeParse(rawConfig);
  const parsedWidgets = parsedV4.success
    ? parsedV4.data.widgets
    : parsedV3.success
      ? parsedV3.data.widgets
      : parsedV2.success
        ? parsedV2.data.widgets
        : [];
  const revisionRequests = parsedWidgets
    .flatMap((widget) => widget.aggregateVersion
      ? [{ aggregateId: widget.aggregateId, version: widget.aggregateVersion }]
      : []);
  const revisionRows = revisionRequests.length > 0
    ? await client.jiraAggregateDefinitionRevision.findMany({
        where: {
          projectId,
          OR: revisionRequests,
        },
      })
    : [];
  const revisionDefinitions = new Map<string, JiraAnalyticsAggregateDraft>();
  const revisionDatasets = new Map<string, JiraAggregateDatasetContract>();
  revisionRows.forEach((revision) => {
    const parsed = jiraAnalyticsAggregateDraftSchema.safeParse(revision.definition);
    if (parsed.success) {
      revisionDefinitions.set(`${revision.aggregateId}:${revision.version}`, parsed.data);
    }
    const normalized = normalizeJiraAnalyticsDatasetRevision(revision.definition);
    if (normalized) {
      revisionDatasets.set(`${revision.aggregateId}:${revision.version}`, {
        dataset: normalized.dataset,
        legacyContract: normalized.legacyContract,
      });
    }
  });
  const accumulator = createSavedDashboardAccumulator(
    rawConfig,
    definitions,
    options,
    selectedWidgetId,
    limits,
    revisionDefinitions,
    revisionDatasets,
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

export function jiraAggregateOutputValue(record: JiraAnalyticsResultRecord, field: JiraAnalyticsFilterField) {
  if (field === 'issueKey') return record.issue.issueKey;
  if (field === 'project') return record.issue.issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1] ?? null;
  if (field === 'summary') return record.issue.summary;
  if (field === 'status') return record.issue.status;
  if (field === 'assignee') return record.issue.assignee;
  if (field === 'reporter') return record.issue.reporter;
  if (field === 'priority') return record.issue.priority;
  if (field === 'sprint') return record.sprint;
  if (field === 'sprintCount') return record.issue.sprintCount;
  if (field === 'labels') return record.issue.labels.length > 0
    ? record.issue.labels.join(', ')
    : null;
  if (field === 'issueType') return record.issue.issueType;
  if (field === 'resolution') return isJiraUnresolvedResolution(record.issue.resolution) ? null : record.issue.resolution;
  if (field === 'fromStatus') return record.fromStatus;
  if (field === 'toStatus') return record.toStatus;
  if (field === 'durationHours') return record.durationHours;
  if (field === 'commitCount') return record.commitCount;
  if (field === 'mergeRequestCount') return record.mergeRequestCount;
  if (field === 'hasDevelopment') return record.commitCount > 0 || record.mergeRequestCount > 0;
  if (field === 'issueCreatedAt') return record.issue.issueCreatedAt;
  if (field === 'criticalPriorityAt') return record.issue.criticalPriorityAt;
  if (field === 'resolutionAt') return record.issue.resolutionAt;
  if (field === 'updatedAt') return record.issue.updatedAt;
  if (field === 'eventAt') return record.eventAt;
  if (field === 'intervalStartAt') return record.intervalStartAt;
  if (field === 'intervalEndAt') return record.intervalEndAt;
  return null;
}

export function jiraAggregateResultProjection(
  result: JiraAnalyticsEvaluationResult & { reconstruction?: JiraAsOfReconstruction },
  selectedFields: readonly JiraAnalyticsFilterField[],
) {
  const { records, ...summary } = result;
  return {
    ...summary,
    records: records.map((record) => ({
      id: record.id,
      issueUrl: record.issue.issueUrl,
      values: Object.fromEntries(selectedFields.map((field) => [field, jiraAggregateOutputValue(record, field)])),
    })),
  };
}

export function jiraAggregateResultCsv(
  result: JiraAnalyticsEvaluationResult,
  selectedFields: readonly JiraAnalyticsFilterField[] = JIRA_ANALYTICS_FIELDS_BY_SOURCE[result.quality.source],
  labels: Partial<Record<JiraAnalyticsFilterField, string>> = {},
) {
  if (result.totalRecords > JIRA_AGGREGATE_MAX_PAGE_WINDOW) {
    throw new JiraAggregateExportLimitError(JIRA_AGGREGATE_MAX_PAGE_WINDOW);
  }
  if (result.records.length !== result.totalRecords) {
    throw new Error('JIRA_AGGREGATE_EXPORT_INCOMPLETE');
  }
  const header = selectedFields.map((field) => labels[field] ?? JIRA_SEMANTIC_FIELD_LABELS[field]);
  const rows = result.records.map((record) => selectedFields.map((field) => {
    const value = jiraAggregateOutputValue(record, field);
    return typeof value === 'boolean' ? value ? 'Да' : 'Нет' : value;
  }));
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

export type JiraDashboardSwitchPlan = {
  sourceStored: boolean;
  sourceConfigHash: string;
  effectiveConfigHash: string;
  planHash: string;
  legacy: JiraAnalyticsDashboardV1;
  managed: JiraAnalyticsDashboardV2;
  definitions: JiraAggregateDefinition[];
  items: JiraAggregateImportPlanItem[];
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
  const byNameKey = new Map(existing.map((row) => [row.nameKey, row]));
  const claimedExistingIds = new Set<string>();
  const occupiedNames = new Set(existing.map((row) => row.nameKey));
  const planned = new Map<string, JiraAggregateImportPlanItem>();
  config.widgets.forEach((widget, index) => {
    const draft = inlineWidgetDefinition(widget, index);
    const fingerprint = jiraAggregateFingerprint(draft);
    if (planned.has(fingerprint)) return;
    const fingerprintMatch = byFingerprint.get(fingerprint);
    const nameMatch = byNameKey.get(normalizeJiraAnalyticsName(draft.name));
    const compatibleNameMatch = nameMatch && nameMatch.definitionSchemaVersion < 2 &&
      jiraAggregateFingerprint(jiraAggregateDraftFromRow(nameMatch)) === fingerprint
      ? nameMatch
      : undefined;
    const candidate = fingerprintMatch ?? compatibleNameMatch;
    const current = candidate && !claimedExistingIds.has(candidate.id) ? candidate : undefined;
    if (current) claimedExistingIds.add(current.id);
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
  const parsedV3 = jiraAnalyticsDashboardV3Schema.safeParse(rawConfig);
  if (parsedV3.success) {
    return {
      verifiable: true,
      widgetIds: parsedV3.data.widgets
        .filter((widget) => widget.aggregateId === aggregateId)
        .map((widget) => widget.id),
    };
  }
  const parsedV4 = jiraAnalyticsDashboardV4Schema.safeParse(rawConfig);
  if (parsedV4.success) {
    return {
      verifiable: true,
      widgetIds: parsedV4.data.widgets
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
  definitionVersionById: ReadonlyMap<string, number> = new Map(),
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
        aggregateVersion: widget.section === 'retro'
          ? definitionVersionById.get(aggregateId) ?? null
          : null,
        visualization: widget.visualization,
        width: widget.width,
        placement: widget.section,
      };
    }),
  });
}

export function convertJiraDashboardV2ToV3(
  config: JiraAnalyticsDashboardV2,
  definitions: readonly JiraAggregateDefinition[],
  revisionDefinitions: ReadonlyMap<string, JiraAnalyticsAggregateDraft> = new Map(),
): JiraAnalyticsDashboardV3 {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return jiraAnalyticsDashboardV3Schema.parse({
    version: 3,
    periodDays: config.periodDays,
    assignee: config.assignee,
    widgets: config.widgets.map((widget) => {
      const row = byId.get(widget.aggregateId);
      if (!row) throw new Error(`AGGREGATE_DEFINITION_MISSING:${widget.aggregateId}`);
      const revisionKey = widget.aggregateVersion && widget.aggregateVersion !== row.version
        ? `${row.id}:${widget.aggregateVersion}`
        : null;
      const query = revisionKey
        ? revisionDefinitions.get(revisionKey)
        : jiraAggregateDraftFromRow(row);
      if (!query) throw new Error(`AGGREGATE_REVISION_MISSING:${revisionKey}`);
      return {
        id: widget.id,
        title: widget.title,
        aggregateId: widget.aggregateId,
        aggregateVersion: widget.placement === 'retro'
          ? widget.aggregateVersion ?? row.version
          : null,
        placement: widget.placement,
        metric: query.metric,
        groupBy: query.groupBy,
        filterLogic: query.filterLogic,
        filters: query.filters,
        periodMode: query.periodMode,
        periodDays: query.periodDays,
        sortBy: 'default',
        sortDirection: 'desc',
        visualization: widget.visualization,
        width: widget.width,
      };
    }),
  });
}

export async function editableJiraDashboardV3(
  client: Pick<PrismaClient, 'jiraAggregateDefinitionRevision'>,
  projectId: string,
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  diagnostics: string[] = [],
): Promise<JiraAnalyticsDashboardV3 | null> {
  const current = jiraAnalyticsDashboardV3Schema.safeParse(rawConfig);
  if (current.success) return current.data;
  if (rawConfig === null || rawConfig === undefined) {
    return { version: 3, periodDays: 90, assignee: '', widgets: [] };
  }
  const record = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig as Record<string, unknown>
    : null;
  if (record?.version === 3) throw new Error('DASHBOARD_CONFIG_INVALID');
  let v2 = jiraAnalyticsDashboardV2Schema.safeParse(rawConfig);
  if (!v2.success) {
    const v1 = normalizeJiraAnalyticsDashboardV1(rawConfig ?? JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1);
    if (!v1) throw new Error('DASHBOARD_CONFIG_INVALID');
    const importPlan = buildJiraAggregateImportPlan(v1, definitions);
    const definitionIds = new Map(importPlan.items.flatMap((item) => item.existingId
      ? [[item.fingerprint, item.existingId] as const]
      : []));
    const definitionVersions = new Map(definitions.map((row) => [row.id, row.version]));
    const convertedWidgets = v1.widgets.flatMap((widget) => {
      try {
        return convertJiraDashboardToV2(
          { ...v1, widgets: [widget] },
          definitionIds,
          definitionVersions,
        ).widgets;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('AGGREGATE_DEFINITION_MISSING:')) throw error;
        diagnostics.push(`Виджет «${widget.title}» пропущен: подходящий агрегат не найден`);
        return [];
      }
    });
    if (convertedWidgets.length === 0) {
      throw new Error('DASHBOARD_V3_CONVERSION_EMPTY');
    }
    v2 = jiraAnalyticsDashboardV2Schema.safeParse({
      version: 2,
      periodDays: v1.periodDays,
      assignee: v1.assignee,
      widgets: convertedWidgets,
    });
  }
  if (!v2.success) throw new Error('DASHBOARD_CONFIG_INVALID');
  const requests = v2.data.widgets.flatMap((widget) => widget.aggregateVersion
    ? [{ aggregateId: widget.aggregateId, version: widget.aggregateVersion }]
    : []);
  const revisions = requests.length === 0 ? [] : await client.jiraAggregateDefinitionRevision.findMany({
    where: { projectId, OR: requests },
  });
  const revisionDefinitions = new Map<string, JiraAnalyticsAggregateDraft>();
  revisions.forEach((revision) => {
    const normalized = normalizeJiraAnalyticsDatasetRevision(revision.definition);
    if (normalized?.legacyQuery) {
      revisionDefinitions.set(`${revision.aggregateId}:${revision.version}`, normalized.legacyQuery);
    }
  });
  const widgets = v2.data.widgets.flatMap((widget) => {
    try {
      return convertJiraDashboardV2ToV3(
        { ...v2.data, widgets: [widget] },
        definitions,
        revisionDefinitions,
      ).widgets;
    } catch (error) {
      if (!(error instanceof Error) || !(
        error.message.startsWith('AGGREGATE_DEFINITION_MISSING:') ||
        error.message.startsWith('AGGREGATE_REVISION_MISSING:')
      )) throw error;
      diagnostics.push(`Виджет «${widget.title}» пропущен: сохранённый агрегат или его ревизия недоступны`);
      return [];
    }
  });
  if (diagnostics.length > 0) throw new Error('DASHBOARD_V3_CONVERSION_PARTIAL');
  return jiraAnalyticsDashboardV3Schema.parse({ ...v2.data, version: 3, widgets });
}

export function convertJiraDashboardV3ToV4(
  config: JiraAnalyticsDashboardV3,
  definitions: readonly JiraAggregateDefinition[],
  revisionDatasets: ReadonlyMap<string, JiraAggregateDatasetContract> = new Map(),
  diagnostics: string[] = [],
): JiraAnalyticsDashboardV4 {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return jiraAnalyticsDashboardV4Schema.parse({
    ...config,
    version: 4,
    widgets: config.widgets.flatMap((widget) => {
      const row = byId.get(widget.aggregateId);
      if (!row) {
        diagnostics.push(`Виджет «${widget.title}» пропущен: агрегат ${widget.aggregateId} недоступен`);
        return [];
      }
      const revisionKey = widget.aggregateVersion && widget.aggregateVersion !== row.version
        ? `${row.id}:${widget.aggregateVersion}`
        : null;
      const contract = revisionKey
        ? revisionDatasets.get(revisionKey)
        : safeJiraAggregateDatasetContractFromRow(row);
      if (!contract) {
        diagnostics.push(`Виджет «${widget.title}» пропущен: ревизия агрегата ${revisionKey ?? row.id} недоступна`);
        return [];
      }
      const legacyContract = contract.legacyContract ?? {
        exposedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[contract.dataset.source]],
        baseFilterLogic: 'and' as const,
        baseFilters: [],
      };
      return [{
        ...widget,
        selectedFields: [...new Set([
          ...legacyContract.exposedFields,
          ...legacyContract.baseFilters.map((filter) => filter.field),
        ])],
        baseFilterLogic: legacyContract.baseFilterLogic,
        baseFilters: legacyContract.baseFilters,
      }];
    }),
  });
}

export async function editableJiraDashboardV4(
  client: Pick<PrismaClient, 'jiraAggregateDefinitionRevision'>,
  projectId: string,
  rawConfig: unknown,
  definitions: JiraAggregateDefinition[],
  diagnostics: string[] = [],
): Promise<JiraAnalyticsDashboardV4 | null> {
  const current = jiraAnalyticsDashboardV4Schema.safeParse(rawConfig);
  if (current.success) return current.data;
  const record = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig as Record<string, unknown>
    : null;
  if (record?.version === 4) throw new Error('DASHBOARD_CONFIG_INVALID');
  const v3 = await editableJiraDashboardV3(client, projectId, rawConfig, definitions, diagnostics);
  if (!v3) return null;
  const requests = v3.widgets.flatMap((widget) => widget.aggregateVersion
    ? [{ aggregateId: widget.aggregateId, version: widget.aggregateVersion }]
    : []);
  const revisions = requests.length === 0 ? [] : await client.jiraAggregateDefinitionRevision.findMany({
    where: { projectId, OR: requests },
  });
  const revisionDatasets = new Map<string, JiraAggregateDatasetContract>();
  revisions.forEach((revision) => {
    const normalized = normalizeJiraAnalyticsDatasetRevision(revision.definition);
    if (!normalized) return;
    revisionDatasets.set(`${revision.aggregateId}:${revision.version}`, {
      dataset: normalized.dataset,
      legacyContract: normalized.legacyContract,
    });
  });
  return convertJiraDashboardV3ToV4(v3, definitions, revisionDatasets, diagnostics);
}

function plannedAggregateDefinition(
  projectId: string,
  item: JiraAggregateImportPlanItem,
): JiraAggregateDefinition {
  const timestamp = new Date(0);
  return {
    id: item.existingId ?? `planned-${item.fingerprint}`,
    projectId,
    aggregateKey: "",
    system: false,
    ...item.definition,
    nameKey: normalizeJiraAnalyticsName(item.definition.name),
    definitionSchemaVersion: 1,
    exposedFields: null,
    baseFilterLogic: null,
    baseFilters: null,
    rowConfig: null,
    filters: item.definition.filters as Prisma.JsonValue,
    fingerprint: item.fingerprint,
    version: 1,
    publishedVersion: null,
    draftDefinition: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildJiraDashboardSwitchPlan(
  projectId: string,
  rawConfig: unknown,
  existing: JiraAggregateDefinition[],
): JiraDashboardSwitchPlan {
  if (rawConfig && typeof rawConfig === 'object' && (rawConfig as Record<string, unknown>).version === 2) {
    throw new Error('DASHBOARD_NOT_V1');
  }
  const sourceStored = rawConfig !== null && rawConfig !== undefined;
  const legacy = sourceStored
    ? normalizeJiraAnalyticsDashboardV1(rawConfig)
    : JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1;
  if (!legacy) throw new Error('DASHBOARD_V1_INVALID');
  const importPlan = buildJiraAggregateImportPlan(legacy, existing);
  if (!importPlan.config) throw new Error('DASHBOARD_V1_INVALID');
  const planned = importPlan.items.map((item) => plannedAggregateDefinition(projectId, item));
  const plannedByFingerprint = new Map(planned.map((definition) => [definition.fingerprint, definition]));
  const definitions = [
    ...existing.filter((definition) => !plannedByFingerprint.has(definition.fingerprint)),
    ...planned,
  ];
  const idsByFingerprint = new Map(planned.map((definition) => [definition.fingerprint, definition.id]));
  const versionsById = new Map(definitions.map((definition) => [definition.id, definition.version]));
  const managed = convertJiraDashboardToV2(legacy, idsByFingerprint, versionsById);
  const effectiveConfigHash = jiraDashboardConfigHash(legacy);
  const planHash = jiraDashboardConfigHash({
    effectiveConfigHash,
    widgetDefinitions: legacy.widgets.map((widget, index) => {
      const draft = inlineWidgetDefinition(widget, index);
      return { widgetId: widget.id, fingerprint: jiraAggregateFingerprint(draft) };
    }),
  });
  return {
    sourceStored,
    sourceConfigHash: jiraDashboardConfigHash(rawConfig),
    effectiveConfigHash,
    planHash,
    legacy,
    managed,
    definitions,
    items: importPlan.items,
  };
}

export function jiraDashboardReferencedAggregateIds(config: JiraAnalyticsDashboardConfig) {
  return config.version === 2 || config.version === 3 || config.version === 4
    ? [...new Set(config.widgets.map((widget) => widget.aggregateId))]
    : [];
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
      managed: convertJiraDashboardToV2(
        currentV1,
        idsByFingerprint,
        new Map(definitions.map((definition) => [definition.id, definition.version])),
      ),
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
    const managedDefinition = managedLayout
      ? definitionsById.get(managedLayout.aggregateId)
      : null;
    const managedFingerprint = managedDefinition
      ? jiraAggregateFingerprint(jiraAggregateDraftFromRow(managedDefinition))
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
