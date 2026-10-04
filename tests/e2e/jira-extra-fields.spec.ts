import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("a system administrator picks extra Jira fields from the catalog on the Jira data tab", async ({ page }) => {
  await mockAdminProject(page);
  const saved: unknown[] = [];
  await page.route("**/api/projects/project-1/jira/extra-fields", async (route) => {
    if (route.request().method() === "PUT") {
      saved.push(route.request().postDataJSON());
      await route.fulfill({ json: { selected: route.request().postDataJSON().fieldIds } });
      return;
    }
    await route.fulfill({
      json: {
        catalog: [
          { id: "customfield_10008", name: "Epic Link" },
          { id: "customfield_20000", name: "Severity" },
          { id: "customfield_20001", name: "Team" },
        ],
        selected: ["customfield_20001"],
        known: { epicLinkFieldId: "customfield_10008", storyPointsFieldId: null },
        max: 10,
      },
    });
  });
  await page.goto("/TV-OVERVIEW/jira-work");
  await page.getByRole("button", { name: "Данные Jira", exact: true }).click();

  const panel = page.locator(".jira-extra-fields");
  await expect(panel.getByText("Ссылка на эпик: Epic Link (customfield_10008). Story points: пока не найдено.")).toBeVisible();
  await expect(panel.locator(".jira-extra-fields-chosen")).toContainText("Team");
  await panel.getByLabel("Найти поле по имени или id").fill("sev");
  await panel.getByRole("button", { name: /Severity/ }).click();
  await panel.getByRole("button", { name: "Убрать Team" }).click();
  await panel.getByRole("button", { name: "Сохранить поля" }).click();
  await expect(panel.getByText("Сохранено. Поля будут прочитаны при следующей синхронизации.")).toBeVisible();
  expect(saved).toEqual([{ fieldIds: ["customfield_20000"] }]);
});
