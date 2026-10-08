import { expect, test } from "./fixtures";
import { isoDay, mockAdminProject } from "./overview-and-baseline.support";

test("Schedule 2.0 in Development draws the project's goals, phases, milestones and shifts with Highcharts and exports in the browser", async ({ page }) => {
  page.on("pageerror", (error) => console.error(error.stack));
  await mockAdminProject(page, (project) => {
    const base = project.wbsItems[0];
    project.wbsItems.push(
      { ...base, id: "lab-phase", parentId: null, code: "9", title: "Лабораторная фаза", type: "PHASE", wbsLevel: 1, sortOrder: 90, startDate: isoDay(-20), dueDate: isoDay(40), progress: 35 },
      { ...base, id: "lab-goal", parentId: "lab-phase", code: "9.1", title: "Цель лаборатории", type: "GOAL", wbsLevel: 2, sortOrder: 91, status: "NOT_STARTED", dueDate: isoDay(30), baselineDueDate: isoDay(20) },
      { ...base, id: "lab-milestone", parentId: "lab-phase", code: "9.2", title: "Веха лаборатории", type: "MILESTONE", wbsLevel: 2, sortOrder: 92, status: "NOT_STARTED", dueDate: isoDay(10) },
    );
  });
  const step = (id: string, deltaDays: number, category: string | null) => ({ id, operationId: id, at: `${isoDay(-5)}T10:00:00.000Z`, previousDate: isoDay(20), newDate: isoDay(20 + deltaDays), deltaDays, trigger: "MANUAL_EDIT", sourceItemId: null, sourceCode: null, sourceTitle: null, sourceIssueId: null, sourceNote: null, actorName: null, reason: category ? { category, text: null, raidItemId: null } : null, needsReason: false });
  await page.route(/\/api\/projects\/[^/]+\/schedule-shifts$/, (route) =>
    route.fulfill({ json: { checkpoints: [{ id: "lab-goal", code: "9.1", title: "Цель лаборатории", type: "GOAL", isActiveGoal: true, baselineDate: isoDay(20), currentDate: isoDay(30), varianceDays: 10, unexplainedDays: 0, earlierSteps: null, reasonDays: { SUPPLIER: 7, CUSTOMER: 3 }, steps: [step("s1", 7, "SUPPLIER"), step("s2", 3, "CUSTOMER")] }] } }),
  );
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("/TV-OVERVIEW/schedule");
  await expect(page.getByText("Цель лаборатории").first()).toBeVisible();
  await page.goto("/development/schedule-lab");
  await expect(page.getByRole("button", { name: "График 2.0" })).toHaveClass(/active/);
  const cards = page.locator(".lab-card");
  await expect(cards).toHaveCount(6);
  await expect(page.locator(".lab-card .highcharts-root")).toHaveCount(6);
  // Goals as dumbbells, the slip written by the forecast.
  await expect(cards.filter({ hasText: "Цели: базовый план" })).toContainText("+10 дн. позже");
  // A column drills down into the moves of its milestone.
  const moves = cards.filter({ hasText: "Сдвиги по вехам" });
  await moves.locator(".highcharts-column-series .highcharts-point").first().click();
  await expect(moves.locator(".highcharts-breadcrumbs-group")).toContainText("Цель лаборатории");
  // The menu exports in the browser: a PNG file, and the data as a table.
  const reasons = cards.filter({ hasText: "Почему сдвигались вехи" });
  await reasons.locator(".highcharts-contextbutton").click();
  const download = page.waitForEvent("download");
  await page.getByText("Скачать PNG").click();
  expect((await download).suggestedFilename()).toBe("Почему сдвигались вехи.png");
  await reasons.locator(".highcharts-contextbutton").click();
  await page.getByText("Показать таблицу данных").click();
  await expect(reasons.locator(".highcharts-data-table")).toContainText("Поставщик");
});
