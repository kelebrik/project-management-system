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
        createdAt: isoDay(-3),
        updatedAt: isoDay(-3),
      },
      {
        id: "problem-1",
        type: "DEPENDENCY",
        title: "Проблема интеграции",
        description: "Зависимость от поставщика",
        owner: "РП",
        status: "IN_PROGRESS",
        probability: 2,
        impact: 3,
        riskScore: 6,
        mitigationPlan: null,
        contingencyPlan: null,
        dueDate: isoDay(3),
        residualRisk: 2,
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
        statusUpdates: [],
        createdAt: isoDay(-5),
        updatedAt: isoDay(-2),
      },
      {
        id: "closed-risk-1",
        type: "RISK",
        title: "Закрытый риск поставки",
        description: "",
        owner: "РП",
        status: "CLOSED",
        probability: 2,
        impact: 2,
        riskScore: 4,
        mitigationPlan: null,
        contingencyPlan: null,
        dueDate: isoDay(-2),
        residualRisk: 1,
        validationDate: isoDay(-1),
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
        createdAt: isoDay(-30),
        updatedAt: isoDay(-1),
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
        createdAt: isoDay(-4),
        updatedAt: isoDay(-2),
      },
    ],
    closedIssues: [
      {
        id: "closed-issue-1",
        source: "INTERNAL",
        title: "Закрытый вопрос согласования",
        severity: "LOW",
        status: "Closed",
        owner: "РП",
        impact: "",
        decisionRequired: false,
        dueDate: isoDay(-1),
        initialDueDate: isoDay(-3),
        closedDelayDays: 2,
        jiraTicketKey: null,
        jiraTicketUrl: null,
        jiraLinks: [],
        statusUpdates: [],
        createdAt: isoDay(-20),
        updatedAt: isoDay(-1),
      },
    ],
    jiraWorkSections: [],
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
  await expect(page.getByRole("button", { name: "Месяц" })).toHaveCount(0);
  await expect(page.getByText("Конструктор", { exact: true })).toHaveCount(0);
  const contentLabelBox = await page.getByText("Содержание", { exact: true }).boundingBox();
  const periodLabelBox = await page.getByText("Период", { exact: true }).first().boundingBox();
  expect(contentLabelBox).not.toBeNull();
  expect(periodLabelBox).not.toBeNull();
  expect(contentLabelBox!.y).toBeLessThan(periodLabelBox!.y);

  const currentWeek = page.getByRole("button", { name: "Закрыто на этой неделе" });
  const twoWeeks = page.getByRole("button", { name: "Закрыто за две недели" });
  await expect(currentWeek).toHaveAttribute("aria-pressed", "true");
  await expect(currentWeek).toHaveClass(/active/);
  await twoWeeks.click();
  await expect(twoWeeks).toHaveAttribute("aria-pressed", "true");
  await expect(twoWeeks).toHaveClass(/active/);
  await expect(currentWeek).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".report-select-wrap svg")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeVisible();

  const ownerField = page.getByRole("checkbox", { name: "Исполнитель" });
  await ownerField.uncheck();
  await expect(page.locator(".report-data-head").first()).not.toContainText("Исполнитель");

  const statusHandle = page.getByRole("button", { name: "Перетащить поле Статус" });
  const packageHandle = page.getByRole("button", { name: "Перетащить поле Пакет работ" });
  await statusHandle.dragTo(packageHandle.locator(".."));
  await expect(page.locator(".report-data-head").first().locator("span").first()).toHaveText("Статус");

  const contentSelect = page.getByLabel("Содержание");
  await contentSelect.selectOption("raid");
  await expect(page.getByRole("heading", { name: /^Открытые риски/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Открытые проблемы/ })).toBeVisible();
  await expect(page.getByText("Риск поставки")).toBeVisible();
  await expect(page.getByText("Проблема интеграции")).toBeVisible();
  const closedActivity = page.getByRole("button", { name: "Закрыто за две недели" });
  const openedActivity = page.getByRole("button", { name: "Открыто за две недели" });
  await expect(openedActivity).toHaveClass(/active/);
  await closedActivity.click();
  await expect(page.getByText("Закрытый риск поставки")).toBeVisible();
  await expect(page.getByText("Риск поставки", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Оценка" })).toBeChecked();

  await contentSelect.selectOption("issues");
  await expect(page.getByRole("heading", { name: /^Закрытые вопросы/ })).toBeVisible();
  await expect(page.getByText("Закрытый вопрос согласования")).toBeVisible();
  await openedActivity.click();
  await expect(page.getByRole("heading", { name: /^Открытые вопросы/ })).toBeVisible();
  await expect(page.getByText("Вопрос согласования")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Критичность" })).toBeChecked();

  await contentSelect.selectOption("tasks");
  await expect(ownerField).not.toBeChecked();
  await expect(page.locator(".report-data-head").first().locator("span").first()).toHaveText("Статус");

  const headerTerms = await page.locator(".report-document-header dt").all();
  for (const term of headerTerms) {
    const box = await term.boundingBox();
    const textMetrics = await term.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(box).not.toBeNull();
    expect(textMetrics.scrollWidth).toBeLessThanOrEqual(textMetrics.clientWidth);
  }
  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
});
