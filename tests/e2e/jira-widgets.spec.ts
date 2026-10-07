import { expect, test, type Page } from "./fixtures";
import { mockAdminProject, mockManagedJiraAnalytics } from "./overview-and-baseline.support";

const base = { aggregateId: "semantic-issues", aggregateVersion: 1, placement: "active", selectedFields: ["issueKey"], filterLogic: "and", filters: [], asOf: null, sortBy: "default", sortDirection: "desc", width: "half" };
const quality = { status: "COMPLETE", population: 3, complete: 3, completenessPercent: 100, oldestObservedAt: null, latestObservedAt: null, warnings: [] };
const result = (patch: object) => ({ evaluatedAt: "2026-10-04T12:00:00.000Z", effective: { periodDays: 90, periodSource: "DASHBOARD", timeZone: "Europe/Moscow", assignee: "" }, value: 0, groups: [], records: [], totalRecords: 0, page: 1, pageSize: 100, quality, ...patch });
const record = (key: string) => ({ id: key, issueUrl: `https://jira.example/browse/${key}`, values: { issueKey: key } });

async function setup(page: Page) {
  const project = await mockAdminProject(page);
  const analytics = await mockManagedJiraAnalytics(page, project);
  analytics.getSemanticDashboard().widgets.push(
    { ...base, id: "kpi", title: "Закрыто", dateField: "resolutionAt", metric: "count", groupBy: "none", visualization: "kpi" },
    { ...base, id: "line", title: "По месяцам", dateField: "eventAt", metric: "count", groupBy: "month", visualization: "line" },
    { ...base, id: "stacked", title: "Эпики", dateField: null, metric: "count", groupBy: "epic", groupBy2: "statusCategory", visualization: "stacked", width: "full" },
  );
  const batches: Array<Record<string, { visualization?: string; compare?: string }>> = [];
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/query-batch$/, async (route) => {
    const body = route.request().postDataJSON() as { queries: Array<{ widgetId: string; aggregateId: string; query: { visualization?: string; compare?: string } }> };
    batches.push(Object.fromEntries(body.queries.map((item) => [item.widgetId, item.query])));
    const byWidget: Record<string, object> = {
      kpi: result({ value: 12, previousValue: 8 }),
      line: result({ groups: [{ key: "2026-10", label: "октябрь 2026", value: 5, recordCount: 5 }, { key: "2026-09", label: "сентябрь 2026", value: 3, recordCount: 3 }] }),
      stacked: result({ groups: [{ key: "value:E1", label: "E1", value: 3, recordCount: 3, breakdown: [{ key: "value:new", label: "К выполнению", value: 1, recordCount: 1 }, { key: "value:done", label: "Готово", value: 2, recordCount: 2 }] }], breakdownKeys: [{ key: "value:done", label: "Готово" }, { key: "value:new", label: "К выполнению" }] }),
    };
    await route.fulfill({ json: { results: body.queries.map((item) => ({ widgetId: item.widgetId, aggregate: { id: item.aggregateId, name: "Тикеты", version: 1 }, result: byWidget[item.widgetId] ?? result({}) })) } });
  });
  const singles: Array<{ groupKey?: string; groupKey2?: string; page: number }> = [];
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/[^/]+\/query$/, async (route) => {
    const query = route.request().postDataJSON() as { groupKey?: string; groupKey2?: string; page: number };
    singles.push(query);
    await route.fulfill({ json: { aggregate: { id: "semantic-issues", name: "Тикеты", version: 1 }, result: result({ totalRecords: 150, page: query.page, records: Array.from({ length: 3 }, (_, index) => record(`TV-${query.page}${index}`)) }) } });
  });
  return { batches, singles };
}

test("widgets show a comparison, a line in time order and stacked bars, and drill from a segment into pages of records", async ({ page }) => {
  const { batches, singles } = await setup(page);
  await page.goto("/TV-OVERVIEW/jira-work");
  const kpi = page.locator(".jira-analytics-widget", { hasText: "Закрыто" });
  await expect(kpi.locator(".jira-analytics-kpi strong")).toHaveText("12");
  await expect(kpi.getByText("+4 (+50%)")).toBeVisible();
  expect(batches[0].kpi).toMatchObject({ visualization: "kpi", compare: "previousPeriod" });
  await expect(page.getByRole("group", { name: "По месяцам" }).locator(".jira-hc-points button").first()).toContainText("сентябрь 2026");
  await expect(page.getByRole("group", { name: "По месяцам" }).locator("path.highcharts-graph")).toHaveCount(1);

  // A segment is reached from the keyboard through the buttons under the chart.
  await page.getByRole("button", { name: "E1 · К выполнению: 1" }).press("Enter");
  await expect.poll(() => singles.at(-1)).toMatchObject({ groupKey: "value:E1", groupKey2: "value:new", page: 1 });
  const stacked = page.locator(".jira-analytics-widget", { hasText: "Эпики" });
  await expect(stacked.getByText("E1 · К выполнению")).toBeVisible();
  await expect(stacked.getByText("Строки 1–100 из 150")).toBeVisible();
  await stacked.getByRole("button", { name: "Далее" }).click();
  await expect.poll(() => singles.at(-1)?.page).toBe(2);
  await expect(stacked.getByRole("link", { name: "TV-20" })).toHaveAttribute("href", "https://jira.example/browse/TV-20");

  // The group's name on the axis opens the whole group; its total is the group's own value.
  await page.reload();
  await expect(stacked.locator("g.highcharts-stack-labels text")).toHaveText("3");
  await stacked.locator(".highcharts-xaxis-labels text", { hasText: "E1" }).click();
  await expect.poll(() => singles.at(-1)).toEqual(expect.objectContaining({ groupKey: "value:E1", page: 1 }));
  expect(singles.at(-1)?.groupKey2).toBeUndefined();
});

