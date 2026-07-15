import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_UNIT_SELECTION_STORAGE_KEY,
  BUSINESS_UNIT_STORAGE_KEY,
  readBusinessUnitSelection,
  storeBusinessUnitSelection,
} from "./businessUnitContext";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("business unit selection cache stores matching id and name", () => {
  const storage = memoryStorage();
  storeBusinessUnitSelection(storage, { id: "bu-1", name: "SberDevices" });
  assert.deepEqual(readBusinessUnitSelection(storage), {
    id: "bu-1",
    name: "SberDevices",
  });
});

test("business unit selection cache rejects corrupt or stale values", () => {
  const corrupt = memoryStorage({
    [BUSINESS_UNIT_STORAGE_KEY]: "bu-1",
    [BUSINESS_UNIT_SELECTION_STORAGE_KEY]: "not-json",
  });
  assert.equal(readBusinessUnitSelection(corrupt), null);

  const stale = memoryStorage({
    [BUSINESS_UNIT_STORAGE_KEY]: "bu-2",
    [BUSINESS_UNIT_SELECTION_STORAGE_KEY]: JSON.stringify({
      id: "bu-1",
      name: "Old unit",
    }),
  });
  assert.equal(readBusinessUnitSelection(stale), null);
});
