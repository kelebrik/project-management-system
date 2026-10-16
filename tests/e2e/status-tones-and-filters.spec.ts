import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const iso = (offsetDays: number) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};
const background = (locator: import("@playwright/test").Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
// The bar colours of the Gantt (ganttToneColor): blocked, work under way, overdue, done.
const BLOCKED = "rgb(239, 83, 80)";
const IN_PROGRESS = "rgb(22, 143, 131)";
const OVERDUE = "rgb(244, 114, 182)";
const DONE = "rgb(53, 184, 111)";

async function mockWork(page: import("@playwright/test").Page) {
  await mockAdminProject(page, (fixture) => {
    const template = fixture.wbsItems[0];
    const work = (id: string, code: string, title: string, status: string, dueDate: string, sortOrder: number) =>
      ({ ...template, id, code, title, status, dueDate, forecastDueDate: dueDate, parentId: null, type: "TASK", wbsLevel: 1, sortOrder });
    fixture.wbsItems = [
      work("w1", "1", "Заблокированная", "BLOCKED", iso(5), 10),
      work("w2", "2", "Идёт сейчас", "IN_PROGRESS", iso(5), 20),
      work("w3", "3", "Просроченная", "IN_PROGRESS", iso(-3), 30),
      work("w4", "4", "Готовая", "DONE", iso(-3), 40),
    ] as typeof fixture.wbsItems;
  });
}

test("status cells in Текучка and the Structure are coloured as the rows' bars on the Gantt", async ({ page }) => {
  await mockWork(page);
  await page.goto("/TV-OVERVIEW/current-work");
  const table = page.getByRole("table", { name: /Текучк|Текущ/ });
  const statusOf = (code: string) => page.getByLabel(`Статус ${code}`).locator("xpath=..");
  await expect(table.getByText("Идёт сейчас")).toBeVisible();
  expect(await background(statusOf("1"))).toBe(BLOCKED);
  expect(await background(statusOf("2"))).toBe(IN_PROGRESS);
  expect(await background(statusOf("3"))).toBe(OVERDUE);
  // The select keeps the colour when focused.
  await page.getByLabel("Статус 2", { exact: true }).focus();
  expect(await background(page.getByLabel("Статус 2", { exact: true }))).toBe("rgba(0, 0, 0, 0)");
  expect(await background(statusOf("2"))).toBe(IN_PROGRESS);

  await page.goto("/TV-OVERVIEW/wbs");
  const cell = (id: string) => page.locator(`#wbs-item-${id} [data-column="status"]`);
  await expect(cell("w1")).toBeVisible();
  expect(await background(cell("w1"))).toBe(BLOCKED);
  expect(await background(cell("w2"))).toBe(IN_PROGRESS);
  expect(await background(cell("w3"))).toBe(OVERDUE);
  expect(await background(cell("w4"))).toBe(DONE);
  const DARK_TEXT = "rgb(17, 24, 39)";
  expect(await cell("w2").locator("select").evaluate((element) => getComputedStyle(element).color)).toBe(DARK_TEXT);

  // The text stays dark in a preliminary cell and in a read-only one, in the dark theme too.
  const colours = await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="wbs-table-row"><div class="wbs-cell preliminary wbs-status-tone tone-b"><select><option>В работе</option></select></div></div>
      <div class="wbs-table-row"><div class="wbs-cell wbs-status-tone tone-g"><span class="wbs-readonly-value">Сделано</span></div></div>`;
    document.body.append(host);
    const result = [...host.querySelectorAll("select, .wbs-readonly-value")].map((element) => getComputedStyle(element).color);
    host.remove();
    return result;
  });
  expect(colours).toEqual([DARK_TEXT, DARK_TEXT]);
});

test("the chosen filter of Текучка is highlighted, after a click and after a reload", async ({ page }) => {
  await mockWork(page);
  await page.goto("/TV-OVERVIEW/current-work");
  const all = page.getByRole("button", { name: "Все", exact: true });
  const blocked = page.getByRole("button", { name: "Заблокированные" });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  const chosen = await background(all);
  const plain = await background(blocked);
  expect(chosen).not.toBe(plain);

  await blocked.click();
  await expect(blocked).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  // Buttons fade between colours: wait for the fade.
  await expect.poll(() => background(blocked)).toBe(chosen);
  await expect.poll(() => background(all)).toBe(plain);
  expect(await blocked.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(await all.evaluate((element) => getComputedStyle(element).borderColor));

  await page.reload();
  await expect(page.getByRole("button", { name: "Заблокированные" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => background(page.getByRole("button", { name: "Заблокированные" }))).toBe(chosen);
});
