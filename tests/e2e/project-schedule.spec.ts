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
  await expect(page.locator("#issue-item-issue-1")).toBeVisible();
});

test("open issues register edits cells, phase, widths, and adds a current-date status", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    fixture.wbsItems.unshift({
      ...fixture.wbsItems[0],
      id: "phase-issues",
      parentId: null,
      code: "1",
      title: "Подготовка выпуска",
      type: "PHASE",
      wbsLevel: 1,
      sortOrder: 0,
    });
  });
  const issue = project.issues[0];
  const linkedRisk = project.raidItems.find((item) => item.type === "RISK")!;
  linkedRisk.status = "CLOSED";
  issue.riskId = linkedRisk.id;
  issue.source = "JIRA";
  issue.jiraTicketKey = "CVTE-1801";
  issue.jiraTicketUrl = "https://jira.example.test/browse/CVTE-1801";
  issue.jiraLinks = [{
    id: "issue-link-1",
    issueId: issue.id,
    jiraKey: "CVTE-1801",
    jiraUrl: "https://jira.example.test/browse/CVTE-1801",
    createdAt: `${isoDay(-2)}T12:00:00.000Z`,
    updatedAt: `${isoDay(-2)}T12:00:00.000Z`,
  }];
  const issuePatches: Record<string, unknown>[] = [];
  let statusPayload: Record<string, unknown> | null = null;
  let jiraLinkPayload: Record<string, unknown> | null = null;
  let uiStatePayload: Record<string, unknown> | null = null;

  await page.route("**/api/open-issues/issue-1", async (route) => {
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    issuePatches.push(patch);
    if (patch.owner === "Ошибка сохранения") {
      await route.fulfill({ status: 500, json: { error: "Тестовая ошибка сохранения" } });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, "title" in patch ? 120 : 10));
    Object.assign(issue, patch);
    if (patch.phaseId) {
      issue.workPackageId = "work-package-issue-1";
      if (!project.wbsItems.some((item) => item.id === issue.workPackageId)) {
        project.wbsItems.push({
          ...project.wbsItems[0],
          id: issue.workPackageId,
          parentId: String(patch.phaseId),
          code: "1.1",
          title: issue.title,
          type: "WORK_PACKAGE",
          wbsLevel: 2,
          sortOrder: 1,
        });
      }
    }
    await route.fulfill({ json: issue });
  });
  await page.route("**/api/projects/project-1", async (route) => {
    const patch = route.request().postDataJSON() as { uiState?: Record<string, unknown> };
    uiStatePayload = patch.uiState ?? null;
    project.uiState = { ...project.uiState, ...(patch.uiState ?? {}) };
    await route.fulfill({ json: { ...project, uiState: project.uiState } });
  });
  await page.route("**/api/open-issues/issue-1/status-updates", async (route) => {
    statusPayload = route.request().postDataJSON() as Record<string, unknown>;
    const update = {
      id: "issue-status-new",
      issueId: issue.id,
      statusAt: isoDay(0),
      text: String(statusPayload.text),
      createdAt: `${isoDay(0)}T12:00:00.000Z`,
      updatedAt: `${isoDay(0)}T12:00:00.000Z`,
    };
    issue.statusUpdates.unshift(update);
    await route.fulfill({ status: 201, json: update });
  });
  await page.route("**/api/open-issues/issue-1/jira-links", async (route) => {
    jiraLinkPayload = route.request().postDataJSON() as Record<string, unknown>;
    const jiraKey = String(jiraLinkPayload.jiraKey).trim().toUpperCase();
    const link = {
      id: `issue-link-${issue.jiraLinks.length + 1}`,
      issueId: issue.id,
      jiraKey,
      jiraUrl: `https://jira.example.test/browse/${jiraKey}`,
      createdAt: `${isoDay(0)}T12:00:00.000Z`,
      updatedAt: `${isoDay(0)}T12:00:00.000Z`,
    };
    issue.jiraLinks.push(link);
    await route.fulfill({ status: 201, json: link });
  });
  await page.route("**/api/open-issues/issue-1/thread-links", async (route) => {
    const payload = route.request().postDataJSON() as { threadUrl: string };
    const link = {
      id: `thread-link-${issue.threadLinks.length + 1}`,
      issueId: issue.id,
      threadUrl: payload.threadUrl,
      createdAt: `${isoDay(0)}T12:00:00.000Z`,
    };
    issue.threadLinks.push(link);
    await route.fulfill({ status: 201, json: link });
  });
  await page.route("**/api/open-issues/issue-1/thread-links/thread-link-1", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as { threadUrl: string };
      issue.threadLinks[0].threadUrl = payload.threadUrl;
      await route.fulfill({ json: issue.threadLinks[0] });
      return;
    }
    issue.threadLinks = issue.threadLinks.filter((link) => link.id !== "thread-link-1");
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/open-issues/issue-1/jira-links/issue-link-1", async (route) => {
    if (route.request().method() === "PATCH") {
      jiraLinkPayload = route.request().postDataJSON() as Record<string, unknown>;
      const jiraKey = String(jiraLinkPayload.jiraKey).trim().toUpperCase();
      issue.jiraLinks[0].jiraKey = jiraKey;
      issue.jiraLinks[0].jiraUrl = `https://jira.example.test/browse/${jiraKey}`;
      issue.jiraTicketKey = jiraKey;
      issue.jiraTicketUrl = issue.jiraLinks[0].jiraUrl;
      await route.fulfill({ json: issue.jiraLinks[0] });
      return;
    }
    issue.jiraLinks = [];
    issue.jiraTicketKey = null;
    issue.jiraTicketUrl = null;
    issue.source = "INTERNAL";
    await route.fulfill({ status: 204 });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/TV-OVERVIEW/issues");
  const row = page.locator("#issue-item-issue-1");
  const title = row.getByLabel("Название вопроса");
  const owner = row.getByLabel("Ответственный");
  await title.fill("  Согласовать обновлённую дату запуска  ");
  await title.blur();
  await owner.fill("Владелец запуска");
  await owner.blur();
  await expect.poll(() => issuePatches).toEqual([
    { title: "Согласовать обновлённую дату запуска" },
    { owner: "Владелец запуска" },
  ]);
  await expect(title).toHaveValue("Согласовать обновлённую дату запуска");
  await expect(owner).toHaveValue("Владелец запуска");

  await row.getByRole("button", { name: "Изменить ссылку на трэд" }).click();
  const threadUrl = row.getByLabel("URL трэда");
  await threadUrl.fill("https://example.test/updated-thread");
  await threadUrl.blur();
  await expect(row.getByRole("link", { name: "Трэд" })).toHaveAttribute(
    "href",
    "https://example.test/updated-thread",
  );
  const additionalThreadUrl = row.getByLabel("URL дополнительного трэда");
  await additionalThreadUrl.fill("https://example.test/second-thread");
  await row.getByRole("button", { name: "Добавить трэд" }).click();
  await expect(row.getByRole("link", { name: "Трэд" })).toHaveCount(2);
  await row.getByRole("button", { name: "Удалить ссылку на трэд" }).first().click();
  await expect(row.getByRole("link", { name: "Трэд" })).toHaveCount(1);
  await expect(row.getByRole("link", { name: "CVTE-1801" })).toBeVisible();
  await row.getByRole("button", { name: "Изменить ключ CVTE-1801" }).click();
  const jiraKeyEditor = row.getByLabel("Ключ тикета CVTE-1801");
  await jiraKeyEditor.fill("sps-42");
  await jiraKeyEditor.blur();
  await expect.poll(() => jiraLinkPayload).toEqual({ jiraKey: "sps-42" });
  await expect(row.getByRole("link", { name: "SPS-42" })).toHaveAttribute(
    "href",
    "https://jira.example.test/browse/SPS-42",
  );
  const additionalJiraKey = row.getByLabel("Ключ дополнительного тикета");
  await expect(additionalJiraKey).toBeVisible();
  await additionalJiraKey.fill("cvte-2000");
  await row.getByRole("button", { name: "Сохранить ссылку на тикет" }).click();
  await expect.poll(() => jiraLinkPayload).toEqual({ jiraKey: "cvte-2000" });
  await expect(row.getByRole("link", { name: "CVTE-2000" })).toBeVisible();
  jiraLinkPayload = null;
  await row.getByRole("button", { name: "Изменить ключ CVTE-2000" }).click();
  const cancelledJiraKeyEditor = row.getByLabel("Ключ тикета CVTE-2000");
  await cancelledJiraKeyEditor.fill("STAROS-999");
  await cancelledJiraKeyEditor.press("Escape");
  await expect(row.getByRole("link", { name: "CVTE-2000" })).toBeVisible();
  await expect(row.getByRole("link", { name: "STAROS-999" })).toHaveCount(0);
  expect(jiraLinkPayload).toBeNull();

  const taskResizer = page.getByLabel("Изменить ширину колонки Задача");
  const taskResizerBox = await taskResizer.boundingBox();
  expect(taskResizerBox).not.toBeNull();
  await page.mouse.move(taskResizerBox!.x + 5, taskResizerBox!.y + 5);
  await page.mouse.down();
  await page.mouse.move(taskResizerBox!.x + 45, taskResizerBox!.y + 5);
  await page.mouse.up();
  await expect.poll(() => {
    const widths = uiStatePayload?.openIssueColumnWidths as Record<string, number> | undefined;
    return widths?.task ?? 0;
  }).toBeGreaterThan(250);

  const riskResizer = page.getByLabel("Изменить ширину колонки Риски");
  const riskResizerBox = await riskResizer.boundingBox();
  expect(riskResizerBox).not.toBeNull();
  await page.mouse.move(riskResizerBox!.x + 5, riskResizerBox!.y + 5);
  await page.mouse.down();
  await page.mouse.move(riskResizerBox!.x + 165, riskResizerBox!.y + 5);
  await page.mouse.up();
  await expect.poll(() => {
    const widths = uiStatePayload?.openIssueColumnWidths as Record<string, number> | undefined;
    return widths?.risk ?? 0;
  }).toBeGreaterThan(112);

  await row.getByLabel("Раздел вопроса").fill("ChangHong");
  await row.getByLabel("Раздел вопроса").blur();
  await expect(page.getByRole("rowgroup").filter({ hasText: "ChangHong" })).toContainText(
    "Согласовать обновлённую дату запуска",
  );
  await row.getByLabel("Готовность").selectOption("GREEN");
  await expect.poll(() => issuePatches).toContainEqual({ readiness: "GREEN" });
  await expect.poll(() => issue.readiness).toBe("GREEN");
  await expect(row.getByLabel("Готовность")).toHaveAttribute("title", "Готовность: Зелёная");
  const readinessControl = row.getByLabel("Готовность");
  const readinessBox = await readinessControl.boundingBox();
  expect(readinessBox?.width).toBeLessThanOrEqual(32);
  await readinessControl.focus();
  await expect(readinessControl).toBeFocused();
  await expect.poll(() => readinessControl.evaluate((element) => getComputedStyle(element).boxShadow))
    .toContain("rgb(23, 32, 51)");
  const riskTextStyle = await row.getByRole("link", { name: linkedRisk.title }).locator("span").evaluate(
    (element) => {
      const style = getComputedStyle(element);
      return { textOverflow: style.textOverflow, whiteSpace: style.whiteSpace };
    },
  );
  expect(riskTextStyle).toEqual({ textOverflow: "clip", whiteSpace: "normal" });
  await row.getByLabel("Фаза проекта").selectOption("phase-issues");
  const phaseConfirmation = page.getByRole("dialog", { name: "Создать пакет работ?" });
  await expect(phaseConfirmation).toContainText("1 · Подготовка выпуска");
  await phaseConfirmation.getByRole("button", { name: "Создать" }).click();
  await expect.poll(() => issuePatches).toContainEqual({ phaseId: "phase-issues" });
  await expect(page.getByText("Пакет работ создан в фазе «1 · Подготовка выпуска»")).toBeVisible();
  await expect(row.getByText("Пакет работ создан в Структуре")).toHaveCount(0);
  await expect(row.getByLabel("Фаза проекта")).toHaveCount(0);
  await expect(row.getByText("Пакет", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: /1\.1 ·/ })).toHaveAttribute(
    "href",
    /focusWbs=work-package-issue-1/,
  );

  await owner.fill("Ошибка сохранения");
  await owner.blur();
  await expect(row.getByRole("alert")).toHaveText("Тестовая ошибка сохранения");
  await owner.fill("Владелец запуска");
  await owner.blur();
  await expect(row.getByRole("alert")).toHaveCount(0);

  await row.getByLabel("Текст нового статуса").fill("Дата запуска подтверждена");
  await row.getByRole("button", { name: "Добавить статус с текущей датой" }).click();
  await expect.poll(() => statusPayload).toEqual({
    text: "Дата запуска подтверждена",
  });
  await expect(row.getByText("Дата запуска подтверждена")).toBeVisible();
  await expect(row.locator(".issue-current-status time")).toHaveText(
    new Intl.DateTimeFormat("ru-RU").format(new Date(`${isoDay(0)}T12:00:00`)),
  );
  await page.getByRole("button", { name: "Состояние", exact: true }).click();
  await page.getByRole("button", { name: "Вопросы", exact: true }).click();
  const reopenedRow = page.locator("#issue-item-issue-1");
  await expect(reopenedRow.getByText("Дата запуска подтверждена")).toBeVisible();
  await expect(reopenedRow.locator(".issue-current-status time")).toHaveText(
    new Intl.DateTimeFormat("ru-RU").format(new Date(`${isoDay(0)}T12:00:00`)),
  );
  await reopenedRow.getByRole("link", { name: linkedRisk.title }).click();
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/risks$/);
  await expect(page.locator(`#raid-item-${linkedRisk.id}`)).toHaveClass(/focused/);
});
