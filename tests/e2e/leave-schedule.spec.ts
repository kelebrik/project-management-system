import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

function day(offset: number) {
  const now = new Date();
  const value = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${date}`;
}

type Leave = { id: string; employeeId: string; typeId: string; startDate: string; endDate: string; comment: string };

async function mockLeaveSchedule(page: Page) {
  await mockAdminProject(page);
  const state = {
    employees: [
      { id: "e1", name: "Барбер Роберт", department: "Разработка", userId: null as string | null, isActive: true, sortOrder: 0 },
      { id: "e2", name: "Альварес Даниэль", department: "Разработка", userId: null, isActive: true, sortOrder: 0 },
      { id: "e3", name: "Кляйн Анна", department: "Маркетинг", userId: "u2" as string | null, isActive: true, sortOrder: 0 },
      { id: "e4", name: "Лонг Мишель", department: "Маркетинг", userId: null, isActive: true, sortOrder: 0 },
    ],
    types: [
      { id: "vacation", name: "Отпуск", nameEn: "Vacation", color: "#8bc34a", isActive: true, sortOrder: 10 },
      { id: "sick", name: "Больничный", nameEn: "Sick leave", color: "#f07056", isActive: true, sortOrder: 20 },
      { id: "time-off", name: "Отгул", nameEn: "Time off", color: "#5b9be6", isActive: true, sortOrder: 30 },
    ],
    leaves: [
      { id: "l1", employeeId: "e1", typeId: "sick", startDate: day(-1), endDate: day(1), comment: "Простуда" },
      { id: "l2", employeeId: "e3", typeId: "vacation", startDate: day(10), endDate: day(23), comment: "" },
    ] as Leave[],
    calendarDays: [] as Array<{ date: string; isWorkingDay: boolean; description: string }>,
    posts: [] as Array<Record<string, unknown>>,
    calendarRequests: [] as Array<Record<string, unknown>>,
    employeePatches: [] as Array<Record<string, unknown>>,
  };
  await page.route(/\/api\/leave-schedule(\?.*)?$/, (route) => {
    // Like the API, return only the leaves that touch the requested period.
    const url = new URL(route.request().url());
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    return route.fulfill({
      json: {
        employees: state.employees,
        types: state.types,
        leaves: state.leaves.filter((leave) => leave.startDate <= to && leave.endDate >= from),
        calendarDays: state.calendarDays,
      },
    });
  });
  await page.route(/\/api\/leave-schedule\/leaves$/, async (route) => {
    const body = route.request().postDataJSON() as Omit<Leave, "id">;
    state.posts.push(body);
    const leave = { id: `l${state.leaves.length + 1}`, ...body };
    state.leaves.push(leave);
    await route.fulfill({ status: 201, json: leave });
  });
  await page.route(/\/api\/leave-schedule\/calendar-days\/\d{4}-\d{2}-\d{2}$/, async (route) => {
    const date = route.request().url().split("/").pop() ?? "";
    state.calendarDays = state.calendarDays.filter((day) => day.date !== date);
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { isWorkingDay: boolean; description: string };
      state.calendarDays.push({ date, ...body });
      state.calendarRequests.push({ method: "PUT", date, ...body });
      return route.fulfill({ json: { date, ...body } });
    }
    state.calendarRequests.push({ method: "DELETE", date });
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route(/\/api\/users$/, (route) =>
    route.fulfill({
      json: [
        { id: "u1", name: "Роберт Барбер", email: "barber@example.test", role: "EXECUTIVE_VIEWER", isActive: true },
        { id: "u2", name: "Анна Кляйн", email: "klein@example.test", role: "EXECUTIVE_VIEWER", isActive: true },
        { id: "u3", name: "Бывший сотрудник", email: "gone@example.test", role: "EXECUTIVE_VIEWER", isActive: false },
      ],
    }),
  );
  await page.route(/\/api\/leave-schedule\/employees\/e\d+$/, async (route) => {
    const id = route.request().url().split("/").pop() ?? "";
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.employeePatches.push({ id, ...body });
    const employee = state.employees.find((candidate) => candidate.id === id);
    if (employee) Object.assign(employee, body);
    await route.fulfill({ json: employee });
  });
  return state;
}

test("the leave schedule shows people, leaves and who is away today", async ({ page }) => {
  await mockLeaveSchedule(page);
  await page.goto("/operations/leave-schedule");

  await expect(page.getByRole("heading", { name: "График отпусков" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ })).toBeVisible();
  await expect(page.getByText("Разработка", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Барбер Роберт: Больничный/ })).toBeVisible();

  await page.getByLabel("Отсутствуют сегодня").check();
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Кляйн Анна/ })).toHaveCount(0);

  // Scrolling far ahead must not drop the people who are away today.
  await page.locator(".leave-grid-shell").evaluate((shell) => {
    shell.scrollLeft = shell.scrollWidth;
  });
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ })).toBeVisible();
});

test("dragging across days creates a leave and overlaps are blocked", async ({ page }) => {
  const state = await mockLeaveSchedule(page);
  await page.goto("/operations/leave-schedule");

  const lane = page.locator('.leave-row-lane[data-employee-id="e2"]');
  const shell = await page.locator(".leave-grid-shell").boundingBox();
  const box = await lane.boundingBox();
  if (!box || !shell) throw new Error("the time lane is not visible");
  // Drag across a stretch of days in the visible part of the row.
  const y = box.y + box.height / 2;
  await page.mouse.move(shell.x + shell.width - 260, y);
  await page.mouse.down();
  await page.mouse.move(shell.x + shell.width - 120, y, { steps: 6 });
  await page.mouse.up();

  const dialog = page.getByRole("dialog", { name: "Новое отсутствие" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Комментарий").fill("Отпуск на море");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({ employeeId: "e2", typeId: "vacation", comment: "Отпуск на море" });
  expect(String(state.posts[0].startDate) <= String(state.posts[0].endDate)).toBe(true);

  await page.getByRole("button", { name: "Добавить отсутствие" }).click();
  const second = page.getByRole("dialog", { name: "Новое отсутствие" });
  await second.getByLabel("Сотрудник").selectOption("e1");
  await expect(second.getByRole("alert")).toContainText("Пересекается");
  await expect(second.getByRole("button", { name: "Сохранить" })).toBeDisabled();
});

test("the list tab exports the visible leaves to CSV", async ({ page }) => {
  await mockLeaveSchedule(page);
  await page.goto("/operations/leave-schedule");
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByRole("cell", { name: "Простуда" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^leave-schedule-.*\.csv$/);
});

test("clicking a production calendar day switches it and a second click resets it", async ({ page }) => {
  const state = await mockLeaveSchedule(page);
  await page.goto("/operations/leave-schedule");
  await page.getByRole("tab", { name: "Производственный календарь" }).click();
  const year = await page.locator(".leave-calendar-toolbar strong").innerText();
  // The first ordinary working day of March in the shown year.
  const workingDay = page.locator(".leave-calendar-month").nth(2).locator(".leave-calendar-day:not(.off)").first();
  await workingDay.click();
  await expect.poll(() => state.calendarRequests.length).toBe(1);
  expect(state.calendarRequests[0]).toMatchObject({ method: "PUT", isWorkingDay: false });
  expect(String(state.calendarRequests[0].date).startsWith(year)).toBe(true);
  const toggled = page.locator(".leave-calendar-month").nth(2).locator(".leave-calendar-day.changed");
  await expect(toggled).toHaveClass(/off/);
  await toggled.click();
  await expect.poll(() => state.calendarRequests.length).toBe(2);
  expect(state.calendarRequests[1]).toMatchObject({ method: "DELETE" });
});

test("a person is linked to a free, active system user", async ({ page }) => {
  const state = await mockLeaveSchedule(page);
  await page.goto("/operations/leave-schedule");
  await page.getByRole("button", { name: "Сотрудники" }).click();
  const dialog = page.getByRole("dialog", { name: "Сотрудники" });
  const row = dialog.getByRole("row").filter({ has: page.locator('input[value="Барбер Роберт"]') });
  const select = row.getByLabel("Пользователь системы");

  // Anna is taken by her own row and the switched-off user is not offered.
  await expect(select.locator('option[value="u2"]')).toBeDisabled();
  await expect(select.locator('option[value="u3"]')).toHaveCount(0);

  await select.selectOption("u1");
  await row.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => state.employeePatches.length).toBe(1);
  expect(state.employeePatches[0]).toMatchObject({ id: "e1", userId: "u1" });

  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ }).getByRole("img", { name: "Связан с пользователем системы" })).toBeVisible();
});

test("Operations is open to a project manager, who edits leaves without listing system users", async ({ page }) => {
  const state = await mockLeaveSchedule(page);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: { id: "pm-1", email: "pm@example.test", name: "Руководитель", role: "PROJECT_MANAGER", isActive: true, lastLoginAt: null },
      },
    }),
  );
  let usersRequested = false;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/users") usersRequested = true;
  });

  // The old Development address still opens the page, now under Operations.
  await page.goto("/development/leave-schedule");
  await expect(page.getByRole("navigation", { name: "Операционка" }).getByRole("button", { name: "График отпусков" })).toHaveClass(/active/);

  await page.getByRole("button", { name: "Добавить отсутствие" }).click();
  const dialog = page.getByRole("dialog", { name: "Новое отсутствие" });
  await dialog.getByLabel("Сотрудник").selectOption("e4");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => state.posts.length).toBe(1);

  await page.getByRole("button", { name: "Сотрудники" }).click();
  await expect(page.getByRole("dialog", { name: "Сотрудники" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Пользователь системы" })).toHaveCount(0);
  expect(usersRequested).toBe(false);
});

test("the time scale scrolls freely, loads more as you go and switches to weeks for a year", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await mockLeaveSchedule(page);
  const requests: URLSearchParams[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/leave-schedule") requests.push(url.searchParams);
  });
  await page.goto("/operations/leave-schedule");
  await expect(page.getByRole("button", { name: /Барбер Роберт: Больничный/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "3 мес." })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".leave-head-day").first()).toBeAttached();

  const shell = page.locator(".leave-grid-shell");
  const firstFrom = requests[0].get("from") ?? "";
  await shell.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await expect.poll(() => requests.some((params) => (params.get("from") ?? "") < firstFrom)).toBe(true);
  // Loading earlier weeks keeps the view where it was instead of jumping to the new start.
  await expect.poll(() => shell.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);

  await page.getByRole("button", { name: "Сегодня" }).click();
  await expect(page.getByRole("button", { name: /Барбер Роберт: Больничный/ })).toBeInViewport();

  // Zooming keeps the week at the left edge in place.
  const leftWeek = () =>
    page.evaluate(() => {
      const shell = document.querySelector(".leave-grid-shell") as HTMLElement;
      const lane = shell.querySelector(".leave-head-weeks .leave-time-lane") as HTMLElement;
      // The first pixel of the time area that is not under the sticky columns.
      const offset = lane.previousElementSibling!.getBoundingClientRect().right - lane.getBoundingClientRect().left + 1;
      return ([...lane.querySelectorAll(".leave-head-week")] as HTMLElement[]).find(
        (week) => week.offsetLeft <= offset && week.offsetLeft + week.offsetWidth > offset,
      )?.textContent;
    });
  const before = await leftWeek();
  await page.getByRole("button", { name: "12 мес." }).click();
  await expect.poll(leftWeek).toBe(before);
  await expect(page.locator(".leave-head-day")).toHaveCount(0);
  await expect(page.locator(".leave-head-week.today")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Барбер Роберт: Больничный/ })).toBeVisible();
});
