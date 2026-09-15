import { expect, test, type Page } from "./fixtures";
import { mockAdminPortfolio, projectFixture } from "./overview-and-baseline.support";

function projectsFixture() {
  return [
    { code: "SMALL", count: 5, status: "ACTIVE", visible: 3 },
    { code: "LARGE", count: 30, status: "ACTIVE", visible: 1 },
    { code: "TIED", count: 30, status: "ACTIVE", visible: 1 },
    { code: "CLOSED", count: 100, status: "CLOSED", visible: 1 },
  ].map(({ code, count, status, visible }) => {
    const project = projectFixture();
    return {
      ...project, id: code.toLowerCase(), code, name: code, status,
      _count: { ...project._count, wbsItems: count },
      wbsItems: Array.from({ length: visible }, (_, index) => ({
        ...project.wbsItems[0], id: `${code}-${index}`, code: `${index + 1}`,
      })),
    };
  });
}

const navigation = (page: Page) => page.getByRole("navigation", { name: "Основные разделы" });
const picker = (page: Page, code: string) => page.getByRole("button", {
  name: `Проект ${code}. Открыть список проектов`, exact: true,
});

test("portfolio to projects selects the largest complete WBS and preserves explicit project navigation", async ({ page }) => {
  await mockAdminPortfolio(page, projectsFixture());
  await page.goto("/SMALL/overview");
  await expect(picker(page, "SMALL")).toBeVisible();
  await navigation(page).getByRole("button", { name: "Проекты", exact: true }).click();
  await expect(picker(page, "SMALL")).toBeVisible();
  await navigation(page).getByRole("button", { name: "Портфель", exact: true }).click();
  await navigation(page).getByRole("button", { name: "Проекты", exact: true }).click();
  await expect(page).toHaveURL(/\/projects(?:[?#]|$)/);
  await expect(picker(page, "LARGE")).toBeVisible();

  await navigation(page).getByRole("button", { name: "Портфель", exact: true }).click();
  await page.locator(".projects-overview-card").filter({ hasText: "SMALL" }).click();
  await expect(picker(page, "SMALL")).toBeVisible();
  await expect(page).toHaveURL(/\/SMALL\/passport/);
  await navigation(page).getByRole("button", { name: "Проекты", exact: true }).click();
  await navigation(page).getByRole("button", { name: "Портфель", exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/projects(?:[?#]|$)/);
  await expect(picker(page, "LARGE")).toBeVisible();
});

// History remains available while the loading screen hides the navigation buttons.
for (const initialPath of ["/portfolio", "/SMALL/overview"]) {
  test(`portfolio history navigation wins after loading from ${initialPath}`, async ({ page }) => {
    const projects = projectsFixture();
    await mockAdminPortfolio(page, projects);
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/api\/projects$/, async (route) => {
      await ready;
      await route.fulfill({ json: projects });
    });
    const listRequested = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/projects");
    await page.goto(initialPath, { waitUntil: "domcontentloaded" });
    await listRequested;
    if (initialPath !== "/portfolio") {
      await page.evaluate(() => {
        window.history.pushState(null, "", "/portfolio");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    }
    await page.evaluate(() => {
      window.history.pushState(null, "", "/projects");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    release();
    await expect(picker(page, "LARGE")).toBeVisible();
  });
}

test("leaving projects cancels a pending default selection", async ({ page }) => {
  const projects = projectsFixture();
  await mockAdminPortfolio(page, projects);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/api\/projects$/, async (route) => {
    await ready;
    await route.fulfill({ json: projects });
  });
  const listRequested = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/projects");
  await page.goto("/portfolio", { waitUntil: "domcontentloaded" });
  await listRequested;
  await page.evaluate(() => {
    window.history.pushState(null, "", "/projects");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.evaluate(() => {
    window.history.pushState(null, "", "/reports");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  release();
  await navigation(page).getByRole("button", { name: "Проекты", exact: true }).click();
  await expect(picker(page, "SMALL")).toBeVisible();
});
