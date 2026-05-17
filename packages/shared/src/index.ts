import { z } from "zod";

export const ragStatuses = ["GREEN", "AMBER", "RED"] as const;
export const projectStatuses = ["DRAFT", "ACTIVE", "ON_HOLD", "CLOSED"] as const;
export const wbsItemTypes = [
  "PHASE",
  "WORK_PACKAGE",
  "DELIVERABLE",
  "MILESTONE",
  "TASK",
] as const;
export const wbsItemStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "AT_RISK",
  "BLOCKED",
  "DONE",
  "CANCELLED",
] as const;
export const raidItemTypes = ["RISK", "ASSUMPTION", "DEPENDENCY"] as const;
export const raidItemStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "MITIGATED",
  "VALIDATED",
  "BREACHED",
  "CLOSED",
] as const;
export const projectCalendarCodes = ["RU", "CN"] as const;
export const issueSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const openIssueStatuses = [
  "Open",
  "In Progress",
  "Blocked",
  "Resolved",
  "Closed",
] as const;

export type RagStatus = (typeof ragStatuses)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
export type WbsItemType = (typeof wbsItemTypes)[number];
export type WbsItemStatus = (typeof wbsItemStatuses)[number];
export type RaidItemType = (typeof raidItemTypes)[number];
export type RaidItemStatus = (typeof raidItemStatuses)[number];
export type ProjectCalendarCode = (typeof projectCalendarCodes)[number];
export type IssueSeverity = (typeof issueSeverities)[number];
export type OpenIssueStatus = (typeof openIssueStatuses)[number];

export const labels = {
  projectStatus: {
    DRAFT: "Черновик",
    ACTIVE: "Активен",
    ON_HOLD: "На паузе",
    CLOSED: "Закрыт",
  },
  rag: {
    GREEN: "В графике",
    AMBER: "Под риском",
    RED: "Критично",
  },
  wbsType: {
    PHASE: "Фаза",
    WORK_PACKAGE: "Пакет работ",
    DELIVERABLE: "Результат",
    MILESTONE: "Веха",
    TASK: "Задача",
  },
  wbsStatus: {
    NOT_STARTED: "Не начата",
    IN_PROGRESS: "В работе",
    AT_RISK: "Под риском",
    BLOCKED: "Провалено",
    DONE: "Сделано",
    CANCELLED: "Отменено",
  },
  raidType: {
    RISK: "Риск",
    ASSUMPTION: "Допущение",
    DEPENDENCY: "Проблема",
  },
  raidStatus: {
    OPEN: "Открыто",
    IN_PROGRESS: "В работе",
    MITIGATED: "Смягчено",
    VALIDATED: "Подтверждено",
    BREACHED: "Нарушено",
    CLOSED: "Закрыто",
  },
  issueSeverity: {
    LOW: "Низкая",
    MEDIUM: "Средняя",
    HIGH: "Высокая",
    CRITICAL: "Критичная",
  },
  openIssueStatus: {
    Open: "Открыто",
    "In Progress": "В работе",
    Blocked: "Заблокировано",
    Resolved: "Решено",
    Closed: "Закрыто",
  },
} as const;

export const projectIdentitySchema = z.object({
  code: z.string().trim().min(2),
  name: z.string().trim().min(3),
});

