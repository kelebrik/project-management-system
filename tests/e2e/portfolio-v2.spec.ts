import { expect, test, type Page, type Route } from "@playwright/test";

function wbsItem(
  id: string,
  parentId: string | null,
  title: string,
  startDate: string | null,
  dueDate: string | null,
) {
  return {
    id,
    parentId,
    code: id,
    title,
    type: parentId ? "WORK_PACKAGE" : "PHASE",
    status: "IN_PROGRESS",
    owner: "Команда",
    startDate,
    dueDate,
    baselineStartDate: null,
    baselineDueDate: null,
    forecastStartDate: null,
    forecastDueDate: null,
    wbsLevel: parentId ? 2 : 1,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: 0,
    workDays: 20,
    calendarDays: 30,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: 20,
    planCalendarDays: 30,
    calendarCode: "RU",
    templateColor: null,
    priority: null,
    effortPercent: 100,
    plannedCost: "0",
    forecastCost: "0",
    progress: 40,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    mattermostUrl: null,
    description: null,
    comment: null,
    closedAt: null,
    sortOrder: 0,
  };
}

function projectFixture() {
  const hw = wbsItem("1", null, "Аппаратная часть", "2026-07-01", "2027-03-31");
  const sw = wbsItem("2", null, "Программная часть", "2026-08-01", "2027-04-30");
  const g2m = wbsItem("3", null, "Маркетинг и вывод на рынок", "2026-10-01", "2027-05-31");
  return {
    id: "device-project",
    businessUnitId: "devices",
    businessUnit: { id: "devices", code: "DEV", name: "Устройства" },
    parentId: null,
    code: "DEVICE-01",
    name: "Новое устройство",
    portfolio: "Аудио",
    sponsor: "Директор продукта",
    projectManager: "Анна Петрова",
    status: "ACTIVE",
    rag: "AMBER",
    startDate: "2026-07-01",
    initialTargetDate: "2027-05-31",
    targetDate: "2027-05-31",
    progress: 40,
    scheduleVariance: 0,
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "",
    sortOrder: 0,
    uiState: null,
    jiraIntegration: null,
    jiraAnalyticsSettings: null,
    targetDateChanges: [],
    wbsItems: [
      hw,
      sw,
      g2m,
      wbsItem("1.1", hw.id, "HW Product Requirements", "2026-07-01", "2026-08-31"),
      wbsItem("1.2", hw.id, "HW EVT", "2026-09-01", "2026-10-31"),
      wbsItem("1.3", hw.id, "HW DVT", "2026-11-01", "2026-12-31"),
      wbsItem("1.4", hw.id, "HW PVT", "2027-06-30", "2027-06-30"),
      wbsItem("1.5", hw.id, "Корпус и механика", "2027-02-01", "2027-03-15"),
      wbsItem("1.6", hw.id, "HW ES1", "2027-01-10", "2027-01-10"),
      wbsItem("1.7", hw.id, "HW ES2", "2027-01-11", "2027-01-11"),
      wbsItem("2.1", sw.id, "SW Architecture", "2026-08-01", "2026-09-30"),
      wbsItem("2.2", sw.id, "Beta", "2026-10-01", "2027-01-31"),
      wbsItem("2.3", sw.id, "Alpha", "2026-09-15", "2026-11-15"),
      wbsItem("3.1", g2m.id, "Integrated GTM Plan Development", "2026-10-01", "2026-11-30"),
      wbsItem("3.2", g2m.id, "Market Launch & Start of Sales", "2027-04-01", "2027-05-31"),
    ],
    tasks: [],
    issues: [],
    closedIssues: [],
    jiraWorkSections: [],
    overviews: [],
    milestones: [],
    wbsDependencies: [],
    criticalPath: null,
    calendarOverrides: [],
    artifacts: [],
    raidItems: [],
    changeRequests: [],
    currentUserAccessLevel: "VIEW",
    _count: { tasks: 7, issues: 0, jiraSnapshots: 0 },
  };
}

