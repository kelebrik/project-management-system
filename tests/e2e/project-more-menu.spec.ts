import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("five sections sit behind «Ещё»; the open one is named on the button; the menu closes on Escape and gives the focus back", async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.goto(`/${project.code}/wbs`);
  const nav = page.getByRole("navigation", { name: "Разделы проекта" });
  for (const hidden of ["Решения", "Работы Jira", "Паспорт", "Требования", "Календари"]) {
    await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  const more = nav.getByRole("button", { name: "Ещё", exact: true });
  await expect(more).toBeVisible();
  await expect(more).not.toHaveClass(/active/);

  await more.click();
  const menu = page.getByRole("menu", { name: "Другие разделы" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Решения", "Работы Jira", "Паспорт", "Требования", "Календари"]);
  // The menu is drawn over the page, not clipped by the scrolling bar.
  const menuBox = (await menu.boundingBox())!;
  const barBox = (await nav.boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 1);
  await expect(menu.getByRole("menuitem", { name: "Решения" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Работы Jira" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  const passport = menu.getByRole("menuitem", { name: "Паспорт" });
  await expect(passport).toHaveAttribute("href", `/${project.code}/passport`);
  await passport.click();
  await expect(page).toHaveURL(new RegExp(`/${project.code}/passport`));
  await expect(menu).toHaveCount(0);
  const named = nav.getByRole("button", { name: /Ещё · Паспорт/ });
  await expect(named).toHaveClass(/active/);
  // Back in the bar: the button is plain «Ещё» again.
  await nav.getByRole("link", { name: "Структура", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Ещё", exact: true })).not.toHaveClass(/active/);
});
