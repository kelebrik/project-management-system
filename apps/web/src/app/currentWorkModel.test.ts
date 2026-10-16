import test from "node:test";
import assert from "node:assert/strict";
import type { WbsItem } from "./domainTypes";
import { wbsToForm } from "./formState";
import { createCurrentWorkRows, currentWorkDateRange } from "./currentWorkModel";
import { focusedWbsBranchState } from "./wbsTree";

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

test("current work range starts next Monday and spans ten working days", () => {
  const range = currentWorkDateRange(new Date(2026, 6, 20));
  assert.equal(localIsoDate(range.upcomingMonday), "2026-07-27");
  assert.equal(localIsoDate(range.upcomingThrough), "2026-08-10");
});

test("current work selects active and upcoming tasks and deliverables", () => {
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
      item({ id: "active", parentId: "wp", code: "1.2", title: "В работе", status: "IN_PROGRESS" }),
      item({ id: "upcoming", parentId: "wp", code: "1.3", title: "Предстоит", dueDate: "2026-08-10", comment: "Важно" }),
      item({ id: "deliverable", parentId: "wp", code: "1.4", title: "Результат", type: "DELIVERABLE", status: "IN_REVIEW" }),
      item({ id: "later", parentId: "wp", code: "1.5", title: "Позже", dueDate: "2026-08-11" }),
      item({ id: "failed", parentId: "wp", code: "1.6", title: "Провалено", status: "BLOCKED", dueDate: "2026-08-10" }),
      item({ id: "cancelled", parentId: "wp", code: "1.7", title: "Отменено", status: "CANCELLED", closedAt: "2026-07-17T12:00:00Z" }),
    ],
    {},
    new Date(2026, 6, 20),
  );

  // Closed three days ago: «All» still shows it; a cancelled row never.
  assert.deepEqual(rows.map((row) => row.id), ["done", "active", "upcoming", "deliverable", "failed"]);
  assert.equal(rows[1].workPackage, "1 Пакет");
  assert.equal(rows[2].comment, "Важно");
});

test("current work uses edited type; a row just made done stays in «All» and leaves «Active»", () => {
  const source = item({ id: "work", code: "2.1", title: "Результат" });
  const deliverableDraft = wbsToForm(source);
  deliverableDraft.type = "DELIVERABLE";
  deliverableDraft.status = "IN_PROGRESS";

  assert.deepEqual(
    createCurrentWorkRows([source], { work: deliverableDraft }).map((row) => row.id),
    ["work"],
  );

  deliverableDraft.status = "DONE";
  assert.deepEqual(createCurrentWorkRows([source], { work: deliverableDraft }).map((row) => row.id), ["work"]);
  assert.deepEqual(createCurrentWorkRows([source], { work: deliverableDraft }, new Date(), "active"), []);
});

test("«All» shows work closed today and the seven calendar days before, and nothing closed earlier or later", () => {
  const today = new Date(2026, 9, 16, 15, 0);
  const done = (id: string, closedAt: string | null, dueDate: string | null = null) =>
    item({ id, code: id, title: id, status: "DONE", closedAt, dueDate });
  const rows = createCurrentWorkRows(
    [
      done("1", "2026-10-16T09:00:00"),
      done("2", "2026-10-09T00:30:00"),
      done("3", "2026-10-08T23:30:00"),
      done("4", "2026-10-17T09:00:00"),
      // Old rows without the day closed: by their due date.
      done("5", null, "2026-10-12"),
      done("6", null, "2026-10-20"),
      done("7", null, null),
    ],
    {},
    today,
  );
  assert.deepEqual(rows.map((row) => row.id), ["1", "2", "5"]);
  for (const filter of ["active", "blocked", "overdue", "dueSoon"] as const) {
    assert.deepEqual(createCurrentWorkRows([done("1", "2026-10-16T09:00:00")], {}, today, filter), [], filter);
  }
  // Whose rows still counts.
  const owned = item({ id: "8", code: "8", title: "8", status: "DONE", closedAt: "2026-10-15T09:00:00", owner: "Иван" });
  assert.deepEqual(createCurrentWorkRows([owned], {}, today, "all", { owners: ["анна"] }), []);
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
  assert.equal(rows[0].comment, "  Проверить  ");
});

test("current work focus collapses every unrelated structure branch", () => {
  const items = [
    item({ id: "phase-a", code: "1", title: "Фаза A", type: "PHASE" }),
    item({ id: "wp-a", parentId: "phase-a", code: "1.1", title: "Пакет A", type: "WORK_PACKAGE" }),
    item({ id: "task-a", parentId: "wp-a", code: "1.1.1", title: "Нужная работа" }),
    item({ id: "wp-b", parentId: "phase-a", code: "1.2", title: "Пакет B", type: "WORK_PACKAGE" }),
    item({ id: "task-b", parentId: "wp-b", code: "1.2.1", title: "Соседняя работа" }),
    item({ id: "phase-b", code: "2", title: "Фаза B", type: "PHASE" }),
    item({ id: "wp-c", parentId: "phase-b", code: "2.1", title: "Пакет C", type: "WORK_PACKAGE" }),
    item({ id: "task-c", parentId: "wp-c", code: "2.1.1", title: "Другая работа" }),
  ];

  const focus = focusedWbsBranchState(items, "task-a");

  assert.equal(focus?.activeItemId, "task-a");
  assert.equal(focus?.scrollItemId, "task-a");
  assert.deepEqual(focus?.collapsedIds, new Set(["wp-b", "phase-b", "wp-c"]));
});

test("work not started but due this week is shown before it becomes overdue", () => {
  const today = new Date(2026, 6, 20); // Monday
  const rows = createCurrentWorkRows([item({ id: "a", code: "1", title: "Эта неделя", dueDate: "2026-07-23" })], {}, today);
  assert.deepEqual(rows.map((row) => row.id), ["a"]);
});

test("rows are filtered by owners, by no owner, and by a due date within the next days", () => {
  const today = new Date(2026, 6, 20);
  const items = [
    item({ id: "a", code: "1", title: "Анна, скоро", owner: "Анна Петрова", status: "IN_PROGRESS", dueDate: "2026-07-24" }),
    item({ id: "b", code: "2", title: "Иван, позже", owner: "Иван", status: "IN_PROGRESS", dueDate: "2026-08-20" }),
    item({ id: "c", code: "3", title: "Без исполнителя", status: "IN_PROGRESS", dueDate: "2026-07-22" }),
  ];
  assert.deepEqual(createCurrentWorkRows(items, {}, today, "all", { owners: ["анна петрова"] }).map((row) => row.id), ["a"]);
  assert.deepEqual(createCurrentWorkRows(items, {}, today, "all", { owners: [""] }).map((row) => row.id), ["c"]);
  assert.deepEqual(createCurrentWorkRows(items, {}, today, "dueSoon", { dueSoonDays: 7 }).map((row) => row.id), ["a", "c"]);
  assert.deepEqual(createCurrentWorkRows(items, {}, today, "dueSoon", { dueSoonDays: 31 }).map((row) => row.id), ["a", "b", "c"]);
});
