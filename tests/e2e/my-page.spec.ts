import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

type Query = { id: string; widget: { type: string; data?: { metric: string; groupBy?: string | null; compare?: boolean } } };

const projectRow = (code: string, rag: string, progress: number) => ({
  id: code,
  projectId: code,
  href: `/${code}/overview`,
  values: { project: code, projectName: `Проект ${code}`, rag, progress, targetDate: "2026-12-01", targetShiftDays: 4, nextCheckpoint: "Beta", nextCheckpointDate: "2026-10-18", overdueWork: 2, redRisks: 1 },
});

/** Answers in the shape the server gives, whatever the widget asks. */
function answer(queries: Query[]) {
  const results: Record<string, unknown> = {};
  for (const query of queries) {
    const type = query.widget.type;
    if (type === "kpi") results[query.id] = { kind: "value", value: 7, ...(query.widget.data?.compare ? { previous: 5 } : {}), rowCount: 7, warnings: [] };
    else if (type === "chart" || (type === "table" && query.widget.data?.groupBy)) {
      const weekly = query.widget.data?.groupBy === "createdAt";
      results[query.id] = {
        kind: "groups",
        groups: weekly ? [{ key: "2026-09-21", value: 1, count: 1 }, { key: "2026-09-28", value: 0, count: 0 }, { key: "2026-10-05", value: 3, count: 3 }] : [{ key: "TV", value: 3, count: 3 }, { key: "AU", value: 1, count: 1 }],
        subKeys: [],
        total: 4,
        rowCount: 4,
        multiValued: false,
        bucket: weekly ? "week" : null,
        warnings: [],
      };
    } else if (type === "timeline") {
      const rows = ["2026-10-10", "2026-10-21", "2026-11-04"].map((day, index) => ({ id: `m${index}`, projectId: "TV", href: "/TV/schedule", values: { project: "TV", title: `Веха ${index + 1}`, plannedDate: "2026-10-14", forecastDate: day } }));
      results[query.id] = { kind: "rows", columns: ["project", "title", "plannedDate", "forecastDate"], rows, total: 3, truncated: false, warnings: [] };
    } else {
      const rows = Array.from({ length: 30 }, (_, index) => projectRow(`P${index + 1}`, index % 3 === 0 ? "RED" : "GREEN", 40 + index));
      results[query.id] = { kind: "rows", columns: ["project", "rag", "progress", "targetDate", "nextCheckpoint", "overdueWork"], rows, total: 42, truncated: true, warnings: [] };
    }
  }
  return { today: "2026-10-07", generatedAt: "2026-10-07T09:30:00.000Z", projects: [{ id: "TV", code: "TV", name: "Телевизор" }], results };
}

async function mockPages(page: Page, options: { conflictOnce?: boolean } = {}) {
  let conflicts = options.conflictOnce ? 1 : 0;
  const saved: Array<{ title: string; document: unknown; expectedRevision?: number }> = [];
  const queries: Query[][] = [];
  let stored: { id: string; title: string; document: unknown; revision: number; createdAt: string; updatedAt: string } | null = null;
  await page.route("**/api/pages/scope-options", (route) => route.fulfill({ json: { projects: [{ id: "TV", code: "TV", name: "Телевизор", portfolio: "TV" }, { id: "AU", code: "AU", name: "Аудио", portfolio: "AU" }], portfolios: ["AU", "TV"] } }));
  await page.route("**/api/pages/query", async (route) => {
    const body = route.request().postDataJSON() as { queries: Query[] };
    queries.push(body.queries);
    await route.fulfill({ json: answer(body.queries) });
  });
  await page.route(/\/api\/pages(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      stored = { id: "page-1", title: body.title, document: body.document, revision: 1, createdAt: "2026-10-07T09:00:00.000Z", updatedAt: "2026-10-07T09:00:00.000Z" };
      await route.fulfill({ status: 201, json: stored });
      return;
    }
    await route.fulfill({ json: { canSave: true, limit: 50, pages: stored ? [stored] : [] } });
  });
  await page.route(/\/api\/pages\/page-1$/, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      saved.push(body);
      if (conflicts > 0) {
        conflicts -= 1;
        stored = { ...stored!, title: "Из другой вкладки", revision: 7 };
        await route.fulfill({ status: 409, json: { code: "PAGE_CONFLICT", error: "Страницу изменили в другой вкладке — обновите её", page: stored } });
        return;
      }
      if (body.expectedRevision !== stored!.revision) {
        await route.fulfill({ status: 409, json: { code: "PAGE_CONFLICT", error: "conflict", page: stored } });
        return;
      }
      stored = { ...stored!, title: body.title ?? stored!.title, document: body.document ?? stored!.document, revision: stored!.revision + 1, updatedAt: "2026-10-07T09:05:00.000Z" };
      await route.fulfill({ json: stored });
      return;
    }
    await route.fulfill({ json: stored });
  });
  return { saved, queries };
}

