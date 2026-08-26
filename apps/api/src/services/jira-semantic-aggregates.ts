import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_SEMANTIC_FIELD_LABELS,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticCompatibleChange,
  jiraSemanticDefaultOutputField,
  type JiraAnalyticsExecutableDefinition,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsPeriodDays,
  type JiraAnalyticsSortDirection,
  type JiraAnalyticsSortField,
  type JiraSemanticAggregateDefinition,
  type JiraSemanticAggregatePublic,
  type JiraSemanticAggregateRevisionStatus,
  type JiraSemanticIntervalAnchor,
} from "@pms/shared";
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from "@prisma/client";

import { jiraDashboardConfigHash, lockJiraAggregateProject } from "./jira-aggregates.js";

const fields = (...keys: JiraAnalyticsFilterField[]) => keys.map(jiraSemanticDefaultOutputField);

const qualityRules = {
  minimumCoveragePercent: 95,
  maximumRows: 100_000,
  maximumRowsPerIssue: 500,
};

export const JIRA_SYSTEM_SEMANTIC_AGGREGATES: Array<{
  key: string;
  definition: JiraSemanticAggregateDefinition;
}> = [
  {
    key: "issues",
    definition: {
      schemaVersion: 5,
      name: "Тикеты",
      description: "Одна строка на актуальный или восстановленный снимок тикета.",
      grain: "issue",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: { kind: "issue" },
      rowIdentity: ["issueKey"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.issues),
      incompleteDataPolicy: "includeWithWarning",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "supported",
    },
  },
  {
    key: "status-transitions",
    definition: {
      schemaVersion: 5,
      name: "Переходы статусов",
      description: "Одна строка на наблюдённое изменение статуса Jira.",
      grain: "transitionEvent",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: { kind: "transitionEvent" },
      rowIdentity: ["rowId"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.transitions),
      incompleteDataPolicy: "exclude",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "none",
    },
  },
  {
    key: "development-activity",
    definition: {
      schemaVersion: 5,
      name: "Активность разработки",
      description: "Одна строка на наблюдённое событие разработки, связанное с тикетом.",
      grain: "developmentEvent",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: { kind: "developmentEvent" },
      rowIdentity: ["rowId"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.development),
      incompleteDataPolicy: "exclude",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "none",
    },
  },
  {
    key: "status-intervals",
    definition: {
      schemaVersion: 5,
      name: "Интервалы статусов",
      description: "Одна строка на пару выбранных контрольных точек истории тикета.",
      grain: "interval",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: {
        kind: "interval",
        start: { type: "issueCreated", occurrence: "first" },
        end: {
          type: "statusEntry",
          statuses: [{ id: null, name: "In Progress" }],
          occurrence: "first",
        },
        pairing: "nextAfterStart",
        openIntervals: "include",
      },
      rowIdentity: ["rowId"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.statusIntervals),
      incompleteDataPolicy: "exclude",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "none",
    },
  },
  {
    key: "critical-blocker-sla",
    definition: {
      schemaVersion: 5,
      name: "SLA Critical/Blocker",
      description: "Интервал от создания или первого повышения до Critical/Blocker до Resolution.",
      grain: "interval",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: {
        kind: "criticalSla",
        issueTypes: ["Bug", "Bug Report", "Defect", "Баг", "Ошибка", "Дефект"],
        priorities: ["Critical", "Blocker"],
        startPolicy: "createdOrFirstPriorityEntry",
        endAnchor: "resolution",
        requirePriorityAtResolution: true,
        openIntervals: "include",
      },
      rowIdentity: ["rowId"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.criticalBugs),
      incompleteDataPolicy: "exclude",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "supported",
    },
  },
];

function hash(value: unknown) {
  return jiraDashboardConfigHash(value);
}

function nameKey(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU");
}

