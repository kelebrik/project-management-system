import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("my page is first in the top bar, says what it can do once, and reports moved to Development", async ({ page }) => {
  await mockAdminProject(page);
  await page.route(/\/api\/pages(\?.*)?$/, (route) => route.fulfill({ json: { canSave: true, limit: 50, pages: [] } }));
  await page.route("**/api/pages/scope-options", (route) => route.fulfill({ json: { projects: [], portfolios: [] } }));
  await page.goto("/portfolio");
  const sections = page.getByRole("navigation", { name: /разделы|sections/i }).getByRole("button");
  await expect(sections.first()).toHaveText(/Моя страница/, { timeout: 15_000 });
  await expect(page.getByRole("navigation", { name: /разделы|sections/i }).getByRole("button", { name: "Отчёты" })).toHaveCount(0);

  await sections.first().click();
  await expect(page).toHaveURL(/\/my-page$/);
  const intro = page.getByRole("dialog", { name: "Что умеет «Моя страница»" });
  await expect(intro).toContainText("Виджет в четыре шага");
  await intro.getByRole("button", { name: "Понятно" }).click();
  await expect(intro).toHaveCount(0);
  await page.reload();
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Больше не показывать" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Моя страница", level: 2 })).toBeVisible();
  await expect(intro).toHaveCount(0);
  // It can still be opened by hand.
  await page.getByRole("button", { name: "Что умеет страница" }).click();
  await expect(intro).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/reports/);
  await expect(page.getByRole("navigation", { name: "Разработка" }).getByRole("button", { name: "Отчёты" })).toHaveClass(/active/);
});
