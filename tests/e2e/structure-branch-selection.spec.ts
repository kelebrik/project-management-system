import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

// Ticking a row of the Structure ticks its whole branch.

const at = (day: string) => `${day}T00:00:00.000Z`;
function row(id: string, code: string, parentId: string | null, sortOrder: number, type = "TASK") {
  return {
    id, parentId, code, title: `Строка ${code}`, type, status: "NOT_STARTED", owner: "", startDate: at("2026-10-12"), dueDate: at("2026-10-16"),
    forecastStartDate: at("2026-10-12"), forecastDueDate: at("2026-10-16"), baselineStartDate: null, baselineDueDate: null, wbsLevel: code.split(".").length,
    predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null, leadLagDays: 0, workDays: 5,
    calendarDays: 5, excelStartDate: null, excelEndDate: null, planWorkDays: null, planCalendarDays: null, calendarCode: "RU", templateColor: null, priority: null,
    effortPercent: 0, plannedCost: "0", forecastCost: "0", progress: 0, jiraTicketKey: null, jiraTicketUrl: null, mattermostUrl: null, description: null,
    comment: null, closedAt: null, sortOrder, createdAt: at("2026-10-01"), updatedAt: at("2026-10-01"),
  };
}

async function openTree(page: Page) {
  await mockAdminProject(page, (project) => {
    Object.assign(project, {
      // 1 > (1.1, 1.2 > 1.2.1); 2
      wbsItems: [row("p", "1", null, 10, "PHASE"), row("a", "1.1", "p", 20), row("b", "1.2", "p", 30, "WORK_PACKAGE"), row("c", "1.2.1", "b", 40), row("d", "2", null, 50)],
      wbsDependencies: [], structureVersion: "1", structureToday: "2026-10-13", calendarOverrides: [],
    });
  });
  const deletes: unknown[] = [];
  await page.route("**/api/projects/project-1/wbs-items", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletes.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { error: "Проверка теста" } });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("button", { name: "3", exact: true }).click();
  await expect(page.locator('[data-wbs-row-id="c"]')).toBeVisible();
  return { deletes };
}
const box = (page: Page, code: string) => page.getByRole("checkbox", { name: `Выбрать строку ${code}`, exact: true });

test("ticking a row ticks its branch, collapsed rows too; unticking a row unticks the rows above it", async ({ page }) => {
  const { deletes } = await openTree(page);
  // Collapse 1.2, so 1.2.1 is hidden, then tick the phase.
  await page.locator('[data-wbs-row-id="b"]').getByRole("button", { name: "Схлопнуть элемент Структуры" }).click();
  await expect(page.locator('[data-wbs-row-id="c"]')).toHaveCount(0);
  await box(page, "1").check();
  for (const code of ["1", "1.1", "1.2"]) await expect(box(page, code)).toBeChecked();
  await expect(box(page, "2")).not.toBeChecked();
  await page.locator('[data-wbs-row-id="b"]').getByRole("button", { name: "Раскрыть элемент Структуры" }).click();
  await expect(box(page, "1.2.1")).toBeChecked();
  await expect(page.getByText("Выбрано: 4").or(page.getByText(/Выбрано\s*4/))).toBeVisible();

  // Unticking 1.2.1: its parents are no longer whole branches; the phase shows mixed.
  await box(page, "1.2.1").uncheck();
  await expect(box(page, "1.2")).not.toBeChecked();
  await expect(box(page, "1")).not.toBeChecked();
  expect(await box(page, "1").evaluate((input) => (input as HTMLInputElement).indeterminate)).toBe(true);
  await expect(box(page, "1.1")).toBeChecked();

  // What the selection acts on: only 1.1 is left.
  await page.getByRole("button", { name: "Удалить выбранные" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
  await expect.poll(() => deletes).toEqual([{ itemIds: ["a"] }]);
});

test("a status set for a ticked phase is sent for the whole branch", async ({ page }) => {
  await openTree(page);
  const saved: Array<{ items: Array<{ id: string; patch: { status?: string } }> }> = [];
  await page.route("**/api/projects/project-1/wbs-items/bulk", async (route) => {
    saved.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { error: "Проверка теста" } });
  });
  await box(page, "1").check();
  await page.getByLabel("Массово изменить статус").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect.poll(() => saved.length).toBeGreaterThan(0);
  const statuses = new Map(saved[0]!.items.map((item) => [item.id, item.patch.status]));
  for (const id of ["p", "a", "b", "c"]) expect(statuses.get(id)).toBe("IN_PROGRESS");
  expect(statuses.has("d")).toBe(false);
});

test("scrolling over a number field in focus does not change it and lets go of the focus", async ({ page }) => {
  await openTree(page);
  const patches: unknown[] = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { error: "Проверка теста" } });
  });
  const workDays = page.locator('[data-wbs-row-id="a"] [data-column="workDays"] input');
  await workDays.click();
  await expect(workDays).toBeFocused();
  const box = await workDays.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let step = 0; step < 5; step += 1) await page.mouse.wheel(0, -120);
  await expect(workDays).not.toBeFocused();
  await expect(workDays).toHaveValue("5");
  // Nothing was typed: after the save delay nothing is sent.
  await page.waitForTimeout(900);
  expect(patches).toEqual([]);
});

test("a number typed in a field is kept when the page is scrolled over it", async ({ page }) => {
  await openTree(page);
  const patches: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { error: "Проверка теста" } });
  });
  const workDays = page.locator('[data-wbs-row-id="a"] [data-column="workDays"] input');
  await workDays.fill("7");
  await workDays.hover();
  await page.mouse.wheel(0, 120);
  await expect(workDays).toHaveValue("7");
  await expect.poll(() => patches.map((patch) => Number(patch.workDays))).toContain(7);
});
