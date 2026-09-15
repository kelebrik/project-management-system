import { expect, test, type Locator, type Page } from "./fixtures";
import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  jiraSemanticDefaultOutputField,
  jiraAnalyticsSourceUsesPeriod,
} from "@pms/shared";
import {
  countPdfPages,
  expectBusinessUnitCalloutToPointAtField,
  isoDay,
  mockAdminPortfolio,
  mockAdminProject,
  mockManagedJiraAnalytics,
  mockReadOnlyProject,
  portfolioProjectFixture,
  projectFixture,
} from "./overview-and-baseline.support";

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
  await expectBusinessUnitCalloutToPointAtField(page);
  if (process.env.CAPTURE_BUSINESS_UNIT_CONFIRM === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-business-unit-confirm-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expectBusinessUnitCalloutToPointAtField(page);
    await page.screenshot({
      path: "/private/tmp/pms-business-unit-confirm-mobile.png",
      fullPage: false,
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
  let syncBody: {
    baseUrl?: string;
    scopeType?: string;
    scopeValue?: string;
  } | null = null;
  await mockAdminProject(page);
  await page.route("**/api/projects/project-1/jira-work-sections", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/projects/project-1/jira/sync", async (route) => {
    syncBody = route.request().postDataJSON() as typeof syncBody;
    await route.fulfill({
      status: 202,
      json: {
        runId: "run-1",
        status: "QUEUED",
        statusUrl: "/api/projects/project-1/jira/sync-runs/run-1",
        pollAfterMs: 3000,
      },
    });
  });
  await page.route("**/api/projects/project-1/jira/sync-runs/run-1", (route) =>
    route.fulfill({
      json: {
        runId: "run-1",
        status: "SUCCEEDED",
        result: { synced: 0, configuredSections: 0, jiraUsers: [] },
      },
    }),
  );
  await page.goto("/TV-OVERVIEW/jira-work");

  await expect(page.getByLabel("Окружение Jira")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "dev", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "prod", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Обновить" }).click();

  await expect.poll(() => syncBody?.baseUrl).toBe("https://tasks.sberdevices.ru");
  await expect.poll(() => syncBody?.scopeType).toBe("LABEL");
  await expect.poll(() => syncBody?.scopeValue).toBe("cvte968");
});

test("Jira synchronization shows the server conflict when no active run is available", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/projects/project-1/jira-work-sections", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.route("**/api/projects/project-1/jira/sync", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: "Обновление Jira для этого проекта уже выполняется",
        runId: null,
        statusUrl: null,
      },
    }),
  );
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Обновить" }).click();
  await expect(page.getByText("Обновление Jira для этого проекта уже выполняется")).toBeVisible();
});

test("Jira backfill polling survives a transient status failure", async ({ page }) => {
  const project = await mockAdminProject(page);
  await mockManagedJiraAnalytics(page, project);
  let statusRequests = 0;
  await page.route("**/api/projects/project-1/jira/backfill", (route) =>
    route.fulfill({
      status: 202,
      json: {
        runId: "backfill-1",
        status: "QUEUED",
        statusUrl: "/api/projects/project-1/jira/sync-runs/backfill-1",
        pollAfterMs: 3_000,
      },
    }),
  );
  await page.route("**/api/projects/project-1/jira/sync-runs/backfill-1", (route) => {
    statusRequests += 1;
    if (statusRequests === 1) return route.abort("failed");
    return route.fulfill({
      json: { runId: "backfill-1", status: "SUCCEEDED", result: { synced: 1 } },
    });
  });

  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Данные Jira" }).click();
  await page.getByRole("button", { name: "Полный импорт" }).click();

  await expect(page.getByText("Полный импорт Jira завершён; отчёт полноты обновлён.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Полный импорт" })).toBeEnabled();
  expect(statusRequests).toBe(2);
});