function legacySource(definition: JiraSemanticAggregateDefinition) {
  if (definition.rowConfig.kind === "issue") return "issues" as const;
  if (definition.rowConfig.kind === "transitionEvent") return "transitions" as const;
  if (definition.rowConfig.kind === "developmentEvent") return "development" as const;
  if (definition.rowConfig.kind === "criticalSla") return "criticalBugs" as const;
  return "statusIntervals" as const;
}

function legacyRowConfig(definition: JiraSemanticAggregateDefinition): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (definition.rowConfig.kind !== "interval") return Prisma.DbNull;
  const endpoint = (anchor: JiraSemanticIntervalAnchor) => {
    if (anchor.type === "issueCreated") return { anchor: "issueCreated", occurrence: "first" };
    if (anchor.type === "resolution") return { anchor: "resolution", occurrence: anchor.occurrence };
    if (anchor.type === "priorityEntry") return { anchor: "criticalPriority", occurrence: "first" };
    return anchor.type === "statusEntry"
      ? { anchor: "firstStatusEntry", statuses: anchor.statuses.map((status) => status.name), occurrence: anchor.occurrence }
      : { anchor: "statusTransition", fromStatuses: anchor.statuses.map((status) => status.name), toStatuses: [], occurrence: anchor.occurrence };
  };
  return {
    kind: "statusInterval",
    start: endpoint(definition.rowConfig.start),
    end: endpoint(definition.rowConfig.end),
    pairing: definition.rowConfig.pairing,
    openIntervals: definition.rowConfig.openIntervals,
    periodAnchor: "start",
  };
}

function definitionData(projectId: string, key: string, definition: JiraSemanticAggregateDefinition, system: boolean) {
  const source = legacySource(definition);
  const systemOrder = JIRA_SYSTEM_SEMANTIC_AGGREGATES.findIndex((aggregate) => aggregate.key === key);
  return {
    projectId,
    aggregateKey: key,
    system,
    name: definition.name,
    nameKey: nameKey(definition.name),
    description: definition.description,
    source,
    definitionSchemaVersion: 5,
    exposedFields: definition.outputFields.map((field) => field.key),
    baseFilterLogic: definition.basePopulation.logic,
    baseFilters: definition.basePopulation.filters,
    rowConfig: legacyRowConfig(definition),
    metric: "count",
    groupBy: "none",
    scope: "retro",
    filterLogic: "and",
    filters: [],
    periodMode: "NONE",
    periodDays: null,
    timeZone: definition.timeZone,
    fingerprint: hash(definition),
    sortOrder: systemOrder >= 0 ? systemOrder : JIRA_SYSTEM_SEMANTIC_AGGREGATES.length,
    version: 1,
    publishedVersion: 1,
    draftDefinition: definition as unknown as Prisma.InputJsonObject,
  } satisfies Prisma.JiraAggregateDefinitionUncheckedCreateInput;
}

export async function ensureJiraSystemSemanticAggregates(client: PrismaClient, projectId: string) {
  await client.$transaction(async (transaction) => {
    await lockJiraAggregateProject(transaction, projectId);
    for (const aggregate of JIRA_SYSTEM_SEMANTIC_AGGREGATES) {
      const row = await transaction.jiraAggregateDefinition.upsert({
        where: { projectId_aggregateKey: { projectId, aggregateKey: aggregate.key } },
        create: definitionData(projectId, aggregate.key, aggregate.definition, true),
        update: {},
      });
      await transaction.jiraAggregateDefinitionRevision.upsert({
        where: { aggregateId_version: { aggregateId: row.id, version: 1 } },
        create: {
          projectId,
          aggregateId: row.id,
          version: 1,
          definition: aggregate.definition as unknown as Prisma.InputJsonObject,
          fingerprint: hash(aggregate.definition),
          status: "published",
          changeKind: "compatible",
          publishedAt: new Date(),
        },
        update: {},
      });
    }
  });
}

