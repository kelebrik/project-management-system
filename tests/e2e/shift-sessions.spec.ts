import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

// The reason a checkpoint moved is asked once an editing session ends, about the
// session's net move, not after every save.

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

const cell = (page: Page, rowId: string, column: string) => page.locator(`[data-wbs-row-id="${rowId}"] [data-column="${column}"]`);

async function openPlan(page: Page, setup: (control: { failNext: number; ownOpen: null | { id: string; lastActivityAt: string } }) => void = () => undefined) {
  const phase = structureRow("p", "1", 10, { startDate: at("2026-10-12"), dueDate: at("2026-10-16"), forecastStartDate: at("2026-10-12"), forecastDueDate: at("2026-10-16"), workDays: 5 });
  const task = structureRow("a", "1.1", 20, { startDate: at("2026-10-12"), dueDate: at("2026-10-14"), forecastStartDate: at("2026-10-12"), forecastDueDate: at("2026-10-14"), workDays: 3 });
  await mockAdminProject(page, (project) => {
    Object.assign(project, { wbsItems: [phase, task], wbsDependencies: [], structureVersion: "1", structureToday: "2026-10-13", calendarOverrides: [] });
  });
  // The session the server puts the saves in: s1 until the person leaves, then s2.
  let session = "s1";
  const saves: string[] = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    saves.push(session);
    const body = route.request().postDataJSON() as { workDays?: number };
    const item = { ...task, workDays: body.workDays ?? task.workDays };
    const version = String(saves.length + 1);
    await route.fulfill({
      status: 200,
      headers: { "X-Schedule-Shift-Operation-Id": `op-${saves.length}`, "X-Schedule-Shift-Reason-Needed": "1", "X-Schedule-Shift-Session-Id": session, "X-Schedule-Shift-Project-Id": "project-1", "X-Schedule-Shift-Actor-Id": "admin-1" },
      json: {
        item,
        structureVersion: version,
        structureDelta: { projectId: "project-1", baseVersion: String(saves.length), version, today: "2026-10-13", deletedItemIds: [], dependencies: [], deletedDependencyIds: [], items: [item] },
      },
    });
  });
  const closes: Array<{ sessionId: string; mode: string; lastActivityAt?: string }> = [];
  await page.route(/\/api\/projects\/project-1\/schedule-shifts\/sessions\/([^/]+)\/close$/, async (route) => {
    const sessionId = route.request().url().split("/").at(-2)!;
    closes.push({ sessionId, ...(route.request().postDataJSON() as { mode: string; lastActivityAt?: string }) });
    session = `s${Number(sessionId.slice(1)) + 1}`;
    await route.fulfill({ json: { closed: true } });
  });
  const asked: string[] = [];
  const reviewed = new Set<string>();
  // The first reading may fail, to see it tried again; the person's session left open in a gone tab may be named.
  const control = { failNext: 0, ownOpen: null as null | { id: string; lastActivityAt: string } };
  await page.route(/\/api\/projects\/project-1\/schedule-shifts\/pending(\?.*)?$/, async (route) => {
    asked.push(new URL(route.request().url()).search);
    if (control.failNext > 0) {
      control.failNext -= 1;
      return route.fulfill({ status: 503, json: { error: "Сервис недоступен" } });
    }
    const sessions = closes
      .filter((close) => !reviewed.has(close.sessionId))
      .map((close) => ({
        id: close.sessionId, startedAt: "2026-10-14T10:00:00.000Z", endedAt: "2026-10-14T10:20:00.000Z",
        steps: [{ checkpointId: "m", code: "2", title: "Готово к релизу", deltaDays: 3, previousDate: "2026-10-20", newDate: "2026-10-23", baselineDate: "2026-10-20", notes: [] }],
      }));
    const ownOpen = control.ownOpen;
    control.ownOpen = null;
    await route.fulfill({ json: { projectId: "project-1", sessions, risks: [{ id: "r1", title: "Поставщик плат" }], ownOpen } });
  });
  const reasons: Array<Record<string, unknown>> = [];
  await page.route("**/api/projects/project-1/schedule-shifts/reason", async (route) => {
    reasons.push(route.request().postDataJSON());
    await route.fulfill({ json: { updated: 3 } });
  });
  await page.route("**/api/projects/project-1/schedule-shifts/sessions/review", async (route) => {
    for (const id of (route.request().postDataJSON() as { sessionIds: string[] }).sessionIds) reviewed.add(id);
    await route.fulfill({ json: { reviewed: 1 } });
  });
  setup(control);
  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.locator('[data-wbs-row-id="p"]')).toBeVisible();
  if ((await page.locator('[data-wbs-row-id="a"]').count()) === 0) await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.locator('[data-wbs-row-id="a"]')).toBeVisible();
  return { saves, closes, asked, reasons, control };
}

