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

function portfolioProjectFixture(
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

async function mockAdminPortfolio(
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

test("project creation confirms the selected business unit for an administrator", async ({
  page,
}) => {
  let createBody: {
    copyCurrentStructureFrom?: Array<{
      projectId: string;
      phaseIds: string[] | null;
    }>;
  } | null = null;
  let createBusinessUnitHeader: string | null = null;
  await page.route("**/api/business-units", (route) =>
    route.fulfill({
      json: [
        {
          id: "business-unit-main",
          code: "main",
          name: "TV&Box",
          isDefault: true,
          role: "ADMIN",
          canManage: true,
          projectCount: 1,
        },
        {
          id: "business-unit-sd",
          code: "sd",
          name: "SberDevices",
          isDefault: false,
          role: "MEMBER",
          canManage: false,
          projectCount: 1,
        },
      ],
    }),
  );
  await page.route("**/api/projects/structure-copy-options", (route) =>
    route.fulfill({
      json: [
        {
          id: "source-alpha",
          code: "ALPHA",
          name: "Проект Альфа",
          businessUnit: { id: "business-unit-main", name: "TV&Box" },
          phases: [
            { id: "phase-analysis", code: "1", title: "Анализ" },
            { id: "phase-launch", code: "2", title: "Запуск" },
          ],
        },
        {
          id: "source-beta",
          code: "BETA",
          name: "Проект Бета",
          businessUnit: { id: "business-unit-sd", name: "SberDevices" },
          phases: [{ id: "phase-delivery", code: "1", title: "Поставка" }],
        },
      ],
    }),
  );
  await mockAdminProject(page);
  await page.route(/\/api\/projects$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    createBody = route.request().postDataJSON() as typeof createBody;
    createBusinessUnitHeader = route.request().headers()["x-business-unit-id"] ?? null;
    await route.fulfill({ status: 400, json: { error: "Проверка запроса" } });
  });
  await page.goto("/projects");

  await page.getByRole("button", { name: "Создать", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Создать проект" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Создать проект?" })).toBeHidden();
  await page.getByLabel("Портфель").selectOption("business-unit-sd");

  await page
    .getByRole("button", { name: "Не копировать, создать тестовую структуру" })
    .click();
  const structureSearch = page.getByLabel("Поиск проектов и фаз");
  await structureSearch.fill("Анализ");
  await page.getByRole("checkbox", { name: /1 · Анализ/ }).check();
  await structureSearch.fill("Поставка");
  await page.getByRole("checkbox", { name: /1 · Поставка/ }).check();
  await structureSearch.fill("");
  await expect(page.getByRole("button", { name: "Выбрано: 2" })).toBeVisible();
  if (process.env.CAPTURE_BUSINESS_UNIT_CONFIRM === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-project-create-structure-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/private/tmp/pms-project-create-structure-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.getByRole("button", { name: "Выбрано: 2" }).click();

  await page.getByRole("button", { name: "Создать проект", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Создать проект?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("SberDevices");
  await expect(dialog).toContainText("Проверьте выбранный БЮ");
  await expect(page.locator(".confirm-business-unit-callout")).toBeVisible();
  if (process.env.CAPTURE_BUSINESS_UNIT_CONFIRM === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-business-unit-confirm-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/private/tmp/pms-business-unit-confirm-mobile.png",
      fullPage: true,
    });
  }
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Создать проект", exact: true }).click();
  await dialog.getByRole("button", { name: "Создать", exact: true }).click();
  await expect.poll(() => createBusinessUnitHeader).toBe("business-unit-sd");
  expect(createBody?.copyCurrentStructureFrom).toEqual([
    { projectId: "source-alpha", phaseIds: ["phase-analysis"] },
    { projectId: "source-beta", phaseIds: ["phase-delivery"] },
  ]);
});

test("project creation keeps business units available when structure options fail", async ({
  page,
}) => {
  await page.route("**/api/business-units", (route) =>
    route.fulfill({
      json: [
        {
          id: "business-unit-main",
          code: "main",
          name: "TV&Box",
          isDefault: true,
          role: "ADMIN",
          canManage: true,
          projectCount: 1,
        },
        {
          id: "business-unit-sd",
          code: "sd",
          name: "SberDevices",
          isDefault: false,
          role: "MEMBER",
          canManage: false,
          projectCount: 1,
        },
        {
          id: "business-unit-test",
          code: "test1",
          name: "test1",
          isDefault: false,
          role: "MEMBER",
          canManage: false,
          projectCount: 0,
        },
      ],
    }),
  );
  await page.route("**/api/projects/structure-copy-options", (route) =>
    route.fulfill({ status: 404, json: { error: "Проект не найден" } }),
  );
  await mockAdminProject(page);
  await page.goto("/projects");

  await page.getByRole("button", { name: "Создать", exact: true }).click();

  const businessUnitSelect = page.getByLabel("Портфель");
  const businessUnitOptions = businessUnitSelect.locator('option:not([value=""])');
  await expect(businessUnitOptions).toHaveCount(3);
  await expect(businessUnitOptions).toHaveText([
    "TV&Box",
    "SberDevices",
    "test1",
  ]);
  await expect(page.getByText("Проект не найден", { exact: true })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Не копировать, создать тестовую структуру" })
    .click();
  await expect(
    page.getByText(
      "Не удалось загрузить варианты копирования. Проект можно создать без копирования Структуры.",
    ),
  ).toBeVisible();
});

test("Jira work synchronization always uses production", async ({ page }) => {
  let syncBody: { baseUrl?: string } | null = null;
  await mockAdminProject(page);
  await page.route("**/api/projects/project-1/jira-work-sections", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/projects/project-1/jira/sync", async (route) => {
    syncBody = route.request().postDataJSON() as { baseUrl?: string };
    await route.fulfill({
      json: { synced: 0, configuredSections: 0, jiraUsers: [] },
    });
  });
  await page.goto("/TV-OVERVIEW/jira-work");

  await expect(page.getByLabel("Окружение Jira")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "dev", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "prod", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Синхронизировать" }).click();

  await expect.poll(() => syncBody?.baseUrl).toBe("https://tasks.sberdevices.ru");
});

test("Jira work sections expose separate JQL and filter URL fields", async ({
  page,
}) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/jira-work");

  const firstSection = page.locator(".jira-work-section").first();
  const collapsedHeight = await firstSection
    .locator(".jira-work-section-head")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(collapsedHeight).toBeLessThanOrEqual(40);

  await firstSection.locator(".jira-work-section-toggle").click();
  await firstSection.getByRole("button", { name: "JQL", exact: true }).click();

  await expect(firstSection.getByLabel("JQL", { exact: true })).toBeVisible();
  await expect(firstSection.getByLabel("Ссылка на фильтр")).toBeVisible();
});

test("project passport keeps the initial target and updates the current target", async ({
  page,
}) => {
  const project = await mockAdminProject(page, (fixture) => {
    fixture.targetDate = isoDay(45);
    fixture.targetDateChanges = [
      {
        id: "target-change-1",
        projectId: fixture.id,
        previousDate: isoDay(30),
        newDate: isoDay(45),
        reason: "Первое согласование",
        approvedBy: "Комитет",
        createdById: "admin-1",
        createdAt: `${isoDay(-1)}T10:00:00.000Z`,
        createdBy: null,
      },
    ];
  });
  await page.route("**/api/projects/project-1/target-date", async (route) => {
    const body = route.request().postDataJSON() as {
      targetDate: string;
      reason: string;
      approvedBy: string | null;
    };
    await route.fulfill({
      json: {
        ...project,
        targetDate: body.targetDate,
        targetDateChanges: [
          ...project.targetDateChanges,
          {
            id: "target-change-2",
            projectId: project.id,
            previousDate: isoDay(45),
            newDate: body.targetDate,
            reason: body.reason,
            approvedBy: body.approvedBy,
            createdById: "admin-1",
            createdAt: new Date().toISOString(),
            createdBy: null,
          },
        ],
      },
    });
  });
  await page.goto("/TV-OVERVIEW/passport");

  const targetRows = page.locator(".passport-row-readonly");
  await expect(targetRows.nth(0)).toContainText("Цель на старте проекта");
  await expect(targetRows.nth(0)).toContainText(
    isoDay(30).split("-").reverse().join("."),
  );
  await expect(targetRows.nth(1)).toContainText("Текущая актуальная цель");
  await expect(targetRows.nth(1)).toContainText(
    isoDay(45).split("-").reverse().join("."),
  );
  await expect(targetRows.locator("input, textarea, button")).toHaveCount(0);
  await expect(page.getByText("Цели и сроки проекта")).toHaveCount(0);
  await expect(page.getByText("Утвердить новую цель")).toBeVisible();

  await page.getByLabel("Новая дата цели").fill(isoDay(60));
  await page.getByLabel("Причина изменения").fill("Новая утвержденная дата");
  await page.getByLabel("Согласовано").fill("Проектный комитет");
  await page.getByRole("button", { name: "Сохранить цель" }).click();

  await expect(targetRows.nth(0)).toContainText(
    isoDay(30).split("-").reverse().join("."),
  );
  await expect(targetRows.nth(1)).toContainText(
    isoDay(60).split("-").reverse().join("."),
  );
});

test("schedule PDF keeps the print layout until afterprint", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printInvoked = "true";
    };
  });
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/schedule");

  await page.getByRole("button", { name: "Сохранить в PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-invoked", "true");
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-target",
    "project-schedule-print",
  );

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("body")).not.toHaveAttribute("data-print-target", /.*/);
});

