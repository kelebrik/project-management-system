import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWbsColumnWidths } from "./wbsTable";

test("WBS column widths clamp any legacy Jira and MM widths", () => {
  const widths = normalizeWbsColumnWidths({
    jiraTicketUrl: 220,
    mattermostUrl: 260,
  });

  assert.equal(widths.jiraTicketUrl, 88);
  assert.equal(widths.mattermostUrl, 76);
});

test("WBS column widths preserve narrower Jira and MM columns", () => {
  const widths = normalizeWbsColumnWidths({
    jiraTicketUrl: 72,
    mattermostUrl: 68,
  });

  assert.equal(widths.jiraTicketUrl, 72);
  assert.equal(widths.mattermostUrl, 68);
});
