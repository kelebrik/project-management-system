import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("a change another person made shows a banner that loads the new state", async ({ page }) => {
  const project = await mockAdminProject(page);
  let overviewLoads = 0;
  await page.route("**/api/projects/project-1/overview", (route) => {
    overviewLoads += 1;
    return route.fulfill({ json: project });
  });
  const change = { id: "evt-1", projectId: "project-1", section: "raid", actorId: "u-anna", actorName: "Анна Орлова", clientId: "tab-of-anna", at: "2026-10-10T10:00:00.000Z" };
  await page.route("**/api/projects/project-1/events", (route) => route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
    body: `retry: 60000\n\nevent: change\ndata: ${JSON.stringify(change)}\n\n`,
  }));

  await page.goto("/TV-OVERVIEW/overview");
  const banner = page.getByRole("status").filter({ hasText: "Анна Орлова" });
  await expect(banner).toContainText("риски и проблемы");
  const loadsBefore = overviewLoads;
  await banner.getByRole("button", { name: "Обновить" }).click();
  await expect(banner).toBeHidden();
  expect(overviewLoads).toBeGreaterThan(loadsBefore);
});
