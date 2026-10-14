import { expect, test } from "./fixtures";
import { isoDay, mockAdminProject } from "./overview-and-baseline.support";

async function setup(page: import("@playwright/test").Page) {
  await mockAdminProject(page, (project) => {
    const open = project.raidItems[0];
    const closed = (id: string, patch: Record<string, unknown>) => ({ ...open, id, status: "CLOSED", decisionRequired: false, statusUpdates: [], ...patch });
    project.raidItems.push(
      closed("closed-a", {
        type: "DEPENDENCY",
        title: "Не хватает разработчика",
        description: "Релиз Ambient под угрозой",
        mitigationPlan: "Взять человека из соседней команды",
        contingencyPlan: "Сдвинуть релиз",
        statusUpdates: [
          // Same day: the one written later comes first.
          { id: "a-1", raidItemId: "closed-a", statusAt: isoDay(-2), text: "Нашли кандидата", createdAt: `${isoDay(-2)}T09:00:00.000Z`, updatedAt: `${isoDay(-2)}T09:00:00.000Z` },
          { id: "a-2", raidItemId: "closed-a", statusAt: isoDay(-2), text: "Человек вышел, закрываем", createdAt: `${isoDay(-2)}T15:00:00.000Z`, updatedAt: `${isoDay(-2)}T15:00:00.000Z` },
          { id: "a-0", raidItemId: "closed-a", statusAt: isoDay(-9), text: "Ищем ресурс", createdAt: `${isoDay(-9)}T09:00:00.000Z`, updatedAt: `${isoDay(-9)}T09:00:00.000Z` },
        ],
      }),
      closed("closed-b", { title: "Dolby Atmos", description: "", mitigationPlan: null, contingencyPlan: null }),
    );
  });
}

test("a closed risk or problem opens to read what it held, and closes again", async ({ page }) => {
  await setup(page);
  await page.goto("/TV-OVERVIEW/risks");
  await page.locator(".raid-closed-section summary").click();
  const rowA = page.locator("#raid-item-closed-a .raid-closed-row");
  await expect(rowA).toHaveAttribute("aria-expanded", "false");
  await rowA.click();
  await expect(rowA).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(".raid-closed-details");
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText("Релиз Ambient под угрозой");
  await expect(panel).toContainText("Взять человека из соседней команды");
  await expect(panel).toContainText("Сдвинуть релиз");
  await expect(panel.locator(".raid-status-history-row p")).toHaveText(["Человек вышел, закрываем", "Нашли кандидата", "Ищем ресурс"]);
  // Only to read: nothing in the panel can be changed.
  await expect(panel.locator("input, textarea, select")).toHaveCount(0);
  await expect(panel.getByRole("button")).toHaveCount(1);

  // Another closed entry takes its place; one without a history says so.
  await page.locator("#raid-item-closed-b .raid-closed-row").click();
  await expect(panel).toHaveCount(1);
  await expect(panel).toContainText("Dolby Atmos");
  await expect(panel).toContainText("Статус пока не добавлен.");
  await panel.getByRole("button", { name: "Закрыть просмотр записи" }).click();
  await expect(panel).toHaveCount(0);

  // The keyboard opens and closes it too.
  await rowA.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toContainText("Не хватает разработчика");
  await page.keyboard.press("Space");
  await expect(panel).toHaveCount(0);
});

test("opening an open entry after a closed one leaves no panel behind once it is closed", async ({ page }) => {
  await setup(page);
  await page.goto("/TV-OVERVIEW/risks");
  await page.locator(".raid-closed-section summary").click();
  await page.locator("#raid-item-closed-a .raid-closed-row").click();
  await expect(page.locator(".raid-closed-details")).toHaveCount(1);
  await page.locator("#raid-item-risk-1 .raid-row").click();
  await expect(page.locator(".raid-closed-details")).toHaveCount(0);
  await expect(page.locator(".raid-details")).toHaveCount(1);
  await page.getByRole("button", { name: "Закрыть редактирование" }).click();
  await expect(page.locator(".raid-details")).toHaveCount(0);
});

test("a link to a closed entry opens it to read", async ({ page }) => {
  await setup(page);
  await page.goto("/TV-OVERVIEW/risks?focusRaid=closed-a");
  await expect(page.locator(".raid-closed-section")).toHaveJSProperty("open", true);
  await expect(page.locator(".raid-closed-details")).toContainText("Релиз Ambient под угрозой");
});


