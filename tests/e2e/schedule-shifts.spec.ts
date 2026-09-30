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
