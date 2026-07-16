import assert from "node:assert/strict";
import test from "node:test";

import {
  businessUnitForProjectCreation,
  projectCreationBusinessUnitMessage,
} from "../app/projectCreation";

const units = [
  { id: "main", name: "Main", isDefault: true },
  { id: "selected", name: "Selected", isDefault: false },
];

test("project creation uses the selected business unit before the default", () => {
  assert.equal(businessUnitForProjectCreation(units, "selected")?.id, "selected");
  assert.equal(businessUnitForProjectCreation(units, "missing")?.id, "main");
});

test("project creation confirmation names the fixed business unit", () => {
  assert.match(projectCreationBusinessUnitMessage("SberDevices"), /«SberDevices»/);
});
