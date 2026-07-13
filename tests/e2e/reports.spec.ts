import { expect, test } from "@playwright/test";

const today = new Date();

function isoDay(offset: number) {
  const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function wbsItem(
  id: string,
  status: string,
  dates: {
    parentId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    baselineDueDate?: string | null;
    forecastDueDate?: string | null;
    closedAt?: string | null;
  },
) {
  return {
    id,
    parentId: dates.parentId ?? null,
    code: `1.${id}`,
    title: `Задача ${id}`,
    type: "TASK",
    status,
    owner: "Руководитель проекта",
    startDate: dates.startDate ?? null,
    dueDate: dates.dueDate ?? null,
    baselineStartDate: null,
    baselineDueDate: dates.baselineDueDate ?? null,
    forecastStartDate: null,
    forecastDueDate: dates.forecastDueDate ?? null,
    wbsLevel: 1,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: 0,
    workDays: 1,
    calendarDays: 1,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: 1,
    planCalendarDays: 1,
    calendarCode: "RU",
    templateColor: null,
    priority: null,
    effortPercent: 100,
    plannedCost: "0",
    forecastCost: "0",
    progress: status === "DONE" ? 100 : 50,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    description: null,
    closedAt: dates.closedAt ?? null,
    sortOrder: 0,
  };
}

test("report builder creates and filters a project status report", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const wbsItems = [
    {
      ...wbsItem("package", "IN_PROGRESS", { startDate: isoDay(-10), dueDate: isoDay(10) }),
      code: "1",
      title: "Пакет интеграции",
      type: "WORK_PACKAGE",
    },
    wbsItem("done", "DONE", {
      parentId: "package",
      dueDate: isoDay(-2),
      baselineDueDate: isoDay(-3),
      closedAt: isoDay(-2),
    }),
    wbsItem("active", "IN_PROGRESS", {
      parentId: "package",
      startDate: isoDay(-3),
      dueDate: isoDay(3),
      baselineDueDate: isoDay(1),
      forecastDueDate: isoDay(3),
    }),
    wbsItem("old-active", "BLOCKED", {
      parentId: "package",
      startDate: isoDay(-120),
      dueDate: isoDay(-100),
    }),
    wbsItem("next", "NOT_STARTED", {
      parentId: "package",
      startDate: isoDay(4),
      dueDate: isoDay(6),
      baselineDueDate: isoDay(7),
      forecastDueDate: isoDay(6),
    }),
  ];
  const project = {
    id: "project-1",
    parentId: null,
    code: "TV-REPORT",
    name: "Проект для отчёта",
    portfolio: "Основной",
    sponsor: "Заказчик",
    projectManager: "Руководитель проекта",
    status: "ACTIVE",
    rag: "GREEN",
    startDate: isoDay(-30),
    initialTargetDate: isoDay(30),
    targetDate: isoDay(30),
    progress: 50,
    scheduleVariance: 0,
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "",
    sortOrder: 0,
    uiState: null,
    jiraIntegration: null,
    targetDateChanges: [],
    wbsItems,
    raidItems: [
      {
        id: "risk-1",
        type: "RISK",
        title: "Риск поставки",
        description: "",
        owner: "РП",
        status: "OPEN",
        probability: 3,
        impact: 4,
        riskScore: 12,
        mitigationPlan: null,
        contingencyPlan: null,
        dueDate: isoDay(5),
        residualRisk: 4,
        validationDate: null,
        linkedRiskId: null,
        dependencyType: null,
        predecessor: null,
        successor: null,
        supplier: null,
        jiraTicketKey: null,
        jiraTicketUrl: null,
        decisionRequired: false,
        escalationLevel: "",
        scheduleImpactDays: 0,
        budgetImpact: "0",
        statusUpdates: [],
      },
    ],
    currentUserAccessLevel: "VIEW",
    _count: { tasks: 3, issues: 1, jiraSnapshots: 0 },
    tasks: [],
    issues: [
      {
        id: "issue-1",
        source: "INTERNAL",
        title: "Вопрос согласования",
        severity: "MEDIUM",
        status: "Open",
        owner: "РП",
        impact: "",
        decisionRequired: true,
        dueDate: isoDay(2),
        initialDueDate: isoDay(2),
        closedDelayDays: null,
        jiraTicketKey: null,
        jiraTicketUrl: null,
        jiraLinks: [],
        statusUpdates: [],
      },
    ],
    closedIssues: [],
    jiraWorkSections: [],
    jiraSnapshots: [],
    overviews: [],
    milestones: [],
    wbsDependencies: [],
    criticalPath: null,
    calendarOverrides: [],
    artifacts: [],
    changeRequests: [],
  };

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "user-1",
          email: "pm@example.test",
          name: "Руководитель проекта",
          role: "PROJECT_MANAGER",
          isActive: true,
          lastLoginAt: null,
        },
      },
    }),
  );
  await page.route("**/api/auth/keycloak/status", (route) =>
    route.fulfill({ json: { enabled: false, hostname: null } }),
  );
  await page.route("**/api/projects", (route) => route.fulfill({ json: [project] }));
  await page.route("**/api/projects/project-1/overview", (route) =>
    route.fulfill({ json: project }),
  );

  await page.goto("/reports");

  await expect(page.getByRole("button", { name: "Отчёты" })).toHaveClass(/active/);
  await expect(page.getByRole("heading", { name: "Что сделано" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что в работе" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Что предстоит сделать" })).toBeVisible();
  await expect(page.getByText("Задача done")).toBeVisible();
  await expect(page.getByText("Задача active")).toBeVisible();
  await expect(page.getByText("Задача old-active")).toHaveCount(0);
  await expect(page.getByText("Задача next")).toBeVisible();
  await expect(page.getByText("Пакет работ").first()).toBeVisible();
  await expect(page.getByText("Дата начала").first()).toBeVisible();
  await expect(page.getByText("Дата завершения").first()).toBeVisible();
  await expect(page.getByText("Исполнитель").first()).toBeVisible();
  await expect(page.getByText("Пакет интеграции").first()).toBeVisible();
  await expect(page.getByText("Риск поставки")).toHaveCount(0);
  await expect(page.getByText("Вопрос согласования")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Месяц" })).toHaveCount(0);
  await expect(page.getByLabel("Риски")).toHaveCount(0);

  const currentWeek = page.getByRole("button", { name: "Закрыто на этой неделе" });
  const twoWeeks = page.getByRole("button", { name: "Закрыто за две недели" });
  await expect(currentWeek).toHaveAttribute("aria-pressed", "true");
  await expect(currentWeek).toHaveClass(/active/);
  await twoWeeks.click();
  await expect(twoWeeks).toHaveAttribute("aria-pressed", "true");
  await expect(twoWeeks).toHaveClass(/active/);
  await expect(currentWeek).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".report-project-select svg")).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeVisible();
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
});
