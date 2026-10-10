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
  // A new issue starts without a section.
  await expect(dialog.getByLabel("Раздел")).toHaveValue("");
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
test("a new open issue left without a section lets the server apply its default", async ({ page }) => {
  const project = await mockAdminProject(page);
  let createPayload: Record<string, unknown> | null = null;
  await page.route("**/api/projects/project-1/open-issues", async (route) => {
    createPayload = route.request().postDataJSON() as Record<string, unknown>;
    const created = { ...project.issues[0], id: "issue-created", ...createPayload, category: "Без раздела", status: "Open", jiraLinks: [], statusUpdates: [] };
    project.issues.push(created);
    await route.fulfill({ status: 201, json: created });
  });

  await page.goto("/TV-OVERVIEW/issues");
  await page.getByRole("button", { name: "Создать вопрос" }).click();
  const dialog = page.getByRole("dialog", { name: "Создать открытый вопрос" });
  await expect(dialog.getByLabel("Раздел")).toHaveValue("");
  await dialog.getByLabel("Заголовок").fill("Вопрос без раздела");
  await dialog.getByRole("button", { name: "Создать вопрос" }).click();

  await expect.poll(() => createPayload).toMatchObject({ title: "Вопрос без раздела" });
  expect(createPayload).not.toHaveProperty("category");
});

test("an ordinary editor sees the server refuse a WBS phase and the issue keeps its phase", async ({ page }) => {
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
  // The phase is chosen from the row's actions; the server decides who may attach a work package
  // to a phase, and its refusal is shown while the issue keeps its phase.
  await row.getByRole("button", { name: "Развернуть", exact: true }).click();
  const actions = page.locator(".open-issues-prototype-actions-row").first();
  await actions.getByRole("button", { name: "Фаза", exact: true }).click();
  await actions.locator(".open-issues-prototype-editor select").selectOption("phase-restricted");
  await actions.locator(".open-issues-prototype-editor").getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => phasePatchCalled).toBe(true);
  await expect(page.getByText("Недостаточно прав").first()).toBeVisible();
  await actions.getByRole("button", { name: "Фаза", exact: true }).click();
  await actions.getByRole("button", { name: "Фаза", exact: true }).click();
  await expect(actions.locator(".open-issues-prototype-editor select")).toHaveValue("");
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
  // The scrolling table can be reached from the keyboard.
  await expect(region).toHaveAttribute("tabindex", "0");
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

  // The registry draws the same progress chart as the portfolio: the share done fills the bar.
  await page.goto("/projects");
  await expect(page.locator(".projects-overview-panel .highcharts-data-labels")).toContainText("40%");
  if (process.env.CAPTURE_PROGRESS === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-progress-projects.png",
      fullPage: true,
    });
  }

  // On the portfolio the same share of work done fills the project's bar in «Прогресс проектов».
  await page.goto("/portfolio");
  await expect(page.locator(".portfolio-progress-panel .highcharts-data-labels")).toContainText("40%");
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
  // The goals of every shown project on one Highcharts chart, a row each, named with the project's code.
  const goals = page.locator(".portfolio-goal-timeline-panel");
  await expect(goals.locator(".highcharts-xaxis-labels text")).toHaveCount(2);
  await expect(goals.locator(".highcharts-xaxis-labels")).toContainText("TV-FIRST");
  await expect(goals.locator(".highcharts-xaxis-labels")).toContainText("TV-SECOND");
  await expect(page.getByText("Основной", { exact: true })).toHaveCount(0);

  await summary.click();
  await filter.getByRole("checkbox", { name: /TV-SECOND.*Второй проект/ }).uncheck();

  await expect(summary).toContainText("1 из 2");
  await expect(filter).toHaveClass(/is-filtered/);
  await expect(goals.locator(".highcharts-xaxis-labels text")).toHaveCount(1);
  await expect(goals.locator(".highcharts-xaxis-labels")).not.toContainText("TV-SECOND");
  await expect(page.getByText("Вторая цель", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Вторая проблема", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Второй риск", { exact: true })).toHaveCount(0);
  // The progress follows the filter too, with each shown project's passport fields next to its bar.
  await expect(page.locator(".portfolio-progress-passport")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Открыть паспорт: TV-FIRST/ })).toBeVisible();
  // The project cards are no longer on the portfolio (they are in the registry).
  await expect(page.locator(".projects-overview-card")).toHaveCount(0);

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
  // Goals, progress, problems and risks say so.
  await expect(
    page.getByText("Для отображения не выбран ни один проект."),
  ).toHaveCount(4);

  await filter.getByRole("button", { name: "Выбрать все" }).click();
  await expect(summary).toContainText("Все 2");
  await expect(filter).not.toHaveClass(/is-filtered/);
  await expect(goals.locator(".highcharts-xaxis-labels text")).toHaveCount(2);

  await page.goto("/projects");
  // The registry draws the projects as the portfolio progress does.
  await expect(page.locator(".portfolio-progress-passport")).toHaveCount(2);
  await expect(page.getByText("Основной", { exact: true })).toHaveCount(0);
});

// Goal rows whose codes match their place, so nothing looks like an unsaved structure edit that holds the page.
function navigableProjects() {
  return [
    portfolioProjectFixture("project-1", "TV-FIRST", "Первый проект", "Первая цель", "Первая проблема", "Первый риск"),
    portfolioProjectFixture("project-2", "TV-SECOND", "Второй проект", "Вторая цель", "Вторая проблема", "Второй риск"),
  ].map((project) => ({ ...project, wbsItems: project.wbsItems.map((item) => ({ ...item, code: "1", parentId: null, wbsLevel: 1, sortOrder: 10 })) }));
}