test("schedule PDF prints goals and milestones on two complete pages", async ({
  page,
}) => {
  await mockAdminProject(page, (project) => {
    for (let index = 0; index < 12; index += 1) {
      project.wbsItems.push({
        ...project.wbsItems[0],
        id: `goal-${index + 1}`,
        parentId: null,
        code: `G${index + 1}`,
        title: `Цель проекта ${index + 1}`,
        type: "GOAL",
        status: "NOT_STARTED",
        startDate: isoDay(index * 5),
        dueDate: isoDay(index * 5),
        baselineDueDate: isoDay(index * 5 - 2),
        sortOrder: 500 + index,
      });
    }
    for (let index = 0; index < 6; index += 1) {
      const phaseId = `phase-${index + 1}`;
      project.wbsItems.push(
        {
          ...project.wbsItems[0],
          id: phaseId,
          parentId: null,
          code: `${index + 2}`,
          title: `Фаза ${index + 1}`,
          type: "PHASE",
          wbsLevel: 1,
          startDate: isoDay(-30),
          dueDate: isoDay(120),
          sortOrder: 100 + index * 20,
        },
        {
          ...project.wbsItems[0],
          id: `milestone-${index + 1}`,
          parentId: phaseId,
          code: `${index + 2}.1`,
          title: `Веха фазы ${index + 1}`,
          type: "MILESTONE",
          status: "NOT_STARTED",
          startDate: isoDay(index * 12),
          dueDate: isoDay(index * 12),
          sortOrder: 110 + index * 20,
        },
      );
    }
  });
  await page.goto("/TV-OVERVIEW/schedule");
  await expect(page.locator("#milestones-by-phase")).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.printTarget = "project-schedule-print";
    document.body.dataset.printTarget = "project-schedule-print";
  });
  await page.emulateMedia({ media: "print" });

  const printLayout = await page.evaluate(() => {
    const header = document.querySelector(".app-global-header");
    const navigation = document.querySelector(".project-section-navigation");
    return {
      headerDisplay: header ? getComputedStyle(header).display : "absent",
      navigationDisplay: navigation
        ? getComputedStyle(navigation).display
        : "absent",
      targetTop: document
        .getElementById("project-schedule-print")!
        .getBoundingClientRect().top,
      goalsHeadingDisplay: getComputedStyle(
        document.querySelector(".schedule-print-goals > .panel-title")!,
      ).display,
      milestonesHeadingDisplay: getComputedStyle(
        document.querySelector(".schedule-print-milestones > .panel-title")!,
      ).display,
      legendDisplay: getComputedStyle(
        document.querySelector(".schedule-print-milestones .milestone-legend")!,
      ).display,
      goalScale: Number(
        getComputedStyle(
          document.querySelector(".schedule-print-goals .portfolio-goal-timeline")!,
        ).zoom,
      ),
      milestoneScale: Number(
        getComputedStyle(
          document.querySelector(".schedule-print-milestones .milestone-timeline")!,
        ).zoom,
      ),
    };
  });
  expect(["none", "absent"]).toContain(printLayout.headerDisplay);
  expect(["none", "absent"]).toContain(printLayout.navigationDisplay);
  expect(printLayout.targetTop).toBeLessThan(40);
  expect(printLayout.goalsHeadingDisplay).not.toBe("none");
  expect(printLayout.milestonesHeadingDisplay).not.toBe("none");
  expect(printLayout.legendDisplay).not.toBe("none");
  expect(printLayout.goalScale).toBeLessThan(1);
  expect(printLayout.milestoneScale).toBeLessThan(1);

  const clipping = await page.evaluate(() => {
    const goalsPage = document.querySelector(".schedule-print-goals")!;
    const milestonesPage = document.querySelector(".schedule-print-milestones")!;
    const lastGoal = document.querySelector(
      ".schedule-print-goals .portfolio-goal-item:last-child",
    )!;
    const lastLane = document.querySelector(
      ".schedule-print-milestones .milestone-lane:last-child",
    )!;
    return {
      goalBottom: lastGoal.getBoundingClientRect().bottom,
      goalPageBottom: goalsPage.getBoundingClientRect().bottom,
      laneBottom: lastLane.getBoundingClientRect().bottom,
      milestonePageBottom: milestonesPage.getBoundingClientRect().bottom,
    };
  });
  expect(clipping.goalBottom).toBeLessThanOrEqual(clipping.goalPageBottom + 1);
  expect(clipping.laneBottom).toBeLessThanOrEqual(
    clipping.milestonePageBottom + 1,
  );
  if (process.env.CAPTURE_SCHEDULE_PRINT_SCREENSHOT) {
    await page.screenshot({
      path: process.env.CAPTURE_SCHEDULE_PRINT_SCREENSHOT,
      fullPage: true,
    });
  }

  const pdf = await page.pdf({
    format: "A4",
    landscape: true,
    path: process.env.CAPTURE_SCHEDULE_PDF || undefined,
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(countPdfPages(pdf)).toBe(2);
});

