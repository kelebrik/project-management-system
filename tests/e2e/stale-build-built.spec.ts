import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

// The same as stale-build.spec.ts on the built application, where pages are files under /assets loaded
// through Vite's preload helper. Run against `vite preview` with E2E_BUILT=1.
const built = process.env.E2E_BUILT === "1";

test("built: a page whose file is gone reloads the tab once and then shows", { tag: "@built" }, async ({ page }) => {
  test.skip(!built, "needs the built application");
  await mockAdminProject(page);
  let failures = 0;
  await page.route(/\/assets\/MyPagePage-[^/]+\.js$/, async (route) => {
    if (failures === 0) {
      failures += 1;
      return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
    return route.fallback();
  });
  await page.goto("/projects");
  await page.getByRole("button", { name: "Моя страница" }).first().click();
  await expect(page.getByText("Мои страницы (0)")).toBeVisible();
  expect(failures).toBe(1);
});

test("built: a page that keeps failing says a new version is out, instead of a blank window", { tag: "@built" }, async ({ page }) => {
  test.skip(!built, "needs the built application");
  await mockAdminProject(page);
  await page.route(/\/assets\/MyPagePage-[^/]+\.js$/, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
  await page.goto("/projects");
  await page.getByRole("button", { name: "Моя страница" }).first().click();
  const notice = page.getByRole("alert").filter({ hasText: "Не удалось показать страницу" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("вышла новая версия приложения");
  await page.getByRole("button", { name: "Портфель" }).first().click();
  await expect(notice).toHaveCount(0);
});

test("built: a page answered with the application's HTML instead of its script also reloads once", { tag: "@built" }, async ({ page }) => {
  test.skip(!built, "needs the built application");
  await mockAdminProject(page);
  let failures = 0;
  await page.route(/\/assets\/MyPagePage-[^/]+\.js$/, async (route) => {
    if (failures === 0) {
      failures += 1;
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body></body></html>" });
    }
    return route.fallback();
  });
  await page.goto("/projects");
  await page.getByRole("button", { name: "Моя страница" }).first().click();
  await expect(page.getByText("Мои страницы (0)")).toBeVisible();
  expect(failures).toBe(1);
});

test("built: charts whose modules keep failing say so instead of waiting for ever", { tag: "@built" }, async ({ page }) => {
  test.skip(!built, "needs the built application");
  await mockAdminProject(page);
  await page.route(/\/api\/projects\/[^/]+\/schedule-shifts$/, (route) => route.fulfill({ json: { checkpoints: [] } }));
  await page.route(/\/assets\/highchartsExtras-[^/]+\.js$/, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
  await page.goto("/TV-OVERVIEW/schedule");
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось показать страницу" })).toBeVisible();
});
