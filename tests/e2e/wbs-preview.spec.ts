import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

// A row edit shows what it moves before the server answers, marked as
// preliminary; the server's answer is what stays.

const at = (day: string) => `${day}T00:00:00.000Z`;

function structureRow(id: string, code: string, sortOrder: number, values: Record<string, unknown>) {
  return {
    id, parentId: code.includes(".") ? "p" : null, code, title: `Строка ${code}`, type: code.includes(".") ? "TASK" : "PHASE", status: "NOT_STARTED", owner: "",
    baselineStartDate: null, baselineDueDate: null, wbsLevel: code.split(".").length, predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null,
    predecessor5: null, predecessor6: null, leadLagDays: 0, calendarDays: null, excelStartDate: null, excelEndDate: null, planWorkDays: null, planCalendarDays: null,
    calendarCode: "RU", templateColor: null, priority: null, effortPercent: 0, plannedCost: "0", forecastCost: "0", progress: 0, jiraTicketKey: null, jiraTicketUrl: null,
    mattermostUrl: null, description: null, comment: null, closedAt: null, sortOrder, createdAt: `2026-10-01T00:00:0${sortOrder / 10}.000Z`, updatedAt: "2026-10-01T00:00:00.000Z",
    ...values,
  };
}

/** A phase with two tasks, the second starting after the first; the PATCH of a row waits until the test answers it. */
async function openPlan(page: Page) {
  const phase = structureRow("p", "1", 10, { startDate: at("2026-10-12"), dueDate: at("2026-10-16"), forecastStartDate: at("2026-10-12"), forecastDueDate: at("2026-10-16"), workDays: 5, calendarDays: 5 });
  const first = structureRow("a", "1.1", 20, { startDate: at("2026-10-12"), dueDate: at("2026-10-14"), forecastStartDate: at("2026-10-12"), forecastDueDate: at("2026-10-14"), workDays: 3, calendarDays: 3 });
  const second = structureRow("b", "1.2", 30, { startDate: at("2026-10-15"), dueDate: at("2026-10-16"), forecastStartDate: at("2026-10-15"), forecastDueDate: at("2026-10-16"), workDays: 2, calendarDays: 2 });
  const project = await mockAdminProject(page, (project) => {
    Object.assign(project, {
      wbsItems: [phase, first, second],
      wbsDependencies: [{ id: "l", projectId: "project-1", predecessorId: "a", successorId: "b", type: "FS", lagDays: 0, createdAt: "2026-10-01T00:00:00.000Z", predecessor: { id: "a", code: "1.1", title: first.title }, successor: { id: "b", code: "1.2", title: second.title } }],
      structureVersion: "1",
      structureToday: "2026-10-13",
      calendarOverrides: [],
    });
  });
  const patches: Array<{ itemId: string; body: Record<string, unknown>; answer: (status: number, json: unknown) => Promise<void>; lose: () => Promise<void> }> = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const itemId = route.request().url().split("/").at(-1)!;
    await new Promise<void>((resolve) => {
      patches.push({
        itemId,
        body: route.request().postDataJSON(),
        answer: async (status, json) => { await route.fulfill({ status, json }); resolve(); },
        lose: async () => { await route.abort("connectionreset"); resolve(); },
      });
    });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.locator('[data-wbs-row-id="p"]')).toBeVisible();
  if ((await page.locator('[data-wbs-row-id="b"]').count()) === 0) await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.locator('[data-wbs-row-id="b"]')).toBeVisible();
  return { phase, first, second, patches, project };
}

const cell = (page: Page, rowId: string, column: string) => page.locator(`[data-wbs-row-id="${rowId}"] [data-column="${column}"]`);

async function longerFirstTask(page: Page) {
  const workDays = cell(page, "a", "workDays").locator("input");
  await workDays.fill("5");
  await workDays.press("Enter");
}