async function editWorkDays(page: Page, value: string) {
  const workDays = cell(page, "a", "workDays").locator("input");
  await workDays.fill(value);
  await workDays.press("Enter");
}

test("saves ask nothing; leaving the Structure asks once about the session's net move, and the reason goes to it", async ({ page }) => {
  const { saves, closes, asked, reasons } = await openPlan(page);
  // Opening the project asks about the person's earlier sessions.
  await expect.poll(() => asked).toEqual([""]);
  const prompt = page.getByRole("dialog", { name: /вехи ушли за базовый план/ });
  for (const value of ["5", "2", "6"]) {
    await editWorkDays(page, value);
    await expect.poll(() => saves.length).toBe(["5", "2", "6"].indexOf(value) + 1);
  }
  await expect(prompt).toHaveCount(0);

  await page.locator(".project-section-navigation").getByRole("button", { name: "Состояние" }).click();
  await expect.poll(() => closes).toEqual([{ sessionId: "s1", mode: "leave" }]);
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("2 Готово к релизу");
  await expect(prompt).toContainText("+3");
  await prompt.getByRole("radio", { name: "Переоценка трудоемкости" }).click();
  await prompt.getByRole("button", { name: "Сохранить причину" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Причина сохранена" })).toBeVisible();
  expect(reasons).toEqual([{ sessionId: "s1", checkpointIds: ["m"], category: "ESTIMATE", text: "", raidItemId: null }]);

  // Back to editing: a new session, asked about on its own when left.
  await page.locator(".project-section-navigation").getByRole("button", { name: "Структура" }).click();
  if ((await page.locator('[data-wbs-row-id="a"]').count()) === 0) await page.getByRole("button", { name: "2", exact: true }).click();
  await editWorkDays(page, "4");
  await expect.poll(() => saves).toEqual(["s1", "s1", "s1", "s2"]);
  await page.locator(".project-section-navigation").getByRole("button", { name: "Состояние" }).click();
  await expect.poll(() => closes.map((close) => close.sessionId)).toEqual(["s1", "s2"]);
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Без причины" }).last().click();
  await expect(prompt).toHaveCount(0);
});

test("moving between the Structure, Current work and Gantt keeps the session going", async ({ page }) => {
  const { saves, closes } = await openPlan(page);
  await editWorkDays(page, "5");
  await expect.poll(() => saves.length).toBe(1);
  await page.locator(".project-section-navigation").getByRole("button", { name: "Гантт" }).click();
  await page.locator(".project-section-navigation").getByRole("button", { name: "Структура" }).click();
  await page.waitForTimeout(500);
  expect(closes).toEqual([]);
});

test("a session left open in a tab that is gone is ended on coming back, only as the page saw it", async ({ page }) => {
  const { closes, asked } = await openPlan(page, (control) => {
    control.ownOpen = { id: "s1", lastActivityAt: "2026-10-14T10:20:00.000Z" };
  });
  await expect.poll(() => closes).toEqual([{ sessionId: "s1", mode: "stale", lastActivityAt: "2026-10-14T10:20:00.000Z" }]);
  // Then the question about it.
  await expect.poll(() => asked.length).toBe(2);
  await expect(page.getByRole("dialog", { name: /вехи ушли за базовый план/ })).toBeVisible();
});

test("a question that could not be fetched after a leave is said so and fetched again", async ({ page }) => {
  const { saves, closes, control } = await openPlan(page);
  await editWorkDays(page, "5");
  await expect.poll(() => saves.length).toBe(1);
  control.failNext = 1;
  await page.locator(".project-section-navigation").getByRole("button", { name: "Состояние" }).click();
  await expect.poll(() => closes.map((close) => close.sessionId)).toEqual(["s1"]);
  const failed = page.getByRole("status").filter({ hasText: "Не удалось узнать, о каких сдвигах спросить" });
  await expect(failed).toBeVisible();
  await failed.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("dialog", { name: /вехи ушли за базовый план/ })).toBeVisible();
});
