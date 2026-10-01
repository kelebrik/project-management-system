import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const row = { id: "wbs-1", code: "1.1", title: "Тестовая задача" };

test("the bell lists what rules said and opens the row", async ({ page }) => {
  await mockAdminProject(page);
  const read: unknown[] = [];
  let unread = 2;
  await page.route("**/api/notifications", (route) =>
    route.fulfill({
      json: {
        unread,
        items: [
          { id: "n1", kind: "FLOAT_EXHAUSTED", params: { kind: "FLOAT_EXHAUSTED", projectCode: "TV-OVERVIEW", rows: [row], more: 0 }, href: "/TV-OVERVIEW/wbs?focusWbs=wbs-1", createdAt: "2026-10-02T06:00:00.000Z", readAt: unread === 2 ? null : "2026-10-02T07:00:00.000Z" },
          { id: "n2", kind: "MILESTONE_SHIFTED", params: { kind: "MILESTONE_SHIFTED", projectCode: "TV-OVERVIEW", row, days: 5, newDate: "2026-10-20" }, href: "/TV-OVERVIEW/overview#schedule-shifts", createdAt: "2026-10-01T06:00:00.000Z", readAt: null },
        ],
      },
    }),
  );
  await page.route("**/api/notifications/read", (route) => {
    read.push(route.request().postDataJSON());
    unread = 1;
    return route.fulfill({ json: { marked: 1 } });
  });
  await page.goto("/TV-OVERVIEW/overview");
  const bell = page.getByRole("button", { name: "Уведомления, непрочитанных: 2" });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Уведомления" });
  await expect(panel.getByText("1.1 Тестовая задача: сдвиг позже на 5 дн., теперь 20.10.2026")).toBeVisible();
  await panel.getByRole("button", { name: /Кончился запас: 1\.1 Тестовая задача/ }).click();
  // The Structure applies the focus and then drops it from the address.
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/wbs$/);
  expect(read).toEqual([{ ids: ["n1"] }]);
  await expect(page.getByRole("button", { name: "Уведомления, непрочитанных: 1" })).toBeVisible();
});

test("a rule is switched on with its threshold and recipients, previewed, and its proposal applied", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { unread: 0, items: [] } }));
  const saved: unknown[] = [];
  const decided: Array<{ url: string; body: unknown }> = [];
  let pending = [
    {
      id: "p1",
      kind: "CREATE_ISSUE",
      wbsItemId: "wbs-1",
      payload: { title: "1.1 Тестовая задача: Нет стенда", impact: "Нет стенда", owner: "Руководитель", severity: "HIGH", person: "Петров", row },
      status: "PENDING",
      version: 1,
      createdAt: "2026-10-02T06:00:00.000Z",
      rule: { template: "CHECK_IN_BLOCKER" },
    },
  ];
  await page.route("**/api/projects/project-1/automation-rules", (route) =>
    route.fulfill({
      json: {
        canWrite: true,
        pendingProposals: pending.length,
        users: [{ id: "u1", name: "Анна Руководитель", email: "anna@example.test" }],
        rules: ["MILESTONE_SHIFT", "MISSING_CHECK_IN", "CHECK_IN_BLOCKER", "FLOAT_EXHAUSTED", "JIRA_DONE"].map((template) => ({ template, rule: null })),
      },
    }),
  );
  await page.route("**/api/projects/project-1/automation-rules/MILESTONE_SHIFT", (route) => {
    saved.push(route.request().postDataJSON());
    return route.fulfill({ json: { id: "r1", enabled: true, params: { minDays: 5 }, recipientIds: ["u1"], version: 1, updatedAt: "2026-10-02T06:00:00.000Z" } });
  });
  await page.route("**/api/projects/project-1/automation-rules/MILESTONE_SHIFT/preview?*", (route) =>
    route.fulfill({ json: { mode: "HISTORY", days: 28, total: 1, items: [{ at: "2026-09-20T10:00:00.000Z", params: { kind: "MILESTONE_SHIFTED", projectCode: "TV-OVERVIEW", row, days: 6, newDate: "2026-10-30" } }] } }),
  );
  await page.route("**/api/projects/project-1/automation/proposals", (route) => route.fulfill({ json: pending }));
  await page.route("**/api/projects/project-1/automation/proposals/p1/apply", (route) => {
    decided.push({ url: route.request().url(), body: route.request().postDataJSON() });
    pending = [];
    return route.fulfill({ json: { status: "APPLIED", issueId: "i1" } });
  });

  await page.goto("/development/rules");
  const card = page.getByRole("article", { name: /Веха уехала/ });
  await card.getByRole("checkbox", { name: "Включено" }).check();
  await card.getByLabel("Сдвиг позже не меньше чем на, календарных дней").fill("5");
  await card.getByRole("combobox", { name: "Добавить человека" }).selectOption("u1");
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByRole("status")).toHaveText("Сохранено");
  expect(saved).toEqual([{ enabled: true, params: { minDays: 5 }, recipientIds: ["u1"] }]);
  await card.getByRole("button", { name: "Что было бы?" }).click();
  await expect(card.getByText("За последние 28 дней по записанной истории: 1")).toBeVisible();
  await expect(card.getByText(/1\.1 Тестовая задача: сдвиг позже на 6 дн\., теперь 30\.10\.2026/)).toBeVisible();

  await page.getByRole("button", { name: "Предложения (1)" }).click();
  await expect(page.getByText("Из отметки Петров по 1.1 Тестовая задача")).toBeVisible();
  await page.getByLabel("Название").fill("Стенд для сборки");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText("Предложений нет.")).toBeVisible();
  expect(decided[0].body).toEqual({ version: 1, title: "Стенд для сборки", owner: "Руководитель", severity: "HIGH" });
});