test("a longer task moves its successor at once, marked preliminary, and the server's answer stays", async ({ page }) => {
  const { phase, first, second, patches } = await openPlan(page);
  await longerFirstTask(page);
  await expect.poll(() => patches.length).toBe(1);
  // Before any answer: the successor starts the next Monday, the phase ends later.
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-19");
  await expect(cell(page, "b", "start")).toHaveClass(/preliminary/);
  await expect(cell(page, "a", "due").locator("input")).toHaveValue("2026-10-16");
  await expect(cell(page, "a", "workDays")).not.toHaveClass(/preliminary/);
  await expect(page.getByRole("status").filter({ hasText: "Предварительный расчёт" })).toBeVisible();
  // What is sent is only the person's edit.
  expect(Object.keys(patches[0]!.body).sort()).toEqual(["scheduleDriver", "workDays"]);

  // The server's answer differs by a day: it is what the table keeps.
  const day = (start: string, due: string) => ({ startDate: at(start), dueDate: at(due), forecastStartDate: at(start), forecastDueDate: at(due) });
  await patches[0]!.answer(200, {
    item: { ...first, workDays: 5, ...day("2026-10-12", "2026-10-16") },
    structureVersion: "2",
    structureDelta: {
      projectId: "project-1", baseVersion: "1", version: "2", today: "2026-10-13", deletedItemIds: [], dependencies: [], deletedDependencyIds: [],
      items: [
        { ...phase, ...day("2026-10-12", "2026-10-21"), workDays: 8, calendarDays: 10 },
        { ...first, workDays: 5, calendarDays: 5, ...day("2026-10-12", "2026-10-16") },
        { ...second, calendarDays: 3, ...day("2026-10-19", "2026-10-21") },
      ],
    },
  });
  await expect(cell(page, "b", "due").locator("input")).toHaveValue("2026-10-21");
  await expect(cell(page, "b", "start")).not.toHaveClass(/preliminary/);
  await expect(page.getByRole("status").filter({ hasText: "Предварительный расчёт" })).toHaveCount(0);
});

test("a refused edit takes its preview away", async ({ page }) => {
  const { patches } = await openPlan(page);
  await longerFirstTask(page);
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-19");
  await expect.poll(() => patches.length).toBe(1);
  await patches[0]!.answer(409, { error: "Строку изменили, обновите страницу" });
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-15");
  await expect(cell(page, "b", "start")).not.toHaveClass(/preliminary/);
  await expect(page.getByText("Строку изменили, обновите страницу")).toBeVisible();
});

test("another edit sent while one waits switches the preview off and sends only its own change", async ({ page }) => {
  const { patches } = await openPlan(page);
  await longerFirstTask(page);
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-19");
  await cell(page, "b", "status").locator("select").selectOption("IN_PROGRESS");
  await expect.poll(() => patches.length).toBe(2);
  await expect(page.getByRole("status").filter({ hasText: "Предварительный расчёт" })).toHaveCount(0);
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-15");
  expect(patches[1]!.itemId).toBe("b");
  expect(patches[1]!.body).toEqual({ status: "IN_PROGRESS" });
});

test("a new start date moves the row's finish and its successor, with the dates the table always sends", async ({ page }) => {
  const { patches } = await openPlan(page);
  const start = cell(page, "a", "start").locator("input");
  await start.fill("2026-10-13");
  await start.press("Enter");
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]!.body).toMatchObject({ startDate: "2026-10-13", forecastStartDate: "2026-10-13", excelStartDate: "2026-10-13", scheduleDriver: "dates" });
  // The dates drive: the duration follows them, the successor still starts after the unchanged finish.
  await expect(cell(page, "a", "workDays").locator("input")).toHaveValue("2");
  await expect(cell(page, "a", "workDays")).toHaveClass(/preliminary/);
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-15");
});

test("Escape in another row during a preview restores that row as confirmed, not as previewed", async ({ page }) => {
  const { patches } = await openPlan(page);
  await longerFirstTask(page);
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-19");
  const other = cell(page, "b", "workDays").locator("input");
  await other.fill("9");
  await other.press("Escape");
  await expect.poll(() => patches.length).toBe(1);
  await patches[0]!.answer(409, { error: "Строку изменили, обновите страницу" });
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-15");
  await expect(cell(page, "b", "workDays").locator("input")).toHaveValue("2");
  // Only the refused edit of the first row remains unsaved; the other row is as confirmed.
  await expect(page.locator(".wbs-save-state")).toHaveText("Есть изменения: 1");
  await expect(page.locator('[data-wbs-row-id="b"] .dirty')).toHaveCount(0);
});

test("an edit whose answer is lost reads the project again, since the server may have saved it", async ({ page }) => {
  const { patches } = await openPlan(page);
  let reads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/projects/project-1/overview")) reads += 1;
  });
  await longerFirstTask(page);
  await expect.poll(() => patches.length).toBe(1);
  await patches[0]!.lose();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.getByRole("status").filter({ hasText: "Предварительный расчёт" })).toHaveCount(0);
});

test("the Gantt chart says it is drawn from a preliminary calculation while the edit waits", async ({ page }) => {
  const { patches } = await openPlan(page);
  await longerFirstTask(page);
  await expect.poll(() => patches.length).toBe(1);
  await page.getByRole("navigation", { name: "Разделы проекта" }).getByRole("button", { name: "Гантт" }).click();
  const leave = page.getByRole("dialog");
  if (await leave.isVisible().catch(() => false)) await leave.getByRole("button").last().click();
  await expect(page.getByRole("status").filter({ hasText: "Предварительный расчёт" })).toBeVisible();
  await patches[0]!.answer(409, { error: "Строку изменили, обновите страницу" });
  await expect(page.getByRole("status").filter({ hasText: "Предварительный расчёт" })).toHaveCount(0);
});

