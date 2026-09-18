import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOpenIssueColumnWidths,
  normalizeOpenIssuesPrototypeColumnWidths,
  openIssueTableWidth,
  openIssuesPrototypeTableWidth,
} from "./openIssueTable";

test("open issue column widths preserve values and clamp unsafe sizes", () => {
  const widths = normalizeOpenIssueColumnWidths({
    task: 410,
    number: 5,
    status: 5_000,
    phase: 320,
  } as Record<string, number>);
  assert.equal(widths.task, 410);
  assert.equal(widths.number, 40);
  assert.equal(widths.status, 680);
  assert.equal(widths.owner, 128);
  assert.equal("phase" in widths, false);
  assert.ok(openIssueTableWidth(widths) > 0);
});

test("questions prototype keeps the status width unrestricted", () => {
  const widths = normalizeOpenIssuesPrototypeColumnWidths({
    status: 5_000,
    actions: 500,
  });
  assert.equal(widths.status, 5_000);
  assert.equal(widths.actions, 96);
  assert.ok(openIssuesPrototypeTableWidth(widths) > 5_000);
});
