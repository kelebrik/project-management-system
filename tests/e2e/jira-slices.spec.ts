import { encodeJiraSlice, jiraAnalyticsSliceSchema } from "@pms/shared";
import { expect, test } from "./fixtures";
import { mockAdminProject, mockManagedJiraAnalytics } from "./overview-and-baseline.support";

const facetValues = {
  assignees: { values: [{ value: "Иванов", count: 5 }, { value: "", count: 2 }], truncated: false },
  statusCategories: { values: [{ value: "indeterminate", count: 4 }, { value: "done", count: 3 }], truncated: false },
  statuses: { values: [], truncated: false }, issueTypes: { values: [], truncated: false }, priorities: { values: [], truncated: false },
  sprints: { values: [], truncated: false }, epics: { values: [{ value: "TV-100", count: 3 }], truncated: false }, labels: { values: [], truncated: false },
  components: { values: [{ value: "Плата", count: 2 }], truncated: false }, fixVersions: { values: [], truncated: false },
};

test("the slice bar narrows every widget, and a link opens the same slice", async ({ page }) => {
  const project = await mockAdminProject(page);
  const analytics = await mockManagedJiraAnalytics(page, project);
  analytics.getSemanticDashboard().widgets.push({
    id: "slice-widget", title: "Тикеты", aggregateId: "semantic-issues", aggregateVersion: 1, placement: "active",
    selectedFields: ["issueKey"], filterLogic: "and", filters: [], dateField: null, asOf: null,
    metric: "count", groupBy: "none", sortBy: "default", sortDirection: "desc", visualization: "number", width: "half",
  });
  await page.route("**/api/projects/project-1/jira/analytics-facets", (route) => route.fulfill({ json: { issueCount: 7, assignees: ["Иванов"], assigneesTruncated: false, values: facetValues } }));
  const slices: unknown[] = [];
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/query-batch$/, async (route) => {
    const body = route.request().postDataJSON() as { queries: Array<{ query: { slice?: unknown; assignee: string } }> };
    slices.push(body.queries[0]?.query.slice ?? null);
    await route.fallback();
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  const bar = page.getByRole("group", { name: "Срез работ Jira" });
  await expect(bar).toBeVisible();
  await expect.poll(() => slices.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(slices.at(-1)).toBeNull();

  await bar.getByText("Исполнитель", { exact: true }).click();
  await bar.getByRole("checkbox", { name: /Иванов/ }).check();
  await expect.poll(() => slices.at(-1)).toMatchObject({ assignees: ["Иванов"] });
  await bar.getByText("Категория статуса", { exact: true }).click();
  await bar.getByRole("checkbox", { name: /В работе/ }).check();
  await expect.poll(() => slices.at(-1)).toMatchObject({ assignees: ["Иванов"], statusCategories: ["indeterminate"] });

  // A link with the filters opens them for anyone.
  const linked = jiraAnalyticsSliceSchema.parse({ components: ["Плата"] });
  await page.goto(`/TV-OVERVIEW/jira-work?sf=${encodeJiraSlice(linked)}`);
  await expect.poll(() => slices.at(-1)).toMatchObject({ components: ["Плата"], assignees: [] });
  await expect(bar.getByText("Компонент: Плата")).toBeVisible();
  await bar.getByRole("button", { name: "Сбросить" }).click();
  await expect.poll(() => slices.at(-1)).toBeNull();
});

test("a link to a saved slice opens it before anything is counted, and an unavailable one says so", async ({ page }) => {
  const project = await mockAdminProject(page);
  const analytics = await mockManagedJiraAnalytics(page, project);
  analytics.getSemanticDashboard().widgets.push({
    id: "slice-widget", title: "Тикеты", aggregateId: "semantic-issues", aggregateVersion: 1, placement: "active",
    selectedFields: ["issueKey"], filterLogic: "and", filters: [], dateField: null, asOf: null,
    metric: "count", groupBy: "none", sortBy: "default", sortDirection: "desc", visualization: "number", width: "half",
  });
  const saved = jiraAnalyticsSliceSchema.parse({ epics: ["TV-100"] });
  await page.route(/\/api\/saved-views\?viewType=jira-slice/, (route) =>
    route.fulfill({ json: [{ id: "sv1", ownerId: "someone", projectId: "project-1", viewType: "jira-slice", name: "Эпик 100", config: { version: 1, slice: saved }, isShared: true, sortOrder: 0, lastUsedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }] }),
  );
  const slices: unknown[] = [];
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/query-batch$/, async (route) => {
    slices.push((route.request().postDataJSON() as { queries: Array<{ query: { slice?: unknown } }> }).queries[0]?.query.slice ?? null);
    await route.fallback();
  });
  // Something else remembered in the browser must not be counted first.
  await page.addInitScript(() => window.localStorage.setItem("pms:jira-slice:project-1", JSON.stringify({ assignees: ["Петров"] })));
  await page.goto("/TV-OVERVIEW/jira-work?slice=sv1");
  await expect.poll(() => slices.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(slices[0]).toMatchObject({ epics: ["TV-100"], assignees: [] });

  await page.goto("/TV-OVERVIEW/jira-work?slice=missing");
  await expect(page.getByText("Срез по ссылке вам недоступен")).toBeVisible();
});