function parsedDefinition(value: unknown) {
  const parsed = jiraSemanticAggregateDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function listJiraSemanticAggregates(client: PrismaClient, projectId: string) {
  const rows = await client.jiraAggregateDefinition.findMany({
    where: { projectId, archivedAt: null, definitionSchemaVersion: 5 },
    orderBy: [{ system: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { revisions: { orderBy: { version: "desc" } } },
  });
  return rows.flatMap((row) => {
    const draft = parsedDefinition(row.draftDefinition);
    if (!draft) return [];
    const publishedRevision = row.publishedVersion == null
      ? null
      : row.revisions.find((revision) => revision.version === row.publishedVersion) ?? null;
    const published = publishedRevision ? parsedDefinition(publishedRevision.definition) : null;
    return [{
      id: row.id,
      projectId: row.projectId,
      key: row.aggregateKey,
      system: row.system,
      version: row.version,
      publishedVersion: row.publishedVersion,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      draft,
      published,
      revisions: row.revisions.map((revision) => ({
        version: revision.version,
        status: revision.status as JiraSemanticAggregateRevisionStatus,
        changeKind: revision.changeKind as "compatible" | "breaking",
        createdAt: revision.createdAt.toISOString(),
        publishedAt: revision.publishedAt?.toISOString() ?? null,
      })),
    } satisfies JiraSemanticAggregatePublic];
  });
}

export function jiraSemanticAggregateSource(definition: JiraSemanticAggregateDefinition) {
  return legacySource(definition);
}

export function jiraSemanticExecutableDefinition(
  definition: JiraSemanticAggregateDefinition,
  query: {
    metric: JiraAnalyticsMetric;
    groupBy: JiraAnalyticsGroupBy;
    filters: JiraAnalyticsFilter[];
    filterLogic: "and" | "or";
    periodDays: JiraAnalyticsPeriodDays | null;
    dateField: JiraAnalyticsFilterField | null;
    sortBy: JiraAnalyticsSortField;
    sortDirection: JiraAnalyticsSortDirection;
  },
): JiraAnalyticsExecutableDefinition {
  const source = legacySource(definition);
  const rowConfig = definition.rowConfig.kind === "interval"
    ? legacyRowConfig(definition) as NonNullable<JiraAnalyticsExecutableDefinition["rowConfig"]>
    : null;
  return {
    name: definition.name,
    description: definition.description,
    source,
    metric: query.metric,
    groupBy: query.groupBy,
    scope: "retro",
    filterLogic: query.filterLogic,
    filters: query.filters,
    baseFilterLogic: definition.basePopulation.logic,
    baseFilters: definition.basePopulation.filters,
    rowConfig,
    periodMode: query.periodDays === null ? "NONE" : "DASHBOARD",
    periodDays: null,
    timeZone: definition.timeZone,
    sortOrder: 0,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
    dateField: query.dateField,
    criticalSlaConfig: definition.rowConfig.kind === "criticalSla"
      ? {
          issueTypes: definition.rowConfig.issueTypes,
          priorities: definition.rowConfig.priorities,
          requirePriorityAtResolution: definition.rowConfig.requirePriorityAtResolution,
          openIntervals: definition.rowConfig.openIntervals,
        }
      : undefined,
    rowIdentity: definition.rowIdentity,
    maximumRows: definition.qualityRules.maximumRows,
    maximumRowsPerIssue: definition.qualityRules.maximumRowsPerIssue,
  };
}

export function jiraSemanticAvailableFields(definition: JiraSemanticAggregateDefinition) {
  return definition.outputFields.map((field) => field.key);
}

export type JiraSemanticPopulationStats = {
  tickets: number;
  transitions: number;
  developmentActivities: number;
};

export async function jiraSemanticPopulationStats(
  client: PrismaClient,
  projectId: string,
): Promise<JiraSemanticPopulationStats> {
  const [tickets, transitions, developmentActivities] = await Promise.all([
    client.jiraIssueSnapshot.count({ where: { projectId, retiredAt: null } }),
    client.jiraIssueStatusTransition.count({ where: { snapshot: { projectId, retiredAt: null } } }),
    client.jiraDevelopmentActivity.count({ where: { snapshot: { projectId, retiredAt: null } } }),
  ]);
  return { tickets, transitions, developmentActivities };
}

export function jiraSemanticAggregateCost(
  definition: JiraSemanticAggregateDefinition,
  population: JiraSemanticPopulationStats | number,
) {
  const stats = typeof population === "number"
    ? { tickets: population, transitions: population, developmentActivities: population }
    : population;
  const repeatedIntervals = definition.rowConfig.kind === "interval"
    && (definition.rowConfig.start.occurrence === "all" || definition.rowConfig.end.occurrence === "all");
  const estimatedRows = definition.rowConfig.kind === "transitionEvent"
    ? stats.transitions
    : definition.rowConfig.kind === "developmentEvent"
      ? stats.developmentActivities
      : repeatedIntervals
        ? Math.min(
            stats.tickets * definition.qualityRules.maximumRowsPerIssue,
            stats.tickets + stats.transitions,
          )
        : stats.tickets;
  return {
    tickets: stats.tickets,
    transitions: stats.transitions,
    developmentActivities: stats.developmentActivities,
    estimatedRows,
    maximumRows: definition.qualityRules.maximumRows,
    blocked: estimatedRows > definition.qualityRules.maximumRows,
  };
}

export async function loadPublishedJiraSemanticAggregate(
  client: PrismaClient,
  projectId: string,
  aggregateId: string,
  version?: number,
) {
  const row = await client.jiraAggregateDefinition.findFirst({
    where: { id: aggregateId, projectId, archivedAt: null, definitionSchemaVersion: 5 },
    include: { revisions: true },
  });
  if (!row) return null;
  const selectedVersion = version ?? row.publishedVersion;
  if (selectedVersion == null) return null;
  const revision = row.revisions.find((item) => item.version === selectedVersion && item.status === "published");
  if (!revision) return null;
  const definition = parsedDefinition(revision.definition);
  return definition ? { row, revision, definition } : null;
}

export function jiraSemanticRevisionChangeKind(
  previous: JiraSemanticAggregateDefinition | null,
  next: JiraSemanticAggregateDefinition,
) {
  return previous && jiraSemanticCompatibleChange(previous, next) ? "compatible" as const : previous ? "breaking" as const : "compatible" as const;
}

export function jiraSemanticDefinitionUpdateData(
  definition: JiraSemanticAggregateDefinition,
  version: number,
): Prisma.JiraAggregateDefinitionUpdateInput {
  return {
    name: definition.name,
    nameKey: nameKey(definition.name),
    description: definition.description,
    source: legacySource(definition),
    exposedFields: definition.outputFields.map((field) => field.key),
    baseFilterLogic: definition.basePopulation.logic,
    baseFilters: definition.basePopulation.filters,
    rowConfig: legacyRowConfig(definition),
    timeZone: definition.timeZone,
    fingerprint: hash(definition),
    version,
    draftDefinition: definition as unknown as Prisma.InputJsonObject,
  };
}

export function jiraSemanticCreateData(projectId: string, key: string, definition: JiraSemanticAggregateDefinition) {
  return { ...definitionData(projectId, key, definition, false), publishedVersion: null };
}

export function jiraSemanticRevisionCreateData(
  projectId: string,
  aggregateId: string,
  version: number,
  definition: JiraSemanticAggregateDefinition,
  changeKind: "compatible" | "breaking",
) {
  return {
    projectId,
    aggregateId,
    version,
    definition: definition as unknown as Prisma.InputJsonObject,
    fingerprint: hash(definition),
    status: "draft",
    changeKind,
  };
}

export function jiraSemanticFieldCatalog(definition: JiraSemanticAggregateDefinition) {
  const source = legacySource(definition);
  const available = new Set(JIRA_ANALYTICS_FIELDS_BY_SOURCE[source]);
  return definition.outputFields.filter((field) => available.has(field.key)).map((field) => ({
    ...field,
    label: field.label || JIRA_SEMANTIC_FIELD_LABELS[field.key],
  }));
}
