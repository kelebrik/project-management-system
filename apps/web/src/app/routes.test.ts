import assert from "node:assert/strict";
import test from "node:test";

import {
  appPathForView,
  appViewFromPath,
  canAccessAdminView,
  canEditAppView,
  canViewAppView,
  developmentSectionViews,
  isDevelopmentSectionViewName,
  isOperationsSectionViewName,
  noSectionAccess,
  writeProtectedViews,
  type SectionAccess,
} from "./routes";

const guest: SectionAccess = noSectionAccess;
const demoVisitor: SectionAccess = { ...noSectionAccess, isAuthenticated: true, isPublicDemoVisitor: true };
const projectManager: SectionAccess = { ...noSectionAccess, isAuthenticated: true };
const unitAdmin: SectionAccess = { ...noSectionAccess, isAuthenticated: true, isBusinessUnitAdmin: true };
const systemAdmin: SectionAccess = { ...noSectionAccess, isAuthenticated: true, isAdminUser: true };

test("business unit admin only sees scoped administration sections", () => {
  assert.equal(canAccessAdminView("admin-projects", false, true), true);
  assert.equal(canAccessAdminView("admin-project-access", false, true), true);
  assert.equal(canAccessAdminView("admin-users", false, true), false);
  assert.equal(canAccessAdminView("admin-roles", false, true), false);
  assert.equal(canAccessAdminView("admin-business-units", false, true), false);
  assert.equal(canAccessAdminView("admin-analytics", false, true), false);
});

test("system admin can open every administration section", () => {
  assert.equal(canAccessAdminView("admin-users", true, false), true);
  assert.equal(canAccessAdminView("admin-config", true, false), true);
  assert.equal(canAccessAdminView("admin-business-units", true, false), true);
  assert.equal(canAccessAdminView("admin-analytics", true, false), true);
});

test("addresses of removed pages lead to the nearest page that still exists", () => {
  for (const [path, view] of [
    ["/portfolio-v2", "portfolio"],
    ["/development/portfolio-v2", "portfolio"],
    ["/development", "decision-queue"],
    ["/development/pm-workspace", "my-work"],
    ["/development/workspace", "my-work"],
    ["/development/resources", "workload"],
    ["/development/resources/capacity", "workload"],
    ["/resources/settings", "workload"],
    ["/budget", "project-overview"],
    ["/admin/templates", "admin-projects"],
    ["/admin/dictionaries", "admin-projects"],
  ] as const) {
    assert.equal(appViewFromPath(path), view, path);
  }
  assert.equal(appViewFromPath("/TV/budget"), "project-overview");
  assert.equal(appViewFromPath("/TV/pm-workspace"), "project-overview");
  assert.equal(writeProtectedViews.has("decision-queue"), true);
});

test("the issues prototype left Development: issues live in the project", () => {
  assert.equal((developmentSectionViews as readonly string[]).includes("open-issues-redesign"), false);
  assert.notEqual(appViewFromPath("/development/open-issues-redesign"), "open-issues-redesign");
  assert.equal(appViewFromPath(appPathForView("project-issues", "TV")), "project-issues");
});

test("public demo visitor only reads administration and development and edits everything else", () => {
  for (const view of ["admin-users", "admin-config", "decision-queue", "closed-projects"] as const) {
    assert.equal(canViewAppView(view, demoVisitor), true, `view ${view}`);
    assert.equal(canEditAppView(view, demoVisitor), false, `edit ${view}`);
  }
  for (const view of ["leave-schedule", "project-create", "project-structure", "portfolio", "my-page"] as const) {
    assert.equal(canEditAppView(view, demoVisitor), true, `edit ${view}`);
  }
});

test("My page is in the top bar, reports and the archive in Development, the leave schedule in Operations", () => {
  assert.equal(isDevelopmentSectionViewName("reports"), true);
  assert.equal(isDevelopmentSectionViewName("my-page"), false);
  assert.equal(appPathForView("my-page"), "/my-page");
  assert.equal(isDevelopmentSectionViewName("closed-projects"), true);
  assert.equal(isDevelopmentSectionViewName("leave-schedule"), false);
  assert.equal(isOperationsSectionViewName("leave-schedule"), true);
  assert.equal(appPathForView("reports"), "/development/reports");
  assert.equal(appPathForView("closed-projects"), "/development/archive");
  assert.equal(appPathForView("leave-schedule"), "/operations/leave-schedule");
  for (const [path, view] of [
    ["/reports", "reports"],
    ["/development/reports", "reports"],
    ["/my-page", "my-page"],
    ["/development/my-page", "my-page"],
    ["/closed-projects", "closed-projects"],
    ["/closed", "closed-projects"],
    ["/development/leave-schedule", "leave-schedule"],
    ["/operations", "leave-schedule"],
  ] as const) {
    assert.equal(appViewFromPath(path), view, path);
  }
});

test("Operations and My page are open to any signed-in user, Development and its reports only to administrators", () => {
  assert.equal(canViewAppView("leave-schedule", guest), false);
  assert.equal(canViewAppView("leave-schedule", projectManager), true);
  assert.equal(canEditAppView("leave-schedule", projectManager), true);
  assert.equal(canViewAppView("my-page", projectManager), true);
  assert.equal(canViewAppView("my-page", guest), false);
  assert.equal(canViewAppView("reports", projectManager), false);
  assert.equal(canViewAppView("closed-projects", projectManager), false);
  assert.equal(canViewAppView("reports", systemAdmin), true);
});

test("outside the demo the same sections stay behind their roles", () => {
  assert.equal(canViewAppView("admin-users", guest), false);
  assert.equal(canViewAppView("admin-users", projectManager), false);
  assert.equal(canViewAppView("decision-queue", projectManager), false);

  assert.equal(canViewAppView("admin-projects", unitAdmin), true);
  assert.equal(canEditAppView("admin-projects", unitAdmin), true);
  assert.equal(canViewAppView("admin-users", unitAdmin), false);
  assert.equal(canViewAppView("decision-queue", unitAdmin), false);

  assert.equal(canViewAppView("decision-queue", systemAdmin), true);
  assert.equal(canEditAppView("decision-queue", systemAdmin), true);
  assert.equal(canViewAppView("admin-users", systemAdmin), true);
});

test("public views stay open and project creation stays behind a session", () => {
  assert.equal(canViewAppView("portfolio", guest), true);
  assert.equal(canViewAppView("project-create", guest), false);
  assert.equal(canViewAppView("project-create", projectManager), true);
});
