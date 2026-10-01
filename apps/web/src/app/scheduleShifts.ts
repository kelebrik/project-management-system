import type { Translator } from "../i18n/types";

export type ShiftStep = {
  id: string;
  operationId: string;
  at: string;
  previousDate: string | null;
  newDate: string | null;
  deltaDays: number | null;
  trigger: string;
  sourceItemId: string | null;
  sourceCode: string | null;
  sourceTitle: string | null;
  sourceIssueId: string | null;
  sourceNote: string | null;
  actorName: string | null;
  reason: { category: string; text: string | null; raidItemId: string | null } | null;
  needsReason: boolean;
};

export type ShiftLadder = {
  id: string;
  code: string;
  title: string;
  type: string;
  isActiveGoal: boolean;
  baselineDate: string | null;
  currentDate: string | null;
  varianceDays: number | null;
  unexplainedDays: number | null;
  earlierSteps: { count: number; deltaDays: number } | null;
  /** Days of later moves since the baseline by reason category; NONE has no reason yet. */
  reasonDays: Record<string, number>;
  steps: ShiftStep[];
};

/** What moved the checkpoint in this step, in words; the source row is named when there is one. */
export function shiftStepCause(step: ShiftStep, checkpointId: string, t: Translator, formatDate: (value: string) => string = (value) => value) {
  const source = step.sourceCode ? `${step.sourceCode} ${step.sourceTitle ?? ""}`.trim() : "";
  switch (step.trigger) {
    case "MANUAL_EDIT":
      return step.sourceItemId === checkpointId ? t("ui.shifts.causeOwnDate") : t("ui.shifts.causeEdit", { source });
    case "BULK_EDIT":
      return source ? t("ui.shifts.causeEdit", { source }) : t("ui.shifts.causeBulk");
    case "STRUCTURE":
      return t("ui.shifts.causeStructure");
    case "LINKS":
      return t("ui.shifts.causeLinks");
    case "RESTORE":
      return t("ui.shifts.causeRestore");
    case "CALENDAR": {
      const [date, kind] = (step.sourceNote ?? "").split(" ");
      const change = kind === "working" ? t("ui.shifts.calendarWorking") : kind === "reset" ? t("ui.shifts.calendarReset") : t("ui.shifts.calendarDayOff");
      return t("ui.shifts.causeCalendar", { date: date ? formatDate(date) : "", change });
    }
    case "TARGET_DATE":
      return step.sourceNote ? t("ui.shifts.causeTargetWithReason", { reason: step.sourceNote }) : t("ui.shifts.causeTarget");
    case "ISSUE":
      return t("ui.shifts.causeIssue", { issue: step.sourceNote ?? "" });
    case "DRAFT":
      return t("ui.shifts.causeDraft");
    case "IMPORT":
      return t("ui.shifts.causeImport");
    case "AUTOMATION":
      return t("ui.shifts.causeAutomation");
    case "RESTORE_DELETED":
      return t("ui.shifts.causeRestoreDeleted");
    case "SYSTEM":
      return t("ui.shifts.causeSystem");
    default:
      return step.trigger;
  }
}

export const SHIFT_REASON_CATEGORIES = ["CUSTOMER", "SUPPLIER", "RESOURCES", "ESTIMATE", "TECHNICAL", "EXTERNAL", "OTHER"] as const;
