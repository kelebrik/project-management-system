import assert from "node:assert/strict";
import test from "node:test";

import {
  appPathForView,
  appViewFromPath,
  canAccessAdminView,
  canEditAppView,
  canViewAppView,
  isDevelopmentSectionViewName,
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

test("public demo visitor may read administration and development but never edit them", () => {
  for (const view of ["admin-users", "admin-config", "resources", "portfolio-v2"] as const) {
    assert.equal(canViewAppView(view, demoVisitor), true, `view ${view}`);
    assert.equal(canEditAppView(view, demoVisitor), false, `edit ${view}`);
  }
  assert.equal(canEditAppView("project-create", demoVisitor), false);
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
  assert.equal(canViewAppView("reports", guest), true);
  assert.equal(canViewAppView("project-create", guest), false);
  assert.equal(canViewAppView("project-create", projectManager), true);
});