test("anyone arranges their own view: hides a shared widget, adds their own, and goes back to the shared view", async ({ page }) => {
  await setup(page);
  const saved: unknown[] = [];
  await page.route("**/api/projects/project-1/my-view", async (route) => {
    if (route.request().method() === "PATCH") saved.push(route.request().postDataJSON());
    await route.fulfill({ json: { state: {} } });
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Мой вид" }).click();
  await expect(page.getByText("Настройка своего вида: изменения увидите только вы")).toBeVisible();
  await page.getByRole("button", { name: "Скрыть для себя: По месяцам" }).click();
  await expect(page.locator(".jira-analytics-widget", { hasText: "По месяцам" })).toHaveCount(0);
  await expect(page.locator(".jira-mine-hidden")).toContainText("По месяцам");
  await page.getByRole("button", { name: "Добавить свой виджет" }).click();
  await expect(page.locator(".jira-mine-badge")).toHaveCount(1);
  await page.getByRole("button", { name: "Сохранить мой вид" }).click();
  await expect.poll(() => saved.length).toBe(1);
  const layer = (saved[0] as { jiraDashboard: { hidden: string[]; widgets: Array<{ id: string }> } }).jiraDashboard;
  expect(layer.hidden).toEqual(["line"]);
  expect(layer.widgets).toHaveLength(1);
  expect(layer.widgets[0].id.startsWith("my-")).toBe(true);

  await page.getByRole("button", { name: "Мой вид" }).click();
  await page.getByRole("button", { name: "Вернуть общий вид" }).click();
  await expect.poll(() => saved.length).toBe(2);
  expect((saved[1] as { jiraDashboard: unknown }).jiraDashboard).toEqual({ version: 1, hidden: [], order: [], widgets: [] });
  await expect(page.locator(".jira-analytics-widget", { hasText: "По месяцам" })).toHaveCount(1);
});

test("a columns chart shows every week of the period and drills into a week's issues", async ({ page }) => {
  const project = await mockAdminProject(page);
  const analytics = await mockManagedJiraAnalytics(page, project);
  analytics.getSemanticDashboard().widgets.push({ ...base, id: "weekly", title: "Создано Critical/Blocker по неделям", dateField: "issueCreatedAt", metric: "count", groupBy: "week", visualization: "columns", width: "full", filters: [{ id: "p", field: "priority", operator: "oneOf", value: "Critical,Blocker" }] });
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/query-batch$/, async (route) => {
    const body = route.request().postDataJSON() as { queries: Array<{ widgetId: string; aggregateId: string }> };
    const weeks = [["2026-W38", "14 сент. 2026 г.", 0], ["2026-W39", "21 сент. 2026 г.", 3], ["2026-W40", "28 сент. 2026 г.", 1]] as const;
    await route.fulfill({ json: { results: body.queries.map((item) => ({ widgetId: item.widgetId, aggregate: { id: item.aggregateId, name: "Тикеты", version: 1 }, result: result({ value: 4, groups: weeks.map(([key, label, value]) => ({ key, label, value, recordCount: value })) }) })) } });
  });
  const singles: Array<{ groupKey?: string }> = [];
  await page.route(/\/api\/projects\/project-1\/jira\/semantic-aggregates\/[^/]+\/query$/, async (route) => {
    singles.push(route.request().postDataJSON());
    await route.fulfill({ json: { aggregate: { id: "semantic-issues", name: "Тикеты", version: 1 }, result: result({ totalRecords: 3, records: [record("TV-1"), record("TV-2"), record("TV-3")] }) } });
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  const chart = page.getByRole("group", { name: "Создано Critical/Blocker по неделям" });
  await expect(chart.locator(".highcharts-column-series .highcharts-point")).toHaveCount(3);
  await expect(chart.getByRole("button", { name: "14 сент. 2026 г.: 0" })).toBeDisabled();
  // A click on the column itself opens that week.
  await chart.locator(".highcharts-column-series .highcharts-point").nth(1).click();
  await expect.poll(() => singles.at(-1)?.groupKey).toBe("2026-W39");
  await expect(page.getByRole("link", { name: "TV-2" })).toBeVisible();
});

test("a widget moves to the Retro tab from its editor", async ({ page }) => {
  const project = await mockAdminProject(page);
  const analytics = await mockManagedJiraAnalytics(page, project);
  analytics.getSemanticDashboard().widgets.push({ ...base, id: "weekly", title: "Создано Critical/Blocker по неделям", dateField: "issueCreatedAt", metric: "count", groupBy: "week", visualization: "columns", width: "full" });
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Настроить для всех" }).click();
  const card = page.locator(".jira-analytics-widget", { hasText: "Создано Critical/Blocker по неделям" });
  await card.getByRole("button", { name: "Настроить" }).click();
  await page.locator("select").filter({ has: page.locator("option[value=\"retro\"]") }).selectOption("retro");
  await expect(page.locator(".jira-analytics-widget", { hasText: "Создано Critical/Blocker по неделям" })).toHaveCount(0);
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => (analytics.getSemanticDashboard().widgets.find((widget) => widget.id === "weekly") as { placement?: string } | undefined)?.placement).toBe("retro");
  await page.getByRole("button", { name: "Ретро" }).click();
  await expect(page.locator(".jira-analytics-widget", { hasText: "Создано Critical/Blocker по неделям" })).toHaveCount(1);
});
