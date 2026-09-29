import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const NOTES = "Иванов подготовит смету до 10 октября.\nЕсть риск, что поставщик сорвет поставку плат.\nНужно решить, кто согласует бюджет.";

async function mockAi(page: Page, { answer, fail = false }: { answer?: unknown; fail?: boolean } = {}) {
  await mockAdminProject(page);
  const calls: unknown[] = [];
  const created: Array<{ url: string; body: any }> = [];
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, allowed: true, provider: "openai", model: "gpt-test" } }));
  await page.route("**/api/projects/project-1/meeting-drafts", async (route) => {
    calls.push(route.request().postDataJSON());
    if (fail) return route.fulfill({ status: 429, json: { error: "Исчерпан лимит разборов протоколов на час. Повторите позже." } });
    return route.fulfill({
      json: answer ?? {
        model: "gpt-test",
        provider: "openai",
        drafts: [
          { id: "ai-0", kind: "TASK", title: "Подготовить смету", owner: "Иванов", dueDate: "2026-10-10", source: "Иванов подготовит смету до 10 октября.", description: "Смета на пилот", probability: 0, impact: 0, decisionRequired: false, sourceVerified: true, ownerKnown: true },
          { id: "ai-1", kind: "RISK", title: "Срыв поставки плат", owner: "", dueDate: "", source: "поставщик сорвет поставку плат", description: "", probability: 3, impact: 4, decisionRequired: false, sourceVerified: true, ownerKnown: true },
          { id: "ai-2", kind: "ISSUE", title: "Кто согласует бюджет", owner: "Сидоров", dueDate: "", source: "выдуманная цитата", description: "", probability: 0, impact: 0, decisionRequired: true, sourceVerified: false, ownerKnown: false },
        ],
      },
    });
  });
  for (const path of ["wbs-items", "raid-items", "open-issues"]) {
    await page.route(`**/api/projects/project-1/${path}`, (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ json: [] });
      created.push({ url: path, body: route.request().postDataJSON() });
      return route.fulfill({ status: 201, json: { id: `new-${path}` } });
    });
  }
  await page.goto("/TV-OVERVIEW/issues");
  await page.getByRole("button", { name: "Из протокола встречи" }).click();
  return { calls, created };
}

test("the model prepares drafts, marks doubtful ones, and only reviewed drafts are created", async ({ page }) => {
  const { calls, created } = await mockAi(page);
  const drawer = page.getByRole("dialog", { name: "Из протокола — в поручения" });
  await expect(drawer.getByText(/Текст протокола будет отправлен поставщику модели/)).toBeVisible();
  await drawer.getByLabel("Текст протокола").fill(NOTES);
  await drawer.getByRole("button", { name: "Подготовить черновики" }).click();

  await expect(drawer.getByText("Черновики подготовлены моделью gpt-test. Проверьте каждый черновик перед созданием.")).toBeVisible();
  expect(calls).toEqual([{ text: NOTES }]);
  await expect(drawer.getByText("Черновик ИИ")).toHaveCount(3);
  await expect(drawer.getByText(/Цитата не найдена в тексте протокола/)).toHaveCount(1);
  await expect(drawer.getByText(/Такого исполнителя нет в справочнике/)).toHaveCount(1);
  await expect(drawer.getByLabel("Вероятность")).toHaveValue("3");
  await expect(drawer.getByLabel("Нужно решение")).toBeChecked();

  // Nothing is created before the user ticks drafts.
  expect(created).toEqual([]);
  const cards = drawer.locator(".automation-card");
  await cards.nth(0).getByRole("checkbox", { name: /Создать запись 1/ }).check();
  await cards.nth(1).getByRole("checkbox", { name: /Создать запись 2/ }).check();
  await drawer.getByRole("button", { name: "Создать проверенные записи" }).click();
  await expect(drawer.getByText("Создано записей: 2")).toBeVisible();
  expect(created.map((entry) => entry.url)).toEqual(["wbs-items", "raid-items"]);
  expect(created[0].body).toMatchObject({ title: "Подготовить смету", owner: "Иванов", dueDate: "2026-10-10", description: "Смета на пилот" });
  expect(created[1].body).toMatchObject({ type: "RISK", probability: 3, impact: 4 });
});

test("a refused call is explained and the lines can still be parsed without AI", async ({ page }) => {
  await mockAi(page, { fail: true });
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Текст протокола").fill("Риск: Задержка поставщика");
  await drawer.getByRole("button", { name: "Подготовить черновики" }).click();
  await expect(drawer.getByRole("alert")).toContainText("Исчерпан лимит разборов протоколов на час");
  await drawer.getByRole("button", { name: "Разобрать строки без ИИ" }).click();
  await expect(drawer.getByLabel("Название", { exact: true })).toHaveValue("Задержка поставщика");
  await expect(drawer.getByText("Черновик ИИ")).toHaveCount(0);
});

test("a corporate installation without GigaChat shows the setup notice and still parses lines", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: false, allowed: false, setup: "gigachat" } }));
  await page.goto("/TV-OVERVIEW/issues");
  await page.getByRole("button", { name: "Из протокола встречи" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("note")).toHaveText("Настройте подключение к ГигаЧат");
  await expect(drawer.getByText(/Черновики подготовит модель/)).toHaveCount(0);
  await drawer.getByLabel("Текст протокола").fill("Риск: Задержка поставщика");
  await drawer.getByRole("button", { name: "Подготовить черновики" }).click();
  await expect(drawer.getByLabel("Название", { exact: true })).toHaveValue("Задержка поставщика");
  await drawer.screenshot({ path: test.info().outputPath("gigachat.png") });
});
