import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("hiding a Structure column is saved to this person's view, not to the project", async ({ page }) => {
  await mockAdminProject(page, (fixture) => {
    Object.assign(fixture, { myViewState: { wbsHiddenColumns: ["comment"] } });
  });
  const viewPatches: Array<Record<string, unknown>> = [];
  const projectPatches: unknown[] = [];
  await page.route("**/api/projects/project-1/my-view", async (route) => {
    viewPatches.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { state: {} } });
  });
  await page.route("**/api/projects/project-1", async (route) => {
    if (route.request().method() === "PATCH") projectPatches.push(route.request().postDataJSON());
    await route.fallback();
  });

  await page.goto("/TV-OVERVIEW/wbs");
  // The saved personal view applies on opening: the comment column starts hidden.
  await expect(page.getByRole("columnheader", { name: /Комментарий/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Колонки", exact: true }).click();
  await page.getByRole("checkbox", { name: "Исполнитель" }).uncheck();
  await expect.poll(() => viewPatches.at(-1)).toEqual({ wbsHiddenColumns: expect.arrayContaining(["comment", "owner"]) });
  await page.getByRole("button", { name: "2", exact: true }).first().click();
  await expect.poll(() => viewPatches.some((patch) => "wbsHierarchyLevel" in patch)).toBe(true);
  expect(projectPatches).toEqual([]);
});
