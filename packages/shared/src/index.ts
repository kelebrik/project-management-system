import { z } from "zod";

export const jiraCriticalPriorities = ["Critical", "Blocker"] as const;
export const jiraBugIssueTypes = [
  "Bug",
  "Bug Report",
  "Defect",
  "Баг",
  "Ошибка",
  "Дефект",
] as const;
export const jiraCriticalBugSlaHours = 30 * 24;

function normalizedJiraValue(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("ru") ?? "";
}

export function isJiraCriticalPriority(value: string | null | undefined) {
  const normalized = normalizedJiraValue(value);
  return jiraCriticalPriorities.some(
    (priority) => normalizedJiraValue(priority) === normalized,
  );
}

export function isJiraBugIssueType(value: string | null | undefined) {
  const normalized = normalizedJiraValue(value);
  if (jiraBugIssueTypes.some(
    (issueType) => normalizedJiraValue(issueType) === normalized,
  )) return true;
  return /^(bug|defect)(\s*[-:/(]|\s+report\b)/u.test(normalized) ||
    /^(баг|ошибка|дефект)(\s*[-:/(]|$)/u.test(normalized);
}

export const appViewKeys = [
  "portfolio",
  "portfolio-v2",
  "decision-queue",
  "projects",
  "reports",
  "wiki",
  "resources",
  "resources-capacity",
  "project-create",
  "project-overview",
  "project-schedule",
  "project-passport",
  "project-business-requirements",
  "project-current-work",
  "project-pm-workspace",
  "project-structure",
  "project-gantt",
  "project-jira-work",
  "project-issues",
  "project-raid",
  "project-changes",
  "project-budget",
  "project-calendars",
  "project-artifacts",
  "closed-projects",
  "admin",
  "admin-users",
  "admin-roles",
  "admin-dictionaries",
  "admin-templates",
  "admin-rag",
  "admin-workflows",
  "admin-integrations",
  "admin-health",
  "admin-backups",
  "admin-config",
  "admin-projects",
  "admin-business-units",
  "admin-modules",
  "admin-project-access",
  "admin-audit",
  "admin-analytics",
] as const;

export type AppViewKey = (typeof appViewKeys)[number];

export const projectAppViewKeys = [
  "project-overview",
  "project-schedule",
  "project-passport",
  "project-business-requirements",
  "project-current-work",
  "project-pm-workspace",
  "project-structure",
  "project-gantt",
  "project-jira-work",
  "project-issues",
  "project-raid",
  "project-changes",
  "project-budget",
  "project-calendars",
  "project-artifacts",
] as const satisfies readonly AppViewKey[];

export const appViewLabels: Record<AppViewKey, string> = {
  portfolio: "Портфель",
  "portfolio-v2": "Портфель_v2",
  "decision-queue": "Очередь решений",
  projects: "Проекты",
  reports: "Отчёты",
  wiki: "FAQ",
  resources: "Управление ресурсами",
  "resources-capacity": "Параметры ресурсов",
  "project-create": "Создание проекта",
  "project-overview": "Состояние",
  "project-schedule": "График",
  "project-passport": "Паспорт",
  "project-business-requirements": "Требования",
  "project-current-work": "Текучка",
  "project-pm-workspace": "Рабочий стол PM",
  "project-structure": "Структура",
  "project-gantt": "Гантт",
  "project-jira-work": "Работы Jira",
  "project-issues": "Вопросы",
  "project-raid": "Риски",
  "project-changes": "Изменения",
  "project-budget": "Бюджет",
  "project-calendars": "Календари",
  "project-artifacts": "Артефакты",
  "closed-projects": "Архив",
  admin: "Администрирование",
  "admin-users": "Пользователи",
  "admin-roles": "Роли и права",
  "admin-dictionaries": "Справочники",
  "admin-templates": "Шаблоны Структуры",
  "admin-rag": "Формулы RAG",
  "admin-workflows": "Workflow согласований",
  "admin-integrations": "Интеграции и API",
  "admin-health": "System health",
  "admin-backups": "Backup/restore",
  "admin-config": "Import/export",
  "admin-projects": "Реестр проектов",
  "admin-business-units": "Бизнес-юниты",
  "admin-modules": "Управление модулями",
  "admin-project-access": "Доступы",
  "admin-audit": "Журнал аудита",
  "admin-analytics": "Посещаемость",
};

export const ragStatuses = ["GREEN", "AMBER", "RED"] as const;
export const projectStatuses = ["DRAFT", "ACTIVE", "ON_HOLD", "CLOSED"] as const;
export const wbsItemTypes = [
  "PHASE",
  "WORK_PACKAGE",
  "DELIVERABLE",
  "MILESTONE",
  "GOAL",
  "TASK",
] as const;
export const wbsItemStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_REVIEW",
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
export const projectCalendarCodes = ["RU", "CN", "RU_CN"] as const;
export const userRoles = [
  "ADMIN",
  "PROJECT_MANAGER",
  "TEAM_MEMBER",
  "EXECUTIVE_VIEWER",
] as const;
export const assignableUserRoles = [
  "ADMIN",
  "EXECUTIVE_VIEWER",
] as const;
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
export type UserRole = (typeof userRoles)[number];
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
    GOAL: "Цель",
    TASK: "Задача",
  },
  wbsStatus: {
    NOT_STARTED: "Не начата",
    IN_PROGRESS: "В работе",
    IN_REVIEW: "На проверке",
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
  userRole: {
    ADMIN: "Администратор системы",
    PROJECT_MANAGER: "Пользователь",
    TEAM_MEMBER: "Пользователь",
    EXECUTIVE_VIEWER: "Пользователь",
  },
} as const;

export const createUserSchema = z.object({
  email: z.string().trim().email("Некорректный email").toLowerCase(),
  name: z.string().trim().min(2, "Укажите имя пользователя"),
  role: z.enum(assignableUserRoles).default("EXECUTIVE_VIEWER"),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  email: z.string().trim().email("Некорректный email").toLowerCase().optional(),
  name: z.string().trim().min(2, "Укажите имя пользователя").optional(),
  role: z.enum(assignableUserRoles).optional(),
  isActive: z.boolean().optional(),
});

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

const wbsItemShape = {
  parentId: z.string().trim().optional().nullable(),
  code: z.string().trim().min(1),
  title: z.string().trim(),
  type: z.enum(wbsItemTypes),
  status: z.enum(wbsItemStatuses),
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
  predecessor4: z.string().trim().optional().nullable(),
  predecessor5: z.string().trim().optional().nullable(),
  predecessor6: z.string().trim().optional().nullable(),
  leadLagDays: z.coerce.number().int(),
  workDays: z.coerce.number().int().optional().nullable(),
  calendarDays: z.coerce.number().int().optional().nullable(),
  scheduleDriver: z.enum(["dates", "workDays"]).optional(),
  excelStartDate: z.string().trim().optional().nullable(),
  excelEndDate: z.string().trim().optional().nullable(),
  planWorkDays: z.coerce.number().int().optional().nullable(),
  planCalendarDays: z.coerce.number().int().optional().nullable(),
  calendarCode: z.enum(projectCalendarCodes),
  templateColor: z.string().trim().optional().nullable(),
  priority: z.string().trim().optional().nullable(),
  effortPercent: z.coerce.number().int().min(0).max(100),
  plannedCost: z.coerce.number().nonnegative(),
  forecastCost: z.coerce.number().nonnegative(),
  progress: z.coerce.number().int().min(0).max(100),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z
    .string()
    .trim()
    .url()
    .startsWith("https://", "Ссылка Jira должна начинаться с https://")
    .optional()
    .nullable(),
  mattermostUrl: z
    .preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      z
        .string()
        .trim()
        .url()
        .refine((value) => {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            url.hostname.toLowerCase() === "mm.sberdevices.ru"
          );
        }, "Ссылка MM должна вести на https://mm.sberdevices.ru")
        .nullable(),
    )
    .optional(),
  description: z.string().trim().optional().nullable(),
  comment: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int(),
} as const;

export const wbsItemBaseSchema = z.object(wbsItemShape);

export const wbsItemSchema = wbsItemBaseSchema.extend({
  type: wbsItemShape.type.default("TASK"),
  status: wbsItemShape.status.default("NOT_STARTED"),
  leadLagDays: wbsItemShape.leadLagDays.default(0),
  calendarCode: wbsItemShape.calendarCode.default("RU"),
  effortPercent: wbsItemShape.effortPercent.default(0),
  plannedCost: wbsItemShape.plannedCost.default(0),
  forecastCost: wbsItemShape.forecastCost.default(0),
  progress: wbsItemShape.progress.default(0),
  sortOrder: wbsItemShape.sortOrder.default(0),
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

export const raidItemStatusUpdateSchema = z.object({
  statusAt: z.string().trim().min(1),
  text: z.string().trim().min(1),
});

export const issueStatusUpdateSchema = z.object({
  statusAt: z.string().trim().min(1),
  text: z.string().trim().min(1),
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
