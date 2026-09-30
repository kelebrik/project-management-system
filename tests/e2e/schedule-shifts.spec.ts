import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const step = (id: string, deltaDays: number | null, trigger: string, extra: Record<string, unknown> = {}) => ({
  id,
  operationId: `op-${id}`,
  at: "2026-09-20T10:00:00.000Z",
  previousDate: "2026-11-01",
  newDate: "2026-11-06",
  deltaDays,
  trigger,
  sourceItemId: null,
  sourceCode: null,
  sourceTitle: null,
  sourceIssueId: null,
  sourceNote: null,
  actorName: "Иванов",
  reason: null,
  needsReason: false,
  ...extra,
});

test("the Status page shows why checkpoints moved, step by step, with links to the rows", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/projects/project-1/schedule-shifts", (route) =>
    route.fulfill({
      json: {
        checkpoints: [
          {
            id: "goal-1",
            code: "3",
            title: "Запуск продаж",
            type: "GOAL",
            isActiveGoal: true,
            baselineDate: "2026-12-01",
            currentDate: "2026-12-13",
            varianceDays: 12,
            unexplainedDays: 3,
            earlierSteps: null,
            steps: [
              step("s1", 5, "MANUAL_EDIT", { sourceItemId: "wbs-1", sourceCode: "1.1", sourceTitle: "Тестовая задача" }),
              step("s2", 4, "CALENDAR", { sourceNote: "2026-10-05 day off" }),
              step("s3", 2, "TARGET_DATE", { sourceNote: "Заказчик перенес приемку" }),
              step("s4", -2, "LINKS"),
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/TV-OVERVIEW/overview");
  const card = page.locator("#schedule-shifts");
  await expect(card.getByText("Почему сдвинулись вехи")).toBeVisible();
  const ladder = card.getByRole("region", { name: "3 Запуск продаж" });
  await expect(ladder.getByText("активная цель")).toBeVisible();
  await expect(ladder.getByText("+12 дн.")).toBeVisible();
  await expect(ladder.getByText("до журнала или без записи")).toBeVisible();
  await expect(ladder.getByText("Календарь: 05.10.2026 стал выходным")).toBeVisible();
  await expect(ladder.getByText("Новая целевая дата проекта: Заказчик перенес приемку")).toBeVisible();
  await expect(ladder.getByText("Изменение связей")).toBeVisible();
  await card.screenshot({ path: test.info().outputPath("shifts.png") });

  await ladder.getByRole("button", { name: "Правка 1.1 Тестовая задача, перенос по связям" }).click();
  await expect(page).toHaveURL(/\/wbs/);
  await expect(page.locator("#wbs-item-wbs-1")).toBeInViewport();
});

test("a project on its baseline says so", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/projects/project-1/schedule-shifts", (route) => route.fulfill({ json: { checkpoints: [] } }));
  await page.goto("/TV-OVERVIEW/overview");
  await expect(page.locator("#schedule-shifts").getByText("Вехи и цели идут по базовому плану")).toBeVisible();
});

test("after a save moves a milestone past its baseline, the page asks why in one click", async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.route(/\/api\/wbs-items\/wbs-1$/, async (route) => {
    Object.assign(project.wbsItems[0], route.request().postDataJSON());
    await route.fulfill({
      headers: { "X-Schedule-Shift-Operation-Id": "op-7", "X-Schedule-Shift-Reason-Needed": "1", "Access-Control-Expose-Headers": "X-Schedule-Shift-Operation-Id, X-Schedule-Shift-Reason-Needed" },
      json: { item: project.wbsItems[0], wbsItems: project.wbsItems, wbsDependencies: [], criticalPath: null },
    });
  });
  await page.route("**/api/schedule-shifts/operations/op-7", (route) =>
    route.fulfill({
      json: { projectId: "project-1", shifts: [{ id: "s9", checkpointId: "m1", checkpointCode: "1.5", checkpointTitle: "Готово", deltaDays: 5, newDate: "2026-11-06", baselineDate: "2026-11-01" }] },
    }),
  );
  const reasons: unknown[] = [];
  await page.route("**/api/projects/project-1/schedule-shifts/reason", (route) => {
    reasons.push(route.request().postDataJSON());
    return route.fulfill({ json: { updated: 1 } });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  const title = page.locator("#wbs-item-wbs-1 .wbs-title-input");
  await title.fill("Тестовая задача, дольше");
  await title.press("Tab");

  const prompt = page.getByRole("dialog", { name: "Веха ушла за базовый план. Почему?" });
  await expect(prompt.getByText("1.5 Готово")).toBeVisible();
  await expect(prompt.getByText("+5 дн.")).toBeVisible();
  await prompt.screenshot({ path: test.info().outputPath("prompt.png") });
  await expect(prompt.getByRole("button", { name: "Сохранить причину" })).toBeDisabled();
  await prompt.getByRole("radio", { name: "Поставщик" }).click();
  await prompt.getByLabel("Комментарий (необязательно)").fill("Платы пришли позже");
  await prompt.getByRole("button", { name: "Сохранить причину" }).click();
  await expect(page.getByText("Причина сохранена")).toBeVisible();
  expect(reasons).toEqual([{ shiftIds: ["s9"], category: "SUPPLIER", text: "Платы пришли позже", raidItemId: null }]);
});

test("a step without a reason gets one on the Status page, and the summary counts days by reason", async ({ page }) => {
  await mockAdminProject(page);
  let loads = 0;
  await page.route("**/api/projects/project-1/schedule-shifts", (route) => {
    loads += 1;
    return route.fulfill({
      json: {
        checkpoints: [
          {
            id: "m1",
            code: "1.5",
            title: "Готово",
            type: "MILESTONE",
            isActiveGoal: false,
            baselineDate: "2026-11-01",
            currentDate: "2026-11-10",
            varianceDays: 9,
            unexplainedDays: 2,
            earlierSteps: null,
            reasonDays: { SUPPLIER: 4, NONE: 3 },
            steps: [
              step("s1", 4, "LINKS", { reason: { category: "SUPPLIER", text: "Платы", raidItemId: null } }),
              step("s2", 3, "MANUAL_EDIT", { sourceItemId: "m1", needsReason: true }),
            ],
          },
        ],
      },
    });
  });
  const reasons: unknown[] = [];
  await page.route("**/api/projects/project-1/schedule-shifts/reason", (route) => {
    reasons.push(route.request().postDataJSON());
    return route.fulfill({ json: { updated: 1 } });
  });
  await page.goto("/TV-OVERVIEW/overview");
  const ladder = page.locator("#schedule-shifts").getByRole("region", { name: "1.5 Готово" });
  await expect(ladder.getByText("По причинам:")).toBeVisible();
  await expect(ladder.getByText("Поставщик +4 дн.")).toBeVisible();
  await expect(ladder.getByText("без причины +3 дн.")).toBeVisible();
  await expect(ladder.getByText("до журнала +2 дн.")).toBeVisible();
  await expect(ladder.getByText("Поставщик: Платы")).toBeVisible();

  await ladder.getByRole("button", { name: "Указать причину" }).click();
  await ladder.getByRole("radio", { name: "Переоценка трудоемкости" }).click();
  await ladder.getByRole("button", { name: "Сохранить причину" }).click();
  expect(reasons).toEqual([{ shiftIds: ["s2"], category: "ESTIMATE", text: "", raidItemId: null }]);
  await expect.poll(() => loads).toBeGreaterThan(1);
  await page.locator("#schedule-shifts").screenshot({ path: test.info().outputPath("ladder-reasons.png") });
});
