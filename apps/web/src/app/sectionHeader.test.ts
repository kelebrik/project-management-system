import assert from "node:assert/strict";
import test from "node:test";

import { viewSectionHeaders } from "./sectionHeader";

test("requests name the look-only section they come from", () => {
  assert.deepEqual(viewSectionHeaders("/admin/projects"), { "X-PMS-Section": "admin" });
  assert.deepEqual(viewSectionHeaders("/development/reports"), { "X-PMS-Section": "development" });
  assert.deepEqual(viewSectionHeaders("/reports"), { "X-PMS-Section": "development" });
  assert.deepEqual(viewSectionHeaders("/operations/leave-schedule"), {});
  assert.deepEqual(viewSectionHeaders("/TV-OVERVIEW/wbs"), {});
  assert.deepEqual(viewSectionHeaders(""), {});
});
