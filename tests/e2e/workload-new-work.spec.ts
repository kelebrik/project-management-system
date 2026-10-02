import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const V1 = "2026-10-01T09:00:00.000Z";

type Captured = { method: string; url: string; body: unknown };

/** Wednesday 7 October 2026. Ivanov works 5–9 October in a project planned in the Chinese calendar. */
async function mockWorkload(page: Page, options: { savedViews?: Array<Record<string, unknown>> } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00"));
  await mockAdminProject(page);
  const calls: Captured[] = [];
  let views = options.savedViews ?? [];
  await page.route(/\/api\/workload(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        projects: [{ id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }],
        items: [
          { id: "1", projectId: "project-1", code: "1.1", title: "Работа 1", owner: "Иванов", type: "TASK", status: "IN_PROGRESS", startDate: "2026-10-05", dueDate: "2026-10-09", updatedAt: V1, startLocked: false, finishLocked: false, lockedByIssue: false, calendarCode: "CN" },
          { id: "2", projectId: "project-1", code: "1.2", title: "Работа 2", owner: "Петров", type: "TASK", status: "IN_PROGRESS", startDate: "2026-10-05", dueDate: "2026-10-06", updatedAt: V1, startLocked: false, finishLocked: false, lockedByIssue: false, calendarCode: "CN" },
        ],
        editableProjectIds: ["project-1"],
        editableProjects: [{ id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }],
        // A day off in the Chinese calendar on Monday 12 October.
        projectCalendars: { "project-1": [{ calendarCode: "CN", date: "2026-10-12", isWorkingDay: false }] },
        employees: [
          { id: "e1", name: "Иванов", department: "Разработка" },
          { id: "e2", name: "Петров", department: "Разработка" },
        ],
        leaves: [],
        calendarDays: [],
      },
    }),
  );
  await page.route(/\/api\/workload\/parents\?.*/, (route) =>
    route.fulfill({
      json: {
        projectId: "project-1",
        defaultCalendarCode: "CN",
        parents: [{ id: "phase-1", code: "1", title: "Фаза", type: "PHASE", level: 1, calendarCode: "CN" }],
        calendar: [{ calendarCode: "CN", date: "2026-10-12", isWorkingDay: false }],
      },
    }),
  );
  await page.route(/\/api\/projects\/project-1\/wbs-items\/append$/, (route) => {
    calls.push({ method: "POST", url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, json: { item: { id: "new-1", code: "1.3", title: "Прошивка" } } });
  });
  await page.route(/\/api\/wbs-items\/[^/]+$/, (route) => {
    calls.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { item: { updatedAt: V1 } } });
  });
  await page.route(/\/api\/saved-views(\?.*)?$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ method: "POST", url: route.request().url(), body });
      const created = { id: "view-1", ownerId: "admin-1", projectId: null, viewType: "workload", isShared: false, sortOrder: 0, lastUsedAt: null, createdAt: V1, updatedAt: V1, ...body };
      views = [...views, created];
      return route.fulfill({ status: 201, json: created });
    }
    return route.fulfill({ json: views });
  });
  await page.route(/\/api\/saved-views\/[^/]+(\/use)?$/, (route) => {
    calls.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    if (route.request().method() === "DELETE") views = views.filter((view) => !route.request().url().includes(String(view.id)));
    return route.fulfill({ status: route.request().method() === "DELETE" ? 204 : 200, json: {} });
  });
  await page.goto("/operations/workload");
  await page.getByRole("button", { name: "1 мес." }).click();
  return calls;
}

const bar = (page: Page, id: string) => page.locator(`.workload-bar[data-item-id="${id}"]`);

