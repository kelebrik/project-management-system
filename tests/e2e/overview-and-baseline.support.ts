import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  jiraSemanticDefaultOutputField,
  jiraAnalyticsSourceUsesPeriod,
} from "@pms/shared";

const today = new Date();

export function isoDay(offset: number) {
  const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return value.toISOString().slice(0, 10);
}
export function projectFixture() {
  const wbsItem = {
    id: "wbs-1",
    parentId: null,
    code: "1.1",
    title: "Тестовая задача",
    type: "TASK",
    status: "IN_PROGRESS",
    owner: "Руководитель проекта",
    startDate: isoDay(-3),
    dueDate: isoDay(5),
    baselineStartDate: isoDay(-5),
    baselineDueDate: isoDay(3),
    forecastStartDate: isoDay(-3),
    forecastDueDate: isoDay(5),
    wbsLevel: 2,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: 0,
    workDays: 7,
    calendarDays: 9,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: 7,
    planCalendarDays: 9,
    calendarCode: "RU",
    templateColor: null,
    priority: null,
    effortPercent: 100,
    plannedCost: "0",
    forecastCost: "0",
    progress: 50,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    mattermostUrl: null,
    description: null,
    comment: "Проверить результат",
    closedAt: null,
    sortOrder: 10,
  };
  const risk = {
    id: "risk-1",
    type: "RISK",
    title: "Риск интеграции",
    description: "",
    owner: "РП",
    status: "OPEN",
    probability: 4,
    impact: 4,
    riskScore: 16,
    mitigationPlan: null,
    contingencyPlan: null,
    dueDate: isoDay(4),
    residualRisk: 8,
    validationDate: null,
    linkedRiskId: null,
    dependencyType: null,
    predecessor: null,
    successor: null,
    supplier: null,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    decisionRequired: true,
    escalationLevel: "",
    scheduleImpactDays: 2,
    budgetImpact: "0",
    statusUpdates: [
      {
        id: "risk-status-2",
        raidItemId: "risk-1",
        statusAt: isoDay(-1),
        text: "Получено подтверждение поставщика",
        createdAt: `${isoDay(-1)}T10:00:00.000Z`,
        updatedAt: `${isoDay(-1)}T10:00:00.000Z`,
      },
      {
        id: "risk-status-1",
        raidItemId: "risk-1",
        statusAt: isoDay(-3),
        text: "Запрошен план поставки",
        createdAt: `${isoDay(-3)}T10:00:00.000Z`,
        updatedAt: `${isoDay(-3)}T10:00:00.000Z`,
      },
    ],
  };
  const issue = {
    id: "issue-1",
    phaseId: null,
    workPackageId: null,
    riskId: null,
    source: "INTERNAL",
    category: "Организационные задачи",
    title: "Согласовать дату запуска",
    referenceLabel: "Протокол комитета",
    referenceUrl: "https://example.test/launch-meeting",
    severity: "HIGH",
    readiness: "AMBER",
    status: "Open",
    owner: "РП",
    impact: "Сдвиг запуска",
    decisionRequired: true,
    dueDate: isoDay(2),
    initialDueDate: isoDay(2),
    closedDelayDays: null,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    threadLinks: [
      {
        id: "thread-link-1",
        issueId: "issue-1",
        threadUrl: "https://example.test/launch-meeting",
        createdAt: `${isoDay(-2)}T09:00:00.000Z`,
      },
    ],
    jiraLinks: [],
    statusUpdates: [
      {
        id: "issue-status-2",
        issueId: "issue-1",
        statusAt: isoDay(-1),
        text: "Решение вынесено на комитет",
        createdAt: `${isoDay(-1)}T11:00:00.000Z`,
        updatedAt: `${isoDay(-1)}T11:00:00.000Z`,
      },
      {
        id: "issue-status-1",
        issueId: "issue-1",
        statusAt: isoDay(-2),
        text: "Подготовлены варианты даты",
        createdAt: `${isoDay(-2)}T11:00:00.000Z`,
        updatedAt: `${isoDay(-2)}T11:00:00.000Z`,
      },
    ],
  };
  return {
    id: "project-1",
    parentId: null,
    code: "TV-OVERVIEW",
    name: "Проект обзора",
    portfolio: "Основной",
    sponsor: "Заказчик",
    projectManager: "Руководитель проекта",
    status: "ACTIVE",
    rag: "RED",
    startDate: isoDay(-30),
    initialTargetDate: isoDay(30),
    targetDate: isoDay(30),
    progress: 50,
    scheduleVariance: 2,
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "",
    sortOrder: 0,
    uiState: {
      wbsColumnWidths: {
        jiraTicketUrl: 220,
        mattermostUrl: 260,
      },
      currentWorkColumnWidths: {
        workPackage: 180,
      },
    },
    jiraIntegration: null,
    jiraAnalyticsSettings: {
      jiraScopeType: "LABEL",
      jiraScopeValue: "cvte968",
      dashboardConfig: null,
      syncStatus: "CONFIGURED",
      lastSyncedAt: null,
    },
    targetDateChanges: [],
    wbsItems: [wbsItem],
    raidItems: [risk],
    currentUserAccessLevel: "ADMIN",
    _count: { tasks: 1, issues: 1, jiraSnapshots: 0 },
    tasks: [],
    issues: [issue],
    closedIssues: [],
    jiraWorkSections: [],
    overviews: [],
    milestones: [],
    wbsDependencies: [],
    criticalPath: null,
    calendarOverrides: [],
    artifacts: [],
    changeRequests: [],
  };
}

