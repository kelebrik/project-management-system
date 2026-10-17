import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the task card opens beside the Structure, edits the status, and stays with the same task on the Gantt chart; the section tabs are links", async ({ page }) => {
  const project = await mockAdminProject(page);
  const patches: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/wbs-items\/wbs-1$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push(body);
    const item = { ...project.wbsItems[0]!, ...body };
    await route.fulfill({ json: { item, wbsItems: [item], wbsDependencies: [], criticalPath: null } });
  });
  await page.goto(`/${project.code}/wbs`);
  const nav = page.getByRole("navigation", { name: "Разделы проекта" });
  // The tabs are links with the section's address: a modifier opens them in a new tab.
  await expect(nav.getByRole("link", { name: "Гантт", exact: true })).toHaveAttribute("href", `/${project.code}/gantt`);
  await expect(nav.getByRole("link", { name: "Структура", exact: true })).toHaveAttribute("aria-current", "page");

  const row = page.locator('[data-wbs-row-id="wbs-1"]');
  await row.click();
  await page.getByRole("button", { name: "Карточка" }).click();
  const card = page.getByRole("complementary", { name: "Карточка задачи" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: /Тестовая задача/ })).toBeVisible();
  await expect(card.getByText("Руководитель проекта")).toBeVisible();

  await card.getByRole("combobox", { name: "Статус" }).selectOption("DONE");
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ status: "DONE" });

  // The card follows to the Gantt chart; its row is the chosen one, in view.
  await nav.getByRole("link", { name: "Гантт", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${project.code}/gantt`));
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: /Тестовая задача/ })).toBeVisible();
  await expect(page.locator(".gantt-label.active")).toBeInViewport();

  // Back in the Structure the row is still the chosen one and in view; Escape in the card closes it.
  await nav.getByRole("link", { name: "Структура", exact: true }).click();
  await expect(page.locator(".wbs-table-row.active")).toBeInViewport();
  await card.getByRole("button", { name: "Закрыть карточку" }).focus();
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Карточка" })).toHaveAttribute("aria-pressed", "false");
});
