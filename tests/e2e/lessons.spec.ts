import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("project lessons are kept from the draft and written by hand", async ({ page }) => {
  await mockAdminProject(page);
  const saved: Array<Record<string, unknown>> = [];
  const posted: unknown[] = [];
  await page.route("**/api/projects/project-1/lessons", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      posted.push(body);
      saved.push({ ...body, id: `l${saved.length + 1}`, projectId: "project-1", createdByName: "Администратор", createdAt: "2026-10-01T10:00:00.000Z" });
      return route.fulfill({ status: 201, json: saved.at(-1) });
    }
    return route.fulfill({ json: saved });
  });
  await page.route("**/api/projects/project-1/lessons/draft?*", (route) =>
    route.fulfill({
      json: saved.some((row) => row.sourceRef === "shift:SUPPLIER")
        ? []
        : [{ category: "SUPPLIER", title: "Сдвиг цели «3 Запуск»: 5 дн.", text: "Цель сдвинулась…", recommendation: "", sourceKind: "SHIFT", sourceRef: "shift:SUPPLIER" }],
    }),
  );
  await page.goto("/TV-OVERVIEW/overview");
  await page.getByRole("button", { name: "Уроки проекта" }).click();
  const drawer = page.getByRole("dialog", { name: "Уроки проекта" });
  await expect(drawer.getByText("Уроков пока нет")).toBeVisible();
  await expect(drawer.getByText("из сдвигов плана")).toBeVisible();
  const draft = drawer.locator(".lesson-draft").first();
  await draft.getByLabel("Что делать в следующий раз").fill("Держать второго поставщика");
  await draft.getByRole("button", { name: "Сохранить как урок" }).click();
  await expect(drawer.locator(".lesson-card")).toContainText("В следующий раз: Держать второго поставщика");
  await expect(drawer.locator(".lesson-draft")).toHaveCount(0);
  expect(posted[0]).toMatchObject({ category: "SUPPLIER", sourceKind: "SHIFT", sourceRef: "shift:SUPPLIER", recommendation: "Держать второго поставщика" });

  await drawer.getByRole("button", { name: "Написать урок" }).click();
  const editor = drawer.locator(".lesson-editor").last();
  await editor.getByLabel("Категория").selectOption("GOOD_PRACTICE");
  await editor.getByLabel("Урок").fill("Еженедельный комитет помог");
  await editor.getByRole("button", { name: "Сохранить" }).click();
  expect(posted[1]).toMatchObject({ category: "GOOD_PRACTICE", sourceKind: "MANUAL", title: "Еженедельный комитет помог" });
  await drawer.screenshot({ path: test.info().outputPath("lessons.png") });
});

test("the lessons register filters by category and words on the server", async ({ page }) => {
  await mockAdminProject(page);
  const queries: string[] = [];
  await page.route(/\/api\/lessons\?.*/, (route) => {
    queries.push(new URL(route.request().url()).search);
    return route.fulfill({
      json: {
        total: 1,
        page: 0,
        pageSize: 50,
        rows: [
          {
            id: "l1",
            projectId: "project-1",
            category: "SUPPLIER",
            title: "Держать второго поставщика",
            text: "",
            recommendation: "Договор с запасным поставщиком",
            sourceKind: "MANUAL",
            sourceRef: null,
            createdByName: null,
            createdAt: "2026-10-01T10:00:00.000Z",
            project: { id: "project-1", code: "TV-OVERVIEW", name: "Проект обзора", status: "CLOSED" },
          },
        ],
      },
    });
  });
  await page.goto("/development/lessons");
  await expect(page.getByRole("heading", { name: "Уроки проектов", level: 2 })).toBeVisible();
  await expect(page.getByText("Держать второго поставщика")).toBeVisible();
  await page.getByLabel("Категория").selectOption("SUPPLIER");
  await page.getByLabel("Слова в уроке").fill("поставщик");
  await expect.poll(() => queries.at(-1)).toContain("q=%D0%BF%D0%BE%D1%81%D1%82%D0%B0%D0%B2%D1%89%D0%B8%D0%BA");
  expect(queries.at(-1)).toContain("category=SUPPLIER");
});

test("a closed project still takes lessons from someone who may change it", async ({ page }) => {
  await mockAdminProject(page, (fixture) => {
    (fixture as { status: string }).status = "CLOSED";
  });
  await page.route("**/api/projects/project-1/lessons", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/projects/project-1/lessons/draft?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/TV-OVERVIEW/overview");
  await page.getByRole("button", { name: "Уроки проекта" }).click();
  await expect(page.getByRole("dialog", { name: "Уроки проекта" }).getByRole("button", { name: "Написать урок" })).toBeVisible();
});
