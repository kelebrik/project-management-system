import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticCompatibleChange,
  jiraSemanticDashboardSchema,
  jiraSemanticWidgetSchema,
} from "@pms/shared";
import { Prisma } from "@prisma/client";

import {
  JIRA_SYSTEM_SEMANTIC_AGGREGATES,
  jiraSemanticAggregateCost,
  jiraSemanticCreateData,
  jiraDefaultSemanticDashboard,
  jiraDashboardWithDefaultWidgets,
  jiraDashboardWithDefaultWidgetsForSeedVersion,
  jiraDashboardWithCurrentSystemAggregateRevisions,
  jiraSemanticExecutableDefinition,
  withCurrentTicketFields,
} from "./jira-semantic-aggregates.js";

test("semantic catalog exposes the managed Jira row sets", () => {
  assert.deepEqual(
    JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate) => aggregate.key),
    [
      "issues",
      "goal-linked-issues",
      "status-transitions",
      "development-activity",
      "status-intervals",
      "critical-blocker-sla",
      "critical-blocker-task-sla",
      "critical-blocker-risk",
      "in-progress-resolution",
      "gitlab-branch-commits",
    ],
  );
  for (const aggregate of JIRA_SYSTEM_SEMANTIC_AGGREGATES) {
    assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse(aggregate.definition).success, true);
    assert.equal("metric" in aggregate.definition, false);
    assert.equal("groupBy" in aggregate.definition, false);
    assert.equal("visualization" in aggregate.definition, false);
    assert.equal("placement" in aggregate.definition, false);
    if (aggregate.definition.rowConfig.kind !== "gitlabBranchCommit") {
      assert.ok(
        aggregate.definition.outputFields.some((field) => field.key === "labels"),
        `${aggregate.key} must expose ticket labels`,
      );
    }
  }
});

test("system aggregate compatibility upgrades remain valid for every source", () => {
  for (const aggregate of JIRA_SYSTEM_SEMANTIC_AGGREGATES) {
    const upgraded = withCurrentTicketFields(aggregate.definition);
    const parsed = jiraSemanticAggregateDefinitionSchema.safeParse(upgraded);
    assert.equal(parsed.success, true, `${aggregate.key} compatibility upgrade must remain valid`);
    if (aggregate.definition.rowConfig.kind === "gitlabBranchCommit") {
      assert.deepEqual(upgraded, aggregate.definition);
    }
  }
});

test("semantic widget keeps display widths selected while allowing hidden query fields", () => {
  const baseWidget = {
    id: "widget-1",
    title: "Тикеты",
    aggregateId: "aggregate-1",
    aggregateVersion: 1,
    placement: "active",
    selectedFields: ["issueKey", "summary"],
    filterLogic: "and",
    filters: [],
    dateField: null,
    asOf: null,
    metric: "count",
    groupBy: "none",
    sortBy: "default",
    sortDirection: "desc",
    visualization: "table",
    width: "full",
  } as const;

  assert.equal(jiraSemanticWidgetSchema.safeParse(baseWidget).success, true);
  assert.equal(jiraSemanticWidgetSchema.safeParse({ ...baseWidget, columnWidths: {} }).success, true);
  assert.equal(jiraSemanticWidgetSchema.safeParse({ ...baseWidget, columnWidths: { issueKey: 120, summary: 360 } }).success, true);
  assert.equal(jiraSemanticWidgetSchema.safeParse({ ...baseWidget, columnWidths: { issueKey: 40 } }).success, false);
  assert.equal(jiraSemanticWidgetSchema.safeParse({ ...baseWidget, columnWidths: { issueKey: 601 } }).success, false);
  assert.equal(jiraSemanticWidgetSchema.safeParse({ ...baseWidget, columnWidths: { status: 120 } }).success, false);
  assert.equal(jiraSemanticWidgetSchema.safeParse({ ...baseWidget, columnWidths: { unknown: 120 } }).success, false);
  assert.equal(jiraSemanticWidgetSchema.safeParse({
    ...baseWidget,
    filters: [{ id: "hidden-filter", field: "labels", operator: "equals", value: "MP" }],
    dateField: "updatedAt",
  }).success, true);
});

