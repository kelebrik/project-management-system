import assert from "node:assert/strict";
import test from "node:test";
import { newProjectFormDefaults } from "./formState";

test("a new project runs from today for three months, with no made-up names", () => {
  const form = newProjectFormDefaults(new Date(2026, 9, 3));
  assert.equal(form.startDate, "2026-10-03");
  assert.equal(form.targetDate, "2027-01-03");
  assert.equal(form.name, "");
  assert.equal(form.code, "");
  assert.equal(form.sponsor, "");
  assert.equal(form.projectManager, "");
  assert.equal(form.summary, "");
});

test("three months from the 30th of November end on the last day of February", () => {
  assert.equal(newProjectFormDefaults(new Date(2026, 10, 30)).targetDate, "2027-02-28");
  assert.equal(newProjectFormDefaults(new Date(2027, 10, 30)).targetDate, "2028-02-29");
});
