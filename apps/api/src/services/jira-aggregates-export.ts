import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_SEMANTIC_FIELD_LABELS,
  isJiraUnresolvedResolution,
  jiraAnalyticsDashboardV2Schema,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsDashboardV4Schema,
  normalizeJiraAnalyticsDashboardV1,
  normalizeJiraAnalyticsDatasetRevision,
  normalizeJiraAnalyticsName,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsDashboardV1,
  type JiraAnalyticsDashboardV2,
  type JiraAnalyticsDashboardV3,
  type JiraAnalyticsDashboardV4,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsResultRecord,
} from "@pms/shared";
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from "@prisma/client";

import {
  JIRA_AGGREGATE_MAX_PAGE_WINDOW,
  JiraAggregateExportLimitError,
  jiraAggregateDraftFromRow,
  jiraAggregateExportEvaluationLimits,
  jiraAggregateFingerprint,
  jiraDashboardConfigHash,
  inlineWidgetDefinition,
  loadJiraAggregateIssueBatches,
  safeJiraAggregateDatasetContractFromRow,
  stableJson,
  type JiraAggregateReadClient,
  type JiraAggregateWidgetResult,
} from "./jira-aggregates-core.js";
import {
  createSavedDashboardAccumulator,
  type JiraAggregateDatasetContract,
} from "./jira-aggregates-dashboard.js";
import type { JiraAsOfReconstruction } from "./jira-history-asof.js";

function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\t\r ]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function jiraAggregateOutputValue(record: JiraAnalyticsResultRecord, field: JiraAnalyticsFilterField) {
  if (record.semanticValues && Object.hasOwn(record.semanticValues, field)) {
    return record.semanticValues[field] ?? null;
  }
  if (field === 'goalId') return record.goal?.id ?? null;
  if (field === 'goalName') return record.goal?.name ?? null;
  if (field === 'goalStatus') return record.goal?.status ?? null;
  if (field === 'goalDate') return record.goal?.date ?? null;
  if (field === 'goalLabels') return record.goal?.labels.join(', ') || null;
  if (field === 'matchedLabels') return record.goal?.matchedLabels.join(', ') || null;
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