test("dragging across free days of a person starts new work in the project calendar", async ({ page }) => {
  const calls = await mockWorkload(page);
  const box = (await bar(page, "1").boundingBox())!;
  const dayWidth = box.width / 5;
  const lane = page.locator('.workload-lane[data-owner="иванов"]');
  const laneBox = (await lane.boundingBox())!;
  // From Monday 12 to Wednesday 14 October, on the empty part of the row.
  const y = laneBox.y + laneBox.height - 3;
  await page.mouse.move(box.x + 7 * dayWidth + dayWidth / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 9 * dayWidth + dayWidth / 2, y, { steps: 6 });
  await page.mouse.up();

  const dialog = page.getByRole("dialog", { name: "Новая работа" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Исполнитель")).toHaveValue("Иванов");
  await expect(dialog.getByLabel("Начало")).toHaveValue("2026-10-12");
  await expect(dialog.getByLabel("Окончание")).toHaveValue("2026-10-14");
  await dialog.getByLabel("Название").fill("Прошивка");
  // The only project the user may change is chosen already; the counts follow its calendar.
  await expect(dialog.getByLabel("В Структуре под")).toHaveValue("phase-1");
  await expect(dialog.getByText("Рабочих дней по календарю проекта (CN): 2")).toBeVisible();
  await expect(dialog.getByText(/приходится на нерабочий день календаря проекта/)).toBeVisible();
  await dialog.getByRole("button", { name: "Создать" }).click();

  await expect.poll(() => calls.filter((call) => call.url.endsWith("/wbs-items/append")).length).toBe(1);
  expect(calls.find((call) => call.url.endsWith("/wbs-items/append"))!.body).toEqual({
    parentId: "phase-1",
    title: "Прошивка",
    owner: "Иванов",
    startDate: "2026-10-12",
    dueDate: "2026-10-14",
    type: "TASK",
  });
  await expect(page.getByRole("status")).toContainText("Создана работа 1.3 Прошивка в TV-OVERVIEW");
  await expect(page.getByRole("link", { name: "Открыть в Структуре" })).toHaveAttribute("href", "/TV-OVERVIEW/wbs?focusWbs=new-1");
});

test("Escape drops a selection in progress without opening anything", async ({ page }) => {
  await mockWorkload(page);
  const box = (await bar(page, "1").boundingBox())!;
  const dayWidth = box.width / 5;
  const laneBox = (await page.locator('.workload-lane[data-owner="иванов"]').boundingBox())!;
  const y = laneBox.y + laneBox.height - 3;
  await page.mouse.move(box.x + 7 * dayWidth + dayWidth / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 9 * dayWidth + dayWidth / 2, y, { steps: 4 });
  await expect(page.locator(".workload-new-selection")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workload-new-selection")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Новая работа" })).toHaveCount(0);
});

test("a moved bar lands on a working day of its project's calendar, not the people's", async ({ page }) => {
  const calls = await mockWorkload(page);
  const box = (await bar(page, "1").boundingBox())!;
  const dayWidth = box.width / 5;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 7 * dayWidth, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  // 12 October is a day off in the Chinese calendar: the start moves on to the 13th.
  await expect.poll(() => calls.filter((call) => call.method === "PATCH").length).toBe(1);
  expect(calls.find((call) => call.method === "PATCH")!.body).toMatchObject({ startDate: "2026-10-13", dueDate: "2026-10-19" });
});

test("a planner keeps people and filters, shows them again, and its author can delete it", async ({ page }) => {
  const calls = await mockWorkload(page);
  await expect(page.locator('.workload-lane[data-owner="петров"]')).toBeVisible();
  await page.locator("summary", { hasText: "Все люди" }).click();
  await page.getByRole("checkbox", { name: "Иванов", exact: true }).check();
  await expect(page.locator('.workload-lane[data-owner="петров"]')).toHaveCount(0);
  await page.locator("summary", { hasText: "Планировщики" }).click();
  await page.getByLabel("Название нового планировщика").fill("Только Иванов");
  await page.getByRole("checkbox", { name: "Показывать всем" }).check();
  await page.getByRole("button", { name: "Сохранить как новый" }).click();
  await expect(page.getByText("Планировщик «Только Иванов» сохранен")).toBeVisible();
  const saved = calls.find((call) => call.method === "POST" && /\/api\/saved-views$/.test(call.url))!.body as Record<string, unknown>;
  expect(saved).toMatchObject({ viewType: "workload", projectId: null, name: "Только Иванов", isShared: true, config: { version: 1, people: ["иванов"] } });

  // Clearing the filter and opening the planner brings the set back.
  // The people list is still open.
  await page.getByRole("checkbox", { name: "Иванов", exact: true }).uncheck();
  await expect(page.locator('.workload-lane[data-owner="петров"]')).toBeVisible();
  await page.getByLabel("Открыть планировщик").selectOption("view-1");
  await expect(page.locator('.workload-lane[data-owner="петров"]')).toHaveCount(0);
  await expect.poll(() => calls.some((call) => call.url.endsWith("/saved-views/view-1/use"))).toBe(true);
  await page.getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText("Планировщик «Только Иванов» удален")).toBeVisible();
});

test("filters stay as they were after leaving the page", async ({ page }) => {
  await mockWorkload(page);
  await page.getByRole("checkbox", { name: "Только с наложениями" }).check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Только с наложениями" })).toBeChecked();
});
