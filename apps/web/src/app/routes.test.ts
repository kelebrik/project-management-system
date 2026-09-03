import assert from "node:assert/strict";
import test from "node:test";

import {
  appPathForView,
  appViewFromPath,
  canAccessAdminView,
  isDevelopmentSectionViewName,
  writeProtectedViews,
} from "./routes";

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

test("portfolio v2 belongs to the protected development section", () => {
  assert.equal(isDevelopmentSectionViewName("portfolio-v2"), true);
  assert.equal(writeProtectedViews.has("portfolio-v2"), true);
  assert.equal(appPathForView("portfolio-v2"), "/development/portfolio-v2");
  assert.equal(appViewFromPath("/development/portfolio-v2"), "portfolio-v2");
  assert.equal(appViewFromPath("/portfolio-v2"), "portfolio-v2");
});
