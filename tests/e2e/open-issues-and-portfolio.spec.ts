import { expect, test, type Locator, type Page } from "@playwright/test";
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

test("new open issue keeps inline register fields in the create request", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    fixture.wbsItems.push({
      ...fixture.wbsItems[0],
      id: "phase-create-issue",
      parentId: null,
      code: "2",
      title: "Серийный выпуск",
      type: "PHASE",
      wbsLevel: 1,
      sortOrder: 20,
    });
  });
  let createPayload: Record<string, unknown> | null = null;
  await page.route("**/api/projects/project-1/open-issues", async (route) => {
    createPayload = route.request().postDataJSON() as Record<string, unknown>;
    const created = {
      ...project.issues[0],
      id: "issue-created",
      ...createPayload,
      status: "Open",
      jiraLinks: [],
      statusUpdates: [],
    };
    project.issues.push(created);
    await route.fulfill({ status: 201, json: created });
  });

  await page.goto("/TV-OVERVIEW/issues");
  await page.getByRole("button", { name: "Создать вопрос" }).click();
  const dialog = page.getByRole("dialog", { name: "Создать открытый вопрос" });
  await dialog.getByLabel("Заголовок").fill("  Проверить выпуск  ");
  await dialog.getByLabel("Раздел").fill("  Новый пульт  ");
  await dialog.getByLabel("Фаза").selectOption("phase-create-issue");
  const phaseConfirmation = page.getByRole("dialog", { name: "Создать пакет работ?" });
  await expect(phaseConfirmation).toContainText("2 · Серийный выпуск");
  await phaseConfirmation.getByRole("button", { name: "Создать" }).click();
  await dialog.getByLabel("Готовность").selectOption("AMBER");
  await dialog.getByLabel("Ссылка на трэд").fill("https://example.test/thread/42");
  await dialog.getByLabel("Ключ основного тикета").fill("cvte-1842");
  await expect(dialog.getByPlaceholder("https://jira.company.ru/browse/ERP-1842")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Создать вопрос" }).click();

  await expect.poll(() => createPayload).toMatchObject({
    title: "Проверить выпуск",
    category: "Новый пульт",
    phaseId: "phase-create-issue",
    readiness: "AMBER",
    referenceUrl: "https://example.test/thread/42",
    jiraTicketKey: "cvte-1842",
  });
  expect(createPayload).not.toHaveProperty("jiraTicketUrl");
  await expect(page.locator("#issue-item-issue-created")).toBeVisible();
});
test("ordinary issue editor gets an explicit error when selecting a WBS phase", async ({ page }) => {
  await mockAdminProject(page, (fixture) => {
    fixture.currentUserAccessLevel = "EDIT";
    fixture.wbsItems.unshift({
      ...fixture.wbsItems[0],
      id: "phase-restricted",
      parentId: null,
      code: "3",
      title: "Закрытая фаза",
      type: "PHASE",
      wbsLevel: 1,
      sortOrder: 0,
    });
  });
  await page.unroute("**/api/auth/me");
  await page.route("**/api/auth/me", (route) => route.fulfill({
    json: {
      user: {
        id: "member-1",
        email: "member@example.test",
        name: "Участник",
        role: "TEAM_MEMBER",
        isActive: true,
        lastLoginAt: null,
        businessUnitAdminIds: [],
      },
    },
  }));
  const ordinaryPatches: Record<string, unknown>[] = [];
  let phasePatchCalled = false;
  await page.route("**/api/open-issues/issue-1", async (route) => {
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    ordinaryPatches.push(patch);
    if ("phaseId" in patch) {
      phasePatchCalled = true;
      await route.fulfill({ status: 403, json: { error: "Недостаточно прав" } });
      return;
    }
    await route.fulfill({ json: { id: "issue-1", ...patch } });
  });

  await page.goto("/TV-OVERVIEW/issues");
  const row = page.locator("#issue-item-issue-1");
  await row.getByLabel("Название вопроса").fill("Обычный пользователь обновил вопрос");
  await row.getByLabel("Название вопроса").blur();
  await expect.poll(() => ordinaryPatches).toContainEqual({
    title: "Обычный пользователь обновил вопрос",
  });
  const phaseSelect = row.getByLabel("Фаза проекта");
  await phaseSelect.selectOption("phase-restricted");
  await expect(page.getByText("Недостаточно прав для выбора фазы и создания пакета работ").first()).toBeVisible();
  await expect(phaseSelect).toHaveValue("");
  expect(phasePatchCalled).toBe(false);
});