test("Jira data page owns the project scope and no longer exposes work sections", async ({
  page,
}) => {
  const project = await mockAdminProject(page);
  await mockManagedJiraAnalytics(page, project);
  let clearRequests = 0;
  let syncScopeValue: string | null = null;
  await page.route("**/api/projects/project-1/jira-work-sections", (route) =>
    route.fulfill({ json: { sections: [] } }),
  );
  await page.route("**/api/projects/project-1/jira/sync", async (route) => {
    syncScopeValue = (route.request().postDataJSON() as { scopeValue?: string }).scopeValue ?? null;
    await route.fulfill({
      status: 202,
      json: {
        runId: "scope-run-1",
        status: "QUEUED",
        statusUrl: "/api/projects/project-1/jira/sync-runs/scope-run-1",
        pollAfterMs: 3_000,
      },
    });
  });
  await page.route("**/api/projects/project-1/jira/sync-runs/scope-run-1", (route) =>
    route.fulfill({
      json: {
        runId: "scope-run-1",
        status: "SUCCEEDED",
        result: { synced: 1, configuredSections: 0, jiraUsers: [] },
      },
    }),
  );
  await page.route("**/api/projects/project-1/jira/data", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    clearRequests += 1;
    await route.fulfill({
      json: {
        projectId: "project-1",
        ticketsDeleted: 244,
        versionsDeleted: 348,
        retriesDeleted: 0,
      },
    });
  });
  await page.goto("/TV-OVERVIEW/jira-work");

  await expect(page.getByRole("combobox", { name: "Способ отбора тикетов" })).toHaveCount(0);
  await page.getByRole("button", { name: "Данные Jira" }).click();

  await expect(page.getByRole("heading", { name: "Область синхронизации Jira" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Способ отбора тикетов" })).toBeEnabled();
  await expect(page.getByLabel("Лейблы Jira")).toHaveValue("cvte968");
  await page.getByLabel("Лейблы Jira").fill("cvte968, cvte950, cvte968");
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect.poll(() => syncScopeValue).toBe("cvte950, cvte968");

  const controlCenters = await Promise.all([
    page.getByRole("combobox", { name: "Способ отбора тикетов" }),
    page.getByLabel("Лейблы Jira"),
    page.getByRole("button", { name: "Обновить", exact: true }),
    page.getByRole("button", { name: "Очистить", exact: true }),
    page.getByRole("button", { name: "Полный импорт" }),
    page.getByRole("button", { name: "Обновить состояние импорта" }),
  ].map(async (locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error("Data Jira control is not visible");
    return box.y + box.height / 2;
  }));
  expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(2);

  await page.getByRole("combobox", { name: "Способ отбора тикетов" }).selectOption("EPIC");
  await page.getByLabel("Код эпика Jira").fill("CVTE-1234");
  await expect(page.getByRole("button", { name: "Очистить" })).toBeVisible();
  await page.getByRole("button", { name: "Очистить" }).click();
  await expect(page.getByRole("dialog", { name: "Очистить данные Jira проекта?" })).toBeVisible();
  await page.getByRole("button", { name: "Очистить данные" }).click();
  await expect.poll(() => clearRequests).toBe(1);
  await expect(page.getByText(/Данные Jira проекта очищены: тикетов 244/)).toBeVisible();
  await expect(page.locator(".jira-work-section")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Создать раздел" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("Jira v5 separates managed aggregate rows from widget presentation", async ({ page }) => {
  const project = await mockAdminProject(page);
  project._count.jiraSnapshots = 1;
  const analytics = await mockManagedJiraAnalytics(page, project);

  await page.goto("/TV-OVERVIEW/jira-work");
  await expect(page.locator(".jira-analytics-widget")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "В работе" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ретро" })).toBeVisible();

  await page.getByRole("button", { name: "Агрегаты" }).click();
  await expect(page.getByRole("heading", { name: "Агрегаты", exact: true })).toBeVisible();
  const aggregateActionButtons = page.locator(".jira-aggregate-actions > button:visible");
  await expect(aggregateActionButtons).toHaveCount(3);
  expect(await aggregateActionButtons.evaluateAll((buttons) => buttons.every((button) => {
    const icon = button.querySelector("svg");
    if (!icon) return false;
    const buttonBounds = button.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    return Math.abs(
      (buttonBounds.top + buttonBounds.height / 2) - (iconBounds.top + iconBounds.height / 2),
    ) <= 1;
  }))).toBe(true);
  for (const name of ["Тикеты", "Переходы статусов", "Активность разработки", "Интервалы статусов", "SLA Critical/Blocker"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  await page.getByRole("button", { name: /^Интервалы статусов/ }).click();
  await expect(page.getByRole("combobox", { name: "Правило формирования строк" })).toHaveValue("interval");
  await expect(page.getByRole("textbox", { name: "Гранулярность", exact: true })).toHaveValue("Интервал");
  await expect(page.getByRole("textbox", { name: "Гранулярность", exact: true })).toBeDisabled();
  await expect(page.getByRole("group", { name: "Контрольные точки интервала" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Контрольная точка" }).first()).toHaveValue("issueCreated");
  await expect(page.getByRole("combobox", { name: "Контрольная точка" }).last()).toHaveValue("statusEntry");
  await expect(page.getByLabel("Метрика")).toHaveCount(0);
  await expect(page.getByLabel("Группировка")).toHaveCount(0);
  await expect(page.getByLabel("Визуализация")).toHaveCount(0);
  await page.getByRole("button", { name: "Показать данные" }).click();
  await expect(page.locator(".jira-aggregate-preview-number").getByText("1", { exact: true })).toBeVisible();
  await expect(page.locator(".jira-aggregate-preview-records").getByRole("link", { name: "TV-101" })).toBeVisible();

  await page.getByRole("button", { name: "В работе", exact: true }).click();
  await page.getByRole("button", { name: "Редактировать" }).click();
  await page.getByRole("button", { name: "Добавить виджет" }).click();
  const editor = page.getByLabel("Настройки виджета");
  await expect(editor.getByLabel("Агрегат")).toHaveValue("semantic-issues");
  await expect(editor.getByLabel("Результат")).toBeVisible();
  await expect(editor.getByLabel("Группировка")).toBeVisible();
  await expect(editor.getByRole("group", { name: "Поля" })).toBeVisible();
  await expect(editor.getByRole("group", { name: "Ширина колонок" })).toHaveCount(0);
  await expect(editor.getByLabel("Раздел")).toHaveCount(0);

  await editor.getByLabel("Агрегат").selectOption("semantic-status-transitions");
  await expect(editor.getByLabel("Агрегат")).toHaveValue("semantic-status-transitions");
  await editor.getByLabel("Агрегат").selectOption("semantic-issues");
  await expect(editor.getByLabel("Агрегат")).toHaveValue("semantic-issues");

  await editor.getByLabel("Результат").selectOption("list");
  await expect(editor.getByRole("group", { name: "Ширина колонок" })).toBeVisible();
  for (const field of ["Проект Jira", "Текущий статус", "Исполнитель", "Resolution", "Дата создания", "Последнее изменение", "Есть активность разработки"]) {
    await editor.getByRole("checkbox", { name: field, exact: true }).uncheck();
  }
  await editor.getByRole("group", { name: "Ширина виджета" }).getByRole("button", { name: "1/1" }).click();
  const issueKeyWidth = editor.getByLabel("Ширина поля «Ключ тикета», пикселей");
  const summaryWidth = editor.getByLabel("Ширина поля «Название», пикселей");
  await issueKeyWidth.fill("");
  await issueKeyWidth.blur();
  await expect(issueKeyWidth).toHaveValue("110");
  await issueKeyWidth.fill("");
  await issueKeyWidth.pressSequentially("180");
  await issueKeyWidth.press("Enter");
  await expect(issueKeyWidth).toBeFocused();
  await summaryWidth.fill("");
  await summaryWidth.pressSequentially("420");
  await summaryWidth.press("Enter");
  await summaryWidth.fill("500");
  await editor.getByRole("button", { name: "Сбросить ширину поля «Название»" }).click();
  await expect(summaryWidth).toHaveValue("300");
  await summaryWidth.fill("420");
  await summaryWidth.press("Enter");
  await page.getByRole("button", { name: "Добавить виджет" }).click();
  await editor.getByLabel("Результат").selectOption("list");
  const secondSummaryWidth = editor.getByLabel("Ширина поля «Название», пикселей");
  await expect(secondSummaryWidth).toHaveValue("300");
  await secondSummaryWidth.fill("500");
  await secondSummaryWidth.press("Escape");
  await secondSummaryWidth.blur();
  await expect(secondSummaryWidth).toHaveValue("300");
  await expect(editor.getByRole("button", { name: "Сбросить ширину поля «Название»" })).toBeDisabled();
  await page.locator(".jira-analytics-widget.selected").getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  const widget = page.locator(".jira-analytics-widget").filter({ hasText: "Тикеты" });
  await expect(widget.getByRole("link", { name: "TV-101" })).toBeVisible();
  expect((analytics.getSemanticDashboard().widgets[0] as { columnWidths?: Record<string, number> }).columnWidths).toMatchObject({
    issueKey: 180,
    summary: 420,
  });
  const issueKeyHeader = await widget.getByRole("columnheader", { name: "Ключ тикета" }).boundingBox();
  const summaryHeader = await widget.getByRole("columnheader", { name: "Название" }).boundingBox();
  const table = await widget.getByRole("table").boundingBox();
  expect(issueKeyHeader?.width).toBeCloseTo(180, 0);
  expect(summaryHeader?.width).toBeCloseTo(420, 0);
  expect(table?.width).toBeCloseTo(600, 0);

  await page.getByRole("button", { name: "Редактировать" }).click();
  await widget.getByRole("button", { name: "Настроить" }).click();
  await editor.getByRole("checkbox", { name: "Проект Jira", exact: true }).check();
  await editor.getByLabel("Результат").selectOption("count");
  await editor.getByLabel("Группировка").selectOption("project");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(widget.locator(".jira-analytics-bars")).toBeVisible();
  await expect(widget.getByText("In Progress", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Редактировать" }).click();
  await widget.getByRole("button", { name: "Удалить" }).click();
  await expect(page.locator(".jira-analytics-widget")).toHaveCount(0);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator(".jira-analytics-widget")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("Jira v5 aggregate and widget mutations stay hidden from non-system administrators", async ({ page }) => {
  const project = await mockAdminProject(page);
  await mockManagedJiraAnalytics(page, project);
  await page.unroute("**/api/auth/me");
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "viewer-1",
          email: "viewer@example.test",
          name: "Наблюдатель",
          role: "EXECUTIVE_VIEWER",
          isActive: true,
          lastLoginAt: null,
        },
      },
    }),
  );

  await page.goto("/TV-OVERVIEW/jira-work");
  await expect(page.getByRole("button", { name: "Редактировать" })).toHaveCount(0);
  await page.getByRole("button", { name: "Агрегаты" }).click();
  await expect(page.getByRole("button", { name: "Создать агрегат" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Показать данные" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Название", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Гранулярность", exact: true })).toBeDisabled();
});
