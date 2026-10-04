import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the RACI matrix sets roles, explains a second Accountable and exports CSV", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/employees", (route) => route.fulfill({ json: [{ id: "e1", name: "Сидоров", department: "" }] }));
  const assignments: Array<{ wbsItemId: string; personName: string; personKey: string; role: string }> = [
    { wbsItemId: "p1", personName: "Иванов", personKey: "иванов", role: "A" },
  ];
  const puts: unknown[] = [];
  await page.route("**/api/projects/project-1/raci", (route) =>
    route.fulfill({
      json: {
        rows: [
          { id: "p1", code: "1", title: "Фаза разработки", type: "PHASE", parentId: null },
          { id: "w1", code: "1.1", title: "Прошивка", type: "WORK_PACKAGE", parentId: "p1" },
        ],
        people: ["Иванов", "Петров"],
        assignments,
      },
    }),
  );
  await page.route("**/api/projects/project-1/raci/cell", (route) => {
    const body = route.request().postDataJSON() as { wbsItemId: string; personName: string; role: string };
    puts.push(body);
    if (body.role === "A" && assignments.some((row) => row.wbsItemId === body.wbsItemId && row.role === "A")) {
      return route.fulfill({ status: 409, json: { error: "У строки 1 уже есть ответственный (A): Иванов" } });
    }
    assignments.push({ ...body, personKey: body.personName.toLowerCase() });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/development/raci");
  await expect(page.getByRole("heading", { name: "Матрица RACI" })).toBeVisible();
  await expect(page.getByRole("row", { name: /1\.1 Прошивка/ })).toContainText("нет A, нет R");

  await page.getByLabel("Роль Петров в 1.1").selectOption("R");
  await expect.poll(() => puts.at(-1)).toEqual({ wbsItemId: "w1", personName: "Петров", role: "R" });
  await page.getByLabel("Роль Петров в 1", { exact: true }).selectOption("A");
  await expect(page.getByRole("alert")).toContainText("уже есть ответственный (A): Иванов");

  await page.getByLabel("Добавить человека").fill("Сидоров");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Сидоров" })).toBeVisible();
  // The same person written differently does not add a column.
  await page.getByLabel("Добавить человека").fill("ИВАНОВ");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByRole("columnheader")).toHaveCount(4);
  await page.screenshot({ path: test.info().outputPath("raci.png") });

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Выгрузить CSV" }).click();
  expect((await download).suggestedFilename()).toBe("raci-TV-OVERVIEW.csv");
});
