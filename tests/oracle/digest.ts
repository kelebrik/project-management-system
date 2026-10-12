import { createHash } from "node:crypto";
import { calculateWbsCriticalPath } from "../../apps/api/src/services/wbs-critical-path/calculate.js";
import { calculateWbsScheduleUpdates } from "../../apps/api/src/services/wbs-schedule/calculate.js";
import { randomPlan } from "./random-plans.js";

// Prints a digest of the engine's answers on fixed plans; the time zone test
// runs it under several TZ values and expects one digest.

function outcome<T>(calculate: () => T) {
  try {
    return { value: calculate() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const hash = createHash("sha256");
for (let seed = 0; seed < 400; seed += 1) {
  const plan = randomPlan(seed);
  hash.update(JSON.stringify(outcome(() => calculateWbsScheduleUpdates(plan.items, plan.dependencies, plan.calendarOverrides, plan.options))));
  hash.update(JSON.stringify(outcome(() => calculateWbsCriticalPath(plan.items, plan.dependencies, plan.calendarOverrides, new Date("2026-10-12T00:00:00.000Z")))));
}
console.log(`DIGEST ${hash.digest("hex")}`);
