import assert from "node:assert/strict";
import test from "node:test";
import { allocationLoad, allocationsInWindow, type WorkloadAllocation } from "./workloadAllocations";

const share = (percent: number, startsOn: string, endsOn: string | null, code = "A"): WorkloadAllocation => ({
  id: `${code}-${startsOn}`,
  employeeId: "e1",
  project: { id: code, code, name: code },
  percent,
  startsOn,
  endsOn,
  editable: true,
});

// 2026-10-05 is a Monday.
const week = { from: "2026-10-05", to: "2026-10-11" };

test("shares above the capacity on working days are overload, weekends are skipped", () => {
  const load = allocationLoad([share(60, "2026-10-01", null), share(50, "2026-10-07", "2026-10-20", "B")], [], 100, week, new Map());
  assert.equal(load.peak, 110);
  assert.equal(load.overloadDays, 3);
  assert.deepEqual(load.overloads, [{ from: "2026-10-07", to: "2026-10-09" }]);
});

test("a lower capacity, a holiday and a leave change what counts", () => {
  const overrides = new Map([["2026-10-06", { date: "2026-10-06", isWorkingDay: false, description: "" }]]);
  const leave = { id: "l", employeeId: "e1", typeId: "t", startDate: "2026-10-08", endDate: "2026-10-08" };
  const load = allocationLoad([share(60, "2026-10-01", null)], [leave], 50, week, overrides);
  assert.equal(load.overloadDays, 3);
  // The holiday, a day off, does not break the stretch; the leave does.
  assert.deepEqual(load.overloads, [{ from: "2026-10-05", to: "2026-10-07" }, { from: "2026-10-09", to: "2026-10-09" }]);
});

test("without shares nothing is counted, and shares outside the window are left out", () => {
  assert.deepEqual(allocationLoad([], [], 100, week, new Map()), { peak: 0, hiddenPeak: 0, overloadDays: 0, overloads: [] });
  const hidden = { ...share(30, "2026-10-01", null), id: null, project: null };
  assert.equal(allocationLoad([hidden, { ...hidden, percent: 20, startsOn: "2026-10-09" }, share(40, "2026-10-01", null, "B")], [], 100, week, new Map()).hiddenPeak, 50);
  const listed = allocationsInWindow([hidden, share(20, "2026-09-01", "2026-09-30", "C"), share(40, "2026-10-10", null, "B")], week);
  assert.deepEqual(listed.map((allocation) => allocation.project?.code ?? null), ["B", null]);
});
