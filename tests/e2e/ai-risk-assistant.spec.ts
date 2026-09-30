import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const SUGGESTIONS = {
  newRisks: [
    { title: "Перегрузка исполнителя", description: "Две задачи одновременно", probability: 4, impact: 4, owner: "", mitigationPlan: "", basisRefs: ["wbs:wbs-1", "jira:TV-7"] },
    { title: "Срыв сертификации", description: "Веха сдвинута", probability: 2, impact: 3, owner: "РП", mitigationPlan: "Заранее записаться", basisRefs: ["wbs:wbs-1"] },
  ],
  scores: [{ riskRef: "risk:risk-1", probability: 2, impact: 5, reason: "Поставщик один" }],
  mitigations: [],
  refs: {
    "wbs:wbs-1": { kind: "wbs", id: "wbs-1", label: "1.1 Тестовая задача" },
    "jira:TV-7": { kind: "jira", id: "TV-7", label: "TV-7 Висит" },
    "risk:risk-1": { kind: "risk", id: "risk-1", label: "Риск интеграции", type: "RISK" },
  },
  droppedRefs: 1,
  model: "gpt-test",
  provider: "openai",
};

test("risk suggestions are applied one by one through the register, with the refusal shown on its row", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } }));
  await page.route("**/api/projects/project-1/ai/risk-suggestions", (route) => route.fulfill({ json: SUGGESTIONS }));
  const created: any[] = [];
  const patched: Array<{ url: string; body: any }> = [];
  await page.route("**/api/projects/project-1/raid-items", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    created.push(body);
    if (!body.owner) return route.fulfill({ status: 400, json: { error: "У высокого риска должен быть ответственный" } });
    return route.fulfill({ status: 201, json: { id: "new-risk", ...body } });
  });
  await page.route("**/api/raid-items/risk-1", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patched.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { id: "risk-1" } });
  });

  await page.goto("/TV-OVERVIEW/risks");
  await page.getByRole("button", { name: "Помощник по рискам" }).click();
  const drawer = page.getByRole("dialog", { name: "Помощник по рискам" });
  await drawer.getByRole("button", { name: "Найти риски" }).click();
  await expect(drawer.getByText("Модель gpt-test подготовила предложений: 3. Отметьте те, что нужно применить.")).toBeVisible();
  await expect(drawer.getByText("Отброшено из ответа модели (ссылки и имена не из данных проекта, лишние пункты): 1")).toBeVisible();
  await expect(drawer.getByText("TV-7 Висит")).toBeVisible();
  await drawer.screenshot({ path: test.info().outputPath("risk-assistant.png") });

  for (const index of [1, 2, 3]) await drawer.getByRole("checkbox", { name: `Применить предложение ${index}` }).check();
  await drawer.getByRole("button", { name: "Применить выбранное (3)" }).click();

  await expect(drawer.getByText("Применено предложений: 2")).toBeVisible();
  await expect(drawer.getByRole("alert")).toContainText("У высокого риска должен быть ответственный");
  expect(created.map((body) => [body.type, body.title, body.probability, body.impact])).toEqual([
    ["RISK", "Перегрузка исполнителя", 4, 4],
    ["RISK", "Срыв сертификации", 2, 3],
  ]);
  expect(created[1].description).toContain("Основание: 1.1 Тестовая задача");
  expect(created[0].basisRefs).toBeUndefined();
  expect(patched).toEqual([{ url: expect.stringContaining("/api/raid-items/risk-1"), body: { probability: 2, impact: 5 } }]);
});

test("the risk assistant is hidden without a connected model", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: false, allowed: false, setup: "gigachat" } }));
  await page.goto("/TV-OVERVIEW/risks");
  await expect(page.locator(".raid-register")).toBeVisible();
  await expect(page.getByRole("button", { name: "Помощник по рискам" })).toHaveCount(0);
});
