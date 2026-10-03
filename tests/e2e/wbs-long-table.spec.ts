import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const ROWS = 400;

async function mockLongStructure(page: import("@playwright/test").Page) {
  await mockAdminProject(page, (fixture) => {
    const template = fixture.wbsItems[0];
    fixture.wbsItems = Array.from({ length: ROWS }, (_, index) => ({
      ...template,
      id: `wbs-${index + 1}`,
      code: String(index + 1),
      title: `Работа ${index + 1}`,
      parentId: null,
      wbsLevel: 1,
      sortOrder: (index + 1) * 10,
    }));
  });
}

const renderedRows = (page: import("@playwright/test").Page) => page.locator(".wbs-row-stack").count();

test("a long Structure keeps only the rows in view in the page and still reaches its end", async ({ page }) => {
  await mockLongStructure(page);
  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.locator("#wbs-item-wbs-1 .wbs-title-input")).toHaveValue("Работа 1");
  const rendered = await renderedRows(page);
  expect(rendered).toBeGreaterThan(10);
  expect(rendered).toBeLessThan(120);
  await expect(page.locator("#wbs-item-wbs-400")).toHaveCount(0);

  await page.locator(".wbs-table-shell").evaluate((shell) => {
    shell.scrollTop = shell.scrollHeight;
  });
  await expect(page.locator("#wbs-item-wbs-400 .wbs-title-input")).toHaveValue(`Работа ${ROWS}`);
  await expect(page.locator("#wbs-item-wbs-1")).toHaveCount(0);
});

test("Ctrl+F and printing put every row in the page", async ({ page }) => {
  await mockLongStructure(page);
  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.locator("#wbs-item-wbs-1")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect.poll(() => renderedRows(page)).toBe(ROWS);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect.poll(() => renderedRows(page)).toBeLessThan(120);
  await page.keyboard.press("Control+f");
  await expect.poll(() => renderedRows(page)).toBe(ROWS);
});

test("a row being edited stays when it is scrolled out of view", async ({ page }) => {
  await mockLongStructure(page);
  await page.goto("/TV-OVERVIEW/wbs");
  const title = page.locator("#wbs-item-wbs-3 .wbs-title-input");
  await title.fill("Работа 3, правлю");
  await page.locator(".wbs-table-shell").evaluate((shell) => {
    shell.scrollTop = shell.scrollHeight;
  });
  await expect(page.locator("#wbs-item-wbs-400")).toBeAttached();
  await expect(title).toHaveValue("Работа 3, правлю");
  await expect(title).toBeFocused();
});

test("a link opens a row deep in a long table", async ({ page }) => {
  await mockLongStructure(page);
  await page.goto("/TV-OVERVIEW/wbs?focusWbs=wbs-350");
  await expect(page.locator("#wbs-item-wbs-350")).toBeInViewport();
});
