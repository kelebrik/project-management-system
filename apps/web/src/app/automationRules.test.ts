import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "../i18n/translate";
import { isInternalHref, notificationText } from "./automationRules";

const ru = createTranslator("ru");
const en = createTranslator("en");
const date = (value: string) => value.split("-").reverse().join(".");

test("bell entries are worded in the reader's language from what happened", () => {
  const row = { id: "m", code: "2.1", title: "Пилот" };
  assert.equal(notificationText({ kind: "MILESTONE_SHIFTED", projectCode: "TV", row, days: 5, newDate: "2026-10-20" }, ru, date), "2.1 Пилот: сдвиг позже на 5 дн., теперь 20.10.2026");
  assert.equal(notificationText({ kind: "SHIFT_REASON_ASKED", projectCode: "TV", row, days: 5 }, en, date), "Please give the reason 2.1 Пилот moved by 5 days");
  assert.equal(notificationText({ kind: "CHECK_IN_BLOCKER", projectCode: "TV", row, person: "Петров", blocker: "", offTrack: true }, ru, date), "Петров, 2.1 Пилот: не успевает");
  assert.equal(
    notificationText({ kind: "CHECK_IN_MISSING_SUMMARY", projectCode: "TV", weekStart: "2026-09-28", people: ["Иванов", "Петров"], more: 3 }, ru, date),
    "Не отметились за неделю: Иванов, Петров и ещё 3",
  );
  assert.equal(notificationText({ kind: "FLOAT_EXHAUSTED", projectCode: "TV", rows: [row], more: 0 }, ru, date), "Кончился запас: 2.1 Пилот");
});

test("only paths inside the application are followed", () => {
  assert.equal(isInternalHref("/TV/overview#schedule-shifts"), true);
  assert.equal(isInternalHref("//evil.example/x"), false);
  assert.equal(isInternalHref("https://evil.example"), false);
});
