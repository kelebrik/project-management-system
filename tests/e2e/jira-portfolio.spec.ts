import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the Jira tab of the portfolio reports shows open work per project with a total and narrows by assignee", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/reports/portfolio**", (route) => route.fulfill({ json: { summary: [], shifts: [], upcoming: [], risks: [], decisions: [] } }));
  const line = (code: string, open: number, overdue: number) => ({ projectId: code, projectCode: code, projectName: `Проект ${code}`, portfolio: "TV", lastSyncedAt: "2026-10-04T08:00:00.000Z", refreshedAt: null, openIssues: open, inProgress: 1, overdue, unassigned: 0, openStoryPoints: 8, createdInPeriod: 2, resolvedInPeriod: 1, oldestOpenDays: 40, withoutAttributes: 0 });
  const urls: string[] = [];
  await page.route("**/api/reports/jira-portfolio**", async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: { periodDays: 30, today: "2026-10-05", projects: [line("TV", 5, 2), line("AU", 3, 0)], total: line("all", 8, 2), assigneeHints: ["Иванов", "Петров"] } });
  });
  await page.goto("/reports?reportView=jira");
  const table = page.locator(".jira-portfolio table");
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await expect(table.locator("tbody tr").first()).toContainText("TV");
  await expect(table.locator(".jira-portfolio-total")).toContainText("8");
  await expect(table.getByRole("link", { name: "TV" })).toHaveAttribute("href", "/TV/jira-work");
  await page.locator(".jira-portfolio select").selectOption("Петров");
  await expect.poll(() => urls.at(-1)).toContain("slice=");
  await page.locator(".jira-portfolio").getByRole("button", { name: "90 дн." }).click();
  await expect.poll(() => urls.at(-1)).toContain("period=90");
});