test("Gantt keeps old project work available in a short range", async ({ page }) => {
  await mockAdminProject(page, (project) => {
    project.wbsItems.unshift({
      ...project.wbsItems[0],
      id: "wbs-old",
      code: "0.1",
      title: "Историческая задача",
      startDate: isoDay(-180),
      dueDate: isoDay(-170),
      sortOrder: 0,
    });
  });
  await page.goto("/TV-OVERVIEW/gantt");

  await page
    .getByLabel("Диапазон Гантта")
    .getByRole("button", { name: "30 дн." })
    .click();
  await expect(page.locator(".gantt-label", { hasText: "Историческая задача" })).toBeVisible();

  const scrollMetrics = await page.locator(".gantt-panel-scroll").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
});

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

test("portfolio and projects show work-day weighted progress", async ({ page }) => {
  await mockAdminProject(page, (project) => {
    const source = project.wbsItems[0];
    project.wbsItems = [
      { ...source, id: "wbs-done", code: "1.1", status: "DONE", workDays: 4 },
      {
        ...source,
        id: "wbs-active",
        code: "1.2",
        status: "IN_PROGRESS",
        workDays: 3,
      },
      {
        ...source,
        id: "wbs-future",
        code: "1.3",
        status: "NOT_STARTED",
        workDays: 3,
      },
    ];
  });

  const label =
    "Прогресс: завершено 40%, в работе 30%, не начато 30%";

  await page.goto("/projects");
  await expect(page.getByLabel(label)).toBeVisible();
  if (process.env.CAPTURE_PROGRESS === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-progress-projects.png",
      fullPage: true,
    });
  }

  await page.goto("/portfolio");
  await expect(page.getByLabel(label)).toBeVisible();
  if (process.env.CAPTURE_PROGRESS === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-progress-portfolio.png",
      fullPage: true,
    });
  }
});

