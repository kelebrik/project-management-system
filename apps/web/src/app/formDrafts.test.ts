import assert from "node:assert/strict";
import test from "node:test";
import { clearFormDraft, formDraftKey, isBlankForm, readFormDraft, writeFormDraft } from "./formDrafts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

test("a blank form is one whose typed fields are as in the blank one; the page's own fields do not count", () => {
  const blank = { name: "", summary: "", startDate: "2026-01-01", tags: [] as string[] };
  assert.equal(isBlankForm({ ...blank, startDate: "2026-10-17" }, blank, ["startDate"]), true);
  assert.equal(isBlankForm({ ...blank, name: "x" }, blank, ["startDate"]), false);
  assert.equal(isBlankForm({ ...blank, tags: ["a"] }, blank, ["startDate"]), false);
});

test("a draft is kept with the time it was kept at, read back, and cleared; a broken record reads as none", () => {
  const storage = memoryStorage();
  const key = formDraftKey("project", "user-1");
  assert.equal(key, "pms-draft:project:user-1");
  writeFormDraft(key, { name: "Банк" }, storage, new Date("2026-10-17T18:40:00.000Z"));
  assert.deepEqual(readFormDraft(key, storage), { value: { name: "Банк" }, savedAt: "2026-10-17T18:40:00.000Z" });
  storage.setItem(key, "{not json");
  assert.equal(readFormDraft(key, storage), null);
  storage.setItem(key, JSON.stringify({ value: 1 }));
  assert.equal(readFormDraft(key, storage), null);
  writeFormDraft(key, "text", storage);
  clearFormDraft(key, storage);
  assert.equal(readFormDraft(key, storage), null);
});
