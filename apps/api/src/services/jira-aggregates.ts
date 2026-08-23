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
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsInlineWidget,
  type JiraAnalyticsIssueData,
} from '@pms/shared';
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

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
  resolutionAt: true,
  criticalSlaTracked: true,
  commitCount: true,
  mergeRequestCount: true,
  developmentDataAvailable: true,
  transitionHistoryComplete: true,
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
    resolutionAt: issue.resolutionAt?.toISOString() ?? null,
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
  'jiraIssueSnapshot' | 'jiraIssueStatusTransition' | 'jiraDevelopmentActivity'
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

export async function evaluateJiraAggregateFromDatabase(
  client: JiraAggregateReadClient,
  projectId: string,
  definition: JiraAnalyticsAggregateDraft,
  options: JiraAnalyticsEvaluationOptions,
) {
  const accumulator = createJiraAnalyticsEvaluationAccumulator(
    definition,
    options,
    jiraAggregateEvaluationLimits,
  );
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
) {
  const accumulator = createSavedDashboardAccumulator(
    rawConfig,
    definitions,
    options,
    selectedWidgetId,
  );
  for await (const issues of loadJiraAggregateIssueBatches(client, projectId)) {
    accumulator.addIssues(issues);
  }
  return accumulator.finish();
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
