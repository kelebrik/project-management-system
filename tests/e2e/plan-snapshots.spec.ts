import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("a plan snapshot is saved and compared with the plan today", async ({ page }) => {
  await mockAdminProject(page);
  const snapshots: Array<Record<string, unknown>> = [];
  const posted: unknown[] = [];
  await page.route("**/api/projects/project-1/plan-snapshots", (route) => {
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      const created = { id: "s1", name: (route.request().postDataJSON() as { name: string }).name, takenAt: "2026-10-01T10:00:00.000Z", createdByName: "Администратор", rowCount: 3 };
      snapshots.unshift(created);
      return route.fulfill({ status: 201, json: created });
    }
    return route.fulfill({ json: snapshots });
  });
  await page.route("**/api/projects/project-1/plan-snapshots/compare?*", (route) =>
    route.fulfill({
      json: {
        changes: [
          {
            id: "wbs-1",
            code: "1.1",
            title: "Тестовая задача",
            type: "TASK",
            checkpoint: false,
            startDays: 0,
            dueDays: 7,
            from: { startDate: "2026-10-01", dueDate: "2026-10-10", status: "NOT_STARTED", owner: "Иванов" },
            to: { startDate: "2026-10-01", dueDate: "2026-10-17", status: "IN_PROGRESS", owner: "Иванов" },
            moved: true,
            statusChanged: true,
            ownerChanged: false,
          },
        ],
        added: [{ id: "n", code: "1.4", title: "Новая", type: "TASK" }],
        removed: [],
        summary: { changed: 1, moved: 1, later: 1, earlier: 0, added: 1, removed: 0 },
      },
    }),
  );
  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("button", { name: "Срезы плана" }).click();
  const drawer = page.getByRole("dialog", { name: "Срезы плана" });
  await expect(drawer.getByText("Срезов пока нет")).toBeVisible();
  await drawer.getByLabel("Название среза").fill("Комитет 01.10");
  await drawer.getByRole("button", { name: "Сохранить срез" }).click();
  await expect(drawer.getByText("Срез «Комитет 01.10» сохранен")).toBeVisible();
  expect(posted).toEqual([{ name: "Комитет 01.10" }]);

  await drawer.getByRole("button", { name: "Сравнить" }).click();
  await expect(drawer.getByText("Сдвинуто: 1 (позже 1, раньше 0); добавлено 1, удалено 0")).toBeVisible();
  await expect(drawer.getByRole("cell", { name: /10\.10\.2026 → 17\.10\.2026/ })).toContainText("+7 дн.");
  await expect(drawer.getByText("статус Не начата → В работе")).toBeVisible();
  await expect(drawer.getByText("1.4 Новая")).toBeVisible();
  await drawer.screenshot({ path: test.info().outputPath("snapshots.png") });
});

test("a snapshot waits for structure edits still being saved", async ({ page }) => {
  await mockAdminProject(page);
  let posts = 0;
  await page.route("**/api/projects/project-1/plan-snapshots", (route) => {
    if (route.request().method() === "POST") posts += 1;
    return route.fulfill({ json: [] });
  });
  // The row save never answers, so the edit stays unsaved.
  await page.route("**/api/wbs-items/wbs-1", () => undefined);
  await page.goto("/TV-OVERVIEW/wbs");
  const title = page.locator("#wbs-item-wbs-1 .wbs-title-input");
  await title.fill("Правка в пути");
  await title.press("Tab");
  await page.getByRole("button", { name: "Срезы плана" }).click();
  const drawer = page.getByRole("dialog", { name: "Срезы плана" });
  await drawer.getByRole("button", { name: "Сохранить срез" }).click();
  await expect(drawer.getByRole("alert")).toContainText("Правки Структуры еще сохраняются");
  expect(posts).toBe(0);
});
