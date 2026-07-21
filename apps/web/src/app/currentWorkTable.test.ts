import assert from "node:assert/strict";
import test from "node:test";

import {
  currentWorkGridTemplate,
  currentWorkTableMinWidth,
  normalizeCurrentWorkColumnWidths,
} from "./currentWorkTable";

test("current work column widths restore saved values and defaults", () => {
  const widths = normalizeCurrentWorkColumnWidths({ workPackage: 135 });

  assert.equal(widths.workPackage, 135);
  assert.equal(widths.number, 76);
  assert.equal(widths.jira, 88);
});

test("current work column widths are clamped and form a stable grid", () => {
  const widths = normalizeCurrentWorkColumnWidths({ number: 10, comment: 900 });

  assert.equal(widths.number, 56);
  assert.equal(widths.comment, 760);
  assert.match(
    currentWorkGridTemplate(widths),
    /760px 88px 76px minmax\(0, 1fr\)$/,
  );
  assert.equal(
    currentWorkTableMinWidth(widths),
    Object.values(widths).reduce((sum, width) => sum + width, 0),
  );
});
