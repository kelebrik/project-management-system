import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { calculateCriticalPath, calculateHierarchyStatusUpdates, calculateScheduleUpdates, comparePlanCodes, dayNumber, plainDate } from "@pms/shared";
import { calculateWbsCriticalPath } from "../../apps/api/src/services/wbs-critical-path/calculate.js";
import { buildWbsRenumberPlan } from "../../apps/api/src/services/wbs-ordering.js";
import { resolveWbsSchedulePatch } from "../../apps/api/src/services/wbs-schedule-patch.js";
import { calculateWbsScheduleUpdates } from "../../apps/api/src/services/wbs-schedule/calculate.js";
import { calculateWbsCriticalPath as legacyCriticalPath } from "../oracle/legacy-engine/wbs-critical-path/calculate.js";
import { buildWbsRenumberPlan as legacyRenumberPlan } from "../oracle/legacy-engine/wbs-ordering.js";
import { resolveWbsSchedulePatch as legacySchedulePatch } from "../oracle/legacy-engine/wbs-schedule-patch.js";
import { calculateWbsScheduleUpdates as legacyScheduleUpdates } from "../oracle/legacy-engine/wbs-schedule/calculate.js";
import { calculateWbsHierarchyStatusUpdates as legacyStatusUpdates } from "../oracle/legacy-engine/statuses.js";
import { random, randomPlan } from "../oracle/random-plans.js";

// The shared engine must give exactly what the engine before it gave, on
// thousands of random plans; the old engine is kept in tests/oracle.

// The old engine takes about 0.1 s a plan; PMS_ORACLE_PLANS=3000 runs the full comparison.
const PLANS = Number(process.env.PMS_ORACLE_PLANS ?? 150);