export const projectSchema = projectIdentitySchema.extend({
  parentId: z.string().trim().optional().nullable(),
  portfolio: z.string().trim().min(1),
  sponsor: z.string().trim().min(1),
  projectManager: z.string().trim().min(1),
  status: z.enum(projectStatuses).default("ACTIVE"),
  rag: z.enum(ragStatuses).default("GREEN"),
  startDate: z.string().trim().min(1),
  targetDate: z.string().trim().min(1),
  budgetPlanned: z.coerce.number().nonnegative(),
  budgetForecast: z.coerce.number().nonnegative(),
  scheduleVariance: z.coerce.number().int().default(0),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  summary: z.string().trim().min(3),
  sortOrder: z.coerce.number().int().default(0),
  uiState: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const wbsItemSchema = z.object({
  parentId: z.string().trim().optional().nullable(),
  code: z.string().trim().min(1),
  title: z.string().trim(),
  type: z.enum(wbsItemTypes).default("TASK"),
  status: z.enum(wbsItemStatuses).default("NOT_STARTED"),
  owner: z.string().trim(),
  startDate: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  baselineStartDate: z.string().trim().optional().nullable(),
  baselineDueDate: z.string().trim().optional().nullable(),
  forecastStartDate: z.string().trim().optional().nullable(),
  forecastDueDate: z.string().trim().optional().nullable(),
  wbsLevel: z.coerce.number().int().optional().nullable(),
  predecessor1: z.string().trim().optional().nullable(),
  predecessor2: z.string().trim().optional().nullable(),
  predecessor3: z.string().trim().optional().nullable(),
  leadLagDays: z.coerce.number().int().default(0),
  workDays: z.coerce.number().int().optional().nullable(),
  calendarDays: z.coerce.number().int().optional().nullable(),
  excelStartDate: z.string().trim().optional().nullable(),
  excelEndDate: z.string().trim().optional().nullable(),
  planWorkDays: z.coerce.number().int().optional().nullable(),
  planCalendarDays: z.coerce.number().int().optional().nullable(),
  calendarCode: z.enum(projectCalendarCodes).default("RU"),
  templateColor: z.string().trim().optional().nullable(),
  priority: z.string().trim().optional().nullable(),
  plannedCost: z.coerce.number().nonnegative().default(0),
  forecastCost: z.coerce.number().nonnegative().default(0),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z.string().trim().url().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const raidItemSchema = z.object({
  type: z.enum(raidItemTypes),
  title: z.string().trim().min(3),
  description: z.string().trim().min(3),
  owner: z.string().trim().optional().default(""),
  status: z.enum(raidItemStatuses).default("OPEN"),
  probability: z.coerce.number().int().min(0).max(5).default(0),
  impact: z.coerce.number().int().min(0).max(5).default(0),
  mitigationPlan: z.string().trim().optional().nullable(),
  contingencyPlan: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  residualRisk: z.coerce.number().int().min(0).max(25).default(0),
  validationDate: z.string().trim().optional().nullable(),
  linkedRiskId: z.string().trim().optional().nullable(),
  dependencyType: z.string().trim().optional().nullable(),
  predecessor: z.string().trim().optional().nullable(),
  successor: z.string().trim().optional().nullable(),
  supplier: z.string().trim().optional().nullable(),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z.string().trim().optional().nullable(),
  decisionRequired: z.boolean().default(false),
  escalationLevel: z.string().trim().min(1).default("Project"),
  scheduleImpactDays: z.coerce.number().int().default(0),
  budgetImpact: z.coerce.number().default(0),
});

export const createIssueSchema = z.object({
  title: z.string().trim().min(1),
  severity: z.enum(issueSeverities).default("HIGH"),
  owner: z.string().trim().optional().default(""),
  impact: z.string().trim().optional().default(""),
  decisionRequired: z.boolean().default(false),
  dueDate: z.string().trim().optional().nullable(),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z.string().trim().optional().nullable(),
  jiraLinks: z
    .array(
      z.object({
        jiraKey: z.string().trim().optional().default(""),
        jiraUrl: z.string().trim().optional().default(""),
      }),
    )
    .optional()
    .default([]),
});

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1).optional(),
  severity: z.enum(issueSeverities).optional(),
  status: z.enum(openIssueStatuses).optional(),
  owner: z.string().trim().optional(),
  impact: z.string().trim().optional(),
  decisionRequired: z.boolean().optional(),
  dueDate: z.string().trim().optional().nullable(),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z.string().trim().optional().nullable(),
});
