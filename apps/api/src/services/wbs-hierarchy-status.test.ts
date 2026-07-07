import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsHierarchyStatusUpdates } from "./wbs.js";

test("calculateWbsHierarchyStatusUpdates moves phase and package to in progress when a child task starts", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "NOT_STARTED",
    },
    {
      id: "package",
      parentId: "phase",
      type: "WORK_PACKAGE",
      status: "NOT_STARTED",
    },
    {
      id: "task",
      parentId: "package",
      type: "TASK",
      status: "IN_PROGRESS",
    },
  ]);

  assert.deepEqual(updates, [
    { id: "phase", status: "IN_PROGRESS" },
    { id: "package", status: "IN_PROGRESS" },
  ]);
});

test("calculateWbsHierarchyStatusUpdates prioritizes at risk over in progress", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "IN_PROGRESS",
    },
    {
      id: "package",
      parentId: "phase",
      type: "WORK_PACKAGE",
      status: "IN_PROGRESS",
    },
    {
      id: "task-a",
      parentId: "package",
      type: "TASK",
      status: "IN_PROGRESS",
    },
    {
      id: "task-b",
      parentId: "package",
      type: "TASK",
      status: "AT_RISK",
    },
  ]);

  assert.deepEqual(updates, [
    { id: "phase", status: "AT_RISK" },
    { id: "package", status: "AT_RISK" },
  ]);
});

test("calculateWbsHierarchyStatusUpdates rolls up in review tasks", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "NOT_STARTED",
    },
    {
      id: "task",
      parentId: "phase",
      type: "TASK",
      status: "IN_REVIEW",
    },
  ]);

  assert.deepEqual(updates, [{ id: "phase", status: "IN_REVIEW" }]);
});

test("calculateWbsHierarchyStatusUpdates reads nested task status through deliverables", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "NOT_STARTED",
    },
    {
      id: "package",
      parentId: "phase",
      type: "WORK_PACKAGE",
      status: "NOT_STARTED",
    },
    {
      id: "deliverable",
      parentId: "package",
      type: "DELIVERABLE",
      status: "NOT_STARTED",
    },
    {
      id: "task",
      parentId: "deliverable",
      type: "TASK",
      status: "AT_RISK",
    },
  ]);

  assert.deepEqual(updates, [
    { id: "phase", status: "AT_RISK" },
    { id: "package", status: "AT_RISK" },
  ]);
});

test("calculateWbsHierarchyStatusUpdates completes package when all child tasks are done", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "IN_PROGRESS",
    },
    {
      id: "package",
      parentId: "phase",
      type: "WORK_PACKAGE",
      status: "IN_PROGRESS",
    },
    {
      id: "task-a",
      parentId: "package",
      type: "TASK",
      status: "DONE",
    },
    {
      id: "task-b",
      parentId: "package",
      type: "TASK",
      status: "DONE",
    },
  ]);

  assert.deepEqual(updates, [
    { id: "phase", status: "DONE" },
    { id: "package", status: "DONE" },
  ]);
});

test("calculateWbsHierarchyStatusUpdates completes phase when all work packages are done", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "IN_PROGRESS",
    },
    {
      id: "package-a",
      parentId: "phase",
      type: "WORK_PACKAGE",
      status: "DONE",
    },
    {
      id: "package-b",
      parentId: "phase",
      type: "WORK_PACKAGE",
      status: "DONE",
    },
  ]);

  assert.deepEqual(updates, [{ id: "phase", status: "DONE" }]);
});

test("calculateWbsHierarchyStatusUpdates keeps mixed done and not started parent in progress", () => {
  const updates = calculateWbsHierarchyStatusUpdates([
    {
      id: "phase",
      parentId: null,
      type: "PHASE",
      status: "NOT_STARTED",
    },
    {
      id: "task-a",
      parentId: "phase",
      type: "TASK",
      status: "DONE",
    },
    {
      id: "task-b",
      parentId: "phase",
      type: "TASK",
      status: "NOT_STARTED",
    },
  ]);

  assert.deepEqual(updates, [{ id: "phase", status: "IN_PROGRESS" }]);
});
