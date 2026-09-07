import assert from "node:assert/strict";
import test from "node:test";
import { pickDefaultProject } from "./defaultProject";

const project = (id: string, count?: number, status = "ACTIVE", visibleCount = 1) => ({
  id, status, _count: { wbsItems: count }, wbsItems: Array(visibleCount).fill(null),
});

test("ranks by complete WBS count and excludes closed projects when open projects exist", () => {
  const projects = [project("small", 5, "ACTIVE", 5), project("large", 20), project("closed", 100, "CLOSED")];
  assert.equal(pickDefaultProject(projects)?.id, "large");
  assert.deepEqual(projects.map(({ id }) => id), ["small", "large", "closed"]);
});

test("keeps registry order for equal and zero counts", () => {
  assert.equal(pickDefaultProject([project("first", 5), project("second", 5)])?.id, "first");
  assert.equal(pickDefaultProject([project("first", 0), project("second", 0, "ACTIVE", 10)])?.id, "first");
});

test("handles an empty registry and a registry containing only closed projects", () => {
  assert.equal(pickDefaultProject([]), undefined);
  assert.equal(pickDefaultProject([project("small", 2, "CLOSED"), project("large", 8, "CLOSED")])?.id, "large");
});

test("supports older API counts without treating an explicit zero as missing", () => {
  assert.equal(pickDefaultProject([project("legacy", undefined, "ACTIVE", 4), project("new", 10)])?.id, "new");
  assert.equal(pickDefaultProject([project("zero", 0, "ACTIVE", 10), project("legacy", undefined, "ACTIVE", 4)])?.id, "legacy");
});
