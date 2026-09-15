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
  const projectTabLabels = await projectNav.locator("button").allTextContents();
  const jiraWorkIndex = projectTabLabels.findIndex((label) => label.trim() === "Работы Jira");
  const structureIndex = projectTabLabels.findIndex((label) => label.trim() === "Структура");
  expect(jiraWorkIndex).toBeGreaterThanOrEqual(0);
  expect(structureIndex).toBeGreaterThanOrEqual(0);
  expect(jiraWorkIndex).toBe(structureIndex + 1);
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
    for (let index = 1; index <= 12; index += 1) {
      project.wbsItems.push(
        {
          ...project.wbsItems[0],
          id: `unrelated-package-${index}`,
          parentId: null,
          code: `${index + 1}`,
          title: `Посторонний пакет ${index}`,
          type: "WORK_PACKAGE",
          comment: null,
        },
        {
          ...project.wbsItems[1],
          id: `unrelated-task-${index}`,
          parentId: `unrelated-package-${index}`,
          code: `${index + 1}.1`,
          title: `Посторонняя работа ${index}`,
          status: "CANCELLED",
          jiraTicketUrl: null,
          mattermostUrl: null,
        },
      );
    }
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
    "Текучка",
    "Структура",
    "Работы Jira",
    "Паспорт",
    "Требования",
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

  page.once("dialog", (dialog) => dialog.accept());
  await currentWork.getByRole("link", { name: "Тестовая задача", exact: true }).click();
  await expect(page).toHaveURL("/TV-OVERVIEW/wbs");
  const focusedPackage = page.locator("#wbs-item-work-package-1");
  const focusedTask = page.locator("#wbs-item-wbs-1");
  await expect(focusedPackage).toBeVisible();
  await expect(focusedTask).toBeVisible();
  await expect(
    focusedPackage.getByRole("button", { name: "Схлопнуть элемент Структуры" }),
  ).toBeVisible();
  await expect(focusedTask.locator(".wbs-table-row")).toHaveClass(/active/);
  await expect(page.locator("#wbs-item-unrelated-package-1")).toBeVisible();
  await expect(page.locator("#wbs-item-unrelated-task-1")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Раскрыть элемент Структуры" }),
  ).toHaveCount(12);
  await expect
    .poll(async () => {
      const box = await focusedTask.boundingBox();
      return box
        ? Math.abs(box.y + box.height / 2 - page.viewportSize()!.height / 2)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(80);
  if (process.env.CAPTURE_CURRENT_WORK === "1") {
    await page.screenshot({
      path: "/private/tmp/pms-current-work-structure-focus.png",
      fullPage: false,
    });
  }
  const distantPackage = page.locator("#wbs-item-unrelated-package-12");
  await distantPackage
    .getByRole("button", { name: "Раскрыть элемент Структуры" })
    .click();
  await expect(page.locator("#wbs-item-unrelated-task-12")).toBeVisible();
  await expect(distantPackage).toBeInViewport();
  await expect
    .poll(async () => {
      const box = await focusedTask.boundingBox();
      return box
        ? Math.abs(box.y + box.height / 2 - page.viewportSize()!.height / 2)
        : Number.POSITIVE_INFINITY;
    })
    .toBeGreaterThan(150);
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
