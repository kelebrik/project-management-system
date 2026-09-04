import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  createJiraAnalyticsEvaluationAccumulator,
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsDashboardV2Schema,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsDashboardV4Schema,
  jiraAnalyticsInlineWidgetReadSchema,
  jiraAnalyticsManagedWidgetSchema,
  jiraAnalyticsManagedWidgetV4Schema,
  jiraAnalyticsReferencedWidgetSchema,
  jiraAnalyticsWidgetDatasetError,
  normalizeJiraAnalyticsDatasetRevision,
  normalizeJiraAnalyticsInlineWidget,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsExecutableDefinition,
  type JiraAnalyticsIssueData,
  type JiraAnalyticsLegacyDatasetContract,
  type JiraAnalyticsManagedWidget,
  type JiraAnalyticsManagedWidgetV3,
} from "@pms/shared";
import type { JiraAggregateDefinition } from "@prisma/client";

import {
  JIRA_AGGREGATE_MAX_BATCH_WIDGETS,
  jiraAggregateDraftFromRow,
  jiraAggregateEvaluationLimits,
  jiraDashboardConfigHash,
  inlineWidgetDefinition,
  loadJiraAggregateIssueBatches,
  safeJiraAggregateDatasetContractFromRow,
  type JiraAggregateReadClient,
  type JiraAggregateWidgetResult,
} from "./jira-aggregates-core.js";

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

export type JiraAggregateDatasetContract = {
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
