import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("a new project typed and left survives a reload: the dialog offers the draft, which goes on or is dropped", async ({ page }) => {
  await mockAdminProject(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Создать проект" });
  await expect(dialog.getByRole("status").filter({ hasText: "незавершённый черновик" })).toHaveCount(0);
  await dialog.getByLabel("Наименование").fill("Новый мобильный банк");

  await page.reload();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  const notice = dialog.getByRole("status").filter({ hasText: "Есть незавершённый черновик" });
  await expect(notice).toBeVisible();
  // Nothing is put back until asked: the field is empty, and typing here does not overwrite the kept draft.
  await expect(dialog.getByLabel("Наименование")).toHaveValue("");
  await notice.getByRole("button", { name: "Продолжить" }).click();
  await expect(dialog.getByLabel("Наименование")).toHaveValue("Новый мобильный банк");
  await expect(notice).toHaveCount(0);

  // Dropping the draft: after a reload nothing is offered and the field is empty.
  await dialog.getByLabel("Наименование").fill("Другое название");
  await page.reload();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await notice.getByRole("button", { name: "Удалить" }).click();
  await expect(notice).toHaveCount(0);
  await expect(dialog.getByLabel("Наименование")).toHaveValue("");
  await page.reload();
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status").filter({ hasText: "незавершённый черновик" })).toHaveCount(0);
});

test("an open issue and a risk typed and left come back after a reload, each kept for its own project", async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.goto(`/${project.code}/issues`);
  await page.getByRole("button", { name: "Создать вопрос" }).click();
  const issueDialog = page.getByRole("dialog", { name: "Создать открытый вопрос" });
  await issueDialog.getByLabel("Заголовок").fill("Не согласован бюджет на интеграцию");
  await page.reload();
  await page.getByRole("button", { name: "Создать вопрос" }).click();
  const issueNotice = issueDialog.getByRole("status").filter({ hasText: "Есть незавершённый черновик" });
  await issueNotice.getByRole("button", { name: "Продолжить" }).click();
  await expect(issueDialog.getByLabel("Заголовок")).toHaveValue("Не согласован бюджет на интеграцию");

  await page.goto(`/${project.code}/risks`);
  await page.getByRole("button", { name: "Новая запись" }).click();
  const raidForm = page.locator("form.raid-form");
  await raidForm.getByLabel("Наименование").fill("Поставщик сорвёт сроки");
  await page.reload();
  await page.getByRole("button", { name: "Новая запись" }).click();
  const raidNotice = page.locator("form.raid-form").getByRole("status").filter({ hasText: "Есть незавершённый черновик" });
  await expect(raidNotice).toBeVisible();
  await raidNotice.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.locator("form.raid-form").getByLabel("Наименование")).toHaveValue("Поставщик сорвёт сроки");
  // The draft is the project's: it is kept under its id.
  expect(await page.evaluate((id) => Object.keys(window.localStorage).filter((key) => key.startsWith("pms-draft:")).sort().join(","), project.id)).toContain(`pms-draft:raid:${project.id}`);
});
