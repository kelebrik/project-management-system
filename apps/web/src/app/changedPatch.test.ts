import assert from "node:assert/strict";
import test from "node:test";
import { createChangedPatch } from "./changedPatch";

test("createChangedPatch returns only modified fields", () => {
  const patch = createChangedPatch(
    { title: "Новое", progress: 50, owner: "PM" },
    { title: "Старое", progress: 50, owner: "PM" },
  );

  assert.deepEqual(patch, { title: "Новое" });
});

test("createChangedPatch keeps explicitly required metadata", () => {
  const patch = createChangedPatch(
    { dueDate: "2026-07-20", scheduleDriver: "dates" },
    { dueDate: "2026-07-20", scheduleDriver: "dates" },
    new Set(["scheduleDriver"]),
  );

  assert.deepEqual(patch, { scheduleDriver: "dates" });
});