test("registry projects open their passport from the bar, the name or the passport fields", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const [first, second] = navigableProjects();
  await mockAdminPortfolio(page, [first, second]);
  await page.route(/\/api\/projects\/(project-1|project-2)(\?.*)?$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({ json: [first, second].find((project) => project.id === id) });
  });

  await page.goto("/projects");
  const board = page.locator(".projects-overview-panel");
  await expect(board.locator(".highcharts-yaxis-labels text")).toHaveCount(2);
  // After a re-sort the names still open their own project.
  await page.getByRole("button", { name: /^Название/ }).click();
  await page.getByRole("button", { name: /^Название/ }).click();
  await expect(board.locator(".highcharts-yaxis-labels text").first()).toContainText("TV-FIRST");
  await board.locator(".highcharts-yaxis-labels text").filter({ hasText: "TV-SECOND" }).click();
  await expect(page).toHaveURL(/\/TV-SECOND\/passport/);

  await page.goto("/projects");
  // Once the bar has finished growing, a click on it, away from its label in the middle.
  const bar = board.locator(".highcharts-point").first();
  let width = -1;
  await expect.poll(async () => {
    const box = await bar.boundingBox();
    const stable = box !== null && Math.abs(box.width - width) < 0.5;
    width = box?.width ?? -1;
    return stable;
  }).toBe(true);
  // The project modules of the mocked API may still be loading: the click is repeated until it lands.
  await expect(async () => {
    const box = (await bar.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
    await expect(page).toHaveURL(/\/TV-(FIRST|SECOND)\/passport/, { timeout: 1500 });
  }).toPass({ timeout: 10_000 });

  // From the keyboard: Tab into the chart reaches a bar, and Enter opens its project.
  await page.goto("/projects");
  await expect(board.locator(".highcharts-point").first()).toBeVisible();
  await page.getByRole("button", { name: /^Цель/ }).focus();
  let onBar = false;
  for (let step = 0; step < 15 && !onBar; step += 1) {
    await page.keyboard.press("Tab");
    onBar = await page.evaluate(() => Boolean(document.activeElement?.closest(".projects-overview-panel .highcharts-point")));
  }
  expect(onBar).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/TV-(FIRST|SECOND)\/passport/);

  await page.goto("/projects");
  await page.getByRole("button", { name: /Открыть паспорт: TV-FIRST/ }).click();
  await expect(page).toHaveURL(/\/TV-FIRST\/passport/);
});

test("a registry project whose dates cannot be drawn stays listed and opens its passport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const [first, second] = navigableProjects();
  const undated = { ...second, targetDate: "2026-01-01T00:00:00.000Z", startDate: "2026-06-01T00:00:00.000Z" };
  await mockAdminPortfolio(page, [first, undated]);
  await page.route(/\/api\/projects\/(project-1|project-2)(\?.*)?$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({ json: [first, undated].find((project) => project.id === id) });
  });

  await page.goto("/projects");
  await expect(page.locator(".portfolio-progress-passport")).toHaveCount(1);
  const listed = page.locator(".portfolio-progress-undated").getByRole("button", { name: /TV-SECOND/ });
  await expect(listed).toBeVisible();
  await listed.click();
  await expect(page).toHaveURL(/\/TV-SECOND\/passport/);
});

test("a goal name on the portfolio opens the goal's row in the structure", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const [first, second] = navigableProjects();
  await mockAdminPortfolio(page, [first, second]);
  await page.route(/\/api\/projects\/(project-1|project-2)(\?.*)?$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({ json: [first, second].find((project) => project.id === id) });
  });

  // From the keyboard: Tab into the goals chart reaches a goal, and Enter opens its row.
  await page.goto("/portfolio");
  const goals = page.locator(".portfolio-goal-timeline-panel");
  await expect(goals.locator(".highcharts-point").first()).toBeVisible();
  await goals.locator("summary").focus();
  let onGoal = false;
  for (let step = 0; step < 15 && !onGoal; step += 1) {
    await page.keyboard.press("Tab");
    onGoal = await page.evaluate(() => Boolean(document.activeElement?.closest(".portfolio-goal-timeline-panel .highcharts-point")));
  }
  expect(onGoal).toBe(true);
  const focusedGoal = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  const [code, projectId] = focusedGoal.includes("TV-SECOND") ? ["TV-SECOND", "project-2"] : ["TV-FIRST", "project-1"];
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${code}/wbs`));
  await expect(page.locator(`#wbs-item-${projectId}-goal .wbs-table-row.active`)).toHaveCount(1);

  // And by its name with the mouse.
  await page.goto("/portfolio");
  await goals.locator(".highcharts-xaxis-labels text").filter({ hasText: "TV-SECOND" }).click();
  await expect(page).toHaveURL(/\/TV-SECOND\/wbs/);
  await expect(page.locator("#wbs-item-project-2-goal")).toBeVisible();
  // The goal's row is the selected one.
  await expect(page.locator("#wbs-item-project-2-goal .wbs-table-row.active")).toHaveCount(1);
  await expect(page.locator("#wbs-item-project-2-goal input[value='Вторая цель']").first()).toBeVisible();
});

test("risk page keeps the color matrix visible", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/risks");

  const matrix = page.getByLabel("Матрица рисков и проблем", { exact: true });
  await expect(matrix).toBeVisible();
  await expect(matrix.locator(".risk-matrix-cell")).toHaveCount(25);
  await expect(
    page.getByLabel(
      "Вероятность 4, влияние 4, высокий риск: рисков 1, проблем 0",
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
