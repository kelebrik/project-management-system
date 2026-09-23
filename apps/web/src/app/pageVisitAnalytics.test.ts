import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "../i18n/translate";
import { attendanceChartBars, visitPageTitle, visitorDisplayName } from "./pageVisitAnalytics";

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

test("visitor names and page titles follow the interface language", () => {
  const en = createTranslator("en");
  const guest = { visitorKey: "anonymous:2c59d1ffee", kind: "ANONYMOUS" as const, displayName: "Гость 2C59D1" };
  assert.equal(visitorDisplayName(guest, en), "Guest 2C59D1");
  assert.equal(visitorDisplayName(guest, createTranslator("ru")), "Гость 2C59D1");
  assert.equal(
    visitorDisplayName({ visitorKey: "user:deleted:unknown", kind: "USER", displayName: "Удаленный пользователь" }, en),
    "Deleted user",
  );
  assert.equal(visitorDisplayName({ visitorKey: "user:u-1", kind: "USER", displayName: "Иван" }, en), "Иван");
  assert.equal(visitPageTitle({ pageKey: "admin-audit", pageTitle: "Журнал аудита" }, "en"), "Audit log");
  assert.equal(visitPageTitle({ pageKey: "unknown-page", pageTitle: "unknown-page" }, "en"), "unknown-page");
});
