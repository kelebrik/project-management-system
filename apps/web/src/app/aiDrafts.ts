import type { Translator } from "../i18n/types";

export type WbsDraftItem = {
  ref: string;
  title: string;
  type: "PHASE" | "WORK_PACKAGE" | "TASK" | "MILESTONE";
  workDays: number;
  owner: string;
  predecessors: string[];
};

/** Removes a row and everything under it; links to removed rows go too. */
export function withoutDraftRow(items: WbsDraftItem[], ref: string) {
  const gone = (candidate: string) => candidate === ref || candidate.startsWith(`${ref}.`);
  return items
    .filter((item) => !gone(item.ref))
    .map((item) => ({ ...item, predecessors: item.predecessors.filter((predecessor) => !gone(predecessor)) }));
}

export type StatusReport = {
  status: "GREEN" | "AMBER" | "RED";
  headline: string;
  summary: string;
  done: string[];
  slipped: string[];
  risks: string[];
  decisions: string[];
  next: string[];
};

const SECTIONS = [
  ["done", "ui.ai.reportDone"],
  ["slipped", "ui.ai.reportSlipped"],
  ["risks", "ui.ai.reportRisks"],
  ["decisions", "ui.ai.reportDecisions"],
  ["next", "ui.ai.reportNext"],
] as const;
const STATUS_KEYS = { GREEN: "ui.ai.statusGreen", AMBER: "ui.ai.statusAmber", RED: "ui.ai.statusRed" } as const;

/** The report as plain Markdown the user can edit, copy and send. */
export function statusReportText(report: StatusReport, projectName: string, periodDays: number, t: Translator) {
  const lines = [
    `# ${t("ui.ai.reportTitleFor", { project: projectName })}`,
    t("ui.ai.reportPeriodLine", { days: periodDays }),
    "",
    `**${t(STATUS_KEYS[report.status])}.** ${report.headline}`.trim(),
    "",
    report.summary,
  ];
  for (const [key, label] of SECTIONS) {
    if (report[key].length === 0) continue;
    lines.push("", `## ${t(label)}`, ...report[key].map((line) => `- ${line}`));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}


/** A row an AI answer points to, checked by the server against the facts it sent. */
export type { FactRef } from "./factRefs";
import type { FactRef } from "./factRefs";

export type MeetingPrep = {
  agenda: Array<{ topic: string; why: string; owner: string; minutes: number; refs: string[] }>;
  askWhom: Array<{ person: string; question: string; refs: string[] }>;
  refs: Record<string, FactRef>;
};

/** The agenda as Markdown to edit and send; references become the row names. */
export function meetingPrepText(prep: MeetingPrep, projectName: string, t: Translator) {
  const named = (refs: string[]) => {
    const labels = refs.map((ref) => prep.refs[ref]?.label).filter(Boolean);
    return labels.length > 0 ? ` (${labels.join("; ")})` : "";
  };
  const total = prep.agenda.reduce((sum, row) => sum + row.minutes, 0);
  const lines = [`# ${t("ui.ai.prepTitleFor", { project: projectName })}`, t("ui.ai.prepTotal", { minutes: total })];
  if (prep.agenda.length > 0) {
    lines.push("", `## ${t("ui.ai.prepAgenda")}`);
    prep.agenda.forEach((row, index) => {
      const owner = row.owner ? `, ${row.owner}` : "";
      lines.push(`${index + 1}. **${row.topic}** — ${t("ui.ai.prepMinutes", { minutes: row.minutes })}${owner}`);
      if (row.why) lines.push(`   ${row.why}${named(row.refs)}`);
    });
  }
  if (prep.askWhom.length > 0) {
    lines.push("", `## ${t("ui.ai.prepAskWhom")}`, ...prep.askWhom.map((row) => `- **${row.person}**: ${row.question}${named(row.refs)}`));
  }
  return lines.join("\n");
}

export type RiskSuggestions = {
  newRisks: Array<{ title: string; description: string; probability: number; impact: number; owner: string; mitigationPlan: string; basisRefs: string[] }>;
  scores: Array<{ riskRef: string; probability: number; impact: number; reason: string }>;
  mitigations: Array<{ riskRef: string; mitigationPlan: string }>;
  refs: Record<string, FactRef>;
};

/** One reviewed suggestion as the register's own create or update request. */
export type RiskSuggestionRow =
  | { key: string; kind: "new"; body: RiskSuggestions["newRisks"][number] }
  | { key: string; kind: "score"; riskId: string; body: { probability: number; impact: number }; reason: string }
  | { key: string; kind: "mitigation"; riskId: string; body: { mitigationPlan: string } };

export function riskSuggestionRows(suggestions: RiskSuggestions): RiskSuggestionRow[] {
  const riskId = (ref: string) => suggestions.refs[ref]?.id ?? ref.replace(/^risk:/, "");
  return [
    ...suggestions.newRisks.map((body, index) => ({ key: `new-${index}`, kind: "new" as const, body })),
    ...suggestions.scores.map((row) => ({
      key: `score-${row.riskRef}`,
      kind: "score" as const,
      riskId: riskId(row.riskRef),
      body: { probability: row.probability, impact: row.impact },
      reason: row.reason,
    })),
    ...suggestions.mitigations.map((row) => ({
      key: `mitigation-${row.riskRef}`,
      kind: "mitigation" as const,
      riskId: riskId(row.riskRef),
      body: { mitigationPlan: row.mitigationPlan },
    })),
  ];
}

export type RebalanceSuggestion = { itemId: string; newOwner: string | null; newStartDate: string | null; newDueDate: string | null; reason: string };
export type RebalanceItem = {
  id: string;
  projectId: string;
  projectCode: string;
  code: string;
  title: string;
  owner: string;
  startDate: string;
  dueDate: string;
  updatedAt: string;
};
export type WorkChange = { owner?: string; startDate?: string; dueDate?: string };

/** The planner's edit for one suggestion: only the fields it changes. */
export function rebalanceChange(suggestion: RebalanceSuggestion): WorkChange {
  return {
    ...(suggestion.newOwner ? { owner: suggestion.newOwner } : {}),
    ...(suggestion.newStartDate ? { startDate: suggestion.newStartDate } : {}),
    ...(suggestion.newDueDate ? { dueDate: suggestion.newDueDate } : {}),
  };
}

/** The request body the workload planner sends for the same edit. */
export function workChangeBody(change: WorkChange, expectedUpdatedAt: string) {
  return { ...change, ...(change.startDate || change.dueDate ? { scheduleDriver: "dates" } : {}), expectedUpdatedAt };
}
