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

test("WBS fullscreen, export controls and baseline dialog follow the locale", async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
  const project = await mockAdminProject(page);
  await page.goto(`/${project.code}/wbs`);
  const toolbar = page.locator('.wbs-structure-controls');
  await expect(toolbar.locator('.workspace-fullscreen-button')).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'PDF EN', exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: 'EN', exact: true })).toHaveCount(0);
  await toolbar.locator('.workspace-fullscreen-button').click();
  await expect(toolbar.locator('.workspace-fullscreen-button')).toContainText('Normal mode');
  await toolbar.locator('.workspace-fullscreen-button').click();
  await toolbar.getByRole('button', { name: 'Set the baseline', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Set the baseline?');
  await expect(dialog).toContainText('The current dates of all WBS items');
  expect(await dialog.innerText()).not.toMatch(/[А-Яа-яЁё]/u);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.wbs-row-select').first().check();
  const calendar = page.locator('.wbs-bulk-calendar');
  await expect(calendar).toBeVisible();
  expect((await calendar.boundingBox())!.width).toBeGreaterThanOrEqual(140);
  await page.getByTestId('language-toggle').click();
  await expect(toolbar.locator('.workspace-fullscreen-button')).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'PDF EN', exact: true })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'EN', exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Зафиксировать базовый план', exact: true }).click();
  await expect(dialog).toContainText('Зафиксировать базовый план?');
});

test('Risk title spans its cell with the edit button below', async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
  const project = await mockAdminProject(page, fixture => {
    fixture.raidItems[0].title = 'High delivery risk';
    Object.assign(fixture.issues[0], { riskId: fixture.raidItems[0].id });
  });
  await page.goto(`/${project.code}/issues`);
  const control = page.locator('.issue-risk-control').first();
  const link = control.locator('.issue-risk-link');
  await expect(link).toHaveText('High delivery risk');
  const title = await link.boundingBox();
  const button = await control.locator('button').boundingBox();
  const cell = await control.boundingBox();
  expect(title).not.toBeNull();
  expect(button!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  expect(title!.width).toBeGreaterThanOrEqual(cell!.width - 1);
});
