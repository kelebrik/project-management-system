import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const row = (id: string, code: string, title: string, status = "IN_PROGRESS") => ({ id, code, title, status, type: "TASK" });
const history = {
  date: "2026-10-05",
  firstCapturedDay: "2026-10-01",
  structure: {
    provenance: "daily", note: null, unknown: 0,
    data: { rows: [row("wbs-1", "1", "Подготовить образцы"), row("wbs-gone", "2", "Удалённая работа")], dependencies: [] },
    compare: { added: [row("wbs-new", "3", "Новая работа")], removed: [row("wbs-gone", "2", "Удалённая работа")], changed: [{ id: "wbs-1", label: "1 Подготовить образцы", fields: [{ field: "dueDate", then: "2026-10-10", now: "2026-10-15" }] }] },
    dependencies: { added: 1, removed: 0 },
  },
  raid: { provenance: "reconstructed", note: "reconstructed", unknown: 2, data: [], compare: { added: [], removed: [], changed: [] } },
  issues: { provenance: "unknown", note: "noStructureJournal", unknown: 0, data: null, compare: null },
  project: { provenance: "daily", note: null, unknown: 0, data: { id: "project-1" }, compare: { added: [], removed: [], changed: [{ id: "project-1", label: "", fields: [{ field: "targetDate", then: "2026-12-01", now: "2026-12-20" }] }] } },
};

test("the history shows the project on a past day, what changed since and how exact each part is", async ({ page }) => {
  await mockAdminProject(page);
  const requested: string[] = [];
  await page.route("**/api/projects/project-1/history?*", (route) => {
    requested.push(new URL(route.request().url()).searchParams.get("date") ?? "");
    return route.fulfill({ json: { ...history, date: requested.at(-1) } });
  });
  await page.route("**/api/projects/project-1/history/days", (route) => route.fulfill({ json: { days: [{ day: "2026-10-02", changes: 1, captured: false, partial: false, unavailable: false }, { day: "2026-10-05", changes: 4, captured: true, partial: false, unavailable: false }] } }));

  await page.goto("/TV-OVERVIEW/history");
  await expect(page.getByRole("heading", { name: /История проекта/ })).toBeVisible();
  await page.getByRole("group", { name: "Дни с изменениями" }).getByRole("button").first().click();
  await expect.poll(() => requested.at(-1)).toBe("2026-10-05");

  const structureTab = page.getByRole("tab", { name: /Структура/ });
  await expect(structureTab).toContainText("точно");
  const table = page.locator(".project-history-table");
  await expect(table.locator("tr.is-changed")).toContainText("Подготовить образцы");
  await expect(table.locator("tr.is-removed")).toContainText("Удалённая работа");
  await expect(page.locator(".project-history-added")).toContainText("Новая работа");
  await expect(page.getByText("Связи: +1 / −0")).toBeVisible();
  await expect(table.getByRole("link", { name: "Подготовить образцы" })).toHaveAttribute("href", /\/TV-OVERVIEW\/wbs\?focusWbs=wbs-1/);

  await page.getByRole("tab", { name: /Риски и проблемы/ }).click();
  await expect(page.getByRole("tab", { name: /Риски и проблемы/ })).toContainText("восстановлено по журналам");
  await expect(page.locator(".project-history-section")).toContainText("Не удалось определить строк: 2");
  await page.getByRole("tab", { name: /Вопросы/ }).click();
  await expect(page.locator(".project-history-section")).toContainText("Нет записей");
  await page.getByRole("tab", { name: /Проект/ }).click();
  await expect(page.locator(".project-history-table")).toContainText("01.12.2026");
  await expect(page.locator(".project-history-table")).toContainText("20.12.2026");
});
