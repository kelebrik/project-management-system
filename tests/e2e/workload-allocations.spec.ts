import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

function day(offset: number) {
  const now = new Date();
  const value = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

test("project shares above a person's capacity show as overload, can be filtered and edited", async ({ page }) => {
  await mockAdminProject(page);
  let allocations = [
    { id: "a1", employeeId: "e1", project: { id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }, percent: 70, startsOn: day(-30), endsOn: null, editable: true },
    { id: null, employeeId: "e1", project: null, percent: 50, startsOn: day(-30), endsOn: null, editable: false },
  ];
  const saved: unknown[] = [];
  await page.route(/\/api\/workload(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        projects: [{ id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }],
        items: [{ id: "w1", projectId: "project-1", code: "1.1", title: "Работа", owner: "Петров", type: "TASK", status: "IN_PROGRESS", startDate: day(0), dueDate: day(5) }],
        employees: [
          { id: "e1", name: "Иванова", department: "Разработка", capacityPercent: 100 },
          { id: "e2", name: "Петров", department: "Разработка", capacityPercent: 100 },
        ],
        allocations,
        canEditCapacity: true,
        editableProjects: [{ id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }],
        editableProjectIds: ["project-1"],
        leaves: [],
        calendarDays: [],
      },
    }),
  );
  await page.route(/\/api\/workload\/allocations$/, async (route) => {
    const body = route.request().postDataJSON();
    saved.push(body);
    allocations = allocations.map((entry) => (entry.id === body.id ? { ...entry, percent: body.percent } : entry));
    await route.fulfill({ json: { id: body.id } });
  });
  await page.goto("/operations/workload");

  // Ivanova has no work, only shares: she shows up when looking for the overloaded.
  await expect(page.getByRole("rowheader", { name: /Иванова/ })).toHaveCount(0);
  await page.getByLabel("Только перегруженные").check();
  const row = page.getByRole("rowheader", { name: /Иванова/ });
  await expect(row).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Петров/ })).toHaveCount(0);
  const chip = row.getByRole("button", { name: /перегрузка/ });
  await expect(chip).toHaveText("120/100%");
  await expect(page.locator(".workload-overload").first()).toBeVisible();

  await chip.click();
  const dialog = page.getByRole("dialog", { name: "Доли в проектах: Иванова" });
  await expect(dialog.getByText("Другие проекты")).toBeVisible();
  await dialog.getByLabel("Доля, %").fill("40");
  await dialog.getByRole("button", { name: "Сохранить" }).last().click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ id: "a1", employeeId: "e1", projectId: "project-1", percent: 40 });
  // After the reload the shares fit: she is no longer overloaded.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("rowheader", { name: /Иванова/ })).toHaveCount(0);
});
