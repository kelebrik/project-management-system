import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("a question is answered from the project data with links to the rows", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } }));
  const calls: unknown[] = [];
  await page.route("**/api/projects/project-1/ai/ask", (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answer: "Запуску мешает открытый вопрос о дате запуска и риск интеграции.",
        citations: ["issue:issue-1", "risk:risk-1", "jira:TV-7"],
        insufficientData: false,
        refs: {
          "issue:issue-1": { kind: "issue", id: "issue-1", label: "Согласовать дату запуска" },
          "risk:risk-1": { kind: "risk", id: "risk-1", label: "Риск интеграции", type: "RISK" },
          "jira:TV-7": { kind: "jira", id: "TV-7", label: "TV-7 Висит" },
        },
        droppedRefs: 0,
        model: "gpt-test",
        provider: "openai",
      },
    });
  });
  await page.goto("/TV-OVERVIEW/overview");
  await page.getByRole("button", { name: "Спросить проект" }).click();
  const drawer = page.getByRole("dialog", { name: "Спросить проект" });
  const ask = drawer.getByRole("button", { name: "Спросить", exact: true });
  await drawer.getByLabel("Ваш вопрос").fill("Что");
  await expect(ask).toBeDisabled();
  await drawer.getByLabel("Ваш вопрос").fill("Что мешает запуску?");
  await ask.click();

  await expect(drawer.getByText("Запуску мешает открытый вопрос о дате запуска и риск интеграции.")).toBeVisible();
  await expect(drawer.getByText("TV-7 Висит")).toBeVisible();
  await expect(drawer.getByLabel("Ваш вопрос")).toHaveValue("");
  expect(calls).toEqual([{ question: "Что мешает запуску?", locale: "ru" }]);
  await drawer.screenshot({ path: test.info().outputPath("ask.png") });

  await drawer.getByRole("button", { name: "Риск интеграции" }).click();
  await expect(page).toHaveURL(/\/risks/);
  await expect(page.locator("#raid-item-risk-1").first()).toBeInViewport();
});

test("an answer without enough data says so, and the button is hidden without a model", async ({ page }) => {
  await mockAdminProject(page);
  let enabled = true;
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ json: enabled ? { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } : { enabled: false, allowed: false, setup: "gigachat" } }),
  );
  await page.route("**/api/projects/project-1/ai/ask", (route) =>
    route.fulfill({ json: { answer: "В данных проекта нет бюджета.", citations: [], insufficientData: true, refs: {}, droppedRefs: 2, model: "gpt-test" } }),
  );
  await page.goto("/TV-OVERVIEW/overview");
  await page.getByRole("button", { name: "Спросить проект" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Ваш вопрос").fill("Сколько потратили денег?");
  await drawer.getByLabel("Ваш вопрос").press("Control+Enter");
  await expect(drawer.getByText("Данных проекта недостаточно для полного ответа.")).toBeVisible();
  await expect(drawer.getByText("Отброшено из ответа модели (ссылки и имена не из данных проекта, лишние пункты): 2")).toBeVisible();

  enabled = false;
  await page.goto("/TV-OVERVIEW/overview");
  await expect(page.locator(".executive-overview-grid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Спросить проект" })).toHaveCount(0);
});
