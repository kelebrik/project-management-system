import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("the density switch in the header makes the rows compact, survives a reload and switches back", async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.goto(`/${project.code}/wbs`);
  const row = page.locator(".wbs-table-row").first();
  await expect(row).toBeVisible();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-density", "comfortable");
  const comfortable = (await row.boundingBox())!.height;
  expect(comfortable).toBeGreaterThanOrEqual(42);

  const toggle = page.getByRole("button", { name: "Компактные строки" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(html).toHaveAttribute("data-density", "compact");
  await expect(page.getByRole("button", { name: "Обычные строки" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await row.boundingBox())!.height).toBeLessThanOrEqual(comfortable - 8);

  await page.reload();
  await expect(page.locator(".wbs-table-row").first()).toBeVisible();
  await expect(html).toHaveAttribute("data-density", "compact");
  expect(await page.evaluate(() => window.localStorage.getItem("pms-density"))).toBe("compact");

  await page.getByRole("button", { name: "Обычные строки" }).click();
  await expect(html).toHaveAttribute("data-density", "comfortable");
  await expect.poll(async () => (await page.locator(".wbs-table-row").first().boundingBox())!.height).toBeGreaterThanOrEqual(42);
});
