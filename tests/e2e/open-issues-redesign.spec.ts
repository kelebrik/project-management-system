import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("questions prototype exposes editable fields and expanded actions", async ({ page }) => {
  const project = await mockAdminProject(page);
  let uiStatePatch: Record<string, unknown> | null = null;
  let statusPayload: Record<string, unknown> | null = null;
  await page.route("**/api/projects/project-1", async (route) => {
    if (route.request().method() === "PATCH") {
      uiStatePatch = route.request().postDataJSON() as Record<string, unknown>;
    }
    await route.fulfill({ json: project });
  });
  await page.route("**/api/open-issues/issue-1", async (route) => {
    const patch = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { ...project.issues[0], ...patch } });
  });
  await page.route("**/api/open-issues/issue-1/status-updates", async (route) => {
    statusPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        id: "status-new",
        issueId: "issue-1",
        statusAt: new Date().toISOString(),
        text: statusPayload.text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  });

  await page.goto("/development/open-issues-redesign");
  await page.getByTestId("language-toggle").click();
  await expect(page.getByRole("heading", { name: "Questions", exact: true })).toBeVisible();

  const row = page.locator(".open-issues-prototype-row").first();
  await expect(row.getByLabel("Issue title")).toBeEditable();
  await expect(row.getByLabel("New status text")).toBeEditable();
  await expect(row.getByLabel("Current status")).toHaveAttribute("aria-readonly", "true");
  await row.getByLabel("New status text").fill("Status update from prototype");
  await row.getByRole("button", { name: "Add status with the current date", exact: true }).click();
  await expect.poll(() => statusPayload).toEqual({ text: "Status update from prototype" });
  await expect(row.getByLabel("Owner")).toBeEditable();
  await expect(row.getByLabel("Readiness")).toBeEditable();
  await expect(row.getByLabel("Issue section")).toHaveCount(0);
  await expect(row.getByLabel("Due date")).toHaveCount(0);
  expect((await row.boundingBox())!.height).toBeLessThan(90);
  const statusResizer = page.getByRole("button", { name: "Resize column Status", exact: true });
  await expect(statusResizer).toBeVisible();
  const resizerBox = await statusResizer.boundingBox();
  expect(resizerBox).not.toBeNull();
  await page.mouse.move(resizerBox!.x + 4, resizerBox!.y + 8);
  await page.mouse.down();
  await page.mouse.move(resizerBox!.x + 34, resizerBox!.y + 8);
  await page.mouse.up();
  await expect.poll(() => uiStatePatch).toMatchObject({
    uiState: { openIssuesPrototypeColumnWidths: { status: expect.any(Number) } },
  });

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
