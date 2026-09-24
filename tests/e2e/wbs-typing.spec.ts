import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("a save response does not erase text typed in another row", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    fixture.wbsItems.push({ ...fixture.wbsItems[0], id: "wbs-2", code: "1.2", title: "Вторая задача", sortOrder: 20 });
  });
  let releasePatch: () => void = () => undefined;
  const patchHeld = new Promise<void>((resolve) => {
    releasePatch = resolve;
  });
  let patchRequests = 0;
  await page.route("**/api/wbs-items/wbs-1", async (route) => {
    patchRequests += 1;
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    await patchHeld;
    Object.assign(project.wbsItems[0], patch);
    await route.fulfill({
      json: { item: project.wbsItems[0], wbsItems: project.wbsItems, wbsDependencies: [], criticalPath: null },
    });
  });

  await page.goto("/TV-OVERVIEW/wbs");
  const firstTitle = page.locator("#wbs-item-wbs-1 .wbs-title-input");
  const secondTitle = page.locator("#wbs-item-wbs-2 .wbs-title-input");
  await firstTitle.fill("Первая задача, сохранена");
  await firstTitle.press("Tab");
  await expect.poll(() => patchRequests).toBe(1);

  // The user is typing in the second row while the first row is being saved.
  await secondTitle.click();
  await secondTitle.fill("Вторая задача, набираю текст");
  releasePatch();

  await expect(firstTitle).toHaveValue("Первая задача, сохранена");
  await page.waitForTimeout(500);
  await expect(secondTitle).toHaveValue("Вторая задача, набираю текст");
});

async function mockTwoRows(page: import("@playwright/test").Page) {
  const project = await mockAdminProject(page, (fixture) => {
    fixture.wbsItems.push({ ...fixture.wbsItems[0], id: "wbs-2", code: "1.2", title: "Вторая задача", sortOrder: 20 });
  });
  const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
  await page.route(/\/api\/wbs-items\/wbs-\d+$/, async (route) => {
    const id = route.request().url().split("/").pop() ?? "";
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push({ id, body });
    const item = project.wbsItems.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, body);
    await route.fulfill({
      json: { item, wbsItems: project.wbsItems, wbsDependencies: [], criticalPath: null },
    });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  return patches;
}

test("Enter saves the whole typed text and Escape restores the saved one", async ({ page }) => {
  const patches = await mockTwoRows(page);
  const title = page.locator("#wbs-item-wbs-1 .wbs-title-input");

  await title.click();
  await title.press("End");
  await page.keyboard.type(" — полностью");
  await title.press("Enter");
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].body.title).toBe("Тестовая задача — полностью");

  await title.click();
  await page.keyboard.type(" лишнее");
  await title.press("Escape");
  await expect(title).toHaveValue("Тестовая задача — полностью");
  await page.waitForTimeout(900);
  expect(patches).toHaveLength(1);
});

test("leaving an untouched cell does not save anything", async ({ page }) => {
  const patches = await mockTwoRows(page);
  const owner = page.locator("#wbs-item-wbs-2 .wbs-title-input");
  await owner.click();
  await owner.press("Tab");
  await page.waitForTimeout(900);
  expect(patches).toHaveLength(0);
});

test("a multi-cell paste is not overwritten by the typed text", async ({ page }) => {
  await mockTwoRows(page);
  const first = page.locator("#wbs-item-wbs-1 .wbs-title-input");
  const second = page.locator("#wbs-item-wbs-2 .wbs-title-input");
  await first.click();
  await page.keyboard.type(" набрано");
  await first.evaluate((input) => {
    const data = new DataTransfer();
    // A table paste starts at the first column (level), as in Excel.
    data.setData("text/plain", "1\tВставка 1\n1\tВставка 2");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await first.evaluate((input) => (input as HTMLInputElement).blur());
  await expect(first).toHaveValue("Вставка 1");
  await expect(second).toHaveValue("Вставка 2");
});

test("Escape in a predecessor cell keeps its saved code untouched", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    fixture.wbsItems.push({
      ...fixture.wbsItems[0],
      id: "wbs-2",
      code: "1.2",
      title: "Вторая задача",
      sortOrder: 20,
      // Stored with spaces, shown trimmed: the displayed code differs from the saved one.
      predecessor1: " 1.1 ",
    });
  });
  let patchRequests = 0;
  await page.route(/\/api\/wbs-items\/wbs-\d+$/, async (route) => {
    patchRequests += 1;
    await route.fulfill({
      json: { item: project.wbsItems[1], wbsItems: project.wbsItems, wbsDependencies: [], criticalPath: null },
    });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  const predecessor = page.locator("#wbs-item-wbs-2 .wbs-predecessor-input").first();
  await expect(predecessor).toHaveValue("1.1");

  await predecessor.click();
  await page.keyboard.type("9");
  await predecessor.press("Escape");
  await expect(predecessor).toHaveValue("1.1");
  await expect(page.locator("#wbs-item-wbs-2 .dirty")).toHaveCount(0);
  await page.waitForTimeout(900);
  expect(patchRequests).toBe(0);
});