async function mockPortfolio(
  page: Page,
  role: "ADMIN" | "PROJECT_MANAGER" = "ADMIN",
) {
  const project = projectFixture();
  const respond = (route: Route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/auth/me") {
      return route.fulfill({
        json: {
          user: {
            id: "pm-1",
            email: "pm@example.test",
            name: role === "ADMIN" ? "Администратор" : "Портфельный управляющий",
            role,
            isActive: true,
            lastLoginAt: null,
            businessUnitAdminIds: [],
          },
        },
      });
    }
    if (pathname === "/api/auth/keycloak/status") {
      return route.fulfill({ json: { enabled: false, hostname: null } });
    }
    if (pathname === "/api/projects") {
      return route.fulfill({ json: [{ ...project, wbsItems: [] }] });
    }
    if (pathname === "/api/projects/portfolio-roadmap") {
      return route.fulfill({ json: [project] });
    }
    if (pathname === "/api/project-modules") {
      return route.fulfill({ json: [] });
    }
    if (pathname === "/api/business-units") {
      return route.fulfill({ json: [] });
    }
    if (pathname === "/api/page-visits") {
      return route.fulfill({ json: null });
    }
    if (pathname === `/api/projects/${project.id}/overview`) {
      return route.fulfill({ json: project });
    }
    return route.fulfill({ status: 404, json: { error: "Not mocked" } });
  };
  await page.route(/^https?:\/\/[^/]+\/api\//, respond);
}

