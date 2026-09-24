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
      { id: "e1", name: "Барбер Роберт", department: "Разработка", userId: null, isActive: true, sortOrder: 0 },
      { id: "e2", name: "Альварес Даниэль", department: "Разработка", userId: null, isActive: true, sortOrder: 0 },
      { id: "e3", name: "Кляйн Анна", department: "Маркетинг", userId: null, isActive: true, sortOrder: 0 },
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
  return state;
}

test("the leave schedule shows people, leaves and who is away today", async ({ page }) => {
  await mockLeaveSchedule(page);
  await page.goto("/development/leave-schedule");

  await expect(page.getByRole("heading", { name: "График отпусков" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ })).toBeVisible();
  await expect(page.getByText("Разработка", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Барбер Роберт: Больничный/ })).toBeVisible();

  await page.getByLabel("Отсутствуют сегодня").check();
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Кляйн Анна/ })).toHaveCount(0);

  // Moving to a later period must not drop the people who are away today.
  await page.getByRole("button", { name: "Вперёд" }).click();
  await expect(page.getByRole("rowheader", { name: /Барбер Роберт/ })).toBeVisible();
});

test("dragging across days creates a leave and overlaps are blocked", async ({ page }) => {
  const state = await mockLeaveSchedule(page);
  await page.goto("/development/leave-schedule");

  const row = page.getByRole("row", { name: /Альварес Даниэль/ });
  const cells = row.locator(".leave-day");
  const first = await cells.nth(14).boundingBox();
  const last = await cells.nth(18).boundingBox();
  if (!first || !last) throw new Error("day cells are not visible");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 6 });
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
  await page.goto("/development/leave-schedule");
  await page.getByRole("tab", { name: "Список" }).click();
  await expect(page.getByRole("cell", { name: "Простуда" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^leave-schedule-.*\.csv$/);
});

test("clicking a production calendar day switches it and a second click resets it", async ({ page }) => {
  const state = await mockLeaveSchedule(page);
  await page.goto("/development/leave-schedule");
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
