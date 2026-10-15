import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

// A tab opened before a new version asks for files the server no longer has.

test("a page whose file is gone reloads the tab once and then shows", async ({ page }) => {
  await mockAdminProject(page);
  let failures = 0;
  await page.route(/\/src\/pages\/MyPagePage\.tsx(\?.*)?$/, async (route) => {
    if (failures === 0) {
      failures += 1;
      return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
    return route.fallback();
  });
  await page.goto("/projects");
  const loads: string[] = [];
  page.on("load", () => loads.push(page.url()));
  await page.getByRole("button", { name: "Моя страница" }).first().click();
  // After the reload the dev server builds the page again: give it time.
  await expect(page.getByText("Мои страницы (0)")).toBeVisible({ timeout: 20_000 });
  expect(failures).toBe(1);
  expect(loads.length).toBe(1);
});

test("a page that keeps failing says so, with the menus still there, instead of a blank window", async ({ page }) => {
  await mockAdminProject(page);
  await page.route(/\/src\/pages\/MyPagePage\.tsx(\?.*)?$/, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
  await page.goto("/projects");
  await page.getByRole("button", { name: "Моя страница" }).first().click();
  const notice = page.getByRole("alert").filter({ hasText: "Не удалось показать страницу" });
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText("вышла новая версия приложения");
  await expect(notice.getByRole("button", { name: "Обновить страницу" })).toBeVisible();
  // The rest of the application is still there: another page opens.
  await page.getByRole("button", { name: "Портфель" }).first().click();
  await expect(notice).toHaveCount(0);
});

test("charts whose modules keep failing say so instead of waiting for ever", async ({ page }) => {
  await mockAdminProject(page);
  await page.route(/\/api\/projects\/[^/]+\/schedule-shifts$/, (route) => route.fulfill({ json: { checkpoints: [] } }));
  await page.route(/\/src\/components\/charts\/highchartsExtras\.ts(\?.*)?$/, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
  await page.goto("/TV-OVERVIEW/schedule");
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось показать страницу" })).toBeVisible({ timeout: 20_000 });
});
