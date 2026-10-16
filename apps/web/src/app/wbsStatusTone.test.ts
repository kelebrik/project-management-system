import assert from "node:assert/strict";
import test from "node:test";
import type { WbsTreeItem } from "./domainTypes";
import { wbsStatusToneClass, wbsToneClass } from "./wbsTree";

const past = "2020-01-01";
const future = "2999-01-01";

test("a status cell takes the colour of the row's bar, for the status and due date it shows", () => {
  const task = { status: "NOT_STARTED" as const, dueDate: `${future}T00:00:00.000Z` };
  assert.equal(wbsStatusToneClass(task, { status: "DONE", dueDate: future }), "tone-g");
  assert.equal(wbsStatusToneClass(task, { status: "BLOCKED", dueDate: future }), "tone-r");
  assert.equal(wbsStatusToneClass(task, { status: "IN_PROGRESS", dueDate: future }), "tone-b");
  assert.equal(wbsStatusToneClass(task, { status: "NOT_STARTED", dueDate: future }), "tone-x");
  // Overdue by the date shown, not the one saved.
  assert.equal(wbsStatusToneClass(task, { status: "IN_PROGRESS", dueDate: past }), "tone-p");
  assert.equal(wbsStatusToneClass(task, { status: "IN_PROGRESS", dueDate: "" }), "tone-b");
  // The same as the bar of plain work.
  assert.equal(wbsStatusToneClass(task, task), wbsToneClass({ ...task, type: "TASK" }));
});

test("a milestone's cell is coloured as work with its status; a parent's as its summary bar", () => {
  const milestone = { status: "DONE" as const, dueDate: null, type: "MILESTONE" };
  assert.equal(wbsStatusToneClass(milestone, { status: "DONE", dueDate: future }), "tone-g");
  const child = { status: "IN_PROGRESS", dueDate: `${future}T00:00:00.000Z`, children: [] } as unknown as WbsTreeItem;
  const parent = { status: "NOT_STARTED" as const, dueDate: `${future}T00:00:00.000Z`, children: [child] };
  assert.equal(wbsStatusToneClass(parent, { status: "NOT_STARTED", dueDate: future }), "tone-b");
  const doneParent = { ...parent, children: [{ ...child, status: "DONE" } as WbsTreeItem] };
  assert.equal(wbsStatusToneClass(doneParent, { status: "NOT_STARTED", dueDate: future }), "tone-g");
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
  const tone = (...statuses: string[]) => wbsStatusToneClass(parent(...statuses), { status: "NOT_STARTED", dueDate: future });
  assert.equal(tone("IN_REVIEW", "IN_PROGRESS"), "tone-b");
  assert.equal(tone("IN_REVIEW", "BLOCKED"), "tone-rv");
  assert.equal(tone("AT_RISK", "BLOCKED"), "tone-r");
  assert.equal(tone("AT_RISK", "NOT_STARTED"), "tone-ar");
  assert.equal(tone("CANCELLED", "NOT_STARTED"), "tone-x");
});
