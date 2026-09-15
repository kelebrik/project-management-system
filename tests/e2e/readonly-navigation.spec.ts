import { expect, test } from "./fixtures";
import { projectPagePath } from "./project-routes";

test("read-only user can open core project pages without authentication", async ({ page }) => {
  await page.goto(await projectPagePath(page, "overview"));
  await expect(page).toHaveURL(/\/[^/]+\/overview$/);
  await expect(page.getByText("Ключевые риски").first()).toBeVisible();

  await page.goto(await projectPagePath(page, "wbs"));
  await expect(page).toHaveURL(/\/[^/]+\/wbs$/);
  await expect(page.getByRole("button", { name: /на весь экран/i }).first()).toBeVisible();

  await page.goto(await projectPagePath(page, "gantt"));
  await expect(page).toHaveURL(/\/[^/]+\/gantt$/);
  await expect(page.getByRole("button", { name: /Месяцы/ })).toBeVisible();
});

test("closed projects page is available in read-only mode", async ({ page }) => {
  await page.goto("/closed-projects");

  await expect(page.getByText("Закрытые проекты").first()).toBeVisible();
});
