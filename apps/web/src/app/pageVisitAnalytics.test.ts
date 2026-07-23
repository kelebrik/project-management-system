import assert from "node:assert/strict";
import test from "node:test";
import { attendanceChartBars } from "./pageVisitAnalytics";

test("attendance chart scales both visitor groups against the weekly maximum", () => {
  const bars = attendanceChartBars(
    [
      { date: "2026-07-22", authenticatedViews: 8, anonymousViews: 2, totalViews: 10 },
      { date: "2026-07-23", authenticatedViews: 3, anonymousViews: 5, totalViews: 8 },
    ],
    100,
  );

  assert.equal(bars[0]?.authenticatedHeight, 80);
  assert.equal(bars[0]?.anonymousHeight, 20);
  assert.equal(bars[1]?.authenticatedHeight, 30);
  assert.equal(bars[1]?.anonymousHeight, 50);
});

test("attendance chart keeps an empty week finite", () => {
  const [bar] = attendanceChartBars([
    { date: "2026-07-23", authenticatedViews: 0, anonymousViews: 0, totalViews: 0 },
  ]);
  assert.equal(bar?.authenticatedHeight, 0);
  assert.equal(bar?.anonymousHeight, 0);
});
