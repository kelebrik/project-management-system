import { expect, test } from "./fixtures";
import { isoDay, mockAdminProject } from "./overview-and-baseline.support";

const shown = (day: string) => day.split("-").reverse().join(".");

test("any open goal is moved from the passport; an agreed move needs who agreed and is marked in the history", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const project = await mockAdminProject(page, (fixture) => {
    fixture.startDate = isoDay(-60);
    const base = fixture.wbsItems[0];
    const goal = (id: string, code: string, title: string, due: string, sortOrder: number) => ({
      ...base, id, code, title, type: "GOAL", status: "NOT_STARTED", parentId: null, wbsLevel: 1,
      startDate: due, dueDate: due, forecastStartDate: due, forecastDueDate: due, baselineStartDate: due, baselineDueDate: due, workDays: 0, sortOrder,
    });
    fixture.wbsItems = [
      goal("goal-done", "1", "Прототип", isoDay(-10), 10),
      { ...goal("goal-first", "2", "Заводская прошивка", isoDay(20), 20) },
      { ...goal("goal-last", "3", "Выпуск OTA", isoDay(80), 30) },
    ] as typeof fixture.wbsItems;
    fixture.wbsItems[0]!.status = "DONE";
    fixture.targetDate = isoDay(80);
  });
  const sent: Array<Record<string, unknown>> = [];
  // The server's state: each answer carries the moves before it.
  let current = project;
  await page.route("**/api/projects/project-1/target-date", async (route) => {
    const body = route.request().postDataJSON() as { targetDate: string; reason: string; approvedBy: string | null; goalId: string; notDelay: boolean };
    sent.push(body);
    const moved = current.wbsItems.find((item) => item.id === body.goalId)!;
    const wbsItems = current.wbsItems.map((item) => item.id === body.goalId
      ? { ...item, dueDate: body.targetDate, startDate: body.targetDate, forecastDueDate: body.targetDate, forecastStartDate: body.targetDate, ...(body.notDelay ? { baselineDueDate: body.targetDate, baselineStartDate: body.targetDate } : {}) }
      : item);
    const lastGoal = wbsItems.filter((item) => item.type === "GOAL").map((item) => item.dueDate!).sort().at(-1)!;
    current = {
      ...current,
      wbsItems,
      targetDate: lastGoal,
      targetDateChanges: [
        { id: `change-${sent.length}`, projectId: project.id, previousDate: moved.dueDate, newDate: body.targetDate, reason: body.reason, approvedBy: body.approvedBy, goalId: moved.id, goalCode: moved.code, goalTitle: moved.title, notDelay: body.notDelay, createdById: "admin-1", createdAt: new Date().toISOString(), createdBy: null },
        ...current.targetDateChanges,
      ],
    };
    await route.fulfill({ json: current });
  });

  await page.goto("/TV-OVERVIEW/passport");
  // The project's target is its last goal; the form starts on the active goal, done goals are not offered.
  await expect(page.locator(".passport-row-readonly").nth(1)).toContainText(shown(isoDay(80)));
  const goalSelect = page.locator(".passport-target-edit select");
  await expect(goalSelect).toHaveValue("goal-first");
  await expect(goalSelect.locator("option")).toHaveText([`2 · Заводская прошивка · ${shown(isoDay(20))}`, `3 · Выпуск OTA · ${shown(isoDay(80))}`]);
  await expect(page.getByLabel("Новая дата цели")).toHaveValue(isoDay(20));

  // Choosing the last goal puts its date in the form; moving it moves the project's target.
  await goalSelect.selectOption("goal-last");
  await expect(page.getByLabel("Новая дата цели")).toHaveValue(isoDay(80));
  await page.getByLabel("Новая дата цели").fill(isoDay(95));
  await page.getByLabel("Причина изменения").fill("Перенос сертификации");
  await page.getByRole("button", { name: "Сохранить цель" }).click();
  await expect(page.locator(".passport-row-readonly").nth(1)).toContainText(shown(isoDay(95)));
  expect(sent[0]).toMatchObject({ goalId: "goal-last", targetDate: isoDay(95), notDelay: false });
  const history = page.locator(".passport-target-history-row").first();
  await expect(history).toContainText("3 · Выпуск OTA");
  await expect(history).not.toContainText("не отставание");

  // The form stays on the goal just moved, with its new date: a second save is for that goal and that date.
  await expect(goalSelect).toHaveValue("goal-last");
  await expect(page.getByLabel("Новая дата цели")).toHaveValue(isoDay(95));
  // An agreed move cannot be saved until who agreed is named; then it is sent even for the goal's own date.
  await page.getByLabel("Причина изменения").fill("Решение комитета");
  await page.getByLabel("Перенос согласован — это не отставание").check();
  const save = page.getByRole("button", { name: "Сохранить цель" });
  await expect(save).toBeDisabled();
  await expect(page.getByLabel("Кто согласовал (обязательно)")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Кто согласовал (обязательно)").fill("Проектный комитет");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".passport-target-history-row").first()).toContainText("не отставание");
  expect(sent[1]).toMatchObject({ goalId: "goal-last", targetDate: isoDay(95), notDelay: true, approvedBy: "Проектный комитет" });
  await expect(page.getByLabel("Перенос согласован — это не отставание")).not.toBeChecked();

  // A date typed for one goal is not carried to another: choosing a goal shows its own date.
  await page.getByLabel("Новая дата цели").fill(isoDay(99));
  await goalSelect.selectOption("goal-first");
  await expect(page.getByLabel("Новая дата цели")).toHaveValue(isoDay(20));

  // The registry follows without a reload: the bar ends at the project's new target.
  await page.getByRole("link", { name: "Реестр" }).click();
  await expect(page.locator(".portfolio-chart .highcharts-point").first()).toHaveAttribute("aria-label", new RegExp(shown(isoDay(95))));
});