test("default semantic dashboard contains the requested operational and retrospective widgets", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: aggregate.key === "issues" ? 2 : 1,
  }));
  const dashboard = jiraDefaultSemanticDashboard(references);
  assert.equal(dashboard.widgets.length, 10);
  assert.deepEqual(dashboard.widgets.map((widget) => [widget.placement, widget.title]), [
    ["active", "Коммиты ветки без упоминания Jira"],
    ["active", "Цель: Релиз заводской прошивки"],
    ["active", "Цель: Первая ОТА готова"],
    ["active", "Без Sprint с коммитами или MR"],
    ["active", "Не перешли в In Progress за 12 дней"],
    ["active", "Тикеты под риском"],
    ["retro", "Баги: нарушение SLA 30 дней Critical/Blocker"],
    ["retro", "Задачи: нарушение SLA 45 дней Critical/Blocker"],
    ["retro", "Более 3 записей в Sprint"],
    ["retro", "P85 от первого In Progress до Resolution по проектам"],
  ]);
  const delayed = dashboard.widgets.find((widget) => widget.id === "active-not-in-progress-after-12-days")!;
  assert.ok(delayed.filters.some((item) => item.field === "intervalEndAt" && item.operator === "empty"));
  assert.ok(delayed.filters.some((item) => item.field === "durationHours" && item.value === "288"));
  for (const id of ["active-goal-factory-firmware-release", "active-goal-first-ota-ready"]) {
    const goal = dashboard.widgets.find((widget) => widget.id === id)!;
    assert.equal(goal.visualization, "table");
    assert.ok(goal.filters.some((item) => item.field === "matchedLabels" && item.operator === "equals"));
    assert.ok(goal.filters.some((item) => item.field === "priority" && item.operator === "oneOf" && item.value === "Critical, Blocker"));
    assert.ok(goal.filters.some((item) => item.field === "resolution" && item.operator === "empty"));
  }
  assert.ok(dashboard.widgets.find((widget) => widget.id === "active-goal-factory-firmware-release")!
    .filters.some((item) => item.field === "matchedLabels" && item.value === "MP"));
  assert.ok(dashboard.widgets.find((widget) => widget.id === "active-goal-first-ota-ready")!
    .filters.some((item) => item.field === "matchedLabels" && item.value === "ota"));
  const taskSla = dashboard.widgets.find((widget) => widget.id === "retro-critical-blocker-task-sla-45-days")!;
  assert.ok(taskSla.filters.some((item) => item.field === "durationHours" && item.value === "1080"));
  const risk = dashboard.widgets.find((widget) => widget.id === "active-critical-blocker-risk")!;
  assert.ok(risk.filters.some((item) => item.field === "resolution" && item.operator === "empty"));
  assert.ok(risk.filters.some((item) => item.field === "status" && item.operator === "notEquals"));
  const sprintHistory = dashboard.widgets.find((widget) => widget.id === "retro-more-than-three-sprints")!;
  assert.equal(sprintHistory.aggregateVersion, 2);
  assert.ok(sprintHistory.filters.some((item) => item.field === "sprintCount" && item.operator === "greaterThan" && item.value === "3"));
  const p85 = dashboard.widgets.find((widget) => widget.id === "retro-p85-in-progress-to-resolution-by-project")!;
  assert.equal(p85.metric, "p85Duration");
  assert.equal(p85.groupBy, "project");
  assert.equal(p85.visualization, "bar");
});

test("default widgets augment an existing dashboard once without replacing its widgets", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: 1,
  }));
  const defaults = jiraDefaultSemanticDashboard(references);
  const existing = {
    ...defaults,
    widgets: [{ ...defaults.widgets[0]!, id: "custom-widget", title: "Пользовательский виджет" }],
  };
  const merged = jiraDashboardWithDefaultWidgets(existing, defaults);
  assert.equal(merged.widgets.length, 11);
  assert.equal(merged.widgets[0]?.id, "custom-widget");
  assert.equal(jiraDashboardWithDefaultWidgets(merged, defaults).widgets.length, 11);
});

