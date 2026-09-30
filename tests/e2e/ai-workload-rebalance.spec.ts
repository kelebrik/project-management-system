import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const work = (id: string, owner: string, startDate: string, dueDate: string) => ({
  id,
  projectId: "project-1",
  code: `1.${id}`,
  title: `Работа ${id}`,
  owner,
  type: "TASK",
  status: "IN_PROGRESS",
  startDate,
  dueDate,
  updatedAt: "v1",
  startLocked: false,
  finishLocked: false,
  lockedByIssue: false,
});

async function mockWorkload(page: Page, { editable = true, ai = true } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00"));
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ json: ai ? { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } : { enabled: false, allowed: false, setup: "gigachat" } }),
  );
  let loads = 0;
  await page.route(/\/api\/workload(\?.*)?$/, (route) => {
    loads += 1;
    return route.fulfill({
      json: {
        projects: [{ id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }],
        items: [work("1", "Иванов", "2026-10-05", "2026-10-16"), work("2", "Иванов", "2026-10-12", "2026-10-20")],
        editableProjectIds: editable ? ["project-1"] : [],
        employees: [
          { id: "e1", name: "Иванов", department: "" },
          { id: "e3", name: "Сидоров", department: "" },
        ],
        leaves: [],
        calendarDays: [],
      },
    });
  });
  return { loads: () => loads };
}

const item = (id: string, startDate: string, dueDate: string) => ({
  id,
  projectId: "project-1",
  projectCode: "TV-OVERVIEW",
  code: `1.${id}`,
  title: `Работа ${id}`,
  owner: "Иванов",
  startDate,
  dueDate,
  updatedAt: "v1",
  startLocked: false,
  finishLocked: false,
});

test("suggested changes are applied with the planner's edit, a conflict is shown, and applied ones can be undone", async ({ page }) => {
  const { loads } = await mockWorkload(page);
  const calls: unknown[] = [];
  await page.route("**/api/ai/workload-rebalance", (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        suggestions: [
          { itemId: "2", newOwner: "Сидоров", newStartDate: null, newDueDate: null, reason: "У Иванова наложение" },
          { itemId: "1", newOwner: null, newStartDate: null, newDueDate: "2026-10-09", reason: "Закончить раньше" },
        ],
        items: { "1": item("1", "2026-10-05", "2026-10-16"), "2": item("2", "2026-10-12", "2026-10-20") },
        droppedRefs: 0,
        horizonDays: 60,
        model: "gpt-test",
      },
    });
  });
  const patches: Array<{ id: string; body: any }> = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, (route) => {
    const id = route.request().url().split("/").pop()!;
    const body = route.request().postDataJSON();
    patches.push({ id, body });
    if (id === "1" && body.expectedUpdatedAt === "v1") {
      return route.fulfill({ status: 409, json: { error: "Работа изменилась, пока вы её правили. Данные обновлены — повторите изменение." } });
    }
    return route.fulfill({ json: { item: { owner: body.owner ?? "Иванов", startDate: "2026-10-12T00:00:00.000Z", dueDate: "2026-10-20T00:00:00.000Z", updatedAt: "v2" } } });
  });

  await page.goto("/operations/workload");
  await page.getByRole("button", { name: "Выровнять загрузку" }).click();
  const drawer = page.getByRole("dialog", { name: "Выровнять загрузку" });
  await drawer.getByRole("button", { name: "60 дн." }).click();
  await drawer.getByRole("button", { name: "Предложить изменения" }).click();
  await expect(drawer.getByText("Модель gpt-test предложила изменений: 2. Отметьте те, что нужно применить.")).toBeVisible();
  await expect(drawer.getByText("2026-10-05 – 2026-10-16 → 2026-10-05 – 2026-10-09")).toBeVisible();
  expect(calls).toEqual([{ horizonDays: 60, locale: "ru" }]);
  await drawer.screenshot({ path: test.info().outputPath("rebalance.png") });

  const loadsBefore = loads();
  await drawer.getByRole("checkbox", { name: "Применить предложение 1" }).check();
  await drawer.getByRole("checkbox", { name: "Применить предложение 2" }).check();
  await drawer.getByRole("button", { name: "Применить выбранное (2)" }).click();
  await expect(drawer.getByText("Применено предложений: 1")).toBeVisible();
  await expect(drawer.getByRole("alert")).toContainText("Работа изменилась");
  expect(patches).toEqual([
    { id: "2", body: { owner: "Сидоров", expectedUpdatedAt: "v1" } },
    { id: "1", body: { dueDate: "2026-10-09", scheduleDriver: "dates", expectedUpdatedAt: "v1" } },
  ]);
  await expect.poll(loads).toBeGreaterThan(loadsBefore);

  await drawer.getByRole("button", { name: "Отменить примененное (1)" }).click();
  await expect(drawer.getByText("Все примененные изменения отменены")).toBeVisible();
  expect(patches[2]).toEqual({ id: "2", body: { owner: "Иванов", expectedUpdatedAt: "v2" } });
});

test("the button is hidden without a connected model or without work the user may change", async ({ page }) => {
  await mockWorkload(page, { ai: false });
  await page.goto("/operations/workload");
  await expect(page.locator(".leave-toolbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выровнять загрузку" })).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockWorkload(page, { editable: false });
  await page.goto("/operations/workload");
  await expect(page.locator(".leave-toolbar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выровнять загрузку" })).toHaveCount(0);
});
