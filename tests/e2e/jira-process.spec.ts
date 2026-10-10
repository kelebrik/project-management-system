import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const processData = {
  periodDays: 90,
  statuses: ["Open", "In Progress", "Review", "Done"],
  statusStats: [
    { status: "Open", samples: 6, medianHours: 20, p85Hours: 40, totalHours: 120, share: 0.2, current: 1 },
    { status: "In Progress", samples: 6, medianHours: 50, p85Hours: 90, totalHours: 200, share: 0.33, current: 2 },
    { status: "Review", samples: 6, medianHours: 70, p85Hours: 120, totalHours: 280, share: 0.47, current: 1 },
  ],
  edges: [{ from: "Open", to: "In Progress", count: 6, medianHoursBefore: 20 }, { from: "In Progress", to: "Review", count: 7, medianHoursBefore: 50 }, { from: "Review", to: "In Progress", count: 1, medianHoursBefore: 30 }, { from: "Review", to: "Done", count: 6, medianHoursBefore: 70 }],
  rework: { issues: 1, ofIssues: 7, rate: 0.143, loops: [{ from: "Review", to: "In Progress", count: 1 }] },
  variants: [{ path: ["Open", "In Progress", "Review", "Done"], count: 5, medianLeadDays: 12 }],
  stuck: [{ issueKey: "TV-77", issueUrl: "https://jira.example.test/browse/TV-77", status: "Review", days: 9, p85Days: 5, assignee: "Анна" }],
  kpi: { issues: 8, resolved: 6, medianLeadDays: 12, bottleneck: "Review" },
  quality: { issues: 9, incompleteHistory: 1, unknownStart: 0, statusesWithoutBaseline: [] },
};

test("the Jira process tab shows where work waits, the moves, the stuck issues and the usual paths", async ({ page }) => {
  await mockAdminProject(page);
  let requested = "";
  await page.route("**/api/projects/project-1/jira/process?*", (route) => {
    requested = route.request().url();
    return route.fulfill({ json: processData });
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Процесс" }).click();
  const panel = page.locator(".jira-process-panel");
  await expect(panel.locator(".jira-process-kpis")).toContainText("Узкое место");
  await expect(panel.locator(".jira-process-kpis")).toContainText("Review");
  await expect(panel.locator(".jira-process-kpis")).toContainText("14%");
  await expect(panel.getByRole("note")).toContainText("История неполная");
  await expect(panel.locator("g.highcharts-heatmap-series").first()).toBeVisible();
  await expect(panel.locator(".highcharts-bar-series").first()).toBeVisible();
  await expect(panel.getByRole("link", { name: /TV-77/ })).toHaveAttribute("href", "https://jira.example.test/browse/TV-77");
  await expect(panel.locator(".jira-process-variants").first()).toContainText("Open → In Progress → Review → Done");
  if (process.env.CAPTURE_PROCESS === "1") await page.locator(".jira-process-panel").screenshot({ path: `${process.env.CAPTURE_DIR}/process.png` });
  expect(requested).toContain("periodDays=90");
  await panel.getByRole("combobox").last().selectOption("30");
  await expect.poll(() => requested).toContain("periodDays=30");
});

test("«Обновить» on the live banner reloads the Jira process", async ({ page }) => {
  await mockAdminProject(page);
  let loads = 0;
  await page.route("**/api/projects/project-1/jira/process?*", (route) => {
    loads += 1;
    return route.fulfill({ json: processData });
  });
  const change = { id: "evt-jira", projectId: "project-1", section: "jira", actorId: null, actorName: null, clientId: null, at: "2026-10-10T10:00:00.000Z" };
  await page.route("**/api/projects/project-1/events", (route) => route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: `retry: 60000\n\nevent: change\ndata: ${JSON.stringify(change)}\n\n` }));
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Процесс" }).click();
  await expect.poll(() => loads).toBeGreaterThan(0);
  const before = loads;
  const banner = page.getByRole("status").filter({ hasText: "данные Jira" });
  await banner.getByRole("button", { name: "Обновить" }).click();
  await expect.poll(() => loads).toBeGreaterThan(before);
});
