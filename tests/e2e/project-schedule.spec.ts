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

const displayDate = (value: string) => value.split("-").reverse().join(".");

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

test("project header uses the next goal baseline and shows the full forecast", async ({
  page,
}) => {
  const nextGoalTitle = "Отгрузка телевизоров с завода и передача полного комплекта заказчику";
  await mockAdminProject(page, (project) => {
    const baseItem = project.wbsItems[0];
    project.initialTargetDate = isoDay(-3);
    project.targetDate = isoDay(18);
    project.targetDateChanges = [
      {
        id: "target-change",
        projectId: project.id,
        previousDate: isoDay(-3),
        newDate: isoDay(18),
        reason: "Согласованный перенос",
        approvedBy: "Проектный комитет",
        createdById: "admin-1",
        createdAt: `${isoDay(-1)}T10:00:00.000Z`,
        createdBy: null,
      },
    ];
    project.wbsItems = [
      {
        ...baseItem,
        id: "completed-goal",
        code: "1",
        title: "Прошедшая цель",
        type: "GOAL",
        status: "DONE",
        baselineDueDate: isoDay(-2),
        dueDate: isoDay(-1),
        forecastDueDate: isoDay(-1),
        sortOrder: 10,
      },
      {
        ...baseItem,
        id: "next-goal",
        code: "2",
        title: nextGoalTitle,
        type: "GOAL",
        status: "NOT_STARTED",
        baselineDueDate: isoDay(14),
        dueDate: isoDay(18),
        forecastDueDate: isoDay(18),
        sortOrder: 20,
      },
    ];
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/TV-OVERVIEW/schedule");

  await expect(
    page.locator(".topbar-project").getByText(
      `Цель: ${displayDate(isoDay(14))}`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".topbar-project")).not.toContainText("Актуальная:");
  await expect(
    page.locator(".topbar-project").getByText("Отставание +4 дн.", { exact: true }),
  ).toBeVisible();
  const forecast = page.locator(".topbar-project-forecast");
  await expect(forecast).toHaveText(
    `Прогноз «${nextGoalTitle}»: ${displayDate(isoDay(18))}`,
  );
  const forecastLayout = await forecast.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    textOverflow: getComputedStyle(element).textOverflow,
  }));
  expect(forecastLayout.textOverflow).toBe("clip");
  expect(forecastLayout.scrollWidth).toBeLessThanOrEqual(forecastLayout.clientWidth + 1);
  if (process.env.CAPTURE_UI_CONSISTENCY === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-project-header-desktop.png",
    });
  }

  await page.setViewportSize({ width: 800, height: 900 });
  const compactForecastLayout = await forecast.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(compactForecastLayout.scrollWidth).toBeLessThanOrEqual(
    compactForecastLayout.clientWidth + 1,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(forecast).toBeVisible();
  const mobileForecastLayout = await forecast.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    textOverflow: getComputedStyle(element).textOverflow,
  }));
  expect(mobileForecastLayout.textOverflow).toBe("clip");
  expect(mobileForecastLayout.scrollWidth).toBeLessThanOrEqual(
    mobileForecastLayout.clientWidth + 1,
  );
  if (process.env.CAPTURE_UI_CONSISTENCY === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-project-header-mobile.png",
    });
  }
});

test("project header keeps goal dates consistent without project target history", async ({
  page,
}) => {
  await mockAdminProject(page, (project) => {
    const baseItem = project.wbsItems[0];
    project.initialTargetDate = isoDay(-60);
    project.targetDate = isoDay(-60);
    project.targetDateChanges = [];
    project.wbsItems = [
      {
        ...baseItem,
        id: "next-goal",
        code: "1",
        title: "Ближайшая цель",
        type: "GOAL",
        status: "NOT_STARTED",
        baselineDueDate: isoDay(12),
        dueDate: isoDay(15),
        forecastDueDate: isoDay(15),
        sortOrder: 10,
      },
    ];
  });
  await page.goto("/TV-OVERVIEW/schedule");

  const badges = page.locator(".topbar-project");
  await expect(
    badges.getByText(`Цель: ${displayDate(isoDay(12))}`, { exact: true }),
  ).toBeVisible();
  await expect(badges).not.toContainText("Актуальная:");
  await expect(badges.getByText("Отставание +3 дн.", { exact: true })).toBeVisible();
  await expect(badges.locator(".topbar-project-forecast")).toHaveText(
    `Прогноз «Ближайшая цель»: ${displayDate(isoDay(15))}`,
  );
  await expect(badges).not.toContainText(displayDate(isoDay(-60)));
});