function countPdfPages(pdf: Buffer) {
  return pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

test("my page: a portfolio page from the template, moved, refused, undone, restyled, saved and printed on one page", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error.stack));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mockAdminProject(page);
  const { saved, queries } = await mockPages(page);
  await page.goto("/development/my-page");
  await expect(page.getByRole("button", { name: /Портфель для руководителя/ })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await page.getByRole("button", { name: "Создать страницу" }).click();

  const sheet = page.locator("#dashboard-page");
  await expect(sheet.locator(".mp-widget")).toHaveCount(9);
  await expect(page).toHaveURL(/\?page=page-1/);
  await expect(sheet.locator('[data-widget-id="k-projects"] .mp-kpi-value')).toHaveText("7");
  await expect(sheet.locator('[data-widget-id="k-red"] .mp-kpi-delta')).toHaveCount(0);
  await expect(sheet.locator('[data-widget-id="c-shifts"] svg')).toBeVisible();
  // The table shows what fits and says how many more.
  await expect(sheet.locator('[data-widget-id="t-projects"] .mp-more')).toContainText("ещё");
  expect(queries.at(-1)!.map((query) => query.id).sort()).toEqual(["c-reasons", "c-risks", "c-shifts", "k-overdue", "k-projects", "k-red", "k-risks", "l-decisions", "t-projects"]);
  await page.screenshot({ path: test.info().outputPath("my-page-editor.png") });

  // Making room: the table gets one row shorter, then a number moves down and pushes the table; further is refused.
  const kpi = sheet.locator('[data-widget-id="k-projects"]');
  const table = sheet.locator('[data-widget-id="t-projects"]');
  await sheet.locator('[data-widget-id="t-projects"] .mp-widget-head').click();
  await page.keyboard.press("Shift+ArrowUp");
  await kpi.click();
  const tableTop = (await table.boundingBox())!.y;
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await table.boundingBox())!.y).toBeGreaterThan(tableTop + 10);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator(".mp-live")).toContainText("нет места");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.abs((await kpi.boundingBox())!.y - (await sheet.locator('[data-widget-id="k-red"]').boundingBox())!.y)).toBeLessThan(2);

  // Dragging with the mouse: a place that would push widgets off the sheet shows red and is not taken.
  const head = (await sheet.locator('[data-widget-id="k-risks"] .mp-widget-head').boundingBox())!;
  await page.mouse.move(head.x + 20, head.y + 8);
  await page.mouse.down();
  await page.mouse.move(head.x + 20, head.y + 120, { steps: 6 });
  await expect(sheet.locator(".mp-ghost-refused")).toBeVisible();
  await page.mouse.up();
  await expect(sheet.locator(".mp-ghost-refused")).toHaveCount(0);

  // The panel: the reasons as bars instead of a donut, then as a number.
  await sheet.locator('[data-widget-id="c-reasons"] .mp-widget-head').click();
  const panel = page.getByRole("complementary", { name: "Виджет" });
  await expect(panel.getByRole("combobox", { name: "Что считаем" })).toHaveValue("shifts.delayDays");
  await panel.getByRole("radio", { name: "Полосы" }).click();
  await expect(panel.getByRole("radio", { name: "Полосы" })).toHaveAttribute("aria-checked", "true");
  await panel.getByRole("radio", { name: "Число" }).click();
  await expect(sheet.locator('[data-widget-id="c-reasons"] .mp-kpi-value')).toBeVisible();
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  expect(saved.at(-1)!.expectedRevision).toBeGreaterThanOrEqual(1);
  const lastDocument = saved.at(-1)!.document as { widgets: Array<{ id: string; type: string }> };
  expect(lastDocument.widgets.find((widget) => widget.id === "c-reasons")!.type).toBe("kpi");

  // A question from the palette lands in a free spot... there is none, so it says so.
  await page.getByRole("button", { name: "Виджет", exact: true }).click();
  await page.getByRole("dialog", { name: "Что показать?" }).getByRole("button", { name: /Сколько решений ждут ответа/ }).click();
  await expect(page.locator(".mp-live")).toContainText("Лист заполнен");

  // Printed alone and at its real size: exactly one page.
  await page.evaluate(() => {
    document.documentElement.dataset.printTarget = "dashboard-page";
    document.body.dataset.printTarget = "dashboard-page";
    const style = document.createElement("style");
    style.textContent = "@media print { @page { size: 1280px 720px; margin: 0; } }";
    document.head.appendChild(style);
  });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(countPdfPages(pdf)).toBe(1);
});

