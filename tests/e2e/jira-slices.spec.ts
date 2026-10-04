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

test("a widget grouped twice shows a table of groups by the second grouping with totals", async ({ page }) => {
  const project = await mockAdminProject(page);
  const analytics = await mockManagedJiraAnalytics(page, project);
  analytics.getSemanticDashboard().widgets.push({
    id: "pivot-widget", title: "Эпики по категориям", aggregateId: "semantic-issues", aggregateVersion: 1, placement: "active",
    selectedFields: ["issueKey"], filterLogic: "and", filters: [], dateField: null, asOf: null,
    metric: "storyPoints", groupBy: "epic", groupBy2: "statusCategory", sortBy: "default", sortDirection: "desc", visualization: "bar", width: "full",
  });
  const queries: Array<{ groupBy: string; groupBy2?: string; metric: string }> = [];
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/query-batch$/, async (route) => {
    const body = route.request().postDataJSON() as { queries: Array<{ widgetId: string; aggregateId: string; query: { groupBy: string; groupBy2?: string; metric: string } }> };
    queries.push(body.queries[0].query);
    await route.fulfill({ json: { results: body.queries.map((item) => ({
      widgetId: item.widgetId,
      aggregate: { id: item.aggregateId, name: "Тикеты", version: 1 },
      result: {
        evaluatedAt: "2026-10-04T12:00:00.000Z", effective: { periodDays: null, periodSource: "NONE", timeZone: "Europe/Moscow", assignee: "" },
        value: 8, totalRecords: 3, page: 1, pageSize: 100, records: [],
        quality: { status: "COMPLETE", population: 3, complete: 3, completenessPercent: 100, oldestObservedAt: null, latestObservedAt: null, warnings: [] },
        groups: [
          { key: "value:E1", label: "E1", value: 8, recordCount: 2, breakdown: [{ key: "value:indeterminate", label: "В работе", value: 5, recordCount: 1 }, { key: "value:new", label: "К выполнению", value: 3, recordCount: 1 }] },
          { key: "__empty__", label: "Без эпика", value: 0, recordCount: 1, breakdown: [{ key: "value:done", label: "Готово", value: 0, recordCount: 1 }] },
        ],
        breakdownKeys: [{ key: "value:done", label: "Готово" }, { key: "value:indeterminate", label: "В работе" }, { key: "value:new", label: "К выполнению" }],
      },
    })) } });
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  const table = page.locator(".jira-analytics-pivot table");
  await expect(table).toBeVisible();
  expect(queries[0]).toMatchObject({ groupBy: "epic", groupBy2: "statusCategory", metric: "storyPoints" });
  await expect(table.locator("thead th")).toHaveText(["", "Готово", "В работе", "К выполнению", "Итого"]);
  await expect(table.locator("tbody tr").first().locator("td")).toHaveText(["", "5", "3", "8"]);
});

test("the Flow tab charts created against resolved, work in progress, the cumulative flow and a burnup", async ({ page }) => {
  const project = await mockAdminProject(page);
  await mockManagedJiraAnalytics(page, project);
  const urls: string[] = [];
  const bucket = (start: string, created: number, resolved: number) => ({ start, end: start, created, resolved, open: 3, byCategory: { new: 1, indeterminate: 2, done: resolved }, scope: 4 + created, done: resolved });
  await page.route(/\/api\/projects\/project-1\/jira\/flow-series\?/, async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: { step: "week", metric: "count", periodDays: 90, buckets: [bucket("2026-09-21T21:00:00.000Z", 2, 1), bucket("2026-09-28T21:00:00.000Z", 1, 2)], quality: { issues: 7, incompleteHistory: 1, withoutCreationDate: 0, missingStoryPoints: 0, reconstructedCategories: true, unknownStatuses: ["Archived"] } } });
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Потоки" }).click();
  for (const title of ["Создано и закрыто", "Открыто на конец шага", "Накопительный поток по категориям статуса", "Burnup: объём и сделано"]) {
    await expect(page.getByRole("img", { name: title })).toBeVisible();
  }
  await expect(page.getByText(/Статусы, которых сейчас нет ни у одной задачи, считаются «в работе»: Archived/)).toBeVisible();
  expect(urls.at(-1)).toContain("periodDays=90&step=week&metric=count");
  await page.locator(".jira-flow-panel .jira-analytics-toolbar select").nth(1).selectOption("month");
  await expect.poll(() => urls.at(-1)).toContain("step=month");
});
