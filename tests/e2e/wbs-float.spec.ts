import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the Structure shows each row's float, red when it holds the finish", async ({ page }) => {
  await mockAdminProject(page, (fixture) => {
    fixture.wbsItems.push({ ...fixture.wbsItems[0], id: "wbs-2", code: "1.2", title: "Вторая задача", sortOrder: 20 });
    (fixture as Record<string, unknown>).criticalPath = {
      projectStartDate: "2026-10-01",
      projectFinishDate: "2026-12-01",
      criticalItemIds: ["wbs-1"],
      criticalDependencyIds: [],
      criticalItemCount: 1,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [
        { itemId: "wbs-1", code: "1.1", title: "Тестовая задача", earlyStartDate: "2026-10-01", earlyFinishDate: "2026-10-02", lateStartDate: "2026-10-01", lateFinishDate: "2026-10-02", totalFloatWorkDays: 0, isCritical: true, isNearCritical: false },
        { itemId: "wbs-2", code: "1.2", title: "Вторая задача", earlyStartDate: "2026-10-01", earlyFinishDate: "2026-10-02", lateStartDate: "2026-10-09", lateFinishDate: "2026-10-12", totalFloatWorkDays: 6, isCritical: false, isNearCritical: false },
      ],
    };
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.getByRole("columnheader", { name: /Запас/ }).first()).toBeVisible();
  const first = page.locator("#wbs-item-wbs-1 .wbs-float");
  await expect(first).toHaveText("0");
  await expect(first).toHaveClass(/wbs-float-critical/);
  await expect(page.locator("#wbs-item-wbs-2 .wbs-float")).toHaveText("6");
  await expect(page.locator("#wbs-item-wbs-2 .wbs-float")).toHaveClass(/wbs-float-free/);
});

test("the float opens what holds the row's dates, with the link that sets them", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/wbs-items/wbs-1/date-drivers", (route) =>
    route.fulfill({
      json: {
        itemId: "wbs-1",
        code: "1.1",
        title: "Тестовая задача",
        kind: "TASK",
        startDate: "2026-10-12",
        dueDate: "2026-10-15",
        start: {
          setBy: "LINK",
          links: [
            { predecessorId: "wbs-1", code: "1.0", title: "Сборка", type: "FS", lagDays: 0, date: "2026-10-12", binding: true },
            { predecessorId: "wbs-1", code: "0.9", title: "Закупка", type: "SS", lagDays: 2, date: "2026-10-07", binding: false },
          ],
        },
        finish: { setBy: "DURATION", links: [], durationWorkDays: 3, daysOff: { count: 1, weekends: 0, other: 1, listed: [{ date: "2026-10-13", weekend: false, description: "Праздник" }] } },
        children: null,
        consistent: false,
      },
    }),
  );
  await page.goto("/TV-OVERVIEW/wbs");
  await page.locator("#wbs-item-wbs-1 button.wbs-float").click();
  const popover = page.getByRole("dialog", { name: "Что держит даты" });
  await expect(popover.getByText("Задано связью (выделена ниже).")).toBeVisible();
  await expect(popover.locator("li.binding")).toContainText("1.0 Сборка");
  await expect(popover.locator("li.binding")).toContainText("(FS) → 12.10.2026 · задает дату");
  await expect(popover.getByText("(SS +2) → 07.10.2026")).toBeVisible();
  await expect(popover.getByText("Начало плюс 3 раб. дн.")).toBeVisible();
  await expect(popover.getByText("Нерабочие дни внутри: выходных 0, других 1: 13.10.2026 (Праздник)")).toBeVisible();
  await expect(popover.getByText(/план пересчитается при следующем изменении/)).toBeVisible();
  await popover.screenshot({ path: test.info().outputPath("drivers.png") });
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});
