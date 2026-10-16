import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const iso = (offsetDays: number) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};
const background = (locator: import("@playwright/test").Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);
// The bar colours of the Gantt (ganttToneColor): failed and cancelled, at risk and overdue, done — the risk matrix's red, yellow and green, a few tones deeper.
const BLOCKED = "rgb(238, 139, 139)";
const IN_PROGRESS = "rgb(74, 134, 200)";
const IN_REVIEW = "rgb(156, 195, 236)";
const NOT_STARTED = "rgb(168, 180, 197)";
const OVERDUE = "rgb(245, 217, 132)";
const DONE = "rgb(149, 228, 177)";
const AT_RISK = OVERDUE;
const CANCELLED = BLOCKED;

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
      work("w5", "5", "На проверке", "IN_REVIEW", iso(5), 50),
      work("w6", "6", "Под риском", "AT_RISK", iso(5), 60),
      work("w7", "7", "Не начатая", "NOT_STARTED", iso(5), 70),
      work("w8", "8", "Отменённая", "CANCELLED", iso(-3), 80),
    ] as typeof fixture.wbsItems;
  });
}

test("status cells in Текучка and the Structure are coloured by their status, in the Gantt's colours", async ({ page }) => {
  await mockWork(page);
  await page.goto("/TV-OVERVIEW/current-work");
  const table = page.getByRole("table", { name: /Текучк|Текущ/ });
  const statusOf = (code: string) => page.getByLabel(`Статус ${code}`).locator("xpath=..");
  await expect(table.getByText("Идёт сейчас")).toBeVisible();
  expect(await background(statusOf("1"))).toBe(BLOCKED);
  expect(await background(statusOf("2"))).toBe(IN_PROGRESS);
  // A status cell says the status: overdue work under way stays «in progress» (its Gantt bar turns overdue).
  expect(await background(statusOf("3"))).toBe(IN_PROGRESS);
  // The select keeps the colour when focused.
  await page.getByLabel("Статус 2", { exact: true }).focus();
  expect(await background(page.getByLabel("Статус 2", { exact: true }))).toBe("rgba(0, 0, 0, 0)");
  expect(await background(statusOf("2"))).toBe(IN_PROGRESS);

  await page.goto("/TV-OVERVIEW/wbs");
  const cell = (id: string) => page.locator(`#wbs-item-${id} [data-column="status"]`);
  await expect(cell("w1")).toBeVisible();
  expect(await background(cell("w1"))).toBe(BLOCKED);
  expect(await background(cell("w2"))).toBe(IN_PROGRESS);
  expect(await background(cell("w3"))).toBe(IN_PROGRESS);
  expect(await background(cell("w4"))).toBe(DONE);
  // Review apart from work under way, at risk apart from failed, cancelled apart from not started; cancelled is never overdue.
  expect(await background(cell("w5"))).toBe(IN_REVIEW);
  expect(await background(cell("w6"))).toBe(AT_RISK);
  expect(await background(cell("w7"))).toBe(NOT_STARTED);
  expect(await background(cell("w8"))).toBe(CANCELLED);
  for (const label of ["В работе", "На проверке", "Сделано", "Под риском", "Провалено", "Просрочено", "Не начато", "Отменено"]) {
    await expect(page.locator(".status-legend").getByText(label, { exact: true })).toBeVisible();
  }
  const DARK_TEXT = "rgb(17, 24, 39)";
  expect(await cell("w2").locator("select").evaluate((element) => getComputedStyle(element).color)).toBe(DARK_TEXT);

  // Text in a preliminary cell and in a read-only one, in the dark theme.
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
  // Dark text on every status colour, in the dark theme too.
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
