import { expect, test } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

test("my Jira tasks come by project, and the Jira login can be changed and reset", async ({ page }) => {
  await mockAdminProject(page);
  await page.route("**/api/my-work", (route) => route.fulfill({ json: { person: "Администратор", weekStart: "2026-09-28", items: [] } }));
  let login: string | null = null;
  const task = { key: "TV-12", url: "https://jira.example/browse/TV-12", summary: "Плата питания", status: "In Progress", statusCategory: "indeterminate", priority: "Major", issueType: "Task", updatedAt: "2026-10-03T10:00:00.000Z" };
  await page.route("**/api/my-work/jira", (route) =>
    route.fulfill({
      json: { login: login ?? "admin", defaultLogin: "admin", customLogin: Boolean(login), status: "OK", groups: [{ project: { id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" }, tasks: [task] }], truncated: false },
    }),
  );
  const saved: unknown[] = [];
  await page.route("**/api/my-work/jira-login", async (route) => {
    const body = route.request().postDataJSON();
    saved.push(body);
    login = body.login;
    await route.fulfill({ json: { login } });
  });
  await page.goto("/development/my-work");
  await page.getByRole("radio", { name: "Задачи Jira" }).or(page.getByRole("button", { name: "Задачи Jira" })).click();

  await expect(page.getByRole("heading", { name: "TV-OVERVIEW Телевизор" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TV-12" })).toHaveAttribute("href", task.url);
  await expect(page.getByText("Открытые задачи на admin (из вашего e-mail)")).toBeVisible();

  await page.getByRole("button", { name: "Изменить логин" }).click();
  await page.getByLabel("Логин Jira").fill("a.ivanov");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Открытые задачи на a.ivanov с лейблом проекта")).toBeVisible();
  await page.getByRole("button", { name: "Вернуть admin" }).click();
  await expect(page.getByText("Открытые задачи на admin (из вашего e-mail)")).toBeVisible();
  expect(saved).toEqual([{ login: "a.ivanov" }, { login: null }]);
});