export async function mockAdminProject(
  page: Page,
  customize?: (project: ReturnType<typeof projectFixture>) => void,
) {
  const project = projectFixture();
  customize?.(project);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "admin-1",
          email: "admin@example.test",
          name: "Администратор",
          role: "ADMIN",
          isActive: true,
          lastLoginAt: null,
        },
      },
    }),
  );
  await page.route("**/api/auth/keycloak/status", (route) =>
    route.fulfill({ json: { enabled: false, hostname: null } }),
  );
  await page.route(/\/api\/projects$/, (route) => route.fulfill({ json: [project] }));
  await page.route("**/api/projects/project-1/overview", (route) =>
    route.fulfill({ json: project }),
  );
  return project;
}

export async function mockManagedJiraAnalytics(
  page: Page,
  project: ReturnType<typeof projectFixture>,
) {
  const evaluatedAt = `${isoDay(0)}T12:00:00.000Z`;
  const aggregateDefinitions = JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1.widgets.map(
    (widget, index) => ({
      id: index === 0 ? "aggregate-unplanned" : `aggregate-${widget.id}`,
      projectId: project.id,
      name: index === 0 ? "Работа вне плана" : widget.title,
      description: index === 0 ? "Тикеты без Sprint с активностью разработки" : "",
      source: widget.source,
      rowConfig: null,
      timeZone: "Europe/Moscow" as const,
      sortOrder: index,
      fingerprint: String(index).padStart(64, "a"),
      version: 1,
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
    }),
  );
  const aggregate = aggregateDefinitions[0];
  const currentStoredDashboard = () => project.jiraAnalyticsSettings.dashboardConfig as {
    version?: number;
    periodDays?: 30 | 90 | 180 | 365;
    assignee?: string;
    widgets?: Array<Record<string, unknown>>;
  } | null;
  const currentEditableConfig = () => {
    const storedDashboard = currentStoredDashboard();
    return storedDashboard?.version === 4
      ? storedDashboard
      : storedDashboard?.version === 3
        ? {
            ...storedDashboard,
            version: 4,
            widgets: (storedDashboard.widgets ?? []).map((widget) => {
              const definition = aggregateDefinitions.find(
                (item) => item.id === widget.aggregateId,
              ) ?? aggregate;
              return {
                ...widget,
                selectedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[definition.source]],
                baseFilterLogic: "and",
                baseFilters: [],
              };
            }),
          }
        : storedDashboard?.version === 1
        ? {
            version: 4,
            periodDays: storedDashboard.periodDays ?? 90,
            assignee: storedDashboard.assignee ?? "",
            widgets: JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1.widgets.map((widget, index) => ({
              id: widget.id,
              title: widget.title,
              aggregateId: aggregateDefinitions[index].id,
              aggregateVersion: widget.section === "retro" ? 1 : null,
              placement: widget.section,
              selectedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[widget.source]],
              baseFilterLogic: widget.filterLogic,
              baseFilters: widget.filters,
              metric: widget.metric,
              groupBy: widget.groupBy,
              filterLogic: widget.filterLogic,
              filters: widget.filters,
              periodMode: jiraAnalyticsSourceUsesPeriod(widget.source) ? "DASHBOARD" : "NONE",
              periodDays: null,
              sortBy: "default",
              sortDirection: "desc",
              visualization: widget.visualization,
              width: widget.width,
            })),
          }
        : null;
  };
  const record = {
    id: "issue:jira-snapshot-1",
    source: "issues",
    issue: {
      id: "jira-snapshot-1",
      issueKey: "TV-101",
      issueUrl: "https://tasks.sberdevices.ru/browse/TV-101",
      summary: "Собрать аналитический дашборд",
      status: "In Progress",
      priority: "Critical",
      assignee: "Разработчик",
      reporter: "Руководитель",
      issueType: "Bug",
      resolution: null,
      resolutionAt: null,
      sprint: null,
      issueCreatedAt: isoDay(-10),
      criticalPriorityAt: isoDay(-40),
      criticalSlaTracked: true,
      commitCount: 3,
      mergeRequestCount: 1,
      developmentUpdatedAt: isoDay(-1),
      developmentDataAvailable: true,
      developmentBaselineCaptured: true,
      transitionHistoryComplete: true,
      updatedAt: isoDay(-1),
      syncedAt: isoDay(0),
    },
    eventAt: `${isoDay(-1)}T12:00:00.000Z`,
    durationHours: 120,
    commitCount: 3,
    mergeRequestCount: 1,
    fromStatus: "Open",
    toStatus: "In Progress",
    sprint: null,
  };
  const evaluationResult = (source = "issues", metric = "count", groupBy = "none") => ({
    evaluatedAt,
    effective: {
      periodDays: source === "transitions" || source === "development" ? 90 : null,
      periodSource: source === "transitions" || source === "development" ? "DASHBOARD" : "NONE",
      timeZone: "Europe/Moscow",
      assignee: "",
    },
    value: metric === "p85Duration" ? 211 : metric.includes("Duration") ? 120 : 1,
    groups: groupBy === "none" ? [] : [
      { key: "in-progress", label: "In Progress", value: 1, recordCount: 1 },
    ],
    records: [{ ...record, source }],
    totalRecords: 1,
    page: 1,
    pageSize: 12,
    quality: {
      status: "COMPLETE",
      basis: "CURRENT_PROJECTION",
      source,
      population: 1,
      complete: 1,
      incomplete: 0,
      coveragePercent: 100,
      oldestObservedAt: evaluatedAt,
      latestObservedAt: evaluatedAt,
      warnings: [],
    },
  });
  const semanticEvaluationResult = (
    source = "issues",
    metric = "count",
    groupBy = "none",
    selectedFields = ["issueKey", "summary", "status"],
  ) => {
    const result = evaluationResult(source, metric, groupBy);
    const values: Record<string, string | number | boolean | null> = {
      issueKey: record.issue.issueKey,
      project: "TV",
      summary: record.issue.summary,
      status: record.issue.status,
      assignee: record.issue.assignee,
      reporter: record.issue.reporter,
      priority: record.issue.priority,
      issueType: record.issue.issueType,
      resolution: record.issue.resolution,
      sprint: record.issue.sprint,
      issueCreatedAt: record.issue.issueCreatedAt,
      criticalPriorityAt: record.issue.criticalPriorityAt,
      resolutionAt: record.issue.resolutionAt,
      updatedAt: record.issue.updatedAt,
      eventAt: record.eventAt,
      intervalStartAt: record.eventAt,
      intervalEndAt: null,
      durationHours: record.durationHours,
      commitCount: record.commitCount,
      mergeRequestCount: record.mergeRequestCount,
      hasDevelopment: true,
      fromStatus: record.fromStatus,
      toStatus: record.toStatus,
    };
    return {
      ...result,
      records: [{
        id: record.id,
        issueUrl: record.issue.issueUrl,
        values: Object.fromEntries(selectedFields.map((field) => [field, values[field] ?? null])),
      }],
    };
  };

  const semanticDefinition = (
    name: string,
    grain: "issue" | "transitionEvent" | "developmentEvent" | "interval",
    rowConfig: Record<string, unknown>,
    fields: (keyof typeof record.issue | "issueKey" | "project" | "summary" | "fromStatus" | "toStatus" | "eventAt" | "intervalStartAt" | "intervalEndAt" | "durationHours" | "hasDevelopment")[],
  ) => ({
    schemaVersion: 5,
    name,
    description: `${name}: управляемый набор строк`,
    grain,
    basePopulation: { logic: "and", filters: [] },
    rowConfig,
    rowIdentity: grain === "issue" ? ["issueKey"] : ["rowId"],
    outputFields: fields.map((field) => jiraSemanticDefaultOutputField(field as Parameters<typeof jiraSemanticDefaultOutputField>[0])),
    incompleteDataPolicy: grain === "issue" ? "includeWithWarning" : "exclude",
    qualityRules: { minimumCoveragePercent: 95, maximumRows: 100_000, maximumRowsPerIssue: 100 },
    timeZone: "Europe/Moscow",
    asOfSupport: grain === "issue" || rowConfig.kind === "criticalSla" ? "supported" : "none",
  });
  const semanticTemplates = [
    ["issues", semanticDefinition("Тикеты", "issue", { kind: "issue" }, ["issueKey", "project", "summary", "status", "assignee", "resolution", "issueCreatedAt", "updatedAt", "hasDevelopment"])],
    ["status-transitions", semanticDefinition("Переходы статусов", "transitionEvent", { kind: "transitionEvent" }, ["issueKey", "project", "summary", "status", "assignee", "fromStatus", "toStatus", "eventAt", "durationHours"])],
    ["development-activity", semanticDefinition("Активность разработки", "developmentEvent", { kind: "developmentEvent" }, ["issueKey", "project", "summary", "status", "assignee", "eventAt", "commitCount", "mergeRequestCount"])],
    ["status-intervals", semanticDefinition("Интервалы статусов", "interval", { kind: "interval", start: { type: "issueCreated", occurrence: "first" }, end: { type: "statusEntry", statuses: [{ id: null, name: "In Progress" }], occurrence: "first" }, pairing: "nextAfterStart", openIntervals: "include" }, ["issueKey", "project", "summary", "status", "assignee", "fromStatus", "intervalStartAt", "intervalEndAt", "durationHours"])],
    ["critical-blocker-sla", semanticDefinition("SLA Critical/Blocker", "interval", { kind: "criticalSla", issueTypes: ["Bug"], priorities: ["Critical", "Blocker"], startPolicy: "createdOrFirstPriorityEntry", endAnchor: "resolution", requirePriorityAtResolution: true, openIntervals: "include" }, ["issueKey", "project", "summary", "status", "assignee", "priority", "resolution", "criticalPriorityAt", "resolutionAt", "durationHours"])],
  ] as const;
  const semanticDefinitions = semanticTemplates.map(([key, definition], index) => ({
    id: `semantic-${key}`,
    projectId: project.id,
    key,
    system: true,
    version: 1,
    publishedVersion: 1,
    archivedAt: null,
    draft: definition,
    published: definition,
    revisions: [{ version: 1, status: "published", changeKind: "compatible", createdAt: evaluatedAt, publishedAt: evaluatedAt }],
    sortOrder: index,
  }));
  let semanticDashboard = { version: 5 as const, periodDays: 180 as const, assignee: "", widgets: [] as Record<string, unknown>[] };
  let semanticDashboardHash = "d".repeat(64);

  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates$/, (route) =>
    route.fulfill({ json: { definitions: semanticDefinitions, goals: [], dashboard: semanticDashboard, dashboardConfigHash: semanticDashboardHash } }),
  );
  await page.route("**/api/projects/project-1/jira/semantic-dashboard", async (route) => {
    const body = route.request().postDataJSON() as { config: typeof semanticDashboard };
    semanticDashboard = body.config;
    semanticDashboardHash = "e".repeat(64);
    await route.fulfill({ json: { config: semanticDashboard, configHash: semanticDashboardHash } });
  });
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/preview$/, (route) => {
    const body = route.request().postDataJSON() as { definition: { outputFields: Array<{ key: string }> } };
    return route.fulfill({ json: { result: semanticEvaluationResult("statusIntervals", "count", "none", body.definition.outputFields.map((field) => field.key)), cost: { tickets: 1, estimatedRows: 1, maximumRows: 100_000, blocked: false } } });
  });
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/query-batch$/, (route) => {
    const body = route.request().postDataJSON() as { queries: Array<{ widgetId: string; aggregateId: string; query: { metric: string; groupBy: string; selectedFields: string[] } }> };
    return route.fulfill({ json: { results: body.queries.map((item) => ({
      widgetId: item.widgetId,
      aggregate: { id: item.aggregateId, name: "Тикеты", version: 1 },
      result: semanticEvaluationResult("issues", item.query.metric, item.query.groupBy, item.query.selectedFields),
    })) } });
  });
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/[^/]+\/query$/, (route) => {
    const body = route.request().postDataJSON() as { metric: string; groupBy: string; selectedFields: string[] };
    return route.fulfill({ json: { aggregate: { id: "semantic-issues", name: "Тикеты", version: 1 }, result: semanticEvaluationResult("issues", body.metric, body.groupBy, body.selectedFields) } });
  });
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/[^/]+\/query\.csv$/, (route) =>
    route.fulfill({ body: "\uFEFF\"Key\"\r\n\"TV-101\"", headers: { "content-disposition": "attachment; filename=\"jira-aggregate.csv\"", "content-type": "text/csv; charset=utf-8" } }),
  );

  await page.route("**/api/projects/project-1/jira/analytics-facets", (route) =>
    route.fulfill({
      json: {
        issueCount: 1,
        activeIssueCount: 1,
        transitionHistoryCompleteCount: 1,
        developmentDataAvailableCount: 1,
        criticalSlaTrackedCount: 1,
        criticalSlaReadyCount: 1,
        latestSyncedAt: evaluatedAt,
        assignees: ["Разработчик"],
        assigneesTruncated: false,
      },
    }),
  );

  await page.route("**/api/projects/project-1/jira/aggregates", (route) => {
    const storedDashboard = currentStoredDashboard();
    return route.fulfill({
      json: {
        definitions: aggregateDefinitions,
        invalidDefinitionCount: 0,
        revisionContracts: [],
        dashboard: {
          stored: project.jiraAnalyticsSettings.dashboardConfig !== null,
          version: storedDashboard?.version ?? null,
          configHash: "b".repeat(64),
          convertedConfigHash: null,
          convertedAt: null,
          rolledBackAt: null,
          editableConfig: currentEditableConfig(),
          editableConfigError: null,
        },
      },
    });
  });
  await page.route("**/api/projects/project-1/jira/aggregates/preview", (route) => {
    const body = route.request().postDataJSON() as {
      definition: { source: string };
      asOf?: string;
    };
    const result = evaluationResult(
      body.definition.source,
      "count",
      "none",
    );
    return route.fulfill({
      json: body.asOf ? {
        ...result,
        evaluatedAt: body.asOf,
        quality: { ...result.quality, basis: "OBSERVED_VERSIONS" },
        reconstruction: {
          mode: "AS_OF",
          provenance: "RECONSTRUCTED",
          basis: "OBSERVED_VERSIONS",
          asOf: body.asOf,
          tickets: 1,
          ticketsWithoutObservation: 0,
          ticketsRetiredAfterAsOf: 0,
          versionRowsScanned: 7,
          earliestObservationAt: "2026-07-01T00:00:00.000Z",
          stalenessHours: { p50: 0.1, p95: 0.5, max: 1 },
          beforeHistoryStart: false,
          historyWriteGap: { includesAsOf: false, runs: 0, firstAt: null, lastAt: null },
          quality: "AVAILABLE",
        },
      } : result,
    });
  });
  await page.route("**/api/projects/project-1/jira/aggregates/aggregate-unplanned/export.csv?**", (route) =>
    route.fulfill({
      body: "\uFEFF\"Key\"\r\n\"TV-101\"",
      headers: {
        "content-disposition": "attachment; filename=\"jira-aggregate.csv\"",
        "content-type": "text/csv; charset=utf-8",
      },
    }),
  );
  const reconciliationResult = {
    status: "MATCH",
    evaluatedAt,
    legacyEngine: "V1_INLINE_WIDGETS",
    managedEngine: "V2_REFERENCED_AGGREGATES",
    legacyConfigHash: "b".repeat(64),
    managedConfigHash: "c".repeat(64),
    comparedWidgets: 1,
    matchedWidgets: 1,
    mismatchedWidgets: 0,
    caveat: "Сверка использует общее арифметическое ядро и не является независимой проверкой формул.",
    widgets: [{
      widgetId: "unplanned-development",
      title: "Работа вне плана",
      status: "MATCH",
      semanticMatch: true,
      valueMatch: true,
      totalRecordsMatch: true,
      groupsMatch: true,
      qualityMatch: true,
      orderedRecordSampleMatch: true,
      recordSampleSize: 1,
      legacy: { status: "OK", value: 1, totalRecords: 1, error: null },
      managed: { status: "OK", value: 1, totalRecords: 1, error: null },
    }],
  };
  await page.route("**/api/projects/project-1/jira/aggregates/reconcile-dashboard", (route) =>
    route.fulfill({ json: reconciliationResult }),
  );
  await page.route("**/api/projects/project-1/jira/aggregates/switch-dashboard", (route) =>
    route.fulfill({
      json: {
        currentHash: "b".repeat(64),
        sourceWidgets: JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1.widgets.length,
        items: [
          { name: "Работа вне плана", action: "WOULD_CREATE" },
          { name: "Тикеты по статусам", action: "REUSE" },
        ],
        reconciliation: reconciliationResult,
      },
    }),
  );
  await page.route("**/api/projects/project-1/jira/aggregates/import-dashboard", (route) =>
    route.fulfill({
      json: {
        currentHash: "b".repeat(64),
        sourceWidgets: JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1.widgets.length,
        items: [
          { name: "Работа вне плана", action: "WOULD_CREATE" },
          { name: "Тикеты по статусам", action: "REUSE" },
        ],
      },
    }),
  );
  await page.route("**/api/projects/project-1/jira/history-status", (route) =>
    route.fulfill({
      json: {
        reportVersion: 1,
        generatedAt: evaluatedAt,
        storage: {
          budgetBytes: 5 * 1024 ** 3,
          databaseBytes: 1024,
          utilizationPercent: 0.01,
          level: "NORMAL",
          newScopeBlocked: false,
        },
        global: {
          versions: 1,
          tickets: 1,
          payloadBytes: 1024,
          averageBytes: 1024,
          p95Bytes: 1024,
          incompleteHydration: 0,
          attachmentReferencesStripped: 0,
        },
        project: {
          versions: 1,
          tickets: 1,
          payloadBytes: 1024,
          averageBytes: 1024,
          p95Bytes: 1024,
          incompleteHydration: 0,
          attachmentReferencesStripped: 0,
        },
        retry: {
          pending: 0,
          failedBatches: 0,
          oldestFailureAt: null,
          nextRetryAt: null,
          items: [],
        },
        cursor: {
          updatedAt: evaluatedAt,
          jiraIssueId: "101",
          lastFullReconciledAt: evaluatedAt,
          fullCursorIssueKey: null,
          fullStartedAt: null,
        },
        historyWrite: {
          enabled: true,
          gapRuns: 0,
          gapFirstAt: null,
          gapLastAt: null,
        },
        projections: { unversioned: 0 },
      },
    }),
  );
  await page.route("**/api/projects/project-1/jira/backfill/completeness?**", (route) =>
    route.fulfill({
      json: {
        generatedAt: evaluatedAt,
        historyWriteEnabled: true,
        scope: {
          tickets: 1,
          stableJiraId: 1,
          withoutStableJiraId: 0,
          observed: 1,
          withoutObservedVersion: 0,
          fullyHydrated: 1,
          coveragePercent: 100,
          unversionedProjection: 0,
        },
        versions: { total: 1, firstObservedAt: evaluatedAt, lastObservedAt: evaluatedAt },
        retry: { pending: 0 },
        historyWriteGap: { runs: 0, firstAt: null, lastAt: null },
        latestBackfill: null,
      },
    }),
  );
  await page.route("**/api/projects/project-1/jira/aggregate-dashboard-results?**", (route) => {
    const stored = project.jiraAnalyticsSettings.dashboardConfig as {
      version: 1 | 2 | 3 | 4;
      widgets: Array<{
        id: string;
        title: string;
        aggregateId?: string;
        groupBy?: string;
        metric?: string;
        placement?: "active" | "retro";
        section?: "active" | "retro";
        source?: string;
        visualization: string;
        width: string;
      }>;
    } | null;
    const config = stored ?? JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1;
    const selectedWidgetId = new URL(route.request().url()).searchParams.get("widgetId");
    return route.fulfill({
      json: {
        configVersion: config.version,
        configHash: "b".repeat(64),
        widgets: config.widgets
          .filter((widget) => !selectedWidgetId || widget.id === selectedWidgetId)
          .map((widget) => {
            const widgetAggregate = widget.aggregateId
              ? aggregateDefinitions.find((definition) => definition.id === widget.aggregateId) ?? aggregate
              : aggregateDefinitions.find((definition) =>
                  definition.id === (widget.id === "unplanned-count"
                    ? "aggregate-unplanned"
                    : `aggregate-${widget.id}`)
                ) ?? aggregate;
            return {
              widgetId: widget.id,
              title: widget.title,
              visualization: widget.visualization,
              width: widget.width,
              placement: widget.placement ?? widget.section,
              aggregateId: widget.aggregateId ?? null,
              aggregateName: widgetAggregate.name,
              source: widget.source ?? widgetAggregate.source,
              metric: widget.metric ?? "count",
              groupBy: widget.groupBy ?? "none",
              status: "OK",
              result: evaluationResult(
                widget.source ?? widgetAggregate.source,
                widget.metric ?? "count",
                widget.groupBy ?? "none",
              ),
            };
          }),
      },
    });
  });
  return { getSemanticDashboard: () => semanticDashboard };
}

