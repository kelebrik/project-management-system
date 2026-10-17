import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the plan is fixed once: the button works until then, and is off after, with when it was fixed", async ({ page }) => {
  const project = await mockAdminProject(page);
  const fixedAt = "2026-10-12T09:00:00.000Z";
  let posts = 0;
  await page.route(`**/api/projects/${project.id}/wbs-baseline`, async (route) => {
    posts += 1;
    // Someone fixed it meanwhile: the server refuses and tells when.
    await route.fulfill({ status: 409, json: { error: "Базовый план проекта уже зафиксирован 12.10.2026. Изменить его может администратор кнопкой «Обновить базовый план»", code: "BASELINE_ALREADY_FIXED", baselineFixedAt: fixedAt } });
  });
  await page.goto(`/${project.code}/wbs`);
  const openMenu = () => page.getByRole("button", { name: "Базовый план", exact: true }).click();
  await openMenu();
  const button = page.getByRole("menuitem", { name: "Зафиксировать базовый план", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await page.getByRole("dialog").getByRole("button", { name: "Зафиксировать", exact: true }).click();
  await expect(page.getByText(/уже зафиксирован 12\.10\.2026/)).toBeVisible();
  await openMenu();
  await expect(button).toBeDisabled();
  await expect(page.locator(".wbs-baseline-action")).toHaveAttribute("title", /зафиксирован 12\.10\.2026.*Обновить базовый план/);
  expect(posts).toBe(1);
});

test("a project whose plan is fixed opens with the button off", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    (fixture as unknown as { baselineFixedAt: string }).baselineFixedAt = "2026-10-01T09:00:00.000Z";
  });
  await page.goto(`/${project.code}/wbs`);
  await page.getByRole("button", { name: "Базовый план", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Зафиксировать базовый план", exact: true })).toBeDisabled();
  await expect(page.locator(".wbs-baseline-action")).toHaveAttribute("title", /01\.10\.2026/);
});

test("after the plan is fixed here, the button is off at once", async ({ page }) => {
  const project = await mockAdminProject(page);
  const fixedAt = "2026-10-16T09:00:00.000Z";
  await page.route(`**/api/projects/${project.id}/wbs-baseline`, async (route) => {
    // The answer carries the Structure, as the server's does.
    await route.fulfill({ json: { wbsItems: project.wbsItems, wbsDependencies: [], criticalPath: null, baselineFixedAt: fixedAt } });
  });
  await page.goto(`/${project.code}/wbs`);
  await page.getByRole("button", { name: "Базовый план", exact: true }).click();
  const button = page.getByRole("menuitem", { name: "Зафиксировать базовый план", exact: true });
  await button.click();
  await page.getByRole("dialog").getByRole("button", { name: "Зафиксировать", exact: true }).click();
  await page.getByRole("button", { name: "Базовый план", exact: true }).click();
  await expect(button).toBeDisabled();
  await expect(page.locator(".wbs-baseline-action")).toHaveAttribute("title", /16\.10\.2026/);
});