test("a lost answer is reconciled once the edits on their way end, even when the last of them is refused", async ({ page }) => {
  const { patches, project, phase, first, second } = await openPlan(page);
  await longerFirstTask(page);
  await cell(page, "b", "status").locator("select").selectOption("IN_PROGRESS");
  await expect.poll(() => patches.length).toBe(2);
  // The server saved the first edit, but its answer never came back.
  const day = (start: string, due: string) => ({ startDate: at(start), dueDate: at(due), forecastStartDate: at(start), forecastDueDate: at(due) });
  Object.assign(project, {
    structureVersion: "2",
    wbsItems: [
      { ...phase, ...day("2026-10-12", "2026-10-20"), workDays: 7, calendarDays: 9 },
      { ...first, workDays: 5, calendarDays: 5, ...day("2026-10-12", "2026-10-16") },
      { ...second, calendarDays: 2, ...day("2026-10-19", "2026-10-20") },
    ],
  });
  await patches[0]!.lose();
  await patches[1]!.answer(409, { error: "Строку изменили, обновите страницу" });
  // The project is read again and what the server holds is shown, the first row no longer unsaved.
  await expect(cell(page, "a", "due").locator("input")).toHaveValue("2026-10-16");
  await expect(cell(page, "b", "start").locator("input")).toHaveValue("2026-10-19");
  await expect(page.locator('[data-wbs-row-id="a"] .dirty')).toHaveCount(0);
});

/** The server state after the first edit was saved, for a reading of the project. */
function savedFirstEdit(project: Record<string, unknown>, rows: { phase: Record<string, unknown>; first: Record<string, unknown>; second: Record<string, unknown> }) {
  const day = (start: string, due: string) => ({ startDate: at(start), dueDate: at(due), forecastStartDate: at(start), forecastDueDate: at(due) });
  Object.assign(project, {
    structureVersion: "2",
    wbsItems: [
      { ...rows.phase, ...day("2026-10-12", "2026-10-20"), workDays: 7, calendarDays: 9 },
      { ...rows.first, workDays: 5, calendarDays: 5, ...day("2026-10-12", "2026-10-16") },
      { ...rows.second, calendarDays: 2, ...day("2026-10-19", "2026-10-20") },
    ],
  });
}

test("a reading kept from applying by an edit that ended meanwhile is made again", async ({ page }) => {
  const { patches, project, phase, first, second } = await openPlan(page);
  const readings: Array<() => Promise<void>> = [];
  await page.route("**/api/projects/project-1/overview", async (route) => {
    // The first reading after the lost answer waits; later ones answer at once.
    if (readings.length === 0) {
      await new Promise<void>((resolve) => readings.push(async () => { await route.fulfill({ json: project }); resolve(); }));
    } else {
      readings.push(async () => undefined);
      await route.fulfill({ json: project });
    }
  });
  await longerFirstTask(page);
  await expect.poll(() => patches.length).toBe(1);
  savedFirstEdit(project, { phase, first, second });
  await patches[0]!.lose();
  await expect.poll(() => readings.length).toBe(1);
  // Another edit starts and is refused while the reading is on its way.
  await cell(page, "b", "status").locator("select").selectOption("IN_PROGRESS");
  await expect.poll(() => patches.length).toBe(2);
  await patches[1]!.answer(409, { error: "Строку изменили, обновите страницу" });
  await readings[0]!();
  await expect.poll(() => readings.length).toBe(2);
  await expect(cell(page, "a", "due").locator("input")).toHaveValue("2026-10-16");
  await expect(page.locator('[data-wbs-row-id="a"] .dirty')).toHaveCount(0);
});

test("a lost answer is reconciled when a refused save of all changes ends after it", async ({ page }) => {
  const { patches, project, phase, first, second } = await openPlan(page);
  const bulk: Array<() => Promise<void>> = [];
  await page.route("**/api/projects/project-1/wbs-items/bulk", async (route) => {
    await new Promise<void>((resolve) => bulk.push(async () => { await route.fulfill({ status: 409, json: { error: "Строку изменили, обновите страницу" } }); resolve(); }));
  });
  await longerFirstTask(page);
  await expect.poll(() => patches.length).toBe(1);
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect.poll(() => bulk.length).toBe(1);
  savedFirstEdit(project, { phase, first, second });
  await patches[0]!.lose();
  await bulk[0]!();
  await expect(cell(page, "a", "due").locator("input")).toHaveValue("2026-10-16");
  await expect(page.locator('[data-wbs-row-id="a"] .dirty')).toHaveCount(0);
});
