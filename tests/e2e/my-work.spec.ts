import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const item = {
  id: "wbs-1",
  projectId: "project-1",
  projectCode: "TV-OVERVIEW",
  projectName: "Проект обзора",
  code: "1.1",
  title: "Тестовая задача",
  status: "IN_PROGRESS",
  startDate: "2026-09-28",
  dueDate: "2026-09-30",
  overdue: true,
  checkIn: null,
};

test("my work takes a weekly check-in and the team tab shows who has not checked in", async ({ page }) => {
  await mockAdminProject(page);
  const puts: unknown[] = [];
  await page.route("**/api/my-work", (route) => route.fulfill({ json: { person: "Администратор", weekStart: "2026-09-28", items: [item] } }));
  await page.route("**/api/my-work/check-ins", (route) => {
    puts.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(/\/api\/projects\/project-1\/check-ins(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        weekStart: "2026-09-28",
        checkIns: [{ wbsItemId: "wbs-1", personName: "Администратор", confidence: "AT_RISK", done: "", blocker: "Нет стенда", updatedAt: "2026-09-29T10:00:00Z", wbsItem: { code: "1.1", title: "Тестовая задача" } }],
        notCheckedIn: ["Петров"],
      },
    }),
  );
  await page.goto("/development/my-work");
  await expect(page.getByRole("heading", { name: "Мои задачи", level: 2 })).toBeVisible({ timeout: 15_000 });
  const row = page.locator(".my-work-row").first();
  await expect(row).toContainText("просрочено");
  await expect(row.getByRole("button", { name: "Отметить" })).toBeDisabled();
  await row.getByRole("radio", { name: "Под вопросом" }).click();
  await row.getByLabel("Что мешает").fill("Нет стенда");
  await row.getByRole("button", { name: "Отметить" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]).toEqual({ wbsItemId: "wbs-1", confidence: "AT_RISK", done: "", blocker: "Нет стенда" });
  await page.screenshot({ path: test.info().outputPath("my-work.png") });

  await page.getByRole("button", { name: "Отметки команды" }).click();
  await expect(page.getByText("Не отметились: Петров")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Под вопросом" })).toBeVisible();
});

test("someone not linked to a person of the leave schedule is told how to get linked", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/my-work", (route) => route.fulfill({ json: { person: null, reason: "NOT_LINKED", weekStart: "2026-09-28", items: [] } }));
  await page.goto("/development/my-work");
  await expect(page.getByText(/не связан с сотрудником в графике отпусков/)).toBeVisible();
});
