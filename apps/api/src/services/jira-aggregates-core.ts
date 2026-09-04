import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_SEMANTIC_MAX_AS_OF_SLICES,
  createJiraAnalyticsEvaluationAccumulator,
  isJiraCancelledStatus,
  isJiraUnresolvedResolution,
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsDatasetDraftSchema,
  jiraAnalyticsDatasetFromLegacy,
  jiraAnalyticsDatasetSemanticKey,
  jiraAnalyticsLegacyDatasetDraftSchema,
  jiraAnalyticsSemanticKey,
  jiraAnalyticsSourcePeriodSupport,
  jiraAnalyticsSourceSupportsAsOf,
  jiraAnalyticsSourceUsesPeriod,
  normalizeJiraAnalyticsDatasetRevision,
  normalizeJiraAnalyticsName,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDataQuality,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsExecutableDefinition,
  type JiraAnalyticsGoalMapping,
  type JiraAnalyticsInlineWidget,
  type JiraAnalyticsIssueData,
  type JiraAnalyticsLegacyDatasetContract,
} from "@pms/shared";
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

import {
  prepareJiraAsOfIssueBatches,
  type JiraAsOfReconstruction,
} from "./jira-history-asof.js";

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

export function stableJson(value: unknown): string {
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

export type JiraAggregateReadClient = Pick<
  PrismaClient,
  '$queryRaw' | 'jiraIssueSnapshot' | 'jiraIssueStatusTransition' | 'jiraDevelopmentActivity' |
  'jiraAggregateDefinitionRevision' | 'wbsItem'
>;

async function loadJiraGoalMappings(
  client: JiraAggregateReadClient,
  projectId: string,
): Promise<JiraAnalyticsGoalMapping[]> {
  const goals = await client.wbsItem.findMany({
    where: { projectId, type: 'GOAL', jiraGoalLabels: { isEmpty: false } },
    select: { id: true, title: true, status: true, dueDate: true, jiraGoalLabels: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return goals.map((goal) => ({
    id: goal.id,
    name: goal.title,
    status: goal.status,
    date: goal.dueDate?.toISOString() ?? null,
    labels: goal.jiraGoalLabels,
  }));
}

async function withJiraGoalMappings(
  client: JiraAggregateReadClient,
  projectId: string,
  definition: JiraAnalyticsExecutableDefinition,
) {
  return definition.source === 'goalIssues'
    ? { ...definition, goalMappings: await loadJiraGoalMappings(client, projectId) }
    : definition;
}

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

export const jiraAggregateEvaluationLimits = {
  maxGroups: JIRA_AGGREGATE_MAX_GROUPS,
  maxPageWindow: JIRA_AGGREGATE_MAX_PAGE_WINDOW,
} as const;

export const jiraAggregateExportEvaluationLimits = {
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
  const executableDefinition = await withJiraGoalMappings(client, projectId, definition);
  const accumulator = createJiraAnalyticsEvaluationAccumulator(
    executableDefinition,
    options,
    limits,
  );
  if (asOf) {
    if (!jiraAnalyticsSourceSupportsAsOf(executableDefinition.source)) {
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
    const preparedRequests = await Promise.all(current.map(async (request) => ({
      ...request,
      definition: await withJiraGoalMappings(client, projectId, request.definition),
    })));
    const accumulators = preparedRequests.map((request) => createBatchAccumulator(request, limits));
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
    const preparedGroup = await Promise.all(group.map(async (request) => ({
      ...request,
      definition: await withJiraGoalMappings(client, projectId, request.definition),
    })));
    const accumulators = preparedGroup.map((request) => createBatchAccumulator(request, limits));
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
