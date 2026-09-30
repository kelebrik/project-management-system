import assert from "node:assert/strict";
import test from "node:test";
import { filterDecisions, supersededBy, type Decision } from "./decisions";

const decision = (id: string, status: Decision["status"], extra: Partial<Decision> = {}): Decision => ({
  id,
  projectId: "p",
  title: id,
  context: "",
  decision: "",
  status,
  decidedBy: null,
  decidedAt: null,
  createdByName: null,
  approverUserId: null,
  approverName: null,
  requestedAt: null,
  approvalComment: null,
  answeredAt: null,
  issueId: null,
  raidItemId: null,
  wbsItemId: null,
  changeRequestId: null,
  supersedesId: null,
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...extra,
});

test("decisions waiting for an answer come first, and 'mine' keeps those I must answer", () => {
  const rows = [
    decision("a", "APPROVED", { updatedAt: "2026-10-03T00:00:00Z" }),
    decision("b", "PENDING_APPROVAL", { approverUserId: "u1" }),
    decision("c", "PROPOSED"),
    decision("d", "PENDING_APPROVAL", { approverUserId: "u2" }),
  ];
  assert.deepEqual(filterDecisions(rows, "all", "u1").map((row) => row.id), ["b", "d", "c", "a"]);
  assert.deepEqual(filterDecisions(rows, "mine", "u1").map((row) => row.id), ["b"]);
  assert.deepEqual(filterDecisions(rows, "APPROVED", "u1").map((row) => row.id), ["a"]);
  assert.equal(supersededBy([decision("x", "SUPERSEDED"), decision("y", "APPROVED", { supersedesId: "x" })], "x")?.id, "y");
});
