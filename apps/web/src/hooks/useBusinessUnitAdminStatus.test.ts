import assert from "node:assert/strict";
import test from "node:test";

import { isBusinessUnitAdminForSelectedUnit } from "./useBusinessUnitAdminStatus";

test("selected business unit grants administration only for an assigned unit", () => {
  assert.equal(isBusinessUnitAdminForSelectedUnit(["bu-a"], "bu-a"), true);
  assert.equal(isBusinessUnitAdminForSelectedUnit(["bu-a"], "bu-b"), false);
  assert.equal(isBusinessUnitAdminForSelectedUnit(["bu-a"], null), false);
});

test("a valid non-admin business unit remains an ordinary selection", () => {
  const selectedBusinessUnitId = "bu-visible-to-everyone";
  assert.equal(
    isBusinessUnitAdminForSelectedUnit(["bu-administered"], selectedBusinessUnitId),
    false,
  );
  assert.equal(selectedBusinessUnitId, "bu-visible-to-everyone");
});
