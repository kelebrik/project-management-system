import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator } from "../i18n/translate";
import type { WbsDependency, WbsItem } from "./domainTypes";
import { scheduleOverrideNotices } from "./scheduleOverride";

const t = createTranslator("ru");

function item(id: string, code: string, startDate: string, dueDate: string, extra: Partial<WbsItem> = {}) {
  return {
    id, code, title: `Работа ${code}`, startDate: `${startDate}T00:00:00.000Z`, dueDate: `${dueDate}T00:00:00.000Z`,
    workDays: 4, leadLagDays: 0,
    predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null,
    ...extra,
  } as unknown as WbsItem;
}

// 1.1.6 finishes three working days after 1.1.5 finishes, as on the demo.
const head = item("a", "1.1.5", "2026-09-17", "2026-09-30");
const held = item("b", "1.1.6", "2026-09-30", "2026-10-05", { predecessor1: "1.1.5" });
const ff = [{ predecessorId: "a", successorId: "b", type: "FF", lagDays: 3 }] as unknown as WbsDependency[];

function notices(sent: { startDate?: string; dueDate?: string; workDays?: string }, saved: WbsItem[], dependencies = ff) {
  return scheduleOverrideNotices({
    sent: { b: { startDate: sent.startDate ?? "2026-09-30", dueDate: sent.dueDate ?? "2026-10-05", workDays: sent.workDays ?? "4" } },
    before: [head, held],
    saved,
    dependencies,
    t,
    formatDay: (day) => day,
  });
}

test("a later finish that a finish-to-finish link puts back is explained", () => {
  const [notice, ...rest] = notices({ dueDate: "2026-10-09" }, [head, held]);
  assert.equal(rest.length, 0);
  assert.equal(
    notice,
    "1.1.6: окончание осталось 2026-10-05. Окончание задаёт связь «окончание–окончание» с 1.1.5 «Работа 1.1.5» (+3 раб. дн.). " +
      "Чтобы изменить дату, поменяйте связь или её задержку на Ганте либо сдвиньте предшественника.",
  );
});

test("a longer duration that keeps the held finish is explained too", () => {
  const moved = item("b", "1.1.6", "2026-09-28", "2026-10-05", { predecessor1: "1.1.5", workDays: 6 });
  assert.equal(notices({ workDays: "6" }, [head, moved]).length, 1);
});

test("a start a finish-to-start link sets is explained", () => {
  const fs = [{ predecessorId: "a", successorId: "b", type: "FS", lagDays: 0 }] as unknown as WbsDependency[];
  const [notice] = notices({ startDate: "2026-10-12" }, [head, held], fs);
  assert.match(notice, /^1\.1\.6: начало осталось 2026-09-30\. Начало задаёт связь «окончание–начало» с 1\.1\.5 «Работа 1\.1\.5»\./);
});

test("dates the schedule kept, or moved without links, raise nothing", () => {
  const saved = item("b", "1.1.6", "2026-09-30", "2026-10-09", { predecessor1: "1.1.5" });
  assert.deepEqual(notices({ dueDate: "2026-10-09" }, [head, saved]), []);
  const free = item("b", "1.1.6", "2026-10-05", "2026-10-05");
  assert.deepEqual(notices({ startDate: "2026-10-03" }, [head, free], []), []);
});
