import assert from "node:assert/strict";
import test from "node:test";

import { shouldNotifyJiraProjectionRefresh } from "./jiraCurrentFreshness";

test("projection refresh notification ignores initial data and catches null-to-value fill", () => {
  const refreshedAt = "2026-09-03T10:00:00.000Z";
  assert.equal(shouldNotifyJiraProjectionRefresh(false, null, null), false);
  assert.equal(shouldNotifyJiraProjectionRefresh(false, null, refreshedAt), false);
  assert.equal(shouldNotifyJiraProjectionRefresh(true, null, refreshedAt), true);
  assert.equal(shouldNotifyJiraProjectionRefresh(true, refreshedAt, refreshedAt), false);
});
