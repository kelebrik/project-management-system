import assert from "node:assert/strict";
import test from "node:test";

import {
  appPathForView,
  appViewFromPath,
  canAccessAdminView,
  canEditAppView,
  canViewAppView,
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

test("roadmap v2 is a development section with its own route", () => {
  assert.equal(isDevelopmentSectionViewName("portfolio-v2"), true);
  assert.equal(writeProtectedViews.has("portfolio-v2"), true);
  assert.equal(appPathForView("portfolio-v2"), "/development/portfolio-v2");
  assert.equal(appViewFromPath("/development/portfolio-v2"), "portfolio-v2");
  assert.equal(appViewFromPath("/portfolio-v2"), "portfolio-v2");
  assert.equal(appViewFromPath("/portfolio"), "portfolio");
});

test("open issues redesign is isolated in Development", () => {
  assert.equal(isDevelopmentSectionViewName("open-issues-redesign"), true);
  assert.equal(writeProtectedViews.has("open-issues-redesign"), true);
  assert.equal(appPathForView("open-issues-redesign"), "/development/open-issues-redesign");
  assert.equal(appViewFromPath("/development/open-issues-redesign"), "open-issues-redesign");
  assert.equal(canViewAppView("open-issues-redesign", demoVisitor), true);
  assert.equal(canEditAppView("open-issues-redesign", demoVisitor), false);
});

test("public demo visitor only reads administration and development and edits everything else", () => {
  for (const view of ["admin-users", "admin-config", "resources", "portfolio-v2", "reports", "closed-projects"] as const) {
    assert.equal(canViewAppView(view, demoVisitor), true, `view ${view}`);
    assert.equal(canEditAppView(view, demoVisitor), false, `edit ${view}`);
  }
  for (const view of ["leave-schedule", "project-create", "project-structure", "portfolio"] as const) {
    assert.equal(canEditAppView(view, demoVisitor), true, `edit ${view}`);
  }
});

test("reports and the archive moved to Development, the leave schedule to Operations", () => {
  assert.equal(isDevelopmentSectionViewName("reports"), true);
  assert.equal(isDevelopmentSectionViewName("closed-projects"), true);
  assert.equal(isDevelopmentSectionViewName("leave-schedule"), false);
  assert.equal(isOperationsSectionViewName("leave-schedule"), true);
  assert.equal(appPathForView("reports"), "/development/reports");
  assert.equal(appPathForView("closed-projects"), "/development/archive");
  assert.equal(appPathForView("leave-schedule"), "/operations/leave-schedule");
  for (const [path, view] of [
    ["/reports", "reports"],
    ["/closed-projects", "closed-projects"],
    ["/closed", "closed-projects"],
    ["/development/leave-schedule", "leave-schedule"],
    ["/operations", "leave-schedule"],
  ] as const) {
    assert.equal(appViewFromPath(path), view, path);
  }
});

test("Operations is open to any signed-in user, Development only to administrators", () => {
  assert.equal(canViewAppView("leave-schedule", guest), false);
  assert.equal(canViewAppView("leave-schedule", projectManager), true);
  assert.equal(canEditAppView("leave-schedule", projectManager), true);
  assert.equal(canViewAppView("reports", projectManager), false);
  assert.equal(canViewAppView("closed-projects", projectManager), false);
  assert.equal(canViewAppView("reports", systemAdmin), true);
});

test("outside the demo the same sections stay behind their roles", () => {
  assert.equal(canViewAppView("admin-users", guest), false);
  assert.equal(canViewAppView("admin-users", projectManager), false);
  assert.equal(canViewAppView("resources", projectManager), false);
  assert.equal(canViewAppView("portfolio-v2", projectManager), false);

  assert.equal(canViewAppView("admin-projects", unitAdmin), true);
  assert.equal(canEditAppView("admin-projects", unitAdmin), true);
  assert.equal(canViewAppView("admin-users", unitAdmin), false);
  assert.equal(canViewAppView("resources", unitAdmin), false);

  assert.equal(canViewAppView("portfolio-v2", systemAdmin), true);
  assert.equal(canEditAppView("portfolio-v2", systemAdmin), true);
  assert.equal(canViewAppView("admin-users", systemAdmin), true);
});

test("public views stay open and project creation stays behind a session", () => {
  assert.equal(canViewAppView("portfolio", guest), true);
  assert.equal(canViewAppView("project-create", guest), false);
  assert.equal(canViewAppView("project-create", projectManager), true);
});