function outcome<T>(calculate: () => T) {
  try {
    return { value: calculate() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

test("the shared schedule gives the old engine's updates on random plans", () => {
  for (let seed = 0; seed < PLANS; seed += 1) {
    const plan = randomPlan(seed);
    assert.deepEqual(
      outcome(() => calculateWbsScheduleUpdates(plan.items, plan.dependencies, plan.calendarOverrides, plan.options)),
      outcome(() => legacyScheduleUpdates(plan.items, plan.dependencies, plan.calendarOverrides, plan.options)),
      `plan ${seed}`,
    );
  }
});

test("the shared schedule gives the old engine's updates after a recalculation settled", () => {
  for (let seed = 0; seed < PLANS / 2; seed += 1) {
    const plan = randomPlan(seed);
    const settled = outcome(() => legacyScheduleUpdates(plan.items, plan.dependencies, plan.calendarOverrides, {}));
    if (!("value" in settled)) continue;
    const byId = new Map(settled.value.map((update) => [update.id, update]));
    const items = plan.items.map((item) => ({ ...item, ...byId.get(item.id) }));
    assert.deepEqual(
      outcome(() => calculateWbsScheduleUpdates(items, plan.dependencies, plan.calendarOverrides, plan.options)),
      outcome(() => legacyScheduleUpdates(items, plan.dependencies, plan.calendarOverrides, plan.options)),
      `plan ${seed}`,
    );
  }
});

test("the shared critical path is the old one on random plans", () => {
  for (let seed = 0; seed < PLANS; seed += 1) {
    const plan = randomPlan(seed);
    assert.deepEqual(
      outcome(() => calculateWbsCriticalPath(plan.items, plan.dependencies, plan.calendarOverrides)),
      outcome(() => legacyCriticalPath(plan.items, plan.dependencies, plan.calendarOverrides)),
      `plan ${seed}`,
    );
  }
});

test("the shared renumbering and status rollup are the old ones on random plans", () => {
  for (let seed = 0; seed < PLANS; seed += 1) {
    const plan = randomPlan(seed);
    assert.deepEqual(buildWbsRenumberPlan(plan.items, plan.dependencies), legacyRenumberPlan(plan.items, plan.dependencies), `plan ${seed}`);
    assert.deepEqual(calculateHierarchyStatusUpdates(plan.items), legacyStatusUpdates(plan.items), `plan ${seed}`);
  }
});

test("a row edit changes the same schedule fields as before", () => {
  const next = random(7);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const date = () => pick([undefined, null, "", "2026-03-02", "2026-03-02T21:30:00.000Z", "2026-03-03", "nonsense", new Date("2026-03-02T00:00:00.000Z"), new Date("2026-03-03T10:00:00.000Z")]);
  const day = () => pick([null, new Date("2026-03-02T00:00:00.000Z"), new Date("2026-03-03T00:00:00.000Z")]);
  const predecessor = () => pick([undefined, null, "", "1.1", "1.2"]);
  for (let index = 0; index < 20_000; index += 1) {
    const patch = {
      scheduleDriver: pick([undefined, "dates", "workDays"] as const),
      startDate: date(),
      dueDate: date(),
      forecastStartDate: date(),
      forecastDueDate: date(),
      predecessor1: predecessor(),
      predecessor3: predecessor(),
      leadLagDays: pick([undefined, 0, 2]),
      workDays: pick([undefined, null, 3, 5]),
      calendarDays: pick([undefined, null, 4, 7]),
      calendarCode: pick([undefined, "RU", "RU_CN"] as const),
    };
    const existing = {
      startDate: day(),
      dueDate: day(),
      forecastStartDate: pick([undefined, null, new Date("2026-03-02T00:00:00.000Z")]),
      forecastDueDate: pick([undefined, null, new Date("2026-03-03T00:00:00.000Z")]),
      predecessor1: pick([null, "1.1"]),
      predecessor2: null,
      predecessor3: pick([null, "1.2"]),
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: pick([0, 2]),
      workDays: pick([null, 3]),
      calendarDays: pick([null, 4]),
      calendarCode: pick(["RU", "CN"] as const),
    };
    assert.deepEqual(resolveWbsSchedulePatch(patch, existing), legacySchedulePatch(patch, existing), JSON.stringify({ patch, existing }));
  }
});

test("plan codes of digits and dots sort as the Russian collation sorts them", () => {
  const next = random(11);
  const code = () => {
    const parts = 1 + Math.floor(next() * 5);
    return Array.from({ length: parts }, () => String(Math.floor(next() * (next() < 0.5 ? 10 : 130)))).join(".") + (next() < 0.02 ? "." : "");
  };
  for (let index = 0; index < 100_000; index += 1) {
    const left = code();
    const right = next() < 0.1 ? left : code();
    assert.equal(Math.sign(comparePlanCodes(left, right)), Math.sign(left.localeCompare(right, "ru")), `${left} ${right}`);
  }
});

test("calendar days count as Date counts them across centuries", () => {
  for (let day = -200_000; day <= 200_000; day += 1) {
    const iso = new Date(day * 86_400_000).toISOString().slice(0, 10);
    assert.equal(plainDate(day), iso);
    assert.equal(dayNumber(iso), day);
  }
  assert.throws(() => dayNumber("2026-02-29"));
  assert.throws(() => dayNumber("2026-13-01"));
  assert.equal(dayNumber("2028-02-29"), Date.UTC(2028, 1, 29) / 86_400_000);
});

test("day zero, a plan without dates and codes that are not numbers", () => {
  const row = { code: "1", type: "TASK" as const, predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null, leadLagDays: 0, calendarDays: null, calendarCode: "RU" as const, sortOrder: 0 };
  // 1970-01-01 is a Thursday and day number 0: three working days end on Monday.
  assert.deepEqual(calculateScheduleUpdates([{ ...row, id: "a", startDate: "1970-01-01", dueDate: null, workDays: 3 }], [], []), [
    { id: "a", startDate: "1970-01-01", dueDate: "1970-01-05", forecastStartDate: "1970-01-01", forecastDueDate: "1970-01-05", workDays: 3, calendarDays: 5 },
  ]);
  const path = calculateCriticalPath([{ ...row, id: "a", title: "A", startDate: null, dueDate: null, workDays: 2 }], [], [], "2026-10-16");
  assert.equal(path.projectStartDate, "2026-10-16");
  assert.equal(path.projectFinishDate, "2026-10-19");
  for (const [left, right] of [["1.a", "1.b"], ["X1", "1"], ["1", "1-1"], ["Б.1", "А.2"], ["1.A", "1.a"], ["", "1"]]) {
    assert.equal(Math.sign(comparePlanCodes(left!, right!)), Math.sign(left!.localeCompare(right!, "ru")), `${left} ${right}`);
  }
});

test("the engine answers the same in every server time zone", () => {
  const script = fileURLToPath(new URL("../oracle/digest.ts", import.meta.url));
  const digests = ["UTC", "Europe/Moscow", "America/New_York", "Asia/Kamchatka"].map((zone) => {
    const output = execFileSync(process.execPath, ["--import", "tsx", script], { env: { ...process.env, TZ: zone }, encoding: "utf8" });
    return /DIGEST (\w+)/.exec(output)?.[1];
  });
  assert.ok(digests[0]);
  assert.equal(new Set(digests).size, 1, digests.join(" "));
});