test("my page: the address opens a saved page again after a reload", async ({ page }) => {
  await mockAdminProject(page);
  await mockPages(page);
  await page.goto("/development/my-page");
  await page.getByRole("button", { name: "Создать страницу" }).click();
  await expect(page).toHaveURL(/\?page=page-1/);
  await page.reload();
  await expect(page.locator("#dashboard-page .mp-widget")).toHaveCount(9, { timeout: 15_000 });
  await page.getByRole("button", { name: "Мои страницы" }).click();
  await expect(page.getByRole("button", { name: /Открыть страницу Портфель/ })).toBeVisible();
});

test("my page: a project status page with a timeline, and a number turned into a traffic light", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error.stack));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mockAdminProject(page);
  await mockPages(page);
  await page.goto("/development/my-page");
  await page.getByRole("button", { name: /Статус проекта/ }).click();
  await expect(page.getByRole("region", { name: "Предпросмотр на ваших данных" })).toContainText("Виджетов с данными");
  await page.getByRole("button", { name: "Создать страницу" }).click();
  const sheet = page.locator("#dashboard-page");
  await expect(sheet.locator('[data-widget-id="tl-checkpoints"] .mp-timeline-dot')).toHaveCount(3);
  await expect(sheet.locator('[data-widget-id="tl-checkpoints"] .mp-timeline-late')).toHaveCount(2);
  await expect(sheet.locator('[data-widget-id="n-takeaway"]')).toContainText("Что главное");
  await sheet.locator('[data-widget-id="k-overdue"]').click();
  const panel = page.getByRole("complementary", { name: "Виджет" });
  await panel.getByRole("radio", { name: "Светофор" }).click();
  await expect(sheet.locator('[data-widget-id="k-overdue"] .mp-light-RED')).toBeVisible();
  await panel.getByLabel("Красный").fill("10");
  await expect(sheet.locator('[data-widget-id="k-overdue"] .mp-light-AMBER')).toBeVisible();
  await panel.getByRole("radio", { name: "Свои" }).click();
  await expect(sheet.locator('[data-widget-id="k-overdue"] .mp-own-scope')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("my-page-status.png") });
});

test("my page: a save refused by another tab can keep this tab's version", async ({ page }) => {
  await mockAdminProject(page);
  const { saved } = await mockPages(page, { conflictOnce: true });
  await page.goto("/development/my-page");
  await page.getByRole("button", { name: "Создать страницу" }).click();
  await page.getByLabel("Название страницы").fill("Моя версия");
  await expect(page.getByRole("alert").filter({ hasText: "Какую версию оставить" })).toBeVisible();
  await page.getByRole("button", { name: "Оставить мою" }).click();
  await expect.poll(() => saved.length).toBe(2);
  expect(saved[1]).toMatchObject({ title: "Моя версия", expectedRevision: 7 });
  await expect(page.locator(".mp-save")).toContainText("Сохранено");
});
