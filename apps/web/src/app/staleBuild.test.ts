import assert from "node:assert/strict";
import test from "node:test";
import { isStaleBuildError, reloadForNewBuild } from "./staleBuild";

test("a file of the application that could not be loaded is told from other errors", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: https://x/assets/MyPagePage-abc.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Unable to preload CSS for /assets/x.css",
  ]) assert.equal(isStaleBuildError(new Error(message)), true, message);
  assert.equal(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'filter')")), false);
});

test("the tab reloads once for a newer build, not again and again", () => {
  let now = 1_000_000;
  let stored: string | null = null;
  let reloads = 0;
  const deps = { now: () => now, read: () => stored, write: (value: string) => (stored = value), reload: () => (reloads += 1) };
  assert.equal(reloadForNewBuild(deps), true);
  now += 5_000;
  // Failing again right after the reload is not a stale build: no second reload.
  assert.equal(reloadForNewBuild(deps), false);
  now += 60_000;
  assert.equal(reloadForNewBuild(deps), true);
  assert.equal(reloads, 2);
});

test("without a place to remember the reload, the tab does not reload at all", () => {
  let reloads = 0;
  let writes = 0;
  const reload = () => (reloads += 1);
  // Long after any reload, so only the storage can stop it.
  const now = () => 1_000_000;
  const refused = { now, read: () => { throw new Error("storage refused"); }, write: () => { throw new Error("storage refused"); }, reload };
  const notKept = { now, read: () => null, write: () => { writes += 1; }, reload };
  const writeRefused = { now, read: () => null, write: () => { writes += 1; throw new Error("quota"); }, reload };
  for (const deps of [refused, notKept, writeRefused]) {
    for (let attempt = 0; attempt < 3; attempt += 1) assert.equal(reloadForNewBuild(deps), false);
  }
  assert.equal(writes, 6, "the reload was tried to be remembered each time");
  assert.equal(reloads, 0);
});
