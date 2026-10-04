import type { AutomationProposalKind, AutomationProposalStatus, AutomationTemplate, NotificationParams } from "@pms/shared";
import type { Translator } from "../i18n/types";

export type NotificationItem = { id: string; kind: string; params: NotificationParams; href: string; createdAt: string; readAt: string | null };
export type RuleSettings = { id: string; enabled: boolean; params: Record<string, unknown>; recipientIds: string[]; version: number; updatedAt: string };
export type RulesOverview = {
  canWrite: boolean;
  pendingProposals: number;
  users: Array<{ id: string; name: string; email: string }>;
  rules: Array<{ template: AutomationTemplate; rule: RuleSettings | null }>;
};
export type RulePreview = { mode: "HISTORY" | "APPROXIMATE" | "CURRENT_ONLY"; days: number; items: Array<{ at: string | null; params: NotificationParams }>; total: number };
export type Proposal = {
  id: string;
  kind: AutomationProposalKind;
  wbsItemId: string | null;
  payload: {
    title?: string;
    impact?: string;
    owner?: string;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    person?: string;
    offTrack?: boolean;
    status?: string;
    row?: { id: string; code: string; title: string };
    expectedJira?: { key: string };
  };
  status: AutomationProposalStatus;
  version: number;
  createdAt: string;
  rule: { template: AutomationTemplate };
};
export type Firing = { id: string; template: AutomationTemplate; summary: Record<string, unknown>; firedAt: string; notifications: number; proposals: number };

type Translate = Translator;
type Rows = Array<{ code: string; title: string }>;

const rowsText = (rows: Rows, more: number, t: Translate) =>
  rows.map((row) => `${row.code} ${row.title}`).join("; ") + (more > 0 ? ` ${t("ui.rules.andMore", { count: more })}` : "");

/** A bell entry in the reader's language; the server sends only what happened, never wording. */
export function notificationText(params: NotificationParams, t: Translate, formatDate: (value: string) => string): string {
  switch (params.kind) {
    case "MILESTONE_SHIFTED":
      return t("ui.rules.note.MILESTONE_SHIFTED", { code: params.row.code, title: params.row.title, days: params.days, date: params.newDate ? formatDate(params.newDate) : "—" });
    case "SHIFT_REASON_ASKED":
      return t("ui.rules.note.SHIFT_REASON_ASKED", { code: params.row.code, title: params.row.title, days: params.days });
    case "CHECK_IN_MISSING":
      return t("ui.rules.note.CHECK_IN_MISSING", { rows: params.rows });
    case "CHECK_IN_MISSING_SUMMARY":
      return t("ui.rules.note.CHECK_IN_MISSING_SUMMARY", { people: params.people.join(", ") + (params.more > 0 ? ` ${t("ui.rules.andMore", { count: params.more })}` : "") });
    case "CHECK_IN_BLOCKER":
      return t("ui.rules.note.CHECK_IN_BLOCKER", { person: params.person, code: params.row.code, title: params.row.title, blocker: params.blocker || t("ui.rules.offTrack") });
    case "FLOAT_EXHAUSTED":
      return t("ui.rules.note.FLOAT_EXHAUSTED", { rows: rowsText(params.rows, params.more, t) });
    case "JIRA_DONE":
      return t("ui.rules.note.JIRA_DONE", { rows: rowsText(params.rows, params.more, t) });
    case "DECISION_WAITING":
      return t("ui.rules.note.DECISION_WAITING", { title: params.item.title, days: params.days, approver: params.approver || t("ui.rules.noApprover") });
    case "RISK_INCOMPLETE":
      return t("ui.rules.note.RISK_INCOMPLETE", { items: params.items.map((item) => item.title).join("; ") + (params.more > 0 ? ` ${t("ui.rules.andMore", { count: params.more })}` : "") });
    case "ISSUE_OVERDUE":
      return t("ui.rules.note.ISSUE_OVERDUE", { title: params.item.title, days: params.days, date: formatDate(params.dueDate) });
    case "WORK_DUE_SOON":
      return t("ui.rules.note.WORK_DUE_SOON", { code: params.row.code, title: params.row.title, date: formatDate(params.dueDate) });
    case "WORK_DUE_SOON_SUMMARY":
      return t("ui.rules.note.WORK_DUE_SOON_SUMMARY", { rows: rowsText(params.rows, params.more, t) });
    case "MILESTONE_AT_RISK":
      return t("ui.rules.note.MILESTONE_AT_RISK", { code: params.row.code, title: params.row.title, date: formatDate(params.dueDate), lagging: params.lagging });
    case "CHANGE_REQUEST_PENDING":
      return t("ui.rules.note.CHANGE_REQUEST_PENDING", { title: params.item.title, days: params.days, status: params.status });
    default:
      return "";
  }
}

/** Only paths inside the application are followed from the bell. */
export const isInternalHref = (href: string) => href.startsWith("/") && !href.startsWith("//");
