import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const iso = (offsetDays: number) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};

test("current work is filtered by owner and by a due date within the next days, and remembers both", async ({ page }) => {
  await mockAdminProject(page, (fixture) => {
    const template = fixture.wbsItems[0];
    fixture.wbsItems = [
      { ...template, id: "w1", code: "1", title: "Работа Анны", owner: "Анна", status: "IN_PROGRESS", dueDate: iso(2), parentId: null, type: "TASK" },
      { ...template, id: "w2", code: "2", title: "Работа Ивана", owner: "Иван", status: "IN_PROGRESS", dueDate: iso(20), parentId: null, type: "TASK" },
      { ...template, id: "w3", code: "3", title: "Ничья работа", owner: "", status: "NOT_STARTED", dueDate: iso(1), parentId: null, type: "TASK" },
    ];
  });
  // "Me" is the directory person linked to the user.
  await page.route("**/api/my-work/person", (route) => route.fulfill({ json: { person: { id: "e1", name: "Анна" }, name: "Анна" } }));
  await page.goto("/TV-OVERVIEW/current-work");
  const table = page.getByRole("table", { name: /Текучк|Текущ/ });
  await expect(table.getByText("Ничья работа")).toBeVisible();

  await page.getByText("Все исполнители").click();
  await page.getByRole("checkbox", { name: "Иван" }).check();
  await expect(table.getByText("Работа Ивана")).toBeVisible();
  await expect(table.getByText("Работа Анны")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Без исполнителя" }).check();
  await expect(table.getByText("Ничья работа")).toBeVisible();
  await page.getByRole("button", { name: "Показать всех" }).click();
  await page.getByRole("checkbox", { name: "Я", exact: true }).check();
  await expect(table.getByText("Работа Анны")).toBeVisible();
  await expect(table.getByText("Работа Ивана")).toHaveCount(0);
  await page.getByRole("button", { name: "Показать всех" }).click();

  await page.getByRole("button", { name: "Срок скоро" }).click();
  await expect(table.getByText("Работа Анны")).toBeVisible();
  await expect(table.getByText("Работа Ивана")).toHaveCount(0);
  await page.getByLabel("Дней вперёд").selectOption("14");
  await expect(table.getByText("Работа Ивана")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Срок скоро" })).toHaveClass(/active/);
  await expect(page.getByRole("table", { name: /Текучк|Текущ/ }).getByText("Работа Ивана")).toHaveCount(0);
});
