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