test("open issues register keeps its table geometry on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/issues");

  const region = page.getByRole("region", {
    name: "Таблица открытых вопросов, доступна горизонтальная прокрутка",
  });
  await expect(region).toBeVisible();
  const dimensions = await region.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  await expect(page.locator("#issue-item-issue-1").getByLabel("Название вопроса")).toBeVisible();
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

test("pressing Enter replaces a stale WBS predecessor only once", async ({
  page,
}) => {
  const project = await mockAdminProject(page, (fixture) => {
    const successor = fixture.wbsItems[0];
    successor.code = "2.5";
    successor.predecessor1 = "2.4.12";
    const oldPredecessor = {
      ...successor,
      id: "predecessor-old",
      code: "2.4.12",
      title: "Прежний предшественник",
      predecessor1: null,
      sortOrder: 5,
    };
    const newPredecessor = {
      ...successor,
      id: "predecessor-new",
      code: "2.4.13",
      title: "Новый предшественник",
      predecessor1: null,
      sortOrder: 6,
    };
    fixture.wbsItems.unshift(oldPredecessor, newPredecessor);
    fixture.wbsDependencies = [
      {
        id: "dependency-old",
        predecessorId: oldPredecessor.id,
        successorId: successor.id,
        type: "FS",
        lagDays: 0,
        predecessor: {
          id: oldPredecessor.id,
          code: oldPredecessor.code,
          title: oldPredecessor.title,
        },
        successor: {
          id: successor.id,
          code: successor.code,
          title: successor.title,
        },
      },
    ];
  });
  let patchRequests = 0;
  let deleteRequests = 0;
  let createRequests = 0;

  await page.route("**/api/wbs-items/wbs-1", async (route) => {
    patchRequests += 1;
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    Object.assign(project.wbsItems.find((item) => item.id === "wbs-1")!, patch);
    await route.fulfill({
      json: {
        wbsItems: project.wbsItems,
        wbsDependencies: project.wbsDependencies,
        criticalPath: null,
      },
    });
  });
  await page.route("**/api/wbs-dependencies/dependency-old", async (route) => {
    deleteRequests += 1;
    if (deleteRequests > 1) {
      await route.fulfill({
        status: 404,
        json: { error: "Связь Структуры не найдена" },
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
    project.wbsDependencies = [];
    await route.fulfill({
      json: {
        wbsItems: project.wbsItems,
        wbsDependencies: project.wbsDependencies,
        criticalPath: null,
      },
    });
  });
  await page.route(
    "**/api/projects/project-1/wbs-dependencies",
    async (route) => {
      createRequests += 1;
      const body = route.request().postDataJSON() as {
        predecessorId: string;
        successorId: string;
        type: "FS";
        lagDays: number;
      };
      project.wbsDependencies = [
        {
          id: "dependency-new",
          ...body,
          predecessor: {
            id: "predecessor-new",
            code: "2.4.13",
            title: "Новый предшественник",
          },
          successor: {
            id: "wbs-1",
            code: "2.5",
            title: project.wbsItems.find((item) => item.id === "wbs-1")!.title,
          },
        },
      ];
      await route.fulfill({
        status: 201,
        json: {
          wbsItems: project.wbsItems,
          wbsDependencies: project.wbsDependencies,
          criticalPath: null,
        },
      });
    },
  );

  await page.goto("/TV-OVERVIEW/wbs");
  const predecessorInput = page
    .locator("#wbs-item-wbs-1 .wbs-predecessor-input")
    .first();
  const initialPredecessor = await predecessorInput.inputValue();
  await predecessorInput.fill("2.4.13");
  await predecessorInput.press("Escape");
  await page.waitForTimeout(1_200);
  await expect(predecessorInput).toHaveValue(initialPredecessor);
  expect(patchRequests).toBe(0);

  const titleInput = page.locator("#wbs-item-wbs-1 .wbs-title-input");
  await titleInput.fill("Задача с обновленным названием");
  await titleInput.press("Tab");
  await expect.poll(() => patchRequests).toBe(1);
  await page.waitForTimeout(800);
  expect(patchRequests).toBe(1);
  patchRequests = 0;

  await predecessorInput.fill("2.4.13");
  await predecessorInput.press("Enter");

  await expect.poll(() => createRequests).toBe(1);
  await page.waitForTimeout(1_500);
  expect(patchRequests).toBe(1);
  expect(deleteRequests).toBe(1);
  await expect(page.getByText("Связь Структуры не найдена")).toHaveCount(0);
});
