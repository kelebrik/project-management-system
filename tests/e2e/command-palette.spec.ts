import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("Ctrl K opens the palette: a section in the wrong layout, a found row, Esc closes", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/search?*", (route) => route.fulfill({
    json: [{ type: "risk", id: "risk-1", projectId: "project-1", projectCode: "TV-OVERVIEW", projectName: "Проект", title: "Риск поставки плат", subtitle: "Высокий", url: "/TV-OVERVIEW/raid", updatedAt: "2026-10-01T00:00:00.000Z" }],
  }));

  await page.goto("/TV-OVERVIEW/overview");
  await expect(page.getByRole("button", { name: "Структура" }).first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Палитра команд" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();
  // Without a query the groups are offered.
  await expect(palette.getByText("Действия", { exact: true })).toBeVisible();
  await expect(palette.getByText("Разделы проекта", { exact: true })).toBeVisible();

  // «структура» typed in the English layout.
  await palette.getByRole("combobox").fill("cnhernehf");
  await expect(palette.getByRole("option").first()).toContainText("Структура");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/wbs/);

  // The server search fills the rows below the commands; arrows move, Enter opens.
  await page.keyboard.press("ControlOrMeta+K");
  await palette.getByRole("combobox").fill("плат");
  const found = palette.getByRole("option", { name: /Риск поставки плат/ });
  await expect(found).toBeVisible();
  await found.click();
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/risks/);

  // The last command comes back first among the recent ones; Esc closes.
  await page.keyboard.press("ControlOrMeta+K");
  await expect(palette.getByText("Недавние", { exact: true })).toBeVisible();
  await expect(palette.getByRole("option").first()).toContainText("Структура");
  // Tab does not leave the palette.
  await page.keyboard.press("Tab");
  expect(await palette.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  // Closing gives the focus back to where it was.
  const tab = page.getByRole("button", { name: "Структура" }).first();
  await tab.focus();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(palette.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tab).toBeFocused();
});

test("the palette creates an open issue in the current project", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/overview");
  await expect(page.getByRole("button", { name: "Структура" }).first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Палитра команд" });
  await palette.getByRole("combobox").fill("вопрос");
  await expect(palette.getByRole("option").first()).toContainText("Создать открытый вопрос");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/issues/);
  await expect(page.getByRole("dialog", { name: "Создать открытый вопрос" })).toBeVisible();
});

test("in English the palette still answers to Russian names", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/TV-OVERVIEW/overview");
  await page.getByTestId("language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("портфель");
  await expect(palette.getByRole("option").first()).toContainText("Portfolio");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/portfolio/);
});
