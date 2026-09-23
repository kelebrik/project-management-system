import { createAdminLabels } from "./adminMetadata";
import { createAuditLabels } from "./auditLabels";
import { labels } from "@pms/shared";
import type { Locale } from "./types";

type LabelGroups = { [G in keyof typeof labels]: { [K in keyof (typeof labels)[G]]: string } };
const english = {
  projectStatus: { DRAFT: "Draft", ACTIVE: "Active", ON_HOLD: "On hold", CLOSED: "Closed" },
  rag: { GREEN: "On track", AMBER: "At risk", RED: "Critical" },
  wbsType: { PHASE: "Phase", WORK_PACKAGE: "Work package", DELIVERABLE: "Deliverable", MILESTONE: "Milestone", GOAL: "Goal", TASK: "Task" },
  wbsStatus: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", IN_REVIEW: "In review", AT_RISK: "At risk", BLOCKED: "Failed", DONE: "Done", CANCELLED: "Cancelled" },
  raidType: { RISK: "Risk", ASSUMPTION: "Assumption", DEPENDENCY: "Problem" },
  raidStatus: { OPEN: "Open", IN_PROGRESS: "In progress", MITIGATED: "Mitigated", VALIDATED: "Validated", BREACHED: "Breached", CLOSED: "Closed" },
  issueSeverity: { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" },
  openIssueStatus: { Open: "Open", "In Progress": "In progress", Blocked: "Blocked", Resolved: "Resolved", Closed: "Closed" },
  userRole: { ADMIN: "System administrator", PROJECT_MANAGER: "User", TEAM_MEMBER: "User", EXECUTIVE_VIEWER: "User" },
} satisfies LabelGroups;

export function createDomainLabels(locale: Locale) {
  const values: LabelGroups = locale === "en" ? english : labels;
  const label = (group: Record<string, string>) => (value: string) => group[value] ?? value;
  return {
    ...createAdminLabels(locale),
    ...createAuditLabels(locale),
    projectStatusLabel: label(values.projectStatus),
    projectHealthLabel: label(values.rag),
    wbsTypeLabel: label(values.wbsType),
    wbsStatusLabel: label(values.wbsStatus),
    raidTypeLabel: label(values.raidType),
    raidStatusLabel: label(values.raidStatus),
    issueSeverityLabel: label(values.issueSeverity),
    issueStatusLabel: label(values.openIssueStatus),
    userRoleLabel: label(values.userRole),
    ragOptionLabel: label(locale === "en" ? { GREEN: "Green", AMBER: "Amber", RED: "Red" } : { GREEN: "Зеленый", AMBER: "Желтый", RED: "Красный" }),
    artifactStatusLabel: label(locale === "en" ? { Draft: "Draft", "In Review": "In review", Approved: "Approved", Baseline: "Baseline", Archived: "Archived" } : { Draft: "Черновик", "In Review": "На согласовании", Approved: "Одобрен", Baseline: "Базовый план", Archived: "Архив" }),
  };
}
