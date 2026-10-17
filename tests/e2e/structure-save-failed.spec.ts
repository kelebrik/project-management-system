import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

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

test("a save that fails stays in view: the error until it is dealt with, the row marked, a retry that clears both", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    Object.assign(fixture, {
      wbsItems: [row("w1", "1", null, 10), row("w2", "2", null, 20)],
      wbsDependencies: [], structureVersion: "1", structureToday: "2026-10-13", calendarOverrides: [],
    });
  });
  let refuse = true;
  await page.route("**/api/projects/project-1/wbs-items/bulk", async (route) => {
    if (refuse) {
      await route.fulfill({ status: 500, json: { error: "База недоступна" } });
      return;
    }
    const items = project.wbsItems.map((item) => (item.id === "w1" ? { ...item, dueDate: at("2026-10-15"), forecastDueDate: at("2026-10-15"), workDays: 4, calendarDays: 4 } : item));
    await route.fulfill({ json: { wbsItems: items, wbsDependencies: [], criticalPath: null, structureVersion: "2", structureDelta: { projectId: "project-1", baseVersion: "1", version: "2", today: "2026-10-13", deletedItemIds: [], dependencies: [], deletedDependencyIds: [], items } } });
  });
  await page.goto(`/${project.code}/wbs`);
  const first = page.locator('[data-wbs-row-id="w1"] .wbs-table-row');
  await first.locator('[data-column="due"] input').fill("2026-10-15");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();

  const toast = page.locator(".toast.error");
  await expect(toast).toContainText("База недоступна");
  await expect(first).toHaveClass(/save-failed/);
  const mark = first.getByRole("button", { name: /Строка не сохранена: База недоступна/ });
  await expect(mark).toBeVisible();
  await expect(page.locator(".wbs-save-state")).toHaveClass(/failed/);
  await expect(page.locator(".wbs-save-state")).toHaveText("Не сохранено: 1");
  // The error has no timer: it stays until it is closed or the save goes through.
  await page.waitForTimeout(1_500);
  await expect(toast).toBeVisible();

  refuse = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(first).not.toHaveClass(/save-failed/);
  await expect(mark).toHaveCount(0);
  await expect(page.locator(".wbs-save-state")).not.toHaveClass(/failed/);
  await expect(toast).toHaveCount(0);
});
