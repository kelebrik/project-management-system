import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const REPORT = {
  status: "AMBER",
  headline: "Тестирование отстает на неделю",
  summary: "Две задачи сдвинулись, релиз под угрозой.",
  done: ["Утвержден дизайн"],
  slipped: ["Тестирование: +5 дней"],
  risks: [],
  decisions: ["Кто согласует бюджет"],
  next: ["Релиз 1.0"],
};

const DRAFT = [
  { ref: "1", title: "Подготовка", type: "PHASE", workDays: 0, owner: "", predecessors: [] },
  { ref: "1.1", title: "Собрать требования", type: "TASK", workDays: 5, owner: "", predecessors: [] },
  { ref: "1.2", title: "Лишняя задача", type: "TASK", workDays: 2, owner: "", predecessors: ["1.1"] },
  { ref: "2", title: "Запуск", type: "MILESTONE", workDays: 0, owner: "", predecessors: ["1.1"] },
];

async function mockAi(page: Page, status: object = { enabled: true, allowed: true, provider: "openai", model: "gpt-test" }) {
  const project = await mockAdminProject(page);
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: status }));
  return project;
}

test("the report for management is prepared from the project, edited and copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockAi(page);
  const calls: unknown[] = [];
  await page.route("**/api/projects/project-1/ai/status-report", (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { report: REPORT, periodDays: 14, model: "gpt-test", provider: "openai" } });
  });
  await page.goto("/TV-OVERVIEW/overview");
  await page.getByRole("button", { name: "Отчет для руководства" }).click();
  const drawer = page.getByRole("dialog", { name: "Отчет для руководства" });
  await drawer.getByRole("button", { name: "14 дн." }).click();
  await drawer.getByRole("button", { name: "Подготовить отчет" }).click();

  const text = drawer.getByLabel("Текст отчета (можно править)");
  await expect(text).toHaveValue(/\*\*Желтый\.\*\* Тестирование отстает на неделю/);
  await expect(text).toHaveValue(/## Нужны решения\n- Кто согласует бюджет/);
  await expect(text).not.toHaveValue(/## Риски и проблемы/);
  expect(calls).toEqual([{ periodDays: 14, locale: "ru" }]);

  await drawer.screenshot({ path: test.info().outputPath("status-report.png") });
  await text.fill("Мой отчет");
  await drawer.getByRole("button", { name: "Скопировать" }).click();
  await expect(drawer.getByText("Скопировано")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Мой отчет");
});

test("a structure draft is trimmed, added after the existing rows and can be removed again", async ({ page }) => {
  const project = await mockAi(page);
  const applied: any[] = [];
  const deleted: any[] = [];
  await page.route("**/api/projects/project-1/ai/wbs-draft", (route) =>
    route.fulfill({ json: { items: DRAFT, droppedLinks: 2, model: "gpt-test", provider: "openai" } }),
  );
  await page.route("**/api/projects/project-1/wbs-draft/apply", (route) => {
    applied.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { createdIds: ["n1", "n2", "n3"], wbsItems: project.wbsItems, wbsDependencies: [] } });
  });
  await page.route("**/api/projects/project-1/wbs-items", (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deleted.push(route.request().postDataJSON());
    return route.fulfill({ json: { wbsItems: project.wbsItems, wbsDependencies: [] } });
  });

  await page.goto("/TV-OVERVIEW/wbs");
  await page.locator(".workspace-focus-panel .panel-title").screenshot({ path: test.info().outputPath("wbs-header.png") });
  await page.getByRole("button", { name: "Черновик с ИИ" }).click();
  const drawer = page.getByRole("dialog", { name: "Черновик Структуры" });
  await expect(drawer.getByText(/Описание отправляется поставщику модели/)).toBeVisible();
  const prepare = drawer.getByRole("button", { name: "Подготовить черновик" });
  await drawer.getByLabel("О чем проект").fill("Коротко");
  await expect(prepare).toBeDisabled();
  await drawer.getByLabel("О чем проект").fill("Запуск нового приложения для клиентов банка за три месяца");
  await prepare.click();

  await expect(drawer.getByText("Модель gpt-test предложила строк: 4. Удалите лишние и поправьте названия, затем добавьте черновик.")).toBeVisible();
  await expect(drawer.getByText("Отброшено некорректных или циклических связей: 2")).toBeVisible();
  await drawer.screenshot({ path: test.info().outputPath("wbs-draft.png") });
  await drawer.getByRole("button", { name: "Удалить строку 1.2 со всем, что под ней" }).click();
  await drawer.getByLabel("Название строки 1.1").fill("Собрать и согласовать требования");
  await drawer.getByLabel("Дата начала").fill("2026-10-05");
  await drawer.getByRole("button", { name: "Добавить в Структуру (3)" }).click();

  await expect(drawer.getByText("Добавлено строк в Структуру: 3")).toBeVisible();
  expect(applied).toHaveLength(1);
  expect(applied[0].startDate).toBe("2026-10-05");
  expect(applied[0].draftKey).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(applied[0].items.map((item: any) => [item.ref, item.title])).toEqual([
    ["1", "Подготовка"],
    ["1.1", "Собрать и согласовать требования"],
    ["2", "Запуск"],
  ]);
  await expect(drawer.getByLabel("Название строки 1.1")).toBeDisabled();

  await drawer.getByRole("button", { name: "Отменить вставку" }).click();
  await expect(drawer.getByText("Добавленные строки удалены")).toBeVisible();
  expect(deleted).toEqual([{ itemIds: ["n1", "n2", "n3"] }]);
});