test("portfolio project filter scopes goals problems and risks only", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const first = portfolioProjectFixture(
    "project-1",
    "TV-FIRST",
    "Первый проект",
    "Первая цель",
    "Первая проблема",
    "Первый риск",
  );
  const second = portfolioProjectFixture(
    "project-2",
    "TV-SECOND",
    "Второй проект",
    "Вторая цель",
    "Вторая проблема",
    "Второй риск",
  );
  await mockAdminPortfolio(page, [first, second]);
  await page.goto("/portfolio");

  const filter = page.getByTestId("portfolio-project-filter");
  const summary = filter.locator("summary");
  await expect(summary).toContainText("Все 2");
  await expect(filter).not.toHaveClass(/is-filtered/);
  await expect(page.locator(".portfolio-project-timeline-row")).toHaveCount(2);

  await summary.click();
  await filter.getByRole("checkbox", { name: /TV-SECOND.*Второй проект/ }).uncheck();

  await expect(summary).toContainText("1 из 2");
  await expect(filter).toHaveClass(/is-filtered/);
  await expect(page.getByText("Вторая цель", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Вторая проблема", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Второй риск", { exact: true })).toHaveCount(0);
  await expect(
    page.locator(".projects-overview-card", { hasText: "Второй проект" }),
  ).toBeVisible();

  const popover = filter.locator(".portfolio-project-filter-popover");
  const desktopBox = await popover.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.x).toBeGreaterThanOrEqual(0);
  expect(desktopBox!.x + desktopBox!.width).toBeLessThanOrEqual(1440);
  if (process.env.CAPTURE_PORTFOLIO_FILTER === "1") {
    await page.locator(".portfolio-goal-timeline-panel").screenshot({
      path: "/private/tmp/pms-portfolio-filter-desktop.png",
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await summary.scrollIntoViewIfNeeded();
  const mobileBox = await popover.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(390);
  if (process.env.CAPTURE_PORTFOLIO_FILTER === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-portfolio-filter-mobile.png",
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });

  await filter.getByRole("button", { name: "Снять все" }).click();
  await expect(summary).toContainText("0 из 2");
  await expect(
    page.getByText("Для отображения не выбран ни один проект."),
  ).toHaveCount(3);
  await expect(page.locator(".projects-overview-card")).toHaveCount(2);

  await filter.getByRole("button", { name: "Выбрать все" }).click();
  await expect(summary).toContainText("Все 2");
  await expect(filter).not.toHaveClass(/is-filtered/);
  await expect(page.locator(".portfolio-project-timeline-row")).toHaveCount(2);
});

