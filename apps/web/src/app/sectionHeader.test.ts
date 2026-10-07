import assert from "node:assert/strict";
import test from "node:test";

import { viewSectionHeaders } from "./sectionHeader";

test("requests name the look-only section they come from", () => {
  assert.deepEqual(viewSectionHeaders("/admin/projects"), { "X-PMS-Section": "admin" });
  assert.deepEqual(viewSectionHeaders("/development/archive"), { "X-PMS-Section": "development" });
  // Reports moved into Development; My page moved out of it to the top bar.
  assert.deepEqual(viewSectionHeaders("/reports"), { "X-PMS-Section": "development" });
  assert.deepEqual(viewSectionHeaders("/development/reports"), { "X-PMS-Section": "development" });
  assert.deepEqual(viewSectionHeaders("/my-page"), {});
  assert.deepEqual(viewSectionHeaders("/development/my-page"), {});
  assert.deepEqual(viewSectionHeaders("/operations/leave-schedule"), {});
  assert.deepEqual(viewSectionHeaders("/TV-OVERVIEW/wbs"), {});
  assert.deepEqual(viewSectionHeaders(""), {});
});
