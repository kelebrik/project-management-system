import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWbsColumnWidths } from "./wbsTable";

test("WBS column widths clamp any legacy Jira and MM widths", () => {
  const widths = normalizeWbsColumnWidths({
    jiraTicketUrl: 220,
    mattermostUrl: 260,
  });

  assert.equal(widths.jiraTicketUrl, 120);
  assert.equal(widths.mattermostUrl, 140);
});

test("WBS column widths preserve narrower Jira and MM columns", () => {
  const widths = normalizeWbsColumnWidths({
    jiraTicketUrl: 100,
    mattermostUrl: 110,
  });

  assert.equal(widths.jiraTicketUrl, 100);
  assert.equal(widths.mattermostUrl, 110);
});
