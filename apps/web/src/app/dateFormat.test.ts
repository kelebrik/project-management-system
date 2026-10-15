import assert from "node:assert/strict";
import test from "node:test";
import { dateFormatter } from "./dateFormat";

const day = Date.UTC(2026, 9, 15, 10, 30);
const ru = (options: Intl.DateTimeFormatOptions) => dateFormatter("ru-RU", { ...options, timeZone: "UTC" }).format(day);

test("a month written next to a year has no «г.» after it in Russian", () => {
  assert.equal(ru({ month: "short", year: "numeric" }), "окт. 2026");
  assert.equal(ru({ month: "long", year: "numeric" }), "октябрь 2026");
  assert.equal(ru({ month: "short", year: "2-digit" }), "окт. 26");
  assert.equal(ru({ day: "numeric", month: "short", year: "numeric" }), "15 окт. 2026");
  assert.equal(ru({ day: "numeric", month: "long", year: "numeric", weekday: "long" }), "четверг, 15 октября 2026");
  // With the time after it, only the mark goes.
  assert.equal(ru({ day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), "15 окт. 2026, 10:30");
  // Dates in numbers and English were never marked and stay as they were.
  assert.equal(ru({ day: "2-digit", month: "2-digit", year: "numeric" }), "15.10.2026");
  assert.equal(dateFormatter("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(day), "Oct 2026");
});
