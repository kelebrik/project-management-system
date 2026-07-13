import { expect, test, type Page } from "@playwright/test";

const today = new Date();

function isoDay(offset: number) {
  const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function projectFixture() {
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
    description: null,
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
    source: "INTERNAL",
    title: "Согласовать дату запуска",
    severity: "HIGH",
    status: "Open",
    owner: "РП",
    impact: "Сдвиг запуска",
    decisionRequired: true,
    dueDate: isoDay(2),
    initialDueDate: isoDay(2),
    closedDelayDays: null,
    jiraTicketKey: null,
    jiraTicketUrl: null,
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
    uiState: null,
    jiraIntegration: null,
    targetDateChanges: [],
    wbsItems: [wbsItem],
    raidItems: [risk],
    currentUserAccessLevel: "ADMIN",
    _count: { tasks: 1, issues: 1, jiraSnapshots: 0 },
    tasks: [],
    issues: [issue],
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
}

async function mockAdminProject(
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

async function mockReadOnlyProject(page: Page) {
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

test("overview entries expand statuses and open the selected issue", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/overview");

  await page.getByRole("button", { name: "Показать статусы: Риск интеграции" }).click();
  await expect(page.getByText("Получено подтверждение поставщика")).toBeVisible();
  await expect(page.getByText("Запрошен план поставки")).toBeVisible();

  await page
    .getByRole("button", { name: "Показать статусы: Согласовать дату запуска" })
    .click();
  await expect(page.getByText("Решение вынесено на комитет")).toBeVisible();
  await expect(page.getByText("Подготовлены варианты даты")).toBeVisible();

  await page
    .getByRole("button", { name: "Согласовать дату запуска", exact: true })
    .click();
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/issues$/);
  await expect(page.locator("#issue-item-issue-1 .issue-summary-row")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("administrator updates baseline only for selected WBS rows", async ({ page }) => {
  const project = await mockAdminProject(page);
  let baselineBody: unknown = null;
  await page.route("**/api/projects/project-1/wbs-baseline", async (route) => {
    baselineBody = route.request().postDataJSON();
    const updatedItem = {
      ...project.wbsItems[0],
      baselineStartDate: project.wbsItems[0].startDate,
      baselineDueDate: project.wbsItems[0].dueDate,
    };
    await route.fulfill({
      json: {
        updatedCount: 1,
        wbsItems: [updatedItem],
        wbsDependencies: [],
        criticalPath: null,
      },
    });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("checkbox", { name: "Выбрать строку 1.1" }).check();
  await page.getByRole("button", { name: "Обновить базовый план" }).click();

  await expect.poll(() => baselineBody).toEqual({ itemIds: ["wbs-1"] });
});

test("inline WBS insert button stays above the following row", async ({ page }) => {
  await mockAdminProject(page, (project) => {
    project.wbsItems.push({
      ...project.wbsItems[0],
      id: "wbs-2",
      code: "1.2",
      title: "Следующая задача",
      sortOrder: 20,
    });
  });

  await page.goto("/TV-OVERVIEW/wbs");
  const firstRow = page.locator(".wbs-row-stack").first();
  const insertButton = firstRow.getByRole("button", {
    name: "Добавить строку Структуры ниже",
  });
  await firstRow.hover();
  await expect(insertButton).toBeVisible();

  const buttonBox = await insertButton.boundingBox();
  const nextRowBox = await page.locator(".wbs-row-stack").nth(1).boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(nextRowBox).not.toBeNull();
  if (!buttonBox || !nextRowBox) return;

  const overlapPoint = {
    x: buttonBox.x + buttonBox.width / 2,
    y: Math.max(nextRowBox.y + 2, buttonBox.y + buttonBox.height - 2),
  };
  expect(overlapPoint.y).toBeLessThan(buttonBox.y + buttonBox.height);
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest(".wbs-inline-insert-button") !== null,
        overlapPoint,
      ),
    )
    .toBe(true);
});

test("read-only WBS title uses the available structure column width", async ({ page }) => {
  await mockReadOnlyProject(page);
  await page.goto("/TV-OVERVIEW/wbs");

  const title = page.locator(".wbs-title-readonly").first();
  await expect(title).toHaveText("Тестовая задача");
  const dimensions = await title.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.clientWidth).toBeGreaterThan(72);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