test("widget seed v2 adds only new widgets and does not recreate deleted v1 defaults", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: 1,
  }));
  const defaults = jiraDefaultSemanticDashboard(references);
  const current = {
    ...defaults,
    widgets: [{ ...defaults.widgets[0]!, id: "custom-widget", title: "Пользовательский виджет" }],
  };
  const upgraded = jiraDashboardWithDefaultWidgetsForSeedVersion(current, defaults, 1);

  assert.deepEqual(upgraded.widgets.map((widget) => widget.id), [
    "custom-widget",
    "active-gitlab-unlinked-branch-commits",
    "active-goal-factory-firmware-release",
    "active-goal-first-ota-ready",
    "active-critical-blocker-risk",
    "retro-critical-blocker-task-sla-45-days",
    "retro-p85-in-progress-to-resolution-by-project",
  ]);
  assert.equal(jiraDashboardWithDefaultWidgetsForSeedVersion(upgraded, defaults, 1).widgets.length, 7);
});

test("widget seed v4 adds only goal widgets without recreating deleted widgets", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: 1,
  }));
  const defaults = jiraDefaultSemanticDashboard(references);
  const current = {
    ...defaults,
    widgets: [{ ...defaults.widgets[0]!, id: "custom-widget", title: "Пользовательский виджет" }],
  };

  assert.deepEqual(jiraDashboardWithDefaultWidgetsForSeedVersion(current, defaults, 3).widgets.map((widget) => widget.id), [
    "custom-widget",
    "active-gitlab-unlinked-branch-commits",
    "active-goal-factory-firmware-release",
    "active-goal-first-ota-ready",
  ]);
});

test("widget seed v5 adds only the GitLab branch widget", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: 1,
  }));
  const defaults = jiraDefaultSemanticDashboard(references);
  const current = {
    ...defaults,
    widgets: [{ ...defaults.widgets[1]!, id: "custom-widget", title: "Пользовательский виджет" }],
  };
  assert.deepEqual(jiraDashboardWithDefaultWidgetsForSeedVersion(current, defaults, 4).widgets.map((widget) => widget.id), [
    "custom-widget",
    "active-gitlab-unlinked-branch-commits",
  ]);
});

test("widget seed v6 repairs goal filters without recreating deleted widgets or replacing presentation", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: 1,
  }));
  const defaults = jiraDefaultSemanticDashboard(references);
  const factory = defaults.widgets.find((widget) => widget.id === "active-goal-factory-firmware-release")!;
  const current = {
    ...defaults,
    widgets: defaults.widgets
      .filter((widget) => widget.id !== "active-goal-first-ota-ready")
      .map((widget) => widget.id === factory.id
        ? {
            ...widget,
            title: "Моя заводская прошивка",
            filterLogic: "or" as const,
            selectedFields: ["goalName", "issueKey", "summary"],
            filters: [{ id: "custom-project", field: "project" as const, operator: "equals" as const, value: "CVTE" }],
            columnWidths: { issueKey: 180 },
          }
        : widget),
  };

  const upgraded = jiraDashboardWithDefaultWidgetsForSeedVersion(current, defaults, 5);
  const repaired = upgraded.widgets.find((widget) => widget.id === factory.id)!;
  assert.equal(repaired.title, "Моя заводская прошивка");
  assert.deepEqual(repaired.columnWidths, { issueKey: 180 });
  assert.equal(repaired.filterLogic, "and");
  assert.deepEqual(repaired.filters, [...factory.filters, ...current.widgets.find((widget) => widget.id === factory.id)!.filters]);
  assert.equal(jiraSemanticDashboardSchema.safeParse(upgraded).success, true);
  assert.equal(upgraded.widgets.some((widget) => widget.id === "active-goal-first-ota-ready"), false);
});

test("widget seed v6 leaves already-upgraded and repointed widgets untouched", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: 1,
  }));
  const defaults = jiraDefaultSemanticDashboard(references);
  const factory = defaults.widgets.find((widget) => widget.id === "active-goal-factory-firmware-release")!;
  const repointed = {
    ...defaults,
    widgets: defaults.widgets.map((widget) => widget.id === factory.id
      ? { ...widget, aggregateId: references.find((reference) => reference.aggregateKey === "issues")!.id, filters: [] }
      : widget),
  };

  assert.deepEqual(jiraDashboardWithDefaultWidgetsForSeedVersion(defaults, defaults, 6), defaults);
  assert.deepEqual(jiraDashboardWithDefaultWidgetsForSeedVersion(repointed, defaults, 5), repointed);
});

