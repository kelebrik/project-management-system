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
    if (type === "kpi" || type === "traffic-light" || type === "progress") results[query.id] = { kind: "value", value: 7, ...(query.widget.data?.compare ? { previous: 5 } : {}), rowCount: 7, warnings: [] };
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
    } else if (type === "roadmap") {
      const goal = (project: string, index: number, forecastDate: string, title: string, plannedDate = forecastDate) => ({ id: `${project}-${index}`, projectId: project, href: `/${project}/schedule`, values: { title, type: "GOAL", status: "IN_PROGRESS", plannedDate, forecastDate, slipDays: 0, open: true } });
      const crowded = ["Образцы с завода готовы к испытаниям", "Сертификация пройдена", "Прошивка для производства", "Приёмка у заказчика", "Первая партия на складе", "Старт продаж в рознице", "Обновление по воздуху", "Пилот у оператора", "Финальный отчёт"];
      const lanes = Array.from({ length: 30 }, (_, index) => {
        const code = `P${index + 1}`;
        const items =
          index === 0 ? crowded.map((title, item) => goal(code, item, `2026-11-${String(2 + item * 2).padStart(2, "0")}`, title))
          : index === 1 ? []
          : index === 2 ? [goal(code, 0, "2026-01-15", "Давно прошедшая цель"), goal(code, 1, "2026-12-20", "Поздняя цель", "2026-11-20"), goal(code, 2, "2028-03-01", "Через полтора года"), goal(code, 3, "2028-05-01", "Ещё позже")]
          : [goal(code, 0, `2027-0${1 + (index % 8)}-10`, `Цель ${code}`)];
        return { projectId: code, project: code, projectName: `Проект ${code}`, href: `/${code}/schedule`, items };
      });
      results[query.id] = { kind: "roadmap", lanes, totalLanes: 34, items: lanes.reduce((sum, lane) => sum + lane.items.length, 0), warnings: [] };
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

// The intro of the page has its own test; here it is already read.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pms-my-page-intro-hidden", "1"));
});

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
  // The autosave catches up with the last change.
  await expect.poll(() => (saved.at(-1)?.document as { widgets: Array<{ id: string; type: string }> } | undefined)?.widgets.find((widget) => widget.id === "c-reasons")?.type, { timeout: 10_000 }).toBe("kpi");
  expect(saved.at(-1)!.expectedRevision).toBeGreaterThanOrEqual(1);

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
  await expect(page.getByRole("region", { name: /^Пример страницы по шаблону «.+» на ваших данных$/ })).toContainText("Виджетов с данными");
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

