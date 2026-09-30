import assert from "node:assert/strict";
import test from "node:test";
import { daysOffSummary, linkLabel } from "./dateDrivers";

test("a link reads as its type with a signed lag", () => {
  assert.equal(linkLabel({ type: "FS", lagDays: 0 }), "FS");
  assert.equal(linkLabel({ type: "SS", lagDays: 2 }), "SS +2");
  assert.equal(linkLabel({ type: "FF", lagDays: -1 }), "FF −1");
});

test("days off split into weekends and the calendar's other days", () => {
  const summary = daysOffSummary({
    count: 45,
    weekends: 30,
    other: 15,
    listed: [
      { date: "2026-10-10", weekend: true, description: null },
      { date: "2026-10-11", weekend: true, description: null },
      { date: "2026-10-13", weekend: false, description: "Праздник" },
    ],
  });
  // Counts come from the server even when the list is cut.
  assert.equal(summary.weekends, 30);
  assert.equal(summary.other, 15);
  assert.deepEqual(summary.holidays.map((entry) => entry.date), ["2026-10-13"]);
});