for (const [name, status] of [
  ["no model is set up", { enabled: false, allowed: false }],
  ["a corporate installation waits for GigaChat", { enabled: false, allowed: false, setup: "gigachat" }],
  ["the model is not allowed for this user", { enabled: true, allowed: false, provider: "openai", model: "gpt-test" }],
] as const) test(`the helpers are hidden when ${name}`, async ({ page }) => {
  await mockAi(page, status);
  await page.goto("/TV-OVERVIEW/overview");
  await expect(page.locator(".executive-overview-grid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отчет для руководства" })).toHaveCount(0);
  await page.goto("/TV-OVERVIEW/wbs");
  await expect(page.locator("#wbs-item-wbs-1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Черновик с ИИ" })).toHaveCount(0);
});

test("a long structure draft runs in the background: the page waits for the job", async ({ page }) => {
  await mockAi(page);
  const prefer: Array<string | undefined> = [];
  await page.route("**/api/projects/project-1/ai/wbs-draft", (route) => {
    prefer.push(route.request().headers()["prefer"]);
    return route.fulfill({ status: 202, json: { jobId: "job-1", pollAfterMs: 100 } });
  });
  let polls = 0;
  await page.route("**/api/ai/jobs/job-1", (route) => {
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204, body: "" });
    polls += 1;
    return route.fulfill(polls < 3 ? { json: { status: "running", pollAfterMs: 100 } } : { json: { items: DRAFT, droppedLinks: 0, model: "gpt-test", provider: "openai" } });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("button", { name: "Черновик с ИИ" }).click();
  const drawer = page.getByRole("dialog", { name: "Черновик Структуры" });
  await drawer.getByLabel("О чем проект").fill("Новый пульт: требования, прототип, испытания и выпуск партии к весне.");
  await drawer.getByRole("button", { name: "Подготовить черновик" }).click();
  await expect(drawer.getByText("Модель gpt-test предложила строк: 4. Удалите лишние и поправьте названия, затем добавьте черновик.")).toBeVisible();
  await expect(drawer.getByLabel("Название строки 1.1")).toHaveValue("Собрать требования");
  expect(prefer).toEqual(["respond-async"]);
  expect(polls).toBe(3);
});
