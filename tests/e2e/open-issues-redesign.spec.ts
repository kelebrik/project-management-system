import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("questions prototype exposes editable fields and expanded actions", async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.route("**/api/open-issues/issue-1", async (route) => {
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { ...project.issues[0], ...patch } });
  });

  await page.goto("/development/open-issues-redesign");
  await page.getByTestId("language-toggle").click();
  await expect(page.getByRole("heading", { name: "Questions", exact: true })).toBeVisible();

  const row = page.locator(".open-issues-prototype-row").first();
  await expect(row.getByLabel("Issue title")).toBeEditable();
  await expect(row.getByLabel("Status")).toBeEditable();
  await expect(row.getByLabel("Owner")).toBeEditable();
  await expect(row.getByLabel("Readiness")).toBeEditable();
  await expect(row.getByLabel("Issue section")).toHaveCount(0);
  await expect(row.getByLabel("Due date")).toHaveCount(0);
  expect((await row.boundingBox())!.height).toBeLessThan(90);

  const readinessCell = row.locator(".open-issues-prototype-readiness-cell");
  const readinessControl = row.getByLabel("Readiness");
  const cellBox = await readinessCell.boundingBox();
  const controlBox = await readinessControl.boundingBox();
  expect(cellBox).not.toBeNull();
  expect(controlBox).not.toBeNull();
  expect(controlBox!.width).toBeGreaterThanOrEqual(cellBox!.width - 2);
  expect(await readinessCell.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");

  await row.getByRole("button", { name: "Expand", exact: true }).click();
  const actionRow = page.locator(".open-issues-prototype-actions-row").first();
  for (const action of ["Section", "Due date", "Phase", "Link risk", "To problem", "Close", "History"]) {
    await expect(actionRow.getByRole("button", { name: new RegExp(`^${action}`) })).toBeVisible();
  }
  await actionRow.getByRole("button", { name: "Section", exact: true }).click();
  await expect(actionRow.getByLabel("Section")).toBeEditable();
  await actionRow.getByRole("button", { name: "Due date", exact: true }).click();
  await expect(actionRow.getByLabel("Due date")).toBeEditable();
});
