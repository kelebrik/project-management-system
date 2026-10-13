import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectDetails, WbsDependency, WbsItem } from "./domainTypes";
import { wbsToForm } from "./formState";
import { previewRowEdit } from "./structurePreview";
import { previewDisplay } from "./structurePreviewDisplay";

const row = (id: string, code: string, sortOrder: number, startDate: string, workDays: number, extra: Partial<WbsItem> = {}) =>
  ({
    id, code, title: id, sortOrder, type: "TASK", status: "NOT_STARTED", parentId: null, wbsLevel: code.split(".").length,
    startDate: `${startDate}T00:00:00.000Z`, dueDate: null, forecastStartDate: null, forecastDueDate: null, workDays, calendarDays: null, calendarCode: "RU", leadLagDays: 0,
    predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null,
    createdAt: `2026-01-01T00:00:0${sortOrder % 10}.000Z`, ...extra,
  }) as unknown as WbsItem;
const link = { id: "l", predecessorId: "a", successorId: "b", type: "FS", lagDays: 0, createdAt: "2026-01-01T00:00:00.000Z" } as unknown as WbsDependency;
const base = () => ({ items: [row("a", "1", 10, "2026-10-12", 3), row("b", "2", 20, "2026-10-15", 2)], dependencies: [link], calendarOverrides: [], today: "2026-10-13" });

test("a longer predecessor moves its successor at once, as the server will", () => {
  const preview = previewRowEdit(base(), "a", { workDays: 5, scheduleDriver: "workDays" })!;
  const byId = new Map(preview.items.map((item) => [item.id, item]));
  // Five working days from Monday end on Friday; the successor starts the next Monday.
  assert.equal(byId.get("a")!.dueDate, "2026-10-16T00:00:00.000Z");
  assert.equal(byId.get("b")!.startDate, "2026-10-19T00:00:00.000Z");
  assert.deepEqual([...preview.changedIds].sort(), ["a", "b"]);
  assert.equal(preview.criticalPath.projectFinishDate, "2026-10-20T00:00:00.000Z");
});

test("edits the preview cannot repeat exactly are left to the server", () => {
  const state = base();
  for (const patch of [{ predecessor1: "1" }, { leadLagDays: 2 }, { wbsLevel: 2 }, { sortOrder: 5 }, { code: "9" }, { parentId: "a" }, { title: "Только текст" }]) {
    assert.equal(previewRowEdit(state, "b", patch as never), null, JSON.stringify(patch));
  }
  assert.equal(previewRowEdit({ ...state, items: [state.items[0]!, { ...state.items[1]!, createdAt: undefined } as unknown as WbsItem] }, "a", { workDays: 4 }), null);
  const before = JSON.stringify(state);
  previewRowEdit(state, "a", { workDays: 5, scheduleDriver: "workDays" });
  assert.equal(JSON.stringify(state), before, "the confirmed copy is never altered");
});

test("the table shows the preview where the person has not typed, and only while the project holds the rows it was worked out from", () => {
  const state = base();
  const project = { id: "p", wbsItems: state.items, wbsDependencies: state.dependencies, calendarOverrides: [], criticalPath: null } as unknown as ProjectDetails;
  const result = previewRowEdit(state, "a", { workDays: 5, scheduleDriver: "workDays" })!;
  const sentDraft = { ...wbsToForm(state.items[0]!, state.dependencies), workDays: "5" };
  const drafts = { a: { ...sentDraft, title: "печатает дальше" }, b: { ...wbsToForm(state.items[1]!, state.dependencies), status: "IN_PROGRESS" as const } };
  const preview = { projectId: "p", baseItems: project.wbsItems, baseDependencies: project.wbsDependencies, baseCalendarOverrides: project.calendarOverrides, ...result, editedItemId: "a", sentDraft };
  const shown = previewDisplay(preview, project, drafts);
  assert.equal(shown.active, true);
  assert.equal(shown.drafts.a!.dueDate, "2026-10-16");
  assert.equal(shown.drafts.a!.title, "печатает дальше");
  assert.equal(shown.drafts.b!.startDate, "2026-10-19");
  // The successor's status the person chose is theirs, not the preview's.
  assert.equal(shown.drafts.b!.status, "IN_PROGRESS");
  assert.equal(shown.preliminary.get("b")!.has("startDate"), true);
  assert.equal(shown.preliminary.get("b")!.has("status"), false);
  assert.equal(shown.preliminary.get("a")!.has("workDays"), false, "what the person typed is not marked as preliminary");
  assert.equal(drafts.b.startDate, "2026-10-15", "the drafts themselves are untouched");
  // Any other rows in the project switch the preview off.
  assert.equal(previewDisplay(preview, { ...project, wbsItems: [...project.wbsItems] }, drafts).active, false);
  assert.equal(previewDisplay(preview, { ...project, id: "q" }, drafts).active, false);
});
