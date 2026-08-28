import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_SEMANTIC_EMPTY_DASHBOARD,
  JIRA_SEMANTIC_FIELD_LABELS,
  jiraCancelledStatuses,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticCompatibleChange,
  jiraSemanticDefaultOutputField,
  jiraSemanticDashboardSchema,
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
  type JiraSemanticDashboard,
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

export const JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION = 3;
const JIRA_SEMANTIC_WIDGET_IDS_ADDED_IN_VERSION_2 = new Set([
  "active-critical-blocker-risk",
  "retro-critical-blocker-task-sla-45-days",
  "retro-p85-in-progress-to-resolution-by-project",
]);

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
  {
    key: "critical-blocker-task-sla",
    definition: {
      schemaVersion: 5,
      name: "SLA задач Critical/Blocker",
      description: "Задачи Critical/Blocker: интервал от создания или первого повышения приоритета до Resolution.",
      grain: "interval",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: {
        kind: "criticalSla",
        issueTypes: ["Task", "Задача"],
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
  {
    key: "critical-blocker-risk",
    definition: {
      schemaVersion: 5,
      name: "Тикеты Critical/Blocker под риском",
      description: "Нерешённые баги в семидневном окне до SLA 30 дней и задачи старше 28 дней от начала Critical/Blocker.",
      grain: "interval",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: {
        kind: "criticalRisk",
        priorities: ["Critical", "Blocker"],
        bugIssueTypes: ["Bug", "Bug Report", "Defect", "Баг", "Ошибка", "Дефект"],
        bugSlaHours: 720,
        bugWarningHours: 168,
        taskIssueTypes: ["Task", "Задача"],
        taskRiskHours: 672,
      },
      rowIdentity: ["rowId"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.criticalBugs),
      incompleteDataPolicy: "exclude",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "none",
    },
  },
  {
    key: "in-progress-resolution",
    definition: {
      schemaVersion: 5,
      name: "От первого In Progress до Resolution",
      description: "Одна строка на завершённый интервал от первого входа в In Progress до Resolution.",
      grain: "interval",
      basePopulation: { logic: "and", filters: [] },
      rowConfig: {
        kind: "interval",
        start: {
          type: "statusEntry",
          statuses: [{ id: null, name: "In Progress" }],
          occurrence: "first",
        },
        end: { type: "resolution", occurrence: "first" },
        pairing: "nextAfterStart",
        openIntervals: "exclude",
      },
      rowIdentity: ["rowId"],
      outputFields: fields(...JIRA_ANALYTICS_FIELDS_BY_SOURCE.statusIntervals),
      incompleteDataPolicy: "exclude",
      qualityRules,
      timeZone: "Europe/Moscow",
      asOfSupport: "none",
    },
  },
];

type SystemAggregateReference = {
  id: string;
  aggregateKey: string;
  publishedVersion: number | null;
};

function filter(id: string, field: JiraAnalyticsFilterField, operator: JiraAnalyticsFilter["operator"], value = ""): JiraAnalyticsFilter {
  return { id, field, operator, value };
}

export function jiraDefaultSemanticDashboard(references: readonly SystemAggregateReference[]): JiraSemanticDashboard {
  const aggregate = (key: string) => {
    const reference = references.find((item) => item.aggregateKey === key && item.publishedVersion !== null);
    if (!reference?.publishedVersion) throw new Error(`JIRA_SYSTEM_AGGREGATE_NOT_PUBLISHED:${key}`);
    return { aggregateId: reference.id, aggregateVersion: reference.publishedVersion };
  };
  const issues = aggregate("issues");
  const statusIntervals = aggregate("status-intervals");
  const criticalSla = aggregate("critical-blocker-sla");
  const criticalTaskSla = aggregate("critical-blocker-task-sla");
  const criticalRisk = aggregate("critical-blocker-risk");
  const inProgressResolution = aggregate("in-progress-resolution");
  const activeScope = (prefix: string) => [
    filter(`${prefix}-unresolved`, "resolution", "empty"),
    ...jiraCancelledStatuses.map((status, index) => filter(`${prefix}-not-cancelled-${index + 1}`, "status", "notEquals", status)),
  ];
  return {
    version: 5,
    periodDays: 180,
    assignee: "",
    widgets: [
      {
        id: "active-without-sprint-with-code",
        title: "Без Sprint с коммитами или MR",
        ...issues,
        placement: "active",
        selectedFields: ["issueKey", "summary", "status", "assignee", "sprint", "commitCount", "mergeRequestCount", "hasDevelopment", "resolution"],
        filterLogic: "and",
        filters: [
          filter("without-sprint", "sprint", "empty"),
          filter("with-development", "hasDevelopment", "equals", "true"),
          ...activeScope("without-sprint"),
        ],
        dateField: null,
        asOf: null,
        metric: "count",
        groupBy: "none",
        sortBy: "commitCount",
        sortDirection: "desc",
        visualization: "table",
        width: "full",
      },
      {
        id: "active-not-in-progress-after-12-days",
        title: "Не перешли в In Progress за 12 дней",
        ...statusIntervals,
        placement: "active",
        selectedFields: ["issueKey", "summary", "status", "assignee", "issueCreatedAt", "intervalEndAt", "durationHours", "resolution"],
        filterLogic: "and",
        filters: [
          filter("not-started-open", "intervalEndAt", "empty"),
          filter("not-started-12-days", "durationHours", "greaterThan", "288"),
          ...activeScope("not-started"),
        ],
        dateField: null,
        asOf: null,
        metric: "count",
        groupBy: "none",
        sortBy: "durationHours",
        sortDirection: "desc",
        visualization: "table",
        width: "full",
      },
      {
        id: "active-critical-blocker-risk",
        title: "Тикеты под риском",
        ...criticalRisk,
        placement: "active",
        selectedFields: ["issueKey", "summary", "project", "issueType", "priority", "assignee", "status", "criticalPriorityAt", "durationHours", "resolution"],
        filterLogic: "and",
        filters: activeScope("critical-blocker-risk"),
        dateField: null,
        asOf: null,
        metric: "count",
        groupBy: "none",
        sortBy: "durationHours",
        sortDirection: "desc",
        visualization: "table",
        width: "full",
      },
      {
        id: "retro-critical-blocker-sla-30-days",
        title: "Баги: нарушение SLA 30 дней Critical/Blocker",
        ...criticalSla,
        placement: "retro",
        selectedFields: ["issueKey", "summary", "project", "priority", "assignee", "status", "criticalPriorityAt", "resolutionAt", "durationHours", "resolution"],
        filterLogic: "and",
        filters: [filter("sla-over-30-days", "durationHours", "greaterThan", "720")],
        dateField: null,
        asOf: null,
        metric: "count",
        groupBy: "none",
        sortBy: "durationHours",
        sortDirection: "desc",
        visualization: "table",
        width: "full",
      },
      {
        id: "retro-critical-blocker-task-sla-45-days",
        title: "Задачи: нарушение SLA 45 дней Critical/Blocker",
        ...criticalTaskSla,
        placement: "retro",
        selectedFields: ["issueKey", "summary", "project", "issueType", "priority", "assignee", "status", "criticalPriorityAt", "resolutionAt", "durationHours", "resolution"],
        filterLogic: "and",
        filters: [filter("task-sla-over-45-days", "durationHours", "greaterThan", "1080")],
        dateField: null,
        asOf: null,
        metric: "count",
        groupBy: "none",
        sortBy: "durationHours",
        sortDirection: "desc",
        visualization: "table",
        width: "full",
      },
      {
        id: "retro-more-than-three-sprints",
        title: "Более 3 записей в Sprint",
        ...issues,
        placement: "retro",
        selectedFields: ["issueKey", "summary", "status", "assignee", "sprint", "sprintCount"],
        filterLogic: "and",
        filters: [filter("more-than-three-sprints", "sprintCount", "greaterThan", "3")],
        dateField: null,
        asOf: null,
        metric: "count",
        groupBy: "none",
        sortBy: "sprintCount",
        sortDirection: "desc",
        visualization: "table",
        width: "full",
      },
      {
        id: "retro-p85-in-progress-to-resolution-by-project",
        title: "P85 от первого In Progress до Resolution по проектам",
        ...inProgressResolution,
        placement: "retro",
        selectedFields: ["issueKey", "project", "summary", "issueType", "status", "assignee", "intervalStartAt", "intervalEndAt", "durationHours", "resolution"],
        filterLogic: "and",
        filters: [],
        dateField: "intervalEndAt",
        asOf: null,
        metric: "p85Duration",
        groupBy: "project",
        sortBy: "durationHours",
        sortDirection: "desc",
        visualization: "bar",
        width: "full",
      },
    ],
  };
}

export function jiraDashboardWithDefaultWidgets(
  current: JiraSemanticDashboard,
  defaults: JiraSemanticDashboard,
): JiraSemanticDashboard {
  const existingIds = new Set(current.widgets.map((widget) => widget.id));
  return {
    ...current,
    widgets: [
      ...current.widgets,
      ...defaults.widgets.filter((widget) => !existingIds.has(widget.id)),
    ],
  };
}

export function jiraDashboardWithDefaultWidgetsForSeedVersion(
  current: JiraSemanticDashboard,
  defaults: JiraSemanticDashboard,
  currentSeedVersion: number,
): JiraSemanticDashboard {
  if (currentSeedVersion < 1) return jiraDashboardWithDefaultWidgets(current, defaults);
  if (currentSeedVersion >= 2) return current;
  return jiraDashboardWithDefaultWidgets(current, {
    ...defaults,
    widgets: defaults.widgets.filter((widget) => JIRA_SEMANTIC_WIDGET_IDS_ADDED_IN_VERSION_2.has(widget.id)),
  });
}

export function jiraDashboardWithCurrentSystemAggregateRevisions(
  dashboard: JiraSemanticDashboard,
  references: readonly SystemAggregateReference[],
): JiraSemanticDashboard {
  const versions = new Map(references.flatMap((reference) => reference.publishedVersion === null
    ? []
    : [[reference.id, reference.publishedVersion] as const]));
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((widget) => versions.has(widget.aggregateId)
      ? { ...widget, aggregateVersion: versions.get(widget.aggregateId)! }
      : widget),
  };
}

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
  if (definition.rowConfig.kind === "criticalSla" || definition.rowConfig.kind === "criticalRisk") return "criticalBugs" as const;
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

function withCurrentTicketFields(definition: JiraSemanticAggregateDefinition) {
  const existing = new Set(definition.outputFields.map((field) => field.key));
  const required = definition.rowConfig.kind === "issue"
    ? (["sprintCount", "labels"] as const)
    : (["labels"] as const);
  const added = required
    .filter((field) => !existing.has(field))
    .map(jiraSemanticDefaultOutputField);
  if (added.length === 0) return definition;
  return {
    ...definition,
    outputFields: [...definition.outputFields, ...added],
  } satisfies JiraSemanticAggregateDefinition;
}

export async function ensureJiraSystemSemanticAggregates(client: PrismaClient, projectId: string) {
  await client.$transaction(async (transaction) => {
    await lockJiraAggregateProject(transaction, projectId);
    const references: SystemAggregateReference[] = [];
    for (const aggregate of JIRA_SYSTEM_SEMANTIC_AGGREGATES) {
      let row = await transaction.jiraAggregateDefinition.upsert({
        where: { projectId_aggregateKey: { projectId, aggregateKey: aggregate.key } },
        create: definitionData(projectId, aggregate.key, aggregate.definition, true),
        update: {},
      });
      references.push(row);
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
      if (row.publishedVersion !== null) {
        const publishedRevision = await transaction.jiraAggregateDefinitionRevision.findUnique({
          where: { aggregateId_version: { aggregateId: row.id, version: row.publishedVersion } },
        });
        const publishedDefinition = parsedDefinition(publishedRevision?.definition);
        const upgradedPublished = publishedDefinition
          ? withCurrentTicketFields(publishedDefinition)
          : null;
        if (
          publishedRevision
          && publishedDefinition
          && upgradedPublished
          && upgradedPublished !== publishedDefinition
        ) {
          const hasDraft = row.version !== row.publishedVersion;
          const publishedVersion = row.version + 1;
          await transaction.jiraAggregateDefinitionRevision.create({
            data: {
              projectId,
              aggregateId: row.id,
              version: publishedVersion,
              definition: upgradedPublished as unknown as Prisma.InputJsonObject,
              fingerprint: hash(upgradedPublished),
              status: "published",
              changeKind: "compatible",
              publishedAt: new Date(),
            },
          });
          if (hasDraft) {
            const draftDefinition = withCurrentTicketFields(parsedDefinition(row.draftDefinition) ?? upgradedPublished);
            const draftVersion = publishedVersion + 1;
            await transaction.jiraAggregateDefinitionRevision.updateMany({
              where: { aggregateId: row.id, version: row.version, status: "draft" },
              data: { status: "archived" },
            });
            await transaction.jiraAggregateDefinitionRevision.create({
              data: {
                projectId,
                aggregateId: row.id,
                version: draftVersion,
                definition: draftDefinition as unknown as Prisma.InputJsonObject,
                fingerprint: hash(draftDefinition),
                status: "draft",
                changeKind: jiraSemanticCompatibleChange(upgradedPublished, draftDefinition) ? "compatible" : "breaking",
              },
            });
            row = await transaction.jiraAggregateDefinition.update({
              where: { id: row.id },
              data: {
                ...jiraSemanticDefinitionUpdateData(draftDefinition, draftVersion),
                publishedVersion,
                exposedFields: draftDefinition.outputFields.map((field) => field.key),
              },
            });
          } else {
            row = await transaction.jiraAggregateDefinition.update({
              where: { id: row.id },
              data: {
                ...jiraSemanticDefinitionUpdateData(upgradedPublished, publishedVersion),
                publishedVersion,
                exposedFields: upgradedPublished.outputFields.map((field) => field.key),
              },
            });
          }
        }
      }
      references[references.length - 1] = row;
    }
    const settings = await transaction.jiraAnalyticsSettings.findUnique({ where: { projectId } });
    if ((settings?.semanticDefaultWidgetsVersion ?? 0) < JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION) {
      const parsedDashboard = jiraSemanticDashboardSchema.safeParse(settings?.dashboardConfig);
      if (settings?.dashboardConfig != null && !parsedDashboard.success) return;
      const currentDashboard = parsedDashboard.success ? parsedDashboard.data : JIRA_SEMANTIC_EMPTY_DASHBOARD;
      const seededDashboard = jiraDashboardWithDefaultWidgetsForSeedVersion(
        currentDashboard,
        jiraDefaultSemanticDashboard(references),
        settings?.semanticDefaultWidgetsVersion ?? 0,
      );
      const dashboardConfig = jiraDashboardWithCurrentSystemAggregateRevisions(
        seededDashboard,
        references,
      ) as unknown as Prisma.InputJsonObject;
      await transaction.jiraAnalyticsSettings.upsert({
        where: { projectId },
        create: {
          projectId, jiraScopeType: "LABEL", jiraScopeValue: "", dashboardConfig,
          semanticDefaultWidgetsVersion: JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION,
        },
        update: { dashboardConfig, semanticDefaultWidgetsVersion: JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION },
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
    criticalRiskConfig: definition.rowConfig.kind === "criticalRisk"
      ? {
          priorities: definition.rowConfig.priorities,
          bugIssueTypes: definition.rowConfig.bugIssueTypes,
          bugSlaHours: definition.rowConfig.bugSlaHours,
          bugWarningHours: definition.rowConfig.bugWarningHours,
          taskIssueTypes: definition.rowConfig.taskIssueTypes,
          taskRiskHours: definition.rowConfig.taskRiskHours,
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