export function portfolioProjectFixture(
  id: string,
  code: string,
  name: string,
  goalTitle: string,
  problemTitle: string,
  riskTitle: string,
) {
  const project = projectFixture();
  project.id = id;
  project.code = code;
  project.name = name;
  project.wbsItems = [
    {
      ...project.wbsItems[0],
      id: `${id}-goal`,
      code: "G.1",
      title: goalTitle,
      type: "GOAL",
      status: "IN_PROGRESS",
    },
  ];
  project.raidItems = [
    {
      ...project.raidItems[0],
      id: `${id}-problem`,
      type: "DEPENDENCY",
      title: problemTitle,
      riskScore: 20,
    },
    {
      ...project.raidItems[0],
      id: `${id}-risk`,
      type: "RISK",
      title: riskTitle,
      riskScore: 16,
    },
  ];
  return project;
}

export async function mockAdminPortfolio(
  page: Page,
  projects: ReturnType<typeof projectFixture>[],
) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "admin-1",
          email: "admin@example.test",
          name: "Администратор",
          role: "ADMIN",
          isActive: true,
          lastLoginAt: null,
        },
      },
    }),
  );
  await page.route("**/api/auth/keycloak/status", (route) =>
    route.fulfill({ json: { enabled: false, hostname: null } }),
  );
  await page.route(/\/api\/projects$/, (route) => route.fulfill({ json: projects }));
  await page.route(/\/api\/projects\/([^/]+)\/overview$/, (route) => {
    const projectId = new URL(route.request().url()).pathname.split("/").at(-2);
    const project = projects.find(({ id }) => id === projectId);
    return project
      ? route.fulfill({ json: project })
      : route.fulfill({ status: 404, json: { error: "Проект не найден" } });
  });
}

