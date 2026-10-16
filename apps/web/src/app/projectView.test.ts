import assert from "node:assert/strict";
import test from "node:test";

test("the demo keeps the Structure layout the same in every project, and the hierarchy level per project", async () => {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
  const { PUBLIC_DEMO_USER_ID } = await import("@pms/shared");
  const { effectiveProjectView, writeDemoView } = await import("./projectView");

  writeDemoView("a", { wbsHiddenColumns: ["comment"], wbsColumnWidths: { owner: 240 }, wbsHierarchyLevel: 2 });
  writeDemoView("b", { wbsHierarchyLevel: 4, sidebarCollapsed: true });
  const viewOf = (id: string) => effectiveProjectView({ id, uiState: { wbsHiddenColumns: ["owner"] } }, PUBLIC_DEMO_USER_ID);

  assert.deepEqual(viewOf("a"), { wbsHiddenColumns: ["comment"], wbsColumnWidths: { owner: 240 }, wbsHierarchyLevel: 2, sidebarCollapsed: true });
  assert.deepEqual(viewOf("b"), { wbsHiddenColumns: ["comment"], wbsColumnWidths: { owner: 240 }, wbsHierarchyLevel: 4, sidebarCollapsed: true });
  // A project never opened takes the layout too; empty values are kept as set.
  writeDemoView("a", { wbsHiddenColumns: [] });
  assert.deepEqual(viewOf("c"), { wbsHiddenColumns: [], wbsColumnWidths: { owner: 240 }, sidebarCollapsed: true });
  delete (globalThis as { window?: unknown }).window;
});