test("portfolio exposes the HW, SW and G2M roadmap as its last section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date("2026-09-03T12:00:00"));
  await mockPortfolio(page);
  await page.goto("/portfolio");

  await expect(page.getByRole("heading", { name: "Портфель", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Дорожная карта v2", exact: true }),
  ).toBeVisible();
  await expect(page.locator("main h2").last()).toHaveText("Дорожная карта v2");
  const roadmap = page.getByTestId("portfolio-v2-roadmap");
  await expect(roadmap).toBeVisible();
  await expect(roadmap.getByText("Новое устройство", { exact: true })).toBeVisible();
  await expect(roadmap.locator(".portfolio-roadmap-track-label")).toHaveText([
    "HW",
    "SW",
    "G2M",
  ]);
  await expect(roadmap.locator(".portfolio-roadmap-segment")).toHaveCount(12);
  const unmatchedStructureGroup = roadmap.getByTitle("1.5 · Корпус и механика");
  await expect(unmatchedStructureGroup).toBeVisible();
  await expect(unmatchedStructureGroup).toHaveCSS("background-color", "rgb(241, 243, 245)");
  await expect(unmatchedStructureGroup).not.toHaveCSS("background-image", "none");
  await expect(roadmap.getByTitle("1.1 · HW Product Requirements")).not.toHaveCSS(
    "background-color",
    "rgb(241, 243, 245)",
  );
  await expect(roadmap.locator(".portfolio-roadmap-track").nth(1)).toHaveCSS(
    "min-height",
    "60px",
  );
  const shortSegment = roadmap.getByTitle("1.4 · HW PVT");
  const shortSegmentBox = await shortSegment.boundingBox();
  expect(shortSegmentBox?.width).toBeGreaterThanOrEqual(24);
  const [firstShortBox, secondShortBox] = await Promise.all([
    roadmap.getByTitle("1.6 · HW ES1").boundingBox(),
    roadmap.getByTitle("1.7 · HW ES2").boundingBox(),
  ]);
  expect(firstShortBox).not.toBeNull();
  expect(secondShortBox).not.toBeNull();
  if (firstShortBox && secondShortBox) {
    const shortVerticalGap = secondShortBox.y - firstShortBox.y - firstShortBox.height;
    expect(shortVerticalGap).toBeGreaterThanOrEqual(2.5);
    expect(Math.abs(shortVerticalGap - 3)).toBeLessThanOrEqual(0.75);
    expect(firstShortBox.x + firstShortBox.width).toBeLessThanOrEqual(
      secondShortBox.x + secondShortBox.width,
    );
  }
  const [firstHwBox, secondHwBox, firstSwBox, overlappingSwBox] = await Promise.all([
    roadmap.getByTitle("1.1 · HW Product Requirements").boundingBox(),
    roadmap.getByTitle("1.2 · HW EVT").boundingBox(),
    roadmap.getByTitle("2.1 · SW Architecture").boundingBox(),
    roadmap.getByTitle("2.3 · Alpha").boundingBox(),
  ]);
  expect(firstHwBox).not.toBeNull();
  expect(secondHwBox).not.toBeNull();
  expect(firstSwBox).not.toBeNull();
  expect(overlappingSwBox).not.toBeNull();
  if (firstHwBox && secondHwBox && firstSwBox && overlappingSwBox) {
    const horizontalGap = secondHwBox.x - firstHwBox.x - firstHwBox.width;
    const verticalGap = overlappingSwBox.y - firstSwBox.y - firstSwBox.height;
    expect(Math.abs(horizontalGap - verticalGap)).toBeLessThanOrEqual(0.75);
    expect(horizontalGap).toBeGreaterThanOrEqual(2.5);
  }
  const globalNavigation = page.getByRole("navigation", {
    name: "Основные разделы",
  });
  await expect(
    globalNavigation.getByRole("button", { name: "Портфель", exact: true }),
  ).toHaveClass(/active/);
  await expect(
    page
      .getByRole("navigation", { name: "Разработка" })
      .getByRole("button", { name: "Портфель v2" }),
  ).toHaveCount(0);

  const portfolioPage = page.locator(".portfolio-roadmap-page");
  const enterFullscreen = page.getByRole("button", {
    name: "Развернуть Дорожную карту v2 на весь экран",
  });
  await enterFullscreen.click();
  await expect(portfolioPage).toHaveClass(/portfolio-roadmap-page-fullscreen/);
  await expect(portfolioPage).toHaveCSS("position", "fixed");
  expect(
    await page.evaluate(() =>
      Boolean(
        document
          .elementFromPoint(2, 2)
          ?.closest(".portfolio-roadmap-page-fullscreen"),
      ),
    ),
  ).toBe(true);
  if (process.env.CAPTURE_PORTFOLIO_V2 === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-portfolio-v2-fullscreen.png",
    });
  }
  await page
    .getByRole("button", { name: "Вернуть обычный режим Дорожной карты v2" })
    .click();
  await expect(portfolioPage).not.toHaveClass(/portfolio-roadmap-page-fullscreen/);
  await enterFullscreen.click();
  await page.getByRole("button", { name: "Легенда", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Легенда этапов" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Легенда этапов" })).toBeHidden();
  await expect(portfolioPage).toHaveClass(/portfolio-roadmap-page-fullscreen/);
  await page.keyboard.press("Escape");
  await expect(portfolioPage).not.toHaveClass(/portfolio-roadmap-page-fullscreen/);

  const twelveMonthWidth = await roadmap
    .locator(".portfolio-roadmap-month")
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
  const twelveMonthSizes = await roadmap.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(twelveMonthSizes.scrollWidth).toBeLessThanOrEqual(
    twelveMonthSizes.clientWidth + 1,
  );

  await page.setViewportSize({ width: 1200, height: 1000 });
  await expect
    .poll(() =>
      roadmap
        .locator(".portfolio-roadmap-month")
        .first()
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThan(twelveMonthWidth - 5);
  const narrowerTwelveMonthSizes = await roadmap.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(narrowerTwelveMonthSizes.scrollWidth).toBeLessThanOrEqual(
    narrowerTwelveMonthSizes.clientWidth + 3,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("button", { name: "6 мес." }).click();
  await expect(roadmap.locator(".portfolio-roadmap-month")).toHaveCount(6);
  const sixMonthWidth = await roadmap
    .locator(".portfolio-roadmap-month")
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(sixMonthWidth).toBeGreaterThan(twelveMonthWidth * 1.9);

  await page.getByRole("button", { name: "12 мес." }).click();
  await expect(roadmap.locator(".portfolio-roadmap-month")).toHaveCount(12);
  await page.getByRole("button", { name: "24 мес." }).click();
  await expect(roadmap.locator(".portfolio-roadmap-month")).toHaveCount(24);
  const twentyFourMonthSizes = await roadmap.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(twentyFourMonthSizes.scrollWidth).toBeGreaterThan(
    twentyFourMonthSizes.clientWidth,
  );

  await roadmap.evaluate((element) => {
    element.scrollLeft = 500;
  });
  await page.getByRole("searchbox", { name: "Поиск проекта" }).fill("нет такого");
  const emptyState = roadmap.getByText("Проекты по заданным фильтрам не найдены.");
  await expect(emptyState).toBeVisible();
  const emptyStatePosition = await emptyState.evaluate((element) => {
    const scroller = element.closest(".portfolio-roadmap-scroll");
    if (!scroller) throw new Error("Roadmap scroller not found");
    const stateRect = element.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return {
      left: stateRect.left - scrollerRect.left,
      right: stateRect.right - scrollerRect.right,
    };
  });
  expect(emptyStatePosition.left).toBeGreaterThanOrEqual(-1);
  expect(emptyStatePosition.right).toBeLessThanOrEqual(1);
  await page.getByRole("searchbox", { name: "Поиск проекта" }).fill("DEVICE-01");
  await expect(roadmap.getByText("Новое устройство", { exact: true })).toBeVisible();

  await roadmap.getByTitle("1.2 · HW EVT").click();
  const details = page.getByRole("complementary", { name: "HW EVT" });
  await expect(details).toBeFocused();
  await expect(details).toContainText("ИСР 1.2");
  await expect(details).toContainText("Легенда: EVT");
  await expect(details).toContainText("Engineering Validation Test");
  await expect(details).toContainText("01.09.2026 - 31.10.2026");
  if (process.env.CAPTURE_PORTFOLIO_V2 === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-portfolio-v2-desktop.png",
    });
  }

  const legendTrigger = page.getByRole("button", { name: "Легенда", exact: true });
  await legendTrigger.click();
  const legend = page.getByRole("dialog", { name: "Легенда этапов" });
  await expect(legend).toBeVisible();
  await expect(legend.getByRole("button", { name: "Закрыть легенду" })).toBeFocused();
  await expect(legend.getByText("MP FW + 1st OTA", { exact: true })).toBeVisible();
  await expect(legend.getByText("Post-Launch Analysis, Retrospective & Handover", { exact: true })).toBeVisible();
  await expect(legend.getByText("Пакет работ из Структуры", { exact: true })).toHaveCount(3);
  if (process.env.CAPTURE_PORTFOLIO_V2 === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-portfolio-v2-legend.png",
    });
  }
  await page.keyboard.press("Escape");
  await expect(legend).toBeHidden();
  await expect(legendTrigger).toBeFocused();
});

