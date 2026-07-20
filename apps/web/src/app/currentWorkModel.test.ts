import test from "node:test";
import assert from "node:assert/strict";
import type { WbsItem } from "./domainTypes";
import { wbsToForm } from "./formState";
import { createCurrentWorkRows, currentWorkDateRange } from "./currentWorkModel";

function item(overrides: Partial<WbsItem> & Pick<WbsItem, "id" | "code" | "title">) {
  return {
    parentId: null,
    type: "TASK",
    status: "NOT_STARTED",
    owner: "",
    startDate: null,
    dueDate: null,
    description: null,
    comment: null,
    closedAt: null,
    sortOrder: 0,
    ...overrides,
  } as WbsItem;
}

function localIsoDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

test("current work ranges use five recent weekdays and the next Monday", () => {
  const range = currentWorkDateRange(new Date(2026, 6, 20));
  assert.equal(localIsoDate(range.closedSince), "2026-07-14");
  assert.equal(localIsoDate(range.upcomingMonday), "2026-07-27");
  assert.equal(localIsoDate(range.upcomingThrough), "2026-08-10");
});

test("current work selects recent done, active and upcoming not-started tasks", () => {
  const workPackage = item({
    id: "wp",
    code: "1",
    title: "Пакет",
    type: "WORK_PACKAGE",
  });
  const rows = createCurrentWorkRows(
    [
      workPackage,
      item({ id: "done", parentId: "wp", code: "1.1", title: "Закрыто", status: "DONE", closedAt: "2026-07-17T12:00:00Z" }),
      item({ id: "active", parentId: "wp", code: "1.2", title: "В работе", status: "BLOCKED" }),
      item({ id: "upcoming", parentId: "wp", code: "1.3", title: "Предстоит", dueDate: "2026-08-10", comment: "Важно" }),
      item({ id: "old", parentId: "wp", code: "1.4", title: "Старое", status: "DONE", closedAt: "2026-07-13T12:00:00Z" }),
      item({ id: "later", parentId: "wp", code: "1.5", title: "Позже", dueDate: "2026-08-11" }),
    ],
    {},
    new Date(2026, 6, 20),
  );

  assert.deepEqual(rows.map((row) => row.id), ["done", "active", "upcoming"]);
  assert.equal(rows[0].workPackage, "1 Пакет");
  assert.equal(rows[2].comment, "Важно");
});

test("current work uses edited structure values", () => {
  const source = item({ id: "task", code: "2.1", title: "Исходное" });
  const draft = wbsToForm(source);
  draft.status = "IN_PROGRESS";
  draft.title = "Измененное";
  draft.comment = "  Проверить  ";

  const rows = createCurrentWorkRows(
    [source],
    { task: draft },
    new Date(2026, 6, 20),
  );
  assert.equal(rows[0].title, "Измененное");
  assert.equal(rows[0].comment, "Проверить");
});
