import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWbsColumnWidths } from "./wbsTable";

test("WBS column widths migrate legacy Jira and MM defaults", () => {
  const widths = normalizeWbsColumnWidths({
    jiraTicketUrl: 240,
    mattermostUrl: 280,
  });

  assert.equal(widths.jiraTicketUrl, 120);
  assert.equal(widths.mattermostUrl, 140);
});

test("WBS column widths preserve manually resized Jira and MM columns", () => {
  const widths = normalizeWbsColumnWidths({
    jiraTicketUrl: 180,
    mattermostUrl: 190,
  });

  assert.equal(widths.jiraTicketUrl, 180);
  assert.equal(widths.mattermostUrl, 190);
});
