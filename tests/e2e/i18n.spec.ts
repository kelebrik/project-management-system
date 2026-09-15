import { test, expect } from "@playwright/test";
import { mockAdminProject } from "./overview-and-baseline.support";

test("English default, language switch and persistence preserve unsaved input and project data", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.route((url) => url.pathname.startsWith("/api/"), (route) => route.fulfill({ json: [] }));
  const project = await mockAdminProject(page);
  await page.goto("/projects");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.locator(".projects-overview-card").first()).toContainText(project.name);
  await page.getByTestId("language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.getByRole("heading", { name: "Проекты", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.goto("/new-project");
  await expect(page.getByRole("heading", { name: "Создать проект", exact: true })).toBeVisible();
  await page.getByPlaceholder("CRM", { exact: true }).fill("UNSAVED-42");
  await page.getByTestId("language-toggle").click();
  await expect(page.getByRole("heading", { name: "Create project", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("CRM", { exact: true })).toHaveValue("UNSAVED-42");
  expect(errors).toEqual([]);
});