export async function mockReadOnlyProject(page: Page) {
  const project = projectFixture();
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: "Требуется вход в систему" } }),
  );
  await page.route("**/api/auth/setup-status", (route) =>
    route.fulfill({ json: { needsSetup: false } }),
  );
  await page.route("**/api/auth/keycloak/status", (route) =>
    route.fulfill({ json: { enabled: false, hostname: null } }),
  );
  await page.route(/\/api\/projects$/, (route) => route.fulfill({ json: [project] }));
  await page.route("**/api/projects/project-1/overview", (route) =>
    route.fulfill({ json: project }),
  );
}

export async function expectBusinessUnitCalloutToPointAtField(page: Page) {
  const businessUnitCallout = page.locator(".confirm-business-unit-callout");
  await expect(businessUnitCallout).toBeVisible();
  const pointerOffset = async () => {
    const [businessUnitBox, calloutArrowBox, calloutBox, calloutPlacement, dialogBox] =
      await Promise.all([
        page.getByLabel("Портфель").boundingBox(),
        businessUnitCallout.locator(".confirm-business-unit-callout-arrow").boundingBox(),
        businessUnitCallout.boundingBox(),
        businessUnitCallout.getAttribute("data-placement"),
        page.getByRole("dialog", { name: "Создать проект?" }).boundingBox(),
      ]);
    if (!businessUnitBox || !calloutArrowBox || !calloutBox || !dialogBox) {
      return {
        overlap: Number.POSITIVE_INFINITY,
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY,
      };
    }
    const targetEdge =
      calloutPlacement === "above"
        ? businessUnitBox.y
        : businessUnitBox.y + businessUnitBox.height;
    const arrowTipY =
      calloutPlacement === "above" ? calloutArrowBox.y + 20 : calloutArrowBox.y + 4;
    return {
      overlap: Math.max(
        0,
        Math.min(calloutBox.y + calloutBox.height, dialogBox.y + dialogBox.height) -
          Math.max(calloutBox.y, dialogBox.y),
      ),
      x: Math.abs(
        calloutArrowBox.x + 9 - (businessUnitBox.x + businessUnitBox.width / 2),
      ),
      y: Math.abs(arrowTipY - targetEdge),
    };
  };
  await expect.poll(async () => (await pointerOffset()).x).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await pointerOffset()).y).toBeLessThanOrEqual(1);
  await expect.poll(async () => (await pointerOffset()).overlap).toBe(0);
}

export function countPdfPages(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}