test("my page: the show, a frozen release and a page opened by a link", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error.stack));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mockAdminProject(page);
  await mockPages(page);
  const releaseAnswer = answer([{ id: "k-red", widget: { type: "kpi", data: { metric: "projects.red" } } }]);
  (releaseAnswer.results["k-red"] as { value: number }).value = 3;
  const shares: Array<{ releaseId: string | null }> = [];
  let releaseDocument: unknown = null;
  await page.route(/\/api\/pages\/page-1\/(revisions|releases|shares)(\/.*)?$/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/releases/rel-1")) {
      await route.fulfill({ json: { id: "rel-1", title: "Портфель", label: "Комитет 10.10", createdAt: "2026-10-07T09:00:00.000Z", document: releaseDocument, answer: releaseAnswer } });
    } else if (url.endsWith("/shares") && method === "POST") {
      shares.push(route.request().postDataJSON());
      await route.fulfill({ status: 201, json: { id: "s1", token: "token-1", expiresAt: null } });
    } else if (url.endsWith("/releases")) {
      await route.fulfill({ json: [{ id: "rel-1", title: "Портфель", label: "Комитет 10.10", createdAt: "2026-10-07T09:00:00.000Z" }] });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  await page.goto("/development/my-page");
  await page.getByRole("button", { name: "Создать страницу" }).click();
  await expect(page.locator("#dashboard-page .mp-widget")).toHaveCount(9);

  // The show: full window, Esc leaves.
  await page.getByRole("button", { name: "Показ", exact: true }).click();
  const show = page.getByRole("dialog", { name: /Показ/ });
  await expect(show.locator(".mp-widget")).toHaveCount(9);
  await page.keyboard.press("Escape");
  await expect(show).toHaveCount(0);

  // A release opens frozen; a link to it is made.
  releaseDocument = await page.evaluate(async () => (await (await fetch("/api/pages/page-1")).json()).document);
  await page.getByRole("button", { name: "Версии и ссылки" }).click();
  const dialog = page.getByRole("dialog", { name: "Версии, выпуски и ссылки" });
  await expect(dialog.getByText("Комитет 10.10")).toBeVisible();
  await dialog.getByRole("button", { name: "Ссылка", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Ссылка" })).toHaveValue(/\/shared-page\?token=token-1$/);
  expect(shares).toEqual([{ releaseId: "rel-1", days: 30 }]);
  await dialog.getByRole("button", { name: "Открыть" }).click();
  const frozen = page.getByRole("dialog", { name: /Показ/ });
  await expect(frozen.locator('[data-widget-id="k-red"] .mp-kpi-value')).toHaveText("3");
  await expect(frozen).toContainText("данные зафиксированы");
  // The release prints alone, the editor behind the show left out: one page.
  await page.evaluate(() => {
    document.documentElement.dataset.printTarget = "dashboard-show";
    document.body.dataset.printTarget = "dashboard-show";
    const style = document.createElement("style");
    style.id = "test-print-size";
    style.textContent = "@media print { @page { size: 1280px 720px; margin: 0; } }";
    document.head.appendChild(style);
  });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect(countPdfPages(pdf)).toBe(1);
  await page.evaluate(() => {
    delete document.documentElement.dataset.printTarget;
    delete document.body.dataset.printTarget;
    document.getElementById("test-print-size")?.remove();
  });
  await frozen.getByRole("button", { name: "Выйти" }).click();

  // The link, as a reader opens it.
  await page.route("**/api/page-links/token-1", (route) => route.fulfill({ json: { title: "Портфель", document: releaseDocument, release: { label: "Комитет 10.10", createdAt: "2026-10-07T09:00:00.000Z" }, answer: releaseAnswer } }));
  await page.goto("/shared-page?token=token-1");
  await expect(page.locator("#dashboard-page .mp-widget")).toHaveCount(9, { timeout: 15_000 });
  await expect(page.locator('#dashboard-page [data-widget-id="k-red"] .mp-kpi-value')).toHaveText("3");
  await expect(page.getByRole("toolbar")).toContainText("Выпуск «Комитет 10.10»");
});

test("my page: a portfolio roadmap with goals named next to them, never overlapping, and a window to choose", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error.stack));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mockAdminProject(page);
  await mockPages(page);
  await page.goto("/development/my-page");
  await page.getByRole("button", { name: /Дорожная карта портфеля/ }).click();
  await page.getByRole("button", { name: "Создать страницу" }).click();
  const roadmap = page.locator('#dashboard-page [data-widget-id="r-goals"]');
  await expect(roadmap.locator(".mp-roadmap")).toBeVisible();
  // A lane for every project that fits, the empty project too; the rest are counted.
  await expect(roadmap.locator(".mp-roadmap-project").nth(1)).toHaveText(/P2$/);
  await expect(roadmap.locator(".mp-more")).toContainText("Ещё проектов");
  // …and that line is not cut off by the widget.
  expect(await roadmap.evaluate((element) => element.querySelector(".mp-more")!.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 0.5)).toBe(true);
  // Goals outside the window are counted at its edges; a late goal is red with its plan.
  await expect(roadmap.locator(".mp-roadmap-lane").nth(2).locator(".mp-roadmap-edge")).toHaveText([/‹1$/, /2›$/]);
  await expect(roadmap.locator(".mp-roadmap-late")).toHaveCount(1);
  // The crowded lane: names that do not fit are counted by the project, none overlaps.
  await expect(roadmap.locator(".mp-roadmap-hidden").first()).toHaveText(/\+\d+$/);
  const overlaps = await roadmap.evaluate((element) => {
    const boxes = (selector: string) => [...element.querySelectorAll(selector)].map((node) => node.getBoundingClientRect());
    const labels = boxes(".mp-roadmap-label");
    const marks = boxes(".mp-roadmap-mark");
    const cross = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const found: string[] = [];
    labels.forEach((label, index) => {
      labels.forEach((other, position) => position > index && cross(label, other) && found.push(`labels ${index}/${position}`));
      marks.forEach((mark, position) => cross(label, mark) && found.push(`label ${index} on mark ${position}`));
    });
    return { found, labels: labels.length };
  });
  expect(overlaps.found).toEqual([]);
  // In words for a screen reader: every goal of the window, those counted as +N too.
  await expect(roadmap.getByRole("list", { name: "Цели проектов: −4 / +8 месяцев" })).toContainText("Финальный отчёт — 18.11.26");
  expect(overlaps.labels).toBeGreaterThanOrEqual(10);
  // Another window: one month back, three ahead.
  await roadmap.click();
  const panel = page.getByRole("complementary", { name: "Виджет" });
  await expect(panel.getByRole("radio", { name: "Дорожная карта" })).toHaveAttribute("aria-checked", "true");
  await panel.getByLabel("Окно вокруг сегодня").selectOption("1:3");
  await expect(roadmap.locator(".mp-roadmap-axis").first()).toHaveText("окт 2026");
  await expect(roadmap.locator("h2")).toHaveText("Цели проектов: −1 / +3 месяцев");
  await page.screenshot({ path: test.info().outputPath("my-page-roadmap.png") });
});
