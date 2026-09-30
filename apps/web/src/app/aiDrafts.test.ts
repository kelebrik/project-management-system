import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "../i18n/translate";
import { meetingPrepText, statusReportText, withoutDraftRow, type WbsDraftItem } from "./aiDrafts";

const row = (ref: string, predecessors: string[] = []): WbsDraftItem => ({ ref, title: `Row ${ref}`, type: "TASK", workDays: 2, owner: "", predecessors });

test("removing a draft row takes its children and the links to them", () => {
  const items = [row("1"), row("1.1"), row("1.2", ["1.1"]), row("10"), row("2", ["1.2", "10"])];
  const left = withoutDraftRow(items, "1");
  assert.deepEqual(left.map((item) => item.ref), ["10", "2"]);
  assert.deepEqual(left.find((item) => item.ref === "2")?.predecessors, ["10"]);
});

test("the status report becomes Markdown with only the sections that have lines", () => {
  const text = statusReportText(
    { status: "AMBER", headline: "Testing is late", summary: "Two tasks slipped.", done: ["Design approved"], slipped: ["Testing, 5 days"], risks: [], decisions: [], next: ["Release"] },
    "Apollo",
    14,
    createTranslator("en"),
  );
  assert.equal(
    text,
    [
      "# Project status: Apollo",
      "Period: the last 14 days",
      "",
      "**Amber.** Testing is late",
      "",
      "Two tasks slipped.",
      "",
      "## Done",
      "- Design approved",
      "",
      "## Slipped",
      "- Testing, 5 days",
      "",
      "## Next",
      "- Release",
    ].join("\n"),
  );
  assert.match(statusReportText({ status: "RED", headline: "", summary: "", done: [], slipped: [], risks: [], decisions: [], next: [] }, "A", 7, createTranslator("ru")), /\*\*Красный\.\*\*/);
});

test("the meeting agenda becomes Markdown with row names instead of references", () => {
  const text = meetingPrepText(
    {
      agenda: [
        { topic: "Delivery", why: "A decision is due", owner: "Ivanov", minutes: 10, refs: ["issue:i1"] },
        { topic: "Firmware", why: "", owner: "", minutes: 5, refs: [] },
      ],
      askWhom: [{ person: "Petrov", question: "When is the second supplier ready?", refs: ["risk:r1", "risk:gone"] }],
      refs: { "issue:i1": { kind: "issue", id: "i1", label: "Who pays" }, "risk:r1": { kind: "risk", id: "r1", label: "Supply", type: "RISK" } },
    },
    "Apollo",
    createTranslator("en"),
  );
  assert.equal(
    text,
    [
      "# Meeting agenda: Apollo",
      "About 15 min",
      "",
      "## Agenda",
      "1. **Delivery** — 10 min, Ivanov",
      "   A decision is due (Who pays)",
      "2. **Firmware** — 5 min",
      "",
      "## Whom to ask what",
      "- **Petrov**: When is the second supplier ready? (Supply)",
    ].join("\n"),
  );
});
