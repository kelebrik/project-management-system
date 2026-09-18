import type { SimpleTranslationKey } from "../i18n/types";

export const OPEN_ISSUE_COLUMNS = [
  { key: "number", labelKey: "ui.projects.issueColumnNumber", width: 44, min: 40, max: 48 },
  { key: "task", labelKey: "ui.projects.issueColumnTask", width: 346, min: 220, max: 560 },
  { key: "link", labelKey: "ui.projects.issueColumnLink", width: 200, min: 160, max: 360 },
  { key: "status", labelKey: "ui.projects.issueColumnStatus", width: 400, min: 280, max: 680 },
  { key: "owner", labelKey: "ui.projects.issueColumnOwner", width: 128, min: 108, max: 180 },
  { key: "risk", labelKey: "ui.projects.issueColumnRisk", width: 92, min: 84, max: 420 },
  { key: "readiness", labelKey: "ui.projects.issueColumnReadiness", width: 96, min: 88, max: 140 },
  { key: "parameters", labelKey: "ui.projects.issueColumnParameters", width: 274, min: 210, max: 380 },
] as const satisfies readonly {
  key: string;
  labelKey: SimpleTranslationKey;
  width: number;
  min: number;
  max: number;
}[];

export type OpenIssueColumnKey = (typeof OPEN_ISSUE_COLUMNS)[number]["key"];

export type OpenIssueColumnWidths = Record<OpenIssueColumnKey, number>;

export function normalizeOpenIssueColumnWidths(
  value?: Partial<Record<OpenIssueColumnKey, number>>,
): OpenIssueColumnWidths {
  return Object.fromEntries(OPEN_ISSUE_COLUMNS.map((column) => [
    column.key,
    Math.min(column.max, Math.max(column.min, Number(value?.[column.key]) || column.width)),
  ])) as OpenIssueColumnWidths;
}

export function openIssueTableWidth(widths: OpenIssueColumnWidths) {
  return OPEN_ISSUE_COLUMNS.reduce((total, column) => total + widths[column.key], 0);
}

export const OPEN_ISSUES_PROTOTYPE_COLUMNS = [
  { key: "number", labelKey: "ui.projects.issueColumnNumber", width: 54, min: 44, max: 72 },
  { key: "task", labelKey: "ui.projects.issueColumnTask", width: 360, min: 240, max: 640 },
  { key: "status", labelKey: "ui.projects.issueColumnStatus", width: 300, min: 230, max: 560 },
  { key: "owner", labelKey: "ui.projects.issueColumnOwner", width: 170, min: 120, max: 320 },
  { key: "readiness", labelKey: "ui.projects.issueColumnReadiness", width: 120, min: 96, max: 180 },
  { key: "actions", labelKey: "ui.projects.openIssuesPrototypeActions", width: 150, min: 128, max: 240 },
] as const satisfies readonly {
  key: string;
  labelKey: SimpleTranslationKey;
  width: number;
  min: number;
  max: number;
}[];

export type OpenIssuesPrototypeColumnKey = (typeof OPEN_ISSUES_PROTOTYPE_COLUMNS)[number]["key"];
export type OpenIssuesPrototypeColumnWidths = Record<OpenIssuesPrototypeColumnKey, number>;

export function normalizeOpenIssuesPrototypeColumnWidths(
  value?: Partial<Record<OpenIssuesPrototypeColumnKey, number>>,
): OpenIssuesPrototypeColumnWidths {
  return Object.fromEntries(OPEN_ISSUES_PROTOTYPE_COLUMNS.map((column) => [
    column.key,
    Math.min(column.max, Math.max(column.min, Number(value?.[column.key]) || column.width)),
  ])) as OpenIssuesPrototypeColumnWidths;
}

export function openIssuesPrototypeTableWidth(widths: OpenIssuesPrototypeColumnWidths) {
  return OPEN_ISSUES_PROTOTYPE_COLUMNS.reduce((total, column) => total + widths[column.key], 0);
}
