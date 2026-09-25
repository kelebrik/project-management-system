import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

function day(offset: number) {
  const now = new Date();
  const value = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${date}`;
}

function work(id: string, projectId: string, owner: string, start: number, end: number, status = "IN_PROGRESS") {
  return {
    id,
    projectId,
    code: `1.${id}`,
    title: `Работа ${id}`,
    owner,
    type: "TASK",
    status,
    startDate: day(start),
    dueDate: day(end),
  };
}

async function mockWorkload(page: Page) {
  await mockAdminProject(page);
  const requests: string[] = [];
  await page.route(/\/api\/workload(\?.*)?$/, (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        projects: [
          { id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" },
          { id: "p2", code: "AUDIO", name: "Колонка" },
        ],
        items: [
          work("1", "project-1", "Иванов", 0, 6),
          work("2", "p2", "иванов ", 3, 10),
          work("3", "project-1", "Петров", 1, 4),
          work("4", "p2", "Петров", 8, 12),
          work("5", "p2", "Петров", 2, 3, "DONE"),
        ],
        employees: [{ id: "e1", name: "Иванов", department: "Разработка" }],
        leaves: [{ id: "l1", employeeId: "e1", typeId: "vacation", startDate: day(20), endDate: day(25) }],
        calendarDays: [],
      },
    });
  });
  return requests;
}

test("workload shows owners with work coloured by project and marks overlaps", async ({ page }) => {
  await mockWorkload(page);
  await page.goto("/operations/workload");

  await expect(page.getByRole("navigation", { name: "Операционка" }).getByRole("button", { name: "Загрузка" })).toHaveClass(/active/);
  // Two spellings of one name make one row, matched to the directory.
  await expect(page.getByRole("rowheader", { name: /Иванов/ })).toHaveCount(1);
  await expect(page.getByRole("rowheader", { name: /Петров/ })).toHaveCount(1);

  const ivanov = page.locator('.workload-lane[data-owner="иванов"]');
  const bars = ivanov.locator(".workload-bar");
  await expect(bars).toHaveCount(2);
  const colors = await bars.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(new Set(colors).size).toBe(2);
  await expect(ivanov.locator(".workload-overlap")).toHaveCount(1);
  await expect(ivanov.locator(".workload-leave")).toHaveCount(1);

  // Petrov's finished work does not count as an overlap.
  await expect(page.locator('.workload-lane[data-owner="петров"] .workload-overlap')).toHaveCount(0);
  await page.getByLabel("Только с наложениями").check();
  await expect(page.getByRole("rowheader", { name: /Петров/ })).toHaveCount(0);
  await expect(page.getByRole("rowheader", { name: /Иванов/ })).toHaveCount(1);
});

test("clicking work opens the structure of its project", async ({ page }) => {
  await mockWorkload(page);
  await page.goto("/operations/workload");
  await page.getByRole("button", { name: /Иванов: TV-OVERVIEW · 1\.1 Работа 1/ }).click();
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/wbs$/);
});

test("the structure offers people from the directory as owners", async ({ page }) => {
  await mockAdminProject(page);
  await page.route(/\/api\/employees$/, (route) =>
    route.fulfill({ json: [{ id: "e1", name: "Иванов Иван", department: "Разработка" }] }),
  );
  await page.goto("/TV-OVERVIEW/wbs");
  const owner = page.locator('#wbs-item-wbs-1 input[list="pms-employee-names"]');
  await expect(owner).toHaveCount(1);
  await expect(page.locator('datalist#pms-employee-names option[value="Иванов Иван"]')).toHaveCount(1);
});

test("the year scale asks for a period the API accepts", async ({ page }) => {
  const requests = await mockWorkload(page);
  await page.goto("/operations/workload");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const before = requests.length;
  await page.getByRole("button", { name: "12 мес." }).click();
  // The wider scale loads a longer stretch: wait for that request before checking it.
  await expect.poll(() => requests.length).toBeGreaterThan(before);
  await expect(page.locator(".leave-head-week.today")).toHaveCount(1);
  for (const url of requests) {
    const params = new URL(url).searchParams;
    const from = new Date(`${params.get("from")}T00:00:00Z`);
    const limit = new Date(Date.UTC(from.getUTCFullYear() + 6, from.getUTCMonth(), from.getUTCDate()));
    expect(new Date(`${params.get("to")}T00:00:00Z`) <= limit, url).toBe(true);
  }
});
