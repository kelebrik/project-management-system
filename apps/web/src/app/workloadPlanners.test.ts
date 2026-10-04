import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WORKLOAD_FILTERS, plannerConfig, plannerHorizon, readWorkloadFilters } from "./workloadPlanners";

test("saved filters are read whatever shape they arrive in, keeping only what still exists", () => {
  assert.deepEqual(readWorkloadFilters(null), DEFAULT_WORKLOAD_FILTERS);
  assert.deepEqual(readWorkloadFilters("garbage"), DEFAULT_WORKLOAD_FILTERS);
  const read = readWorkloadFilters(
    { search: "Ив", projectIds: ["p1", "gone", "p1", 7], people: ["иванов", "петров"], overlapsOnly: true, overloadedOnly: true, grouped: "yes", showIdle: true, sort: { key: "overlap", direction: "desc" }, extra: 1 },
    { projectIds: new Set(["p1"]), people: new Set(["иванов"]) },
  );
  assert.deepEqual(read, {
    search: "Ив",
    projectIds: ["p1"],
    people: ["иванов"],
    overlapsOnly: true,
    overloadedOnly: true,
    grouped: false,
    showIdle: true,
    sort: { key: "overlap", direction: "desc" },
  });
  assert.equal(readWorkloadFilters({ sort: { key: "drop table", direction: "sideways" } }).sort.key, "name");
});

test("a planner keeps the horizon, and only a known one comes back", () => {
  const config = plannerConfig(DEFAULT_WORKLOAD_FILTERS, 6);
  assert.equal(config.version, 1);
  assert.equal(plannerHorizon(config), 6);
  assert.equal(plannerHorizon({ horizon: 5 }), null);
});
