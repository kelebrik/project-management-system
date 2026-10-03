import fs from "node:fs";
import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

// The help menu belongs to the cloud build; the corporate build has no src/cloudOnly.
test.skip(!fs.existsSync("apps/web/src/cloudOnly/help"), "cloud build only");

test("the help menu shows what's new, sends a problem report and lists reports for an administrator", async ({ page }) => {
  await mockAdminProject(page);
  const reports = [
    { id: "r1", createdAt: "2026-10-03T09:00:00.000Z", author: "Анна", message: "Не открывается Гант", page: "/TV/gantt", status: "OPEN", statusChangedBy: null },
  ];
  const sent: Array<Record<string, unknown>> = [];
  const patched: Array<{ id: string; status: string }> = [];
  await page.route(/\/api\/problem-reports(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 201, json: { id: "r2", createdAt: "2026-10-03T10:00:00.000Z" } });
      return;
    }
    await route.fulfill({ json: { items: reports.filter((report) => report.status === "OPEN"), openCount: reports.filter((report) => report.status === "OPEN").length } });
  });
  await page.route(/\/api\/problem-reports\/r\d$/, async (route) => {
    const body = route.request().postDataJSON() as { status: string };
    const id = route.request().url().split("/").pop()!;
    patched.push({ id, status: body.status });
    reports.find((report) => report.id === id)!.status = body.status;
    await route.fulfill({ json: { id, status: body.status, openCount: 0 } });
  });

  await page.goto("/projects");
  const help = page.getByRole("button", { name: "Помощь" });
  await expect(help.locator(".help-menu-dot")).toBeVisible();
  await help.click();
  await page.getByRole("button", { name: /Что нового/ }).click();
  await expect(page.locator(".help-news section").first()).toContainText("Большие Структуры");
  await page.getByRole("button", { name: "Назад" }).click();

  await page.getByRole("button", { name: "Сообщить о проблеме" }).click();
  const textArea = page.getByRole("textbox", { name: "Сообщить о проблеме" });
  await textArea.fill("коротко");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByRole("alert")).toContainText("10 символах");
  await textArea.fill("Кнопка «Сохранить» в паспорте ничего не делает");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("Обращение отправлено администраторам")).toBeVisible();
  expect(sent[0]).toMatchObject({ message: "Кнопка «Сохранить» в паспорте ничего не делает", page: "/projects", context: { locale: "ru" } });
  expect(String((sent[0].context as { viewport: string }).viewport)).toMatch(/^\d+x\d+$/);

  await page.getByRole("button", { name: "Назад" }).click();
  await page.getByRole("button", { name: /Обращения/ }).click();
  await expect(page.locator(".help-reports li")).toContainText("Не открывается Гант");
  await page.getByRole("button", { name: "Решено" }).click();
  await expect.poll(() => patched).toEqual([{ id: "r1", status: "DONE" }]);
  await expect(page.getByText("Открытых обращений нет")).toBeVisible();

  // Once read, the dot goes away and stays away after a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Помощь" }).locator(".help-menu-dot")).toHaveCount(0);
});
