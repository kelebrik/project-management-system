import { expect, test } from "@playwright/test";

test("read-only user can open core project pages without authentication", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Портфель проектов").first()).toBeVisible();

  await page.getByText("Обзор и вехи").first().click();
  await expect(page).toHaveURL(/\/[^/]+\/overview$/);
  await expect(page.getByText("Ключевые риски").first()).toBeVisible();

  await page.getByText("Структура").first().click();
  await expect(page).toHaveURL(/\/[^/]+\/wbs$/);
  await expect(page.getByRole("button", { name: /На весь экран/ }).first()).toBeVisible();

  await page.getByText("Гантт").first().click();
  await expect(page).toHaveURL(/\/[^/]+\/gantt$/);
  await expect(page.getByRole("button", { name: /Месяцы/ })).toBeVisible();
});

test("closed projects page is available in read-only mode", async ({ page }) => {
  await page.goto("/closed-projects");

  await expect(page.getByText("Закрытые проекты").first()).toBeVisible();
});
