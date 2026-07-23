import { expect, test, type Page } from "@playwright/test";

const report = {
  range: {
    from: "2026-07-17T21:00:00.000Z",
    to: "2026-07-24T21:00:00.000Z",
    days: 7,
    timezoneOffsetMinutes: -180,
    retentionDays: 30,
  },
  totals: {
    views: 31,
    authenticatedViews: 23,
    anonymousViews: 8,
    uniqueAuthenticated: 3,
    uniqueAnonymous: 2,
  },
  daily: [
    { date: "2026-07-17", authenticatedViews: 2, anonymousViews: 1, totalViews: 3 },
    { date: "2026-07-18", authenticatedViews: 1, anonymousViews: 0, totalViews: 1 },
    { date: "2026-07-19", authenticatedViews: 0, anonymousViews: 2, totalViews: 2 },
    { date: "2026-07-20", authenticatedViews: 5, anonymousViews: 1, totalViews: 6 },
    { date: "2026-07-21", authenticatedViews: 4, anonymousViews: 2, totalViews: 6 },
    { date: "2026-07-22", authenticatedViews: 6, anonymousViews: 1, totalViews: 7 },
    { date: "2026-07-23", authenticatedViews: 5, anonymousViews: 1, totalViews: 6 },
  ],
  visitors: [
    {
      visitorKey: "user:user-1",
      kind: "USER",
      displayName: "Мария Новикова",
      views: 12,
      projectCount: 2,
      lastVisitedAt: "2026-07-23T10:15:00.000Z",
    },
    {
      visitorKey: "anonymous:abcdef",
      kind: "ANONYMOUS",
      displayName: "Гость ABCDEF",
      views: 5,
      projectCount: 1,
      lastVisitedAt: "2026-07-23T09:20:00.000Z",
    },
  ],
  breakdown: [
    {
      visitorKey: "user:user-1",
      kind: "USER",
      displayName: "Мария Новикова",
      projectId: "project-1",
      projectCode: "DEMO-001",
      projectName: "Демо-проект",
      pageKey: "project-structure",
      pageTitle: "Структура",
      views: 7,
      lastVisitedAt: "2026-07-23T10:15:00.000Z",
    },
    {
      visitorKey: "anonymous:abcdef",
      kind: "ANONYMOUS",
      displayName: "Гость ABCDEF",
      projectId: null,
      projectCode: null,
      projectName: null,
      pageKey: "portfolio",
      pageTitle: "Портфель",
      views: 5,
      lastVisitedAt: "2026-07-23T09:20:00.000Z",
    },
  ],
};

async function mockAdminAnalytics(page: Page) {
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
    if (path === "/api/auth/keycloak/status") {
      return route.fulfill({ json: { enabled: false, hostname: null } });
    }
    if (path === "/api/admin/page-visits") return route.fulfill({ json: report });
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
      return route.fulfill({
        json: {
          apiTokens: [],
          webhookEndpoints: [],
          webhookDeliveries: [],
          integrationSettings: [],
        },
      });
    }
    if (
      path === "/api/projects" ||
      path === "/api/project-modules" ||
      path === "/api/users" ||
      path === "/api/audit-events" ||
      path === "/api/admin/project-access" ||
      path === "/api/business-units"
    ) {
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 404, json: { error: `Unexpected ${path}` } });
  });
}

test("system administrator sees weekly visits and aggregated visitors", async ({ page }) => {
  await mockAdminAnalytics(page);
  await page.goto("/admin/analytics");

  await expect(
    page.getByRole("heading", { name: "Администрирование: посещаемость" }),
  ).toBeVisible();
  await expect(page.getByText("Всего просмотров")).toBeVisible();
  await expect(page.getByText("31", { exact: true })).toBeVisible();
  await expect(page.locator(".attendance-chart")).toBeVisible();
  await expect(page.locator(".attendance-bar.authenticated")).toHaveCount(7);
  await expect(page.locator(".attendance-bar.anonymous")).toHaveCount(7);
  await expect(page.getByText("Мария Новикова").first()).toBeVisible();
  await expect(page.getByText("Гость ABCDEF").first()).toBeVisible();
  await expect(page.getByText("DEMO-001 · Демо-проект")).toBeVisible();
  await expect(page.getByText("Общие страницы")).toBeVisible();
  await expect(page.getByText(/IP и email не сохраняются/)).toBeVisible();
});

test("attendance page remains usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminAnalytics(page);
  await page.goto("/admin/analytics");

  await expect(page.locator(".attendance-page")).toBeVisible();
  await expect(page.locator(".attendance-chart-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Посетители" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Детализация просмотров" })).toBeVisible();
});