test("portfolio keeps the wide roadmap inside its mobile scroller", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-09-03T12:00:00"));
  await mockPortfolio(page);
  await page.goto("/portfolio");

  const roadmapHeading = page.getByRole("heading", {
    name: "Дорожная карта v2",
    exact: true,
  });
  await expect(roadmapHeading).toBeVisible();
  const roadmap = page.getByTestId("portfolio-v2-roadmap");
  await expect
    .poll(async () => {
      await page.evaluate(() => document.getElementById("roadmap-v2")?.scrollIntoView());
      return roadmap.isVisible();
    })
    .toBe(true);
  const sizes = await roadmap.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeGreaterThan(sizes.clientWidth);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Сегодня" }).click();
  await expect.poll(() => roadmap.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  if (process.env.CAPTURE_PORTFOLIO_V2 === "1") {
    await page.screenshot({
      fullPage: true,
      path: "/private/tmp/pms-portfolio-v2-mobile.png",
    });
  }
});

test("legacy portfolio v2 URL opens the roadmap section for a non-admin", async ({ page }) => {
  await mockPortfolio(page, "PROJECT_MANAGER");
  await page.goto("/development/portfolio-v2");

  await expect(page).toHaveURL(/\/portfolio#roadmap-v2$/);
  const roadmapHeading = page.getByRole("heading", {
    name: "Дорожная карта v2",
    exact: true,
  });
  await expect(roadmapHeading).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const roadmap = page.getByTestId("portfolio-v2-roadmap");
  await expect(roadmap.getByText("Новое устройство", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const headingBox = await roadmapHeading.boundingBox();
      return Boolean(
        headingBox && headingBox.y >= 0 && headingBox.y < page.viewportSize()!.height,
      );
    })
    .toBe(true);
  await expect(
    page
      .getByRole("navigation", { name: "Основные разделы" })
      .getByRole("button", { name: "Разработка" }),
  ).toHaveCount(0);
});
