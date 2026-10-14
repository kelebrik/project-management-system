import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("saving a risk holds the editor, says so in the panel and shows the notice above it", async ({ page }) => {
  const project = await mockAdminProject(page);
  let patches = 0;
  let release!: () => void;
  const answered = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/raid-items/risk-1", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches += 1;
    const body = route.request().postDataJSON() as { title: string };
    await answered;
    // The project read back after the save carries the new title.
    project.raidItems[0] = { ...project.raidItems[0], title: body.title };
    await route.fulfill({ json: project.raidItems[0] });
  });
  await page.goto("/TV-OVERVIEW/risks");
  await page.locator("#raid-item-risk-1 .raid-row").click();
  const panel = page.locator(".raid-details");
  const save = panel.getByRole("button", { name: "Сохранить запись" });
  // Nothing changed: nothing to save.
  await expect(save).toBeDisabled();
  const title = panel.getByPlaceholder("Наименование");
  await title.fill("Риск интеграции с поставщиком");
  await expect(save).toBeEnabled();
  await save.click();
  // While the save runs, the editor waits: no typing, no closing, no other row.
  await expect(panel.getByRole("button", { name: "Сохранение…" })).toBeDisabled();
  await expect(title).toBeDisabled();
  await expect(panel.getByRole("button", { name: "Закрыть редактирование" })).toBeDisabled();
  release();
  await expect(panel.getByRole("status")).toHaveText("✓ Изменения сохранены");
  await expect(title).toBeEnabled();
  await expect(save).toBeDisabled();
  expect(patches).toBe(1);
  // The notice is drawn above the panel, not under it.
  const toast = page.locator(".toast", { hasText: "Запись о риске обновлена" });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  })).toBe(true);
  // A new edit takes the confirmation away.
  await title.fill("Риск интеграции с поставщиком плат");
  await expect(panel.getByRole("status")).toHaveText("");
});

test("a failed save says why above the panel and does not claim it saved", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/raid-items/risk-1", (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 409, json: { error: "Запись изменили, обновите страницу" } }) : route.fallback());
  await page.goto("/TV-OVERVIEW/risks");
  await page.locator("#raid-item-risk-1 .raid-row").click();
  const panel = page.locator(".raid-details");
  await panel.getByPlaceholder("Наименование").fill("Другое название");
  await panel.getByRole("button", { name: "Сохранить запись" }).click();
  const toast = page.locator(".toast", { hasText: "Запись изменили, обновите страницу" });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
  })).toBe(true);
  await expect(panel.getByRole("status")).toHaveText("");
  await expect(panel.getByRole("button", { name: "Сохранить запись" })).toBeEnabled();
});

test("a row asked to open during a save opens once the save is done", async ({ page }) => {
  const project = await mockAdminProject(page, (draft) => {
    draft.raidItems.push({ ...draft.raidItems[0], id: "risk-2", title: "Риск сертификации" });
  });
  let release!: () => void;
  const answered = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/raid-items/risk-1", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { title: string };
    await answered;
    project.raidItems[0] = { ...project.raidItems[0], title: body.title };
    await route.fulfill({ json: project.raidItems[0] });
  });
  await page.goto("/TV-OVERVIEW/risks");
  await page.locator("#raid-item-risk-1 .raid-row").click();
  const panel = page.locator(".raid-details");
  await panel.getByPlaceholder("Наименование").fill("Риск интеграции с поставщиком");
  await panel.getByRole("button", { name: "Сохранить запись" }).click();
  await expect(panel.getByRole("button", { name: "Сохранение…" })).toBeVisible();
  // A link (as from the risk assistant) asks for another row while the save runs.
  await page.evaluate(async () => {
    const reveal = await import("/src/app/raidReveal.ts");
    reveal.requestRaidReveal("risk-2");
  });
  await expect(panel.getByPlaceholder("Наименование")).toHaveValue("Риск интеграции с поставщиком");
  await expect(panel.getByPlaceholder("Наименование")).toBeDisabled();
  // A click on the other row waits too.
  await page.locator("#raid-item-risk-2 .raid-row").click({ force: true });
  await expect(panel.getByPlaceholder("Наименование")).toHaveValue("Риск интеграции с поставщиком");
  release();
  // Then the asked row opens, and nothing typed was lost.
  await expect(panel.getByPlaceholder("Наименование")).toHaveValue("Риск сертификации");
  await expect(panel.getByPlaceholder("Наименование")).toBeEnabled();
  await expect(page.locator("#raid-item-risk-1 .raid-title")).toHaveText("Риск интеграции с поставщиком");
});