test("widget seed v3 repins existing system widgets to compatible published revisions", () => {
  const references = JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate, index) => ({
    id: `aggregate-${index + 1}`,
    aggregateKey: aggregate.key,
    publishedVersion: index + 2,
  }));
  const dashboard = {
    ...jiraDefaultSemanticDashboard(references),
    widgets: jiraDefaultSemanticDashboard(references).widgets.map((widget) => ({
      ...widget,
      aggregateVersion: 1,
    })),
  };
  const upgraded = jiraDashboardWithCurrentSystemAggregateRevisions(dashboard, references);

  for (const widget of upgraded.widgets) {
    assert.equal(
      widget.aggregateVersion,
      references.find((reference) => reference.id === widget.aggregateId)?.publishedVersion,
    );
  }
});

test("semantic interval maps typed anchors without widget presentation", () => {
  const source = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "status-intervals")!;
  const definition = structuredClone(source.definition);
  if (definition.rowConfig.kind !== "interval") throw new Error("expected interval");
  definition.rowConfig.start = {
    type: "priorityEntry",
    priorities: ["Critical", "Blocker"],
    occurrence: "first",
  };
  definition.rowConfig.end = { type: "resolution", occurrence: "first" };

  const executable = jiraSemanticExecutableDefinition(definition, {
    metric: "count",
    groupBy: "project",
    filters: [],
    filterLogic: "and",
    periodDays: null,
    dateField: null,
    sortBy: "default",
    sortDirection: "desc",
  });

  assert.deepEqual(executable.rowConfig, {
    kind: "statusInterval",
    start: { anchor: "criticalPriority", occurrence: "first" },
    end: { anchor: "resolution", occurrence: "first" },
    pairing: "nextAfterStart",
    openIntervals: "include",
    periodAnchor: "start",
  });
  assert.equal(executable.metric, "count");
  assert.equal(executable.groupBy, "project");
});

test("semantic status entry includes the synthetic status observed at issue creation", () => {
  const source = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "status-intervals")!;
  const executable = jiraSemanticExecutableDefinition(source.definition, {
    metric: "count",
    groupBy: "none",
    filters: [],
    filterLogic: "and",
    periodDays: null,
    dateField: null,
    sortBy: "default",
    sortDirection: "desc",
  });

  assert.deepEqual(executable.rowConfig, {
    kind: "statusInterval",
    start: { anchor: "issueCreated", occurrence: "first" },
    end: { anchor: "firstStatusEntry", statuses: ["In Progress"], occurrence: "first" },
    pairing: "nextAfterStart",
    openIntervals: "include",
    periodAnchor: "start",
  });
});

test("semantic aggregate rejects presentation and unsupported priority history", () => {
  const source = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "status-intervals")!;
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse({
    ...source.definition,
    metric: "count",
  }).success, false);

  const definition = structuredClone(source.definition);
  if (definition.rowConfig.kind !== "interval") throw new Error("expected interval");
  definition.rowConfig.start = {
    type: "priorityEntry",
    priorities: ["Critical", "Blocker"],
    occurrence: "last",
  };
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse(definition).success, false);

  const invalidFieldType = structuredClone(source.definition);
  const duration = invalidFieldType.outputFields.find((field) => field.key === "durationHours")!;
  duration.type = "date";
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse(invalidFieldType).success, false);

  const repeatedIdentity = structuredClone(source.definition);
  repeatedIdentity.rowIdentity = ["rowId", "rowId"];
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse(repeatedIdentity).success, false);
});

test("semantic SLA accepts configured bug and task types", () => {
  const source = structuredClone(JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "critical-blocker-sla")!.definition);
  if (source.rowConfig.kind !== "criticalSla") throw new Error("expected SLA");
  source.rowConfig.issueTypes = ["Task"];
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse(source).success, true);
  source.rowConfig.issueTypes = ["Bug-Report", "Ошибка: Production"];
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse(source).success, true);
});

test("non-interval semantic aggregates persist SQL NULL in the legacy rowConfig column", () => {
  const issues = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "issues")!;
  const data = jiraSemanticCreateData("project-1", "custom-issues", issues.definition);
  assert.equal(data.rowConfig, Prisma.DbNull);
});

