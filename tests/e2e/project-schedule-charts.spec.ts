import { expect, test } from "./fixtures";
import { countPdfPages, isoDay, mockAdminProject } from "./overview-and-baseline.support";

test("the project schedule tab draws goals, phases, milestones and shifts with Highcharts, exports in the browser and prints each chart on a page", async ({ page }) => {
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
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printInvoked = "true";
    };
  });
  await page.goto("/TV-OVERVIEW/schedule");
  await expect(page.locator(".project-section-navigation").getByRole("button", { name: "График" })).toHaveClass(/active/);
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
  // Highcharts hides its menu when the pointer has been away from it for half a second; under load the
  // pick is tried again with the menu opened anew.
  const pick = (item: string) =>
    expect(async () => {
      await reasons.locator(".highcharts-contextbutton").click();
      await reasons.locator(".highcharts-menu-item", { hasText: item }).click({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  const download = page.waitForEvent("download");
  await pick("Скачать PNG");
  expect((await download).suggestedFilename()).toBe("Почему сдвигались вехи.png");
  await pick("Показать таблицу данных");
  await expect(reasons.locator(".highcharts-data-table")).toContainText("Поставщик");

  // "Save as PDF": every chart drawn at the page's size, one chart a page; back as it was after printing.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Сохранить в PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-invoked", "true");
  await expect(page.locator("body")).toHaveAttribute("data-print-target", "project-schedule-charts");
  await expect.poll(() => page.locator(".lab-card .highcharts-root").first().getAttribute("width")).toBe("1040");
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
  expect(countPdfPages(pdf)).toBe(6);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("body")).not.toHaveAttribute("data-print-target", /.*/);
  await expect.poll(() => page.locator(".lab-card .highcharts-root").first().getAttribute("width")).not.toBe("1040");
});

test("the old schedule lives in Development as «Старый график»", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/schedule");
  await page.goto("/development/schedule-legacy");
  await expect(page.locator(".development-section-navigation").getByRole("button", { name: "Старый график" })).toHaveClass(/active/);
  await expect(page.locator("#milestones-by-phase")).toBeVisible();
  await expect(page.locator(".development-section-navigation .section-project-picker")).toBeVisible();
});
