import { z } from "zod";

/** The rule templates a project can switch on; each one only tells or prepares, never changes the plan by itself. */
export const automationTemplates = ["MILESTONE_SHIFT", "MISSING_CHECK_IN", "CHECK_IN_BLOCKER", "FLOAT_EXHAUSTED", "JIRA_DONE"] as const;
export type AutomationTemplate = (typeof automationTemplates)[number];

export const AUTOMATION_LIMITS = { recipients: 20, listed: 10, text: 200, minDaysMax: 90 } as const;

export const automationParamsSchemas = {
  MILESTONE_SHIFT: z.object({ minDays: z.number().int().min(1).max(AUTOMATION_LIMITS.minDaysMax).default(3) }).strict(),
  MISSING_CHECK_IN: z.object({}).strict(),
  CHECK_IN_BLOCKER: z.object({}).strict(),
  FLOAT_EXHAUSTED: z.object({}).strict(),
  JIRA_DONE: z.object({}).strict(),
} satisfies Record<AutomationTemplate, z.ZodTypeAny>;

export const automationRuleUpdateSchema = z.object({
  enabled: z.boolean(),
  params: z.record(z.string(), z.unknown()).default({}),
  recipientIds: z.array(z.string().min(1).max(64)).max(AUTOMATION_LIMITS.recipients),
  /** The version the page showed; absent when the rule is switched on for the first time. */
  version: z.number().int().min(1).optional(),
});

export const automationProposalKinds = ["CREATE_ISSUE", "SET_WBS_STATUS"] as const;
export type AutomationProposalKind = (typeof automationProposalKinds)[number];
export const automationProposalStatuses = ["PENDING", "APPLIED", "REJECTED", "STALE"] as const;
export type AutomationProposalStatus = (typeof automationProposalStatuses)[number];

export const automationProposalApplySchema = z.object({
  version: z.number().int().min(1),
  /** A prepared issue can be corrected before it is created. */
  title: z.string().trim().min(1).max(500).optional(),
  owner: z.string().trim().max(200).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});
export const automationProposalRejectSchema = z.object({ version: z.number().int().min(1) });

/** What a bell entry says; the web words it in the reader's language. */
export type AutomationRowRef = { id: string; code: string; title: string };
export type NotificationParams =
  | { kind: "MILESTONE_SHIFTED"; projectCode: string; row: AutomationRowRef; days: number; newDate: string | null }
  | { kind: "SHIFT_REASON_ASKED"; projectCode: string; row: AutomationRowRef; days: number }
  | { kind: "CHECK_IN_MISSING"; projectCode: string; weekStart: string; rows: number }
  | { kind: "CHECK_IN_MISSING_SUMMARY"; projectCode: string; weekStart: string; people: string[]; more: number }
  | { kind: "CHECK_IN_BLOCKER"; projectCode: string; row: AutomationRowRef; person: string; blocker: string; offTrack: boolean }
  | { kind: "FLOAT_EXHAUSTED"; projectCode: string; rows: AutomationRowRef[]; more: number }
  | { kind: "JIRA_DONE"; projectCode: string; rows: AutomationRowRef[]; more: number };
export type NotificationKind = NotificationParams["kind"];
