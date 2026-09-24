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
