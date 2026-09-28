import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

async function mockWorkload(page: import("@playwright/test").Page, people = 3) {
  await mockAdminProject(page);
  const items = Array.from({ length: people }, (_, index) => ({
    id: `w${index}`, projectId: "project-1", code: `1.${index}`, title: `Работа ${index}`, owner: `Сотрудник ${index}`,
    type: "TASK", status: "IN_PROGRESS", startDate: "2026-10-05", dueDate: "2026-10-09",
  }));
  await page.route(/\/api\/workload(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        projects: [{ id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }],
        items, employees: [], leaves: [], calendarDays: [],
      },
    }),
  );
}

test("the header search folds to its magnifier and opens on hover or Ctrl K", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-07T12:00:00") });
  await mockWorkload(page);
  await page.goto("/operations/workload");
  const search = page.locator(".app-global-header .global-search");
  await expect(search).toHaveClass(/collapsed/);
  expect((await search.boundingBox())!.width).toBeLessThan(40);

  await search.hover();
  await expect(search).toHaveClass(/expanded/);
  // Left alone, it folds back after ten seconds.
  await page.mouse.move(5, 400);
  await page.clock.runFor(9_000);
  await expect(search).toHaveClass(/expanded/);
  await page.clock.runFor(1_500);
  await expect(search).toHaveClass(/collapsed/);

  // Ctrl K opens it with the cursor in the field, and it stays open while focused.
  await page.keyboard.press("Control+k");
  await expect(search).toHaveClass(/expanded/);
  await expect(page.getByRole("textbox", { name: /Поиск/ }).first()).toBeFocused();
  await page.clock.runFor(30_000);
  await expect(search).toHaveClass(/expanded/);
});

test("the workload opens full screen, suggests it on scrolling and leaves it on Escape", async ({ page }) => {
  await mockWorkload(page, 40);
  await page.goto("/operations/workload");
  const section = page.locator("section.workload-page");
  await expect(section).not.toHaveClass(/timeline-page-fullscreen/);

  await page.locator(".leave-grid-shell").evaluate((shell) => {
    shell.scrollTop = 400;
    shell.dispatchEvent(new Event("scroll"));
  });
  const tip = page.getByRole("complementary", { name: "Подсказка по режиму просмотра" });
  await expect(tip).toContainText("Удобнее смотреть загрузку?");
  await tip.getByRole("button", { name: "На весь экран" }).click();
  await expect(section).toHaveClass(/timeline-page-fullscreen/);
  await expect(page.locator(".leave-page-description")).toHaveCount(0);
  await expect(tip).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(section).not.toHaveClass(/timeline-page-fullscreen/);

  await page.getByRole("button", { name: "На весь экран" }).click();
  await expect(section).toHaveClass(/timeline-page-fullscreen/);
  await page.getByRole("button", { name: "Вернуть обычный режим" }).click();
  await expect(section).not.toHaveClass(/timeline-page-fullscreen/);
});

test("the leave schedule has the same full screen", async ({ page }) => {
  await mockAdminProject(page);
  await page.route(/\/api\/leave-schedule(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        employees: [{ id: "e1", name: "Барбер Роберт", department: "", userId: null, isActive: true, sortOrder: 0 }],
        types: [{ id: "vacation", name: "Отпуск", nameEn: "Vacation", color: "#8bc34a", isActive: true, sortOrder: 10 }],
        leaves: [], calendarDays: [],
      },
    }),
  );
  await page.goto("/operations/leave-schedule");
  // People, leave types and a new leave share the row with Today, the scales and full screen.
  const nav = page.locator(".leave-toolbar .leave-period-nav");
  await expect(nav.getByRole("button", { name: "Добавить отсутствие" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "На весь экран" })).toBeVisible();
  const description = page.locator(".leave-page-description");
  await expect(description).toBeVisible();

  await page.getByRole("button", { name: "На весь экран" }).click();
  await expect(page.locator("section.leave-page")).toHaveClass(/timeline-page-fullscreen/);
  // Full screen drops the explanation line and keeps the controls.
  await expect(description).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Добавить отсутствие" })).toBeVisible();
});

test("work and overlap counts line up under their headers", async ({ page }) => {
  await mockWorkload(page);
  await page.goto("/operations/workload");
  await expect(page.locator(".workload-counts").first()).toBeVisible();
  const [tasksHeader, overlapHeader] = await page.locator(".leave-head-corner.leave-planned-cell > *").all();
  const [tasks, overlap] = await page.locator(".workload-counts").first().locator("span").all();
  const right = async (locator: import("@playwright/test").Locator) => {
    const box = (await locator.boundingBox())!;
    return box.x + box.width;
  };
  // Each number ends within a few pixels of its header, in its own half of the column.
  expect(Math.abs((await right(tasksHeader)) - (await right(tasks)))).toBeLessThan(8);
  expect(Math.abs((await right(overlapHeader)) - (await right(overlap)))).toBeLessThan(8);
  expect(await right(tasks)).toBeLessThan((await overlapHeader.boundingBox())!.x + 4);
});

test("messages stay visible over a full-screen page", async ({ page }) => {
  await mockWorkload(page);
  await page.goto("/operations/workload");
  await page.getByRole("button", { name: "На весь экран" }).click();
  const layer = (selector: string) => page.locator(selector).evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(await layer(".toast-stack")).toBeGreaterThan(await layer(".timeline-page-fullscreen"));
});
