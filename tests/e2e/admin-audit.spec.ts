import { expect, test, type Page } from "./fixtures";

function auditEvent(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `event-${String(index).padStart(3, "0")}`,
    actorId: "admin-1",
    actorEmail: "admin@example.test",
    actorName: "Администратор",
    action: "wbs_item.update",
    objectType: "WbsItem",
    objectId: `item-${index}`,
    projectId: "project-1",
    ipAddress: null,
    userAgent: null,
    beforeValue: null,
    afterValue: null,
    metadata: null,
    createdAt: new Date(Date.UTC(2026, 9, 8, 12, 0) - index * 3_600_000).toISOString(),
    changes: [],
    wbsTombstone: null,
    ...overrides,
  };
}

async function mockAuditJournal(page: Page, requests: URLSearchParams[]) {
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") {
      return route.fulfill({
        json: {
          user: {
            id: "admin-1",
            email: "admin@example.test",
            name: "Администратор",
            role: "ADMIN",
            isActive: true,
            lastLoginAt: null,
            businessUnitAdminIds: [],
          },
        },
      });
    }
    if (path === "/api/auth/keycloak/status") return route.fulfill({ json: { enabled: false, hostname: null } });
    if (path === "/api/audit-events") {
      requests.push(url.searchParams);
      if (url.searchParams.get("action")) {
        return route.fulfill({ json: [auditEvent(500, { action: "issue.convert_to_risk", objectType: "Issue" })] });
      }
      const before = url.searchParams.get("before");
      const start = before ? Number(before.slice("event-".length)) + 1 : 0;
      const count = before ? 20 : 100;
      return route.fulfill({ json: Array.from({ length: count }, (_, offset) => auditEvent(start + offset)) });
    }
    if (path === "/api/projects") {
      return route.fulfill({ json: [{ id: "project-1", code: "TV-1", name: "Телевизор", status: "ACTIVE", portfolio: "TV", wbsItems: [], raidItems: [], issues: [] }] });
    }
    if (path === "/api/admin/config") {
      return route.fulfill({
        json: {
          rolePermissions: [],
          dictionaryItems: [],
          systemSettings: [],
          projectModules: [],
          managedPermissions: [],
          health: { ok: true },
          backupStatus: { ok: true },
        },
      });
    }
    if (path === "/api/admin/integrations") {
      return route.fulfill({ json: { apiTokens: [], webhookEndpoints: [], webhookDeliveries: [], integrationSettings: [] } });
    }
    if (["/api/project-modules", "/api/users", "/api/admin/project-access", "/api/business-units"].includes(path)) {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected ${path}` } });
  });
}

test("audit journal shows older events page by page and filters on the server", async ({ page }) => {
  const requests: URLSearchParams[] = [];
  await mockAuditJournal(page, requests);
  await page.goto("/admin/audit");

  const rows = page.locator(".audit-entry");
  await expect(rows).toHaveCount(100);
  await expect(page.getByText("Показано событий: 100")).toBeVisible();
  await page.getByRole("button", { name: "Показать ещё" }).click();
  await expect(rows).toHaveCount(120);
  expect(requests.at(-1)?.get("before")).toBe("event-099");
  // A short page means the journal has reached its oldest event.
  await expect(page.getByRole("button", { name: "Показать ещё" })).toHaveCount(0);

  const filters = page.getByRole("form", { name: "Фильтры журнала аудита" });
  await filters.getByLabel("С", { exact: true }).fill("2026-09-01");
  await filters.getByLabel("По", { exact: true }).fill("2026-09-21");
  await filters.getByRole("combobox", { name: "Проект", exact: true }).selectOption({ label: "TV-1 · Телевизор" });
  await filters.getByLabel("Пользователь", { exact: true }).fill(" admin ");
  await filters.getByRole("combobox", { name: "Действие", exact: true }).selectOption({ label: "Перевод вопроса в риск" });
  await filters.getByRole("button", { name: "Применить" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Перевод вопроса в риск");
  const filtered = requests.at(-1)!;
  expect(filtered.get("projectId")).toBe("project-1");
  expect(filtered.get("actor")).toBe("admin");
  expect(filtered.get("action")).toBe("issue.convert_to_risk");
  expect(new Date(filtered.get("to")!).getTime() - new Date(filtered.get("from")!).getTime()).toBeGreaterThan(20 * 86_400_000);
  expect(filtered.get("before")).toBeNull();

  await filters.getByRole("button", { name: "Сбросить" }).click();
  await expect(rows).toHaveCount(100);
  await expect(filters.getByRole("combobox", { name: "Действие", exact: true })).toHaveValue("");
});
