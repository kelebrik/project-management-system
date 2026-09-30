import { readFile } from "node:fs/promises";
import { readXlsx } from "../../apps/web/src/app/tables/xlsx";
import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const plan = {
  creates: [{ code: "1.9", title: "Новая строка", type: "TASK", parentCode: "1" }],
  updates: [{ code: "1.1", changes: [{ field: "owner", from: "Иванов", to: "Петров" }] }],
  unchanged: 0,
  warnings: [{ code: "1.1", kind: "TYPE_KEPT", field: "type", detail: "MILESTONE" }],
  errors: [],
};

test("the Structure goes to .xlsx and comes back through a checked plan", async ({ page }) => {
  await mockAdminProject(page);
  const sent: Array<{ rows: Array<Record<string, unknown>>; dryRun?: boolean; importKey: string }> = [];
  await page.route("**/api/projects/project-1/wbs-import", (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return body.dryRun ? route.fulfill({ json: plan }) : route.fulfill({ status: 201, json: { summary: plan, createdIds: ["n1"], replayed: false } });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("button", { name: "Excel / Таблицы" }).click();
  const drawer = page.getByRole("dialog", { name: "Структура в Excel и Google Таблицах" });

  const [download] = await Promise.all([page.waitForEvent("download"), drawer.getByRole("button", { name: "Скачать .xlsx" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^TV-OVERVIEW-structure-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const file = await download.path();
  const table = await readXlsx(new Uint8Array(await readFile(file)));
  expect(table.headers.slice(0, 3)).toEqual(["ID", "Код", "Название"]);
  expect(table.rows.map((row) => row[0])).toContain("wbs-1");

  // The same file comes back: its rows carry their ids.
  await drawer.locator('input[type="file"]').setInputFiles(file);
  await expect(drawer.getByText(`Колонки (строк: ${table.rows.length})`)).toBeVisible();
  await drawer.getByRole("button", { name: "Проверить изменения" }).click();
  await expect(drawer.getByText("Новых: 1, изменённых: 1, без изменений: 0")).toBeVisible();
  expect(sent[0].dryRun).toBe(true);
  expect(sent[0].rows.find((row) => row.id === "wbs-1")).toMatchObject({ code: expect.any(String) });

  // Cells pasted from Google Sheets.
  await drawer.getByLabel("Или вставьте ячейки").fill("Код\tНазвание\tОтветственный\n1.9\tНовая строка\tПетров\n\tбез кода\t");
  await drawer.getByRole("button", { name: "Прочитать вставленное" }).click();
  await expect(drawer.getByText("Строки без кода пропущены: 1.")).toBeVisible();
  await drawer.getByRole("button", { name: "Проверить изменения" }).click();
  await expect(drawer.getByText("1.1: тип не меняется — меняйте тип в Структуре")).toBeVisible();
  await expect(drawer.getByText("Ответственный: Иванов → Петров")).toBeVisible();
  await drawer.getByRole("button", { name: "Загрузить", exact: true }).click();
  await expect(drawer.getByText("Загружено: новых 1, изменённых 1.")).toBeVisible();
  expect(sent[1].rows).toEqual([{ code: "1.9", title: "Новая строка", owner: "Петров" }]);
  expect(sent[2]).toMatchObject({ rows: sent[1].rows, importKey: sent[1].importKey, dryRun: false });
});

test("cells that cannot be read keep the table from being checked", async ({ page }) => {
  await mockAdminProject(page);
  let calls = 0;
  await page.route("**/api/projects/project-1/wbs-import", (route) => {
    calls += 1;
    return route.fulfill({ json: plan });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await page.getByRole("button", { name: "Excel / Таблицы" }).click();
  const drawer = page.getByRole("dialog", { name: "Структура в Excel и Google Таблицах" });
  await drawer.getByLabel("Или вставьте ячейки").fill("Код;Начало\n1.9;32.13.2026");
  await drawer.getByRole("button", { name: "Прочитать вставленное" }).click();
  await expect(drawer.getByText("Строка 2, Начало: «32.13.2026» — не дата (2026-10-01 или 01.10.2026)")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Проверить изменения" })).toBeDisabled();
  expect(calls).toBe(0);
});