test("project header keeps the project target pair when the active goal has no baseline", async ({
  page,
}) => {
  await mockAdminProject(page, (project) => {
    const baseItem = project.wbsItems[0];
    project.initialTargetDate = isoDay(6);
    project.targetDate = isoDay(10);
    project.targetDateChanges = [
      {
        id: "target-change",
        projectId: project.id,
        previousDate: isoDay(6),
        newDate: isoDay(10),
        reason: "Согласованный перенос",
        approvedBy: "Проектный комитет",
        createdById: "admin-1",
        createdAt: `${isoDay(-1)}T10:00:00.000Z`,
        createdBy: null,
      },
    ];
    project.wbsItems = [
      {
        ...baseItem,
        id: "next-goal",
        code: "1",
        title: "Ближайшая цель",
        type: "GOAL",
        status: "NOT_STARTED",
        baselineDueDate: null,
        dueDate: isoDay(10),
        forecastDueDate: isoDay(10),
        sortOrder: 10,
      },
    ];
  });
  await page.goto("/TV-OVERVIEW/schedule");

  const badges = page.locator(".topbar-project");
  await expect(
    badges.getByText(`Цель: ${displayDate(isoDay(6))}`, { exact: true }),
  ).toBeVisible();
  await expect(badges).not.toContainText("Актуальная:");
  await expect(badges.locator(".topbar-project-forecast")).toHaveText(
    `Прогноз «Ближайшая цель»: ${displayDate(isoDay(10))}`,
  );
});

test("project header does not duplicate an approved target date without active goals", async ({
  page,
}) => {
  await mockAdminProject(page, (project) => {
    project.initialTargetDate = isoDay(8);
    project.targetDate = isoDay(13);
    project.targetDateChanges = [
      {
        id: "target-change",
        projectId: project.id,
        previousDate: isoDay(8),
        newDate: isoDay(13),
        reason: "Согласованный перенос",
        approvedBy: "Проектный комитет",
        createdById: "admin-1",
        createdAt: `${isoDay(-1)}T10:00:00.000Z`,
        createdBy: null,
      },
    ];
    project.wbsItems = project.wbsItems.map((item) => ({
      ...item,
      type: "TASK",
    }));
  });
  await page.goto("/TV-OVERVIEW/schedule");

  const badges = page.locator(".topbar-project");
  await expect(
    badges.getByText(`Цель: ${displayDate(isoDay(8))}`, { exact: true }),
  ).toBeVisible();
  await expect(badges).not.toContainText("Актуальная:");
  await expect(badges.locator(".topbar-project-forecast")).toContainText(
    'Прогноз «ближайшая цель»:',
  );
});

test("old schedule PDF keeps the print layout until afterprint", async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printInvoked = "true";
    };
  });
  await mockAdminProject(page);
  // The two-page schedule PDF belongs to the old schedule, now in Development.
  await page.goto("/TV-OVERVIEW/schedule");
  await page.goto("/development/schedule-legacy");

  await page.getByRole("button", { name: "Сохранить в PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-invoked", "true");
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-target",
    "project-schedule-print",
  );

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("body")).not.toHaveAttribute("data-print-target", /.*/);
});

test("old schedule PDF prints goals and milestones on two complete pages", async ({
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
  await page.goto("/development/schedule-legacy");
  await expect(page.locator("#milestones-by-phase")).toBeVisible();
  if (process.env.CAPTURE_UI_CONSISTENCY === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-phase-titles-desktop.png",
    });
  }
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
  // The overview lists issues that need a decision by criticality and readiness.
  await mockAdminProject(page, (fixture) => {
    Object.assign(fixture.issues[0], { severity: "CRITICAL", readiness: "RED" });
  });
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
  await expect(page.locator("#issue-item-issue-1")).toBeVisible();
});