test("semantic aggregate exposes only completeness and as-of modes implemented by the datalake", () => {
  const transition = structuredClone(JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "status-transitions")!.definition);
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse({
    ...transition,
    incompleteDataPolicy: "includeWithWarning",
  }).success, false);
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse({
    ...transition,
    asOfSupport: "supported",
  }).success, false);

  const issues = structuredClone(JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "issues")!.definition);
  assert.equal(jiraSemanticAggregateDefinitionSchema.safeParse({
    ...issues,
    incompleteDataPolicy: "exclude",
  }).success, false);
});

test("semantic cost estimate does not reject ordinary single-row intervals", () => {
  const interval = structuredClone(JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "status-intervals")!.definition);
  const single = jiraSemanticAggregateCost(interval, 1_000);
  assert.deepEqual(single, {
    tickets: 1_000,
    transitions: 1_000,
    developmentActivities: 1_000,
    goals: 1,
    estimatedRows: 1_000,
    maximumRows: 100_000,
    blocked: false,
  });

  if (interval.rowConfig.kind !== "interval") throw new Error("expected interval");
  interval.rowConfig.start = { ...interval.rowConfig.start, occurrence: "all" };
  const repeated = jiraSemanticAggregateCost(interval, {
    tickets: 1_001,
    transitions: 8_000,
    developmentActivities: 2_000,
    goals: 4,
  });
  assert.equal(repeated.estimatedRows, 9_001);
  assert.equal(repeated.blocked, false);
});

test("semantic cost estimate accounts for every configured goal-to-ticket match", () => {
  const goalIssues = structuredClone(JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "goal-linked-issues")!.definition);
  const cost = jiraSemanticAggregateCost(goalIssues, {
    tickets: 1_000,
    transitions: 8_000,
    developmentActivities: 2_000,
    goals: 25,
  });
  assert.equal(cost.estimatedRows, 25_000);
  assert.equal(cost.goals, 25);
  assert.equal(cost.blocked, false);
});

test("semantic revision compatibility protects row meaning and allows added output fields", () => {
  const source = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === "issues")!;
  const addedField = {
    ...source.definition,
    outputFields: [
      ...source.definition.outputFields,
      { key: "eventAt" as const, label: "Дата события", type: "date" as const, nullable: true },
    ],
  };
  const changedPopulation = {
    ...source.definition,
    basePopulation: {
      logic: "and" as const,
      filters: [{ id: "status", field: "status" as const, operator: "equals" as const, value: "Open" }],
    },
  };

  assert.equal(jiraSemanticCompatibleChange(source.definition, addedField), true);
  assert.equal(jiraSemanticCompatibleChange(source.definition, changedPopulation), false);
  assert.equal(jiraSemanticCompatibleChange(source.definition, { ...source.definition, timeZone: "UTC" }), false);
  assert.equal(jiraSemanticCompatibleChange(source.definition, {
    ...source.definition,
    qualityRules: { ...source.definition.qualityRules, maximumRows: 50_000 },
  }), false);
});

test("production router registers only semantic aggregate API", () => {
  const source = fs.readFileSync(new URL("../routes/issues.routes.ts", import.meta.url), "utf8");
  assert.match(source, /registerJiraSemanticAggregateRoutes\(router\)/);
  assert.doesNotMatch(source, /registerJiraAggregateRoutes\(router\)/);
});

test("semantic aggregate mutations serialize project changes and system seeding is idempotent", () => {
  const route = fs.readFileSync(new URL("../routes/jira-semantic-aggregates.routes.ts", import.meta.url), "utf8");
  const service = fs.readFileSync(new URL("./jira-semantic-aggregates.ts", import.meta.url), "utf8");
  assert.ok((route.match(/lockJiraAggregateProject\(transaction, req\.params\.projectId\)/g) ?? []).length >= 4);
  assert.match(route, /lockJiraAggregateProject\(transaction, project\.id\)/);
  assert.match(service, /jiraAggregateDefinition\.upsert/);
  assert.match(service, /jiraAggregateDefinitionRevision\.upsert/);
  assert.match(service, /dashboardConfig != null && !parsedDashboard\.success/);
  const listStart = service.indexOf("export async function listJiraSemanticAggregates");
  const listEnd = service.indexOf("export function jiraSemanticAggregateSource", listStart);
  assert.doesNotMatch(service.slice(listStart, listEnd), /ensureJiraSystemSemanticAggregates/u);
  assert.doesNotMatch(route, /from ["']\.\.\/jira/u);
  assert.doesNotMatch(route, /\bpayload\s*:\s*true\b/u);
});
