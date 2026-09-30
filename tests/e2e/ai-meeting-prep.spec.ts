import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the meeting agenda is prepared, links to the issue and hands over to the meeting notes", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } }));
  const calls: unknown[] = [];
  await page.route("**/api/projects/project-1/ai/meeting-prep", (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        agenda: [{ topic: "Кто платит за доставку", why: "Решение нужно до 5 октября", owner: "Иванов", minutes: 15, refs: ["issue:issue-1"] }],
        askWhom: [{ person: "Петров", question: "Готов ли второй поставщик?", refs: [] }],
        refs: { "issue:issue-1": { kind: "issue", id: "issue-1", label: "Открытый вопрос обзора" } },
        droppedRefs: 2,
        horizonDays: 14,
        model: "gpt-test",
        provider: "openai",
      },
    });
  });
  await page.goto("/TV-OVERVIEW/issues");
  await page.getByRole("button", { name: "Подготовка к встрече" }).click();
  const drawer = page.getByRole("dialog", { name: "Подготовка к встрече" });
  await drawer.getByRole("button", { name: "14 дн." }).click();
  await drawer.getByRole("button", { name: "Подготовить повестку" }).click();

  const text = drawer.getByLabel("Повестка (можно править)");
  await expect(text).toHaveValue(/1\. \*\*Кто платит за доставку\*\* — 15 мин, Иванов/);
  await expect(text).toHaveValue(/Решение нужно до 5 октября \(Открытый вопрос обзора\)/);
  await expect(text).toHaveValue(/- \*\*Петров\*\*: Готов ли второй поставщик\?/);
  await expect(drawer.getByText("Отброшено из ответа модели (ссылки и имена не из данных проекта, лишние пункты): 2")).toBeVisible();
  expect(calls).toEqual([{ horizonDays: 14, locale: "ru" }]);
  await drawer.screenshot({ path: test.info().outputPath("meeting-prep.png") });

  await drawer.getByRole("button", { name: "Открытый вопрос обзора" }).click();
  await expect(page.locator("#issue-item-issue-1")).toBeInViewport();

  await page.getByRole("button", { name: "Подготовка к встрече" }).click();
  await page.getByRole("dialog", { name: "Подготовка к встрече" }).getByRole("button", { name: "Подготовить повестку" }).click();
  await page.getByRole("button", { name: "После встречи — разобрать протокол" }).click();
  await expect(page.getByRole("dialog", { name: "Из протокола — в поручения" })).toBeVisible();
});

test("the meeting preparation is hidden without a connected model", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: false, allowed: false, setup: "gigachat" } }));
  await page.goto("/TV-OVERVIEW/issues");
  await expect(page.getByRole("button", { name: "Из протокола встречи" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Подготовка к встрече" })).toHaveCount(0);
});

test("links from the agenda reveal a nested structure row and a low overdue risk", async ({ page }) => {
  await mockAdminProject(page, (fixture) => {
    const task = fixture.wbsItems[0];
    fixture.wbsItems.unshift(
      { ...task, id: "wbs-phase", parentId: null, code: "1", title: "Фаза", type: "PHASE", wbsLevel: 1, sortOrder: 1 },
      { ...task, id: "wbs-package", parentId: "wbs-phase", code: "1.1", title: "Пакет", type: "WORK_PACKAGE", wbsLevel: 2, sortOrder: 2 },
    );
    Object.assign(task, { parentId: "wbs-package", code: "1.1.1", title: "Глубокая задача", wbsLevel: 3, sortOrder: 3 });
    Object.assign(fixture.raidItems[0], { probability: 2, impact: 2, riskScore: 4 });
  });
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } }));
  await page.route("**/api/projects/project-1/ai/meeting-prep", (route) =>
    route.fulfill({
      json: {
        agenda: [{ topic: "Хвосты", why: "", owner: "", minutes: 5, refs: ["wbs:wbs-1", "risk:risk-1"] }],
        askWhom: [],
        refs: {
          "wbs:wbs-1": { kind: "wbs", id: "wbs-1", label: "1.1.1 Глубокая задача" },
          "risk:risk-1": { kind: "risk", id: "risk-1", label: "Риск интеграции", type: "RISK" },
        },
        droppedRefs: 0,
        horizonDays: 7,
        model: "gpt-test",
        provider: "openai",
      },
    }),
  );
  const openAgenda = async () => {
    await page.goto("/TV-OVERVIEW/issues");
    await page.getByRole("button", { name: "Подготовка к встрече" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Подготовить повестку" }).click();
  };
  await openAgenda();
  await page.getByRole("dialog").getByRole("button", { name: "1.1.1 Глубокая задача" }).click();
  await expect(page.locator("#wbs-item-wbs-1")).toBeInViewport();

  // A search saved in the register that hides the risk does not keep it hidden.
  await page.goto("/TV-OVERVIEW/risks");
  await page.locator(".raid-filter-card input").first().fill("ничего такого нет");
  await expect(page.locator("#raid-item-risk-1")).toHaveCount(0);
  await openAgenda();
  await page.getByRole("dialog").getByRole("button", { name: "Риск интеграции" }).click();
  await expect(page.locator("#raid-item-risk-1").first()).toBeInViewport();
  await expect(page.locator(".raid-filter-card input").first()).toHaveValue("");
});
