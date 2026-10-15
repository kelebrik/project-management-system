import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectDetails, ProjectListItem } from "./domainTypes";
import { syncProjectListEntry } from "./projectListSync";

const row = (id: string, type: string, status: string, dueDate: string | null) => ({ id, type, status, dueDate, forecastDueDate: dueDate });

test("the open project's list entry takes its rows, its last goal as target and its last date", () => {
  const stale = { id: "p1", targetDate: "2026-12-01T00:00:00.000Z", structureEndDate: "2026-12-01", wbsItems: [] } as unknown as ProjectListItem;
  const other = { id: "p2", targetDate: "2027-01-01T00:00:00.000Z", structureEndDate: null, wbsItems: [] } as unknown as ProjectListItem;
  const project = {
    id: "p1",
    wbsItems: [
      row("phase", "PHASE", "NOT_STARTED", "2027-03-01T00:00:00.000Z"),
      row("g1", "GOAL", "DONE", "2027-01-10T00:00:00.000Z"),
      row("g2", "GOAL", "CANCELLED", "2027-05-01T00:00:00.000Z"),
      row("g3", "GOAL", "NOT_STARTED", "2026-12-20T00:00:00.000Z"),
      row("t1", "TASK", "IN_PROGRESS", "2027-02-01T00:00:00.000Z"),
    ],
  } as unknown as ProjectDetails;

  const [synced, untouched] = syncProjectListEntry([stale, other], project);
  assert.equal(synced!.targetDate, "2027-01-10T00:00:00.000Z");
  assert.equal(synced!.structureEndDate, "2027-03-01");
  assert.deepEqual(synced!.wbsItems.map((item) => item.id), ["g1", "g2", "g3", "t1"]);
  assert.equal(untouched, other);

  // Without goals the entry keeps its own target.
  const [bare] = syncProjectListEntry([stale], { id: "p1", wbsItems: [row("t1", "TASK", "NOT_STARTED", "2027-02-01T00:00:00.000Z")] } as unknown as ProjectDetails);
  assert.equal(bare!.targetDate, "2026-12-01T00:00:00.000Z");
  // A project not in the list leaves it as it is.
  const list = [other];
  assert.equal(syncProjectListEntry(list, project), list);
});
