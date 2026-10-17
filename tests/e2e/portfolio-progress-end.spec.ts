import { expect, test } from "./fixtures";
import { isoDay, mockAdminProject } from "./overview-and-baseline.support";

const shown = (day: string) => day.split("-").reverse().join(".");

test("a goal moved earlier in the passport ends the portfolio bar there, with no reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const project = await mockAdminProject(page, (fixture) => {
    fixture.startDate = isoDay(-60);
    fixture.targetDate = isoDay(20);
    // The list counts the Structure's last date: a goal far ahead.
    (fixture as unknown as { structureEndDate: string }).structureEndDate = `${isoDay(160)}T00:00:00.000Z`;
    const goal = fixture.wbsItems.find((item) => item.type === "GOAL") ?? fixture.wbsItems[0];
    Object.assign(goal, { type: "GOAL", status: "NOT_STARTED", dueDate: isoDay(160), forecastDueDate: isoDay(160) });
  });
  await page.route("**/api/projects/project-1/target-date", async (route) => {
    const body = route.request().postDataJSON() as { targetDate: string };
    // The answer carries the whole Structure, the goal at its new date.
    const wbsItems = project.wbsItems.map((item) => ({ ...item, dueDate: item.dueDate && item.dueDate > body.targetDate ? body.targetDate : item.dueDate, forecastDueDate: item.forecastDueDate && item.forecastDueDate > body.targetDate ? body.targetDate : item.forecastDueDate }));
    await route.fulfill({ json: { ...project, targetDate: body.targetDate, wbsItems } });
  });
  await page.goto("/projects");
  const bar = page.locator(".portfolio-chart .highcharts-point").first();
  await expect(bar).toHaveAttribute("aria-label", new RegExp(shown(isoDay(160))));

  await page.goto("/TV-OVERVIEW/passport");
  await page.getByLabel("Новая дата цели").fill(isoDay(90));
  await page.getByLabel("Причина изменения").fill("Решение бизнеса");
  const saved = page.waitForResponse("**/api/projects/project-1/target-date");
  await page.getByRole("button", { name: "Сохранить цель" }).click();
  await saved;

  // Back to the registry inside the app: the bar ends at the new goal, not the old last date.
  await page.getByRole("link", { name: "Реестр" }).click();
  await expect(bar).toHaveAttribute("aria-label", new RegExp(shown(isoDay(90))));
  await expect(bar).not.toHaveAttribute("aria-label", new RegExp(shown(isoDay(160))));
});
