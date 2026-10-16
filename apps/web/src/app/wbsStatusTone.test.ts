import assert from "node:assert/strict";
import test from "node:test";
import type { WbsTreeItem } from "./domainTypes";
import { summaryToneClass, wbsStatusToneClass, wbsToneClass } from "./wbsTree";

const past = "2020-01-01";
const future = "2999-01-01";

test("a status cell is coloured by the status written in it: never overdue, never its children's", () => {
  assert.deepEqual(
    (["DONE", "IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED", "NOT_STARTED", "CANCELLED"] as const).map(wbsStatusToneClass),
    ["tone-g", "tone-b", "tone-rv", "tone-ar", "tone-r", "tone-x", "tone-c"],
  );
  // The bar of overdue work under way turns overdue; its status cell stays «in progress».
  assert.equal(wbsToneClass({ status: "IN_PROGRESS", dueDate: past, type: "TASK" }), "tone-p");
  assert.equal(wbsStatusToneClass("IN_PROGRESS"), "tone-b");
});

test("each status has its own tone: review apart from work, at risk apart from failed, cancelled apart from not started", () => {
  const work = (status: string, due = future) => ({ status: status as WbsTreeItem["status"], dueDate: due, type: "TASK" as const });
  assert.deepEqual(
    ["DONE", "IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED", "NOT_STARTED", "CANCELLED"].map((status) => wbsToneClass(work(status))),
    ["tone-g", "tone-b", "tone-rv", "tone-ar", "tone-r", "tone-x", "tone-c"],
  );
  // Overdue shows over work not done; cancelled work is never overdue.
  assert.equal(wbsToneClass(work("IN_REVIEW", past)), "tone-p");
  assert.equal(wbsToneClass(work("NOT_STARTED", past)), "tone-p");
  assert.equal(wbsToneClass(work("CANCELLED", past)), "tone-c");
  assert.equal(wbsToneClass(work("AT_RISK", past)), "tone-ar");
  assert.equal(wbsToneClass({ ...work("DONE"), type: "MILESTONE" }), "tone-o");
});

test("a parent's tone: work under way first, then review, then failed, then at risk", () => {
  const child = (status: string) => ({ status, dueDate: `${future}T00:00:00.000Z`, children: [] }) as unknown as WbsTreeItem;
  const parent = (...statuses: string[]) => ({ status: "NOT_STARTED" as const, dueDate: `${future}T00:00:00.000Z`, children: statuses.map(child) });
  const tone = (...statuses: string[]) => summaryToneClass(parent(...statuses) as unknown as WbsTreeItem);
  assert.equal(tone("IN_REVIEW", "IN_PROGRESS"), "tone-b");
  assert.equal(tone("IN_REVIEW", "BLOCKED"), "tone-rv");
  assert.equal(tone("AT_RISK", "BLOCKED"), "tone-r");
  assert.equal(tone("AT_RISK", "NOT_STARTED"), "tone-ar");
  assert.equal(tone("CANCELLED", "NOT_STARTED"), "tone-x");
});