test("risk page keeps the color matrix visible", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/risks");

  const matrix = page.getByLabel("Матрица рисков");
  await expect(matrix).toBeVisible();
  await expect(matrix.locator(".risk-matrix-cell")).toHaveCount(25);
  await expect(
    page.getByLabel(
      "Вероятность 4, влияние 4, высокий риск, записей: 1",
    ),
  ).toBeVisible();
});

test("overview sections scroll after six visible items", async ({ page }) => {
  await mockAdminProject(page, (project) => {
    const risk = project.raidItems[0];
    project.raidItems = Array.from({ length: 7 }, (_, index) => ({
      ...risk,
      id: `risk-${index + 1}`,
      title: `Риск ${index + 1}`,
      statusUpdates: [],
    }));
  });

  await page.goto("/TV-OVERVIEW/overview");

  const card = page.locator(".executive-overview-card.danger");
  const list = card.locator(".executive-overview-list");
  await expect(card.locator(".executive-overview-card-title strong")).toHaveText("7");
  await expect(list.locator(".executive-overview-row")).toHaveCount(7);

  const metrics = await list.evaluate((element) => {
    const listBox = element.getBoundingClientRect();
    const visibleRows = [...element.querySelectorAll(".executive-overview-row")].filter(
      (row) => {
        const rowBox = row.getBoundingClientRect();
        return rowBox.top >= listBox.top && rowBox.bottom <= listBox.bottom;
      },
    ).length;
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      visibleRows,
    };
  });

  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.visibleRows).toBeLessThanOrEqual(6);
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

  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.getByRole("button", { name: "Критический путь" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Выбрать строку 1.1" }).check();
  await page.getByRole("button", { name: "Обновить базовый план" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Обновить базовый план?",
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Обновить" }).click();

  await expect.poll(() => baselineBody).toEqual({ itemIds: ["wbs-1"] });
});

test("WBS deletion uses one in-app confirmation without a browser dialog", async ({
  page,
}) => {
  await mockAdminProject(page);
  let deleteRequests = 0;
  let browserDialogs = 0;
  page.on("dialog", async (dialog) => {
    browserDialogs += 1;
    await dialog.dismiss();
  });
  await page.route("**/api/wbs-items/wbs-1", async (route) => {
    deleteRequests += 1;
    await route.fulfill({
      json: {
        wbsItems: [],
        wbsDependencies: [],
        criticalPath: null,
      },
    });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await page
    .getByRole("button", { name: "Удалить строку Структуры" })
    .click({ force: true });

  const confirmation = page.getByRole("dialog", {
    name: "Удалить строку Структуры?",
  });
  await expect(confirmation).toBeVisible();
  expect(browserDialogs).toBe(0);

  await confirmation.getByRole("button", { name: "Удалить" }).click();
  await expect(confirmation).toBeHidden();
  await expect.poll(() => deleteRequests).toBe(1);
  expect(browserDialogs).toBe(0);
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

test("read-only WBS rows keep the editable table geometry", async ({ page }) => {
  await mockReadOnlyProject(page);
  await page.goto("/TV-OVERVIEW/wbs");

  const structureCell = page.locator(".wbs-work-cell.read-only-cell").first();
  const title = structureCell.locator(".wbs-title-input");
  await expect(title).toHaveValue("Тестовая задача");
  const dimensions = await title.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.clientWidth).toBeGreaterThan(72);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(structureCell.locator(".wbs-row-select")).toBeDisabled();
  await expect(
    page.locator(".wbs-level-cell.read-only-cell").first().locator("button").first(),
  ).toBeDisabled();
  await expect(
    page.locator(".wbs-predecessor-editor.read-only-cell").first().locator("button"),
  ).toHaveCount(2);
});

test("visual refresh keeps two-level navigation and Gantt rows aligned", async ({
  page,
}) => {
  await mockAdminProject(page, (project) => {
    project.wbsItems.push({
      ...project.wbsItems[0],
      id: "wbs-2",
      code: "1.2",
      title: "Вторая тестовая задача",
      sortOrder: 20,
    });
    project.wbsItems.push(
      {
        ...project.wbsItems[0],
        id: "phase-1",
        code: "2",
        title: "Аппаратная часть",
        type: "PHASE",
        wbsLevel: 1,
        sortOrder: 30,
      },
      {
        ...project.wbsItems[0],
        id: "milestone-1",
        parentId: "phase-1",
        code: "2.1",
        title: "Образцы готовы",
        type: "MILESTONE",
        status: "NOT_STARTED",
        startDate: isoDay(12),
        dueDate: isoDay(12),
        sortOrder: 40,
      },
    );
  });
  await page.setViewportSize({ width: 2048, height: 1152 });
  await page.goto("/TV-OVERVIEW/gantt");

  const globalNav = page.locator(".app-global-header");
  const projectNav = page.locator(".project-section-navigation");
  await expect(globalNav).toBeVisible();
  await expect(projectNav).toBeVisible();
  await expect(globalNav.getByRole("button", { name: "Проекты" })).toBeVisible();
  await expect(projectNav.getByRole("button", { name: "Гантт" })).toHaveClass(
    /active/,
  );
  await expect(projectNav.getByRole("button", { name: "Риски" })).toBeVisible();
  const projectTabsFit = await projectNav.locator(".section-tabs").evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  expect(projectTabsFit).toBe(true);

  const ganttRange = page.getByLabel("Диапазон Гантта");
  for (const days of [30, 90, 180]) {
    await ganttRange.getByRole("button", { name: `${days} дн.` }).click();
    const widths = await page.locator(".gantt-panel").evaluate((panel) => {
      const panelBox = panel.getBoundingClientRect();
      const timelineBox = panel
        .querySelector(".gantt-timeline")
        ?.getBoundingClientRect();
      return {
        panelRight: panelBox.right,
        timelineRight: timelineBox?.right ?? 0,
      };
    });
    expect(Math.abs(widths.panelRight - widths.timelineRight)).toBeLessThanOrEqual(2);
  }

  for (const rowIndex of [0, 1]) {
    const labelBox = await page.locator(".gantt-label").nth(rowIndex).boundingBox();
    const trackBox = await page.locator(".gantt-track-row").nth(rowIndex).boundingBox();
    expect(labelBox).not.toBeNull();
    expect(trackBox).not.toBeNull();
    if (labelBox && trackBox) {
      expect(Math.abs(labelBox.y - trackBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(labelBox.height - trackBox.height)).toBeLessThanOrEqual(1);
    }
  }

  await page.goto("/TV-OVERVIEW/schedule");
  const milestoneWidths = await page.locator(".milestone-timeline").evaluate(
    (timeline) => {
      const timelineBox = timeline.getBoundingClientRect();
      const canvasBox = timeline
        .querySelector(".milestone-lane-canvas")
        ?.getBoundingClientRect();
      return {
        timelineRight: timelineBox.right,
        canvasRight: canvasBox?.right ?? 0,
      };
    },
  );
  expect(
    Math.abs(milestoneWidths.timelineRight - milestoneWidths.canvasRight),
  ).toBeLessThanOrEqual(14);

  await page.goto("/TV-OVERVIEW/wbs");
  await expect(
    page.locator('select:has(option[value="RU_CN"])').first(),
  ).toBeVisible();

  if (process.env.CAPTURE_DESIGN_REFRESH === "1") {
    await page.goto("/TV-OVERVIEW/gantt");
    await expect(page.locator(".gantt-panel")).toBeVisible();
    await page.screenshot({
      path: "/private/tmp/pms-design-gantt-desktop.png",
      fullPage: true,
    });
    await page.goto("/TV-OVERVIEW/overview");
    await expect(page.locator(".executive-overview-card").first()).toBeVisible();
    await page.screenshot({
      path: "/private/tmp/pms-design-overview-desktop.png",
      fullPage: true,
    });
    await page.goto("/TV-OVERVIEW/risks");
    await expect(page.getByLabel("Матрица рисков")).toBeVisible();
    await page.screenshot({
      path: "/private/tmp/pms-design-raid-desktop.png",
      fullPage: true,
    });
    await page.goto("/projects");
    await expect(page.locator(".projects-overview-card").first()).toBeVisible();
    await page.screenshot({
      path: "/private/tmp/pms-design-projects-desktop.png",
      fullPage: true,
    });
    await page.goto("/TV-OVERVIEW/gantt");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(globalNav).toBeVisible();
  await expect(projectNav).toBeVisible();
  await expect(page.locator(".global-header-search")).toBeHidden();
  await expect(projectNav.getByRole("button", { name: "Гантт" })).toBeVisible();

  if (process.env.CAPTURE_DESIGN_REFRESH === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-design-gantt-mobile.png",
      fullPage: true,
    });
  }
});

test("project navigation and current work reflect the structure", async ({ page }) => {
  let savedPatch: Record<string, unknown> | null = null;
  let savedCurrentWorkWidths: Record<string, number> | null = null;
  let renumberRequests = 0;
  const project = await mockAdminProject(page, (project) => {
    project.wbsItems.unshift({
      ...project.wbsItems[0],
      id: "work-package-1",
      parentId: null,
      code: "1",
      title: "Пакет интеграции",
      type: "WORK_PACKAGE",
      comment: null,
    });
    project.wbsItems[1].parentId = "work-package-1";
    project.wbsItems[1].jiraTicketUrl = "https://tasks.sberdevices.ru/browse/TV-1";
    project.wbsItems[1].mattermostUrl = "https://mm.sberdevices.ru/channel/thread";
  });
  await page.route("**/api/wbs-items/wbs-1", async (route) => {
    savedPatch = route.request().postDataJSON() as Record<string, unknown>;
    Object.assign(project.wbsItems[1], savedPatch);
    await route.fulfill({
      json: {
        item: project.wbsItems[1],
        wbsItems: project.wbsItems,
        wbsDependencies: [],
        criticalPath: null,
      },
    });
  });
  await page.route(/\/api\/projects\/project-1\/wbs-items\/renumber$/, (route) => {
    renumberRequests += 1;
    return route.fulfill({
      json: {
        wbsItems: project.wbsItems,
        wbsDependencies: [],
        criticalPath: null,
      },
    });
  });
  await page.route("**/api/projects/project-1", async (route) => {
    const body = route.request().postDataJSON() as {
      uiState?: { currentWorkColumnWidths?: Record<string, number> };
    };
    savedCurrentWorkWidths = body.uiState?.currentWorkColumnWidths ?? null;
    await route.fulfill({ json: { id: project.id, uiState: body.uiState } });
  });
  await page.goto("/TV-OVERVIEW/current-work");

  const projectPickerTrigger = page.getByRole("button", {
    name: /Проект TV-OVERVIEW\. Открыть список проектов/,
  });
  await expect(projectPickerTrigger).toHaveText(/TV-OVERVIEW/);
  await expect(projectPickerTrigger).not.toContainText(project.name);
  expect(
    await projectPickerTrigger.locator("span").evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await projectPickerTrigger.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(168);

  const projectNav = page.getByRole("navigation", { name: "Разделы проекта" });
  const orderedLabels = [
    "Состояние",
    "График",
    "Гантт",
    "Требования",
    "Паспорт",
    "Текучка",
    "Структура",
  ];
  const tabPositions = await Promise.all(
    orderedLabels.map(async (label) => {
      const tab = projectNav.getByRole("button", { name: label, exact: true });
      await expect(tab).toBeVisible();
      return (await tab.boundingBox())?.x ?? 0;
    }),
  );
  expect(tabPositions).toEqual([...tabPositions].sort((left, right) => left - right));
  const currentWork = page.getByRole("table", { name: "Текучка проекта" });
  await expect(currentWork).toContainText("1.1");
  await expect(currentWork).toContainText("1 Пакет интеграции");
  const workPackageHeader = currentWork.getByRole("columnheader", {
    name: /^Пакет работ/,
  });
  const initialWorkPackageWidth = await workPackageHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const resizeHandle = page.getByRole("button", {
    name: "Изменить ширину колонки Пакет работ",
  });
  const resizeHandleBox = await resizeHandle.boundingBox();
  expect(resizeHandleBox).not.toBeNull();
  if (resizeHandleBox) {
    await page.mouse.move(
      resizeHandleBox.x + resizeHandleBox.width / 2,
      resizeHandleBox.y + resizeHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(resizeHandleBox.x - 45, resizeHandleBox.y + 4);
    await page.mouse.up();
  }
  await expect
    .poll(() => savedCurrentWorkWidths?.workPackage ?? initialWorkPackageWidth)
    .toBeLessThan(initialWorkPackageWidth);
  const resizedWorkPackageWidth = await workPackageHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(resizedWorkPackageWidth).toBeLessThan(initialWorkPackageWidth);
  expect(
    Math.abs(
      resizedWorkPackageWidth -
        (savedCurrentWorkWidths?.workPackage ?? resizedWorkPackageWidth),
    ),
  ).toBeLessThanOrEqual(1);
  const titleHeader = currentWork.getByRole("columnheader", {
    name: /^Наименование/,
  });
  const initialTitleWidth = await titleHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  const titleResizeHandle = page.getByRole("button", {
    name: "Изменить ширину колонки Наименование",
  });
  const titleResizeHandleBox = await titleResizeHandle.boundingBox();
  expect(titleResizeHandleBox).not.toBeNull();
  if (titleResizeHandleBox) {
    await page.mouse.move(
      titleResizeHandleBox.x + titleResizeHandleBox.width / 2,
      titleResizeHandleBox.y + titleResizeHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(titleResizeHandleBox.x - 50, titleResizeHandleBox.y + 4);
    await page.mouse.up();
  }
  await expect
    .poll(() => savedCurrentWorkWidths?.title ?? initialTitleWidth)
    .toBeLessThan(initialTitleWidth);
  const resizedTitleWidth = await titleHeader.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(resizedTitleWidth).toBeLessThan(initialTitleWidth);
  expect(
    Math.abs(
      resizedTitleWidth - (savedCurrentWorkWidths?.title ?? resizedTitleWidth),
    ),
  ).toBeLessThanOrEqual(1);
  await expect(page.getByLabel("Комментарий 1.1")).toHaveValue("Проверить результат");
  const commentInput = page.getByLabel("Комментарий 1.1");
  for (const editor of [
    page.getByLabel("Статус 1.1"),
    page.getByLabel("Срок 1.1"),
    page.getByLabel("Исполнитель 1.1"),
    commentInput,
  ]) {
    await expect(editor).toHaveCSS("border-top-width", "0px");
    await expect(editor).toHaveCSS("border-radius", "0px");
    await expect(editor).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  await expect(commentInput).toHaveAttribute("rows", "3");
  await expect(commentInput).toHaveAttribute("wrap", "soft");
  await expect(commentInput).toHaveCSS("min-height", "62px");
  await expect(commentInput).toHaveCSS("padding-top", "4px");
  await expect(commentInput).toHaveCSS("padding-bottom", "4px");
  await expect(commentInput).toHaveCSS("overflow-y", "auto");
  await expect(commentInput).toHaveCSS("resize", "none");
  await expect(commentInput).toHaveCSS("overflow-wrap", "anywhere");
  const commentCellGaps = await commentInput.evaluate((element) => {
    const field = element.getBoundingClientRect();
    const cell = element.parentElement?.getBoundingClientRect();
    return cell
      ? { top: field.top - cell.top, bottom: cell.bottom - field.bottom }
      : null;
  });
  expect(commentCellGaps).not.toBeNull();
  expect(Math.abs(commentCellGaps?.top ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
  expect(Math.abs(commentCellGaps?.bottom ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
  await commentInput.locator("..").click();
  await expect(commentInput).toBeFocused();
  await commentInput.fill("Новый комментарий\nВторая строка\nТретья строка");
  await commentInput.blur();
  await expect.poll(() => savedPatch?.comment).toBe(
    "Новый комментарий\nВторая строка\nТретья строка",
  );
  await expect(page.getByLabel("Статус 1.1")).toBeEnabled();
  await expect(page.getByLabel("Срок 1.1")).toBeEnabled();
  await expect(page.getByLabel("Исполнитель 1.1")).toBeEnabled();
  await expect(page.getByRole("link", { name: "Jira", exact: true })).toHaveAttribute(
    "href",
    "https://tasks.sberdevices.ru/browse/TV-1",
  );
  await expect(page.getByRole("link", { name: "MM", exact: true })).toHaveAttribute(
    "href",
    "https://mm.sberdevices.ru/channel/thread",
  );
  await page.getByRole("button", { name: "Изменить ссылку MM 1.1" }).click();
  let mmInput = page.getByLabel("Ссылка MM 1.1");
  await mmInput.fill("https://mm.sberdevices.ru.evil.test/channel");
  await expect(mmInput).toHaveAttribute("aria-invalid", "true");
  await mmInput.blur();
  await expect(page.getByRole("link", { name: "MM", exact: true })).toHaveAttribute(
    "href",
    "https://mm.sberdevices.ru/channel/thread",
  );
  await page.getByRole("button", { name: "Изменить ссылку MM 1.1" }).click();
  mmInput = page.getByLabel("Ссылка MM 1.1");
  await mmInput.fill("https://mm.sberdevices.ru/team/channel");
  await mmInput.blur();
  await expect.poll(() => savedPatch?.mattermostUrl).toBe(
    "https://mm.sberdevices.ru/team/channel",
  );
  await expect.poll(() => renumberRequests).toBeGreaterThan(0);
  if (process.env.CAPTURE_CURRENT_WORK === "1") {
    await currentWork.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.screenshot({
      path: "/private/tmp/pms-current-work-desktop.png",
      fullPage: true,
    });
    await currentWork.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.screenshot({
      path: "/private/tmp/pms-current-work-links-desktop.png",
      fullPage: true,
    });
    await currentWork.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/private/tmp/pms-current-work-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("button", { name: "Раскрыть элемент Структуры" }).click();
  await expect(page.getByText("Сводка по работам", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Комментарий", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jira URL", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "MM", exact: true })).toBeVisible();
  const jiraHeaderWidth = await page
    .getByRole("columnheader", { name: /^Jira URL/ })
    .evaluate((element) => element.getBoundingClientRect().width);
  const mmHeaderWidth = await page
    .getByRole("columnheader", { name: /^MM/ })
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(jiraHeaderWidth).toBeLessThanOrEqual(89);
  expect(mmHeaderWidth).toBeLessThanOrEqual(77);
  await expect(page.getByRole("link", { name: "Jira", exact: true })).toHaveAttribute(
    "href",
    "https://tasks.sberdevices.ru/browse/TV-1",
  );
  await expect(page.getByRole("link", { name: "MM", exact: true })).toHaveAttribute(
    "href",
    "https://mm.sberdevices.ru/team/channel",
  );
});

function countPdfPages(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}
