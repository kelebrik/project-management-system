import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOpenIssueColumnWidths,
  openIssueTableWidth,
} from "./openIssueTable";

test("open issue column widths preserve values and clamp unsafe sizes", () => {
  const widths = normalizeOpenIssueColumnWidths({
    task: 410,
    number: 5,
    status: 5_000,
    phase: 320,
  } as Record<string, number>);
  assert.equal(widths.task, 410);
  assert.equal(widths.number, 44);
  assert.equal(widths.status, 680);
  assert.equal("phase" in widths, false);
  assert.ok(openIssueTableWidth(widths) > 0);
});
