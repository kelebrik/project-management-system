import {
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileText,
  FolderTree,
  GanttChartSquare,
  LayoutDashboard,
  ListChecks,
  Plus,
  Search,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { labels } from "@pms/shared";
import { apiClient } from "./api/client";
import "./App.css";

type RagStatus = "GREEN" | "AMBER" | "RED";
type WbsItemType =
  | "PHASE"
  | "WORK_PACKAGE"
  | "DELIVERABLE"
  | "MILESTONE"
  | "TASK";
type WbsItemStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "AT_RISK"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";
type AppView =
  | "portfolio"
  | "project-create"
  | "project-overview"
  | "project-passport"
  | "project-structure"
  | "project-gantt"
  | "project-issues"
  | "project-raid"
  | "project-calendars"
  | "project-artifacts"
  | "admin";

type ProjectListItem = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED";
  rag: RagStatus;
  startDate: string;
  targetDate: string;
  progress: number;
  scheduleVariance: number;
  budgetPlanned: string;
  budgetForecast: string;
  summary: string;
  sortOrder: number;
  uiState: ProjectUiState | null;
  jiraIntegration: JiraIntegration | null;
  _count: {
    tasks: number;
    issues: number;
    jiraSnapshots: number;
  };
};

type ProjectTreeItem = ProjectListItem & {
  children: ProjectTreeItem[];
  level: number;
};

type JiraIntegration = {
  baseUrl: string;
  boardUrl: string;
  projectKey: string;
  issuesJql: string;
  openIssuesJql: string;
  syncStatus: string;
  lastSyncedAt: string | null;
};

type ProjectDetails = ProjectListItem & {
  tasks: Task[];
  issues: Issue[];
  jiraSnapshots: JiraIssueSnapshot[];
  overviews: ExecutiveOverview[];
  milestones: Milestone[];
  wbsItems: WbsItem[];
  wbsDependencies: WbsDependency[];
  calendarOverrides: ProjectCalendarOverride[];
  artifacts: ProjectArtifact[];
  raidItems: RaidItem[];
  changeRequests: unknown[];
};

type PassportRow = {
  id: string;
  field: string;
  description: string;
};

type ProjectUiState = {
  sidebarCollapsed?: boolean;
  wbsColumnOrder?: WbsTableColumnKey[];
  wbsHiddenColumns?: WbsTableColumnKey[];
  wbsColumnWidths?: Partial<Record<WbsTableColumnKey, number>>;
  ganttPanelHeight?: number;
  ganttPanelWidth?: number;
  ganttWbsWidth?: number;
  passportRows?: PassportRow[];
};

type ProjectFormState = {
  parentId: string;
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED";
  rag: RagStatus;
  startDate: string;
  targetDate: string;
  budgetPlanned: string;
  budgetForecast: string;
  scheduleVariance: string;
  progress: string;
  summary: string;
  sortOrder: string;
};

type ProjectRegistryDraft = {
  parentId: string;
  code: string;
  name: string;
  projectManager: string;
  status: ProjectListItem["status"];
  rag: RagStatus;
  sortOrder: string;
};

type Task = {
  id: string;
  title: string;
  owner: string;
  status: string;
  priority: string;
  dueDate: string | null;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  jiraStatus: string | null;
};

type WbsItem = {
  id: string;
  parentId: string | null;
  code: string;
  title: string;
  type: WbsItemType;
  status: WbsItemStatus;
  owner: string;
  startDate: string | null;
  dueDate: string | null;
  baselineStartDate: string | null;
  baselineDueDate: string | null;
  forecastStartDate: string | null;
  forecastDueDate: string | null;
  wbsLevel: number | null;
  predecessor1: string | null;
  predecessor2: string | null;
  predecessor3: string | null;
  predecessor4: string | null;
  predecessor5: string | null;
  predecessor6: string | null;
  leadLagDays: number;
  workDays: number | null;
  calendarDays: number | null;
  excelStartDate: string | null;
  excelEndDate: string | null;
  planWorkDays: number | null;
  planCalendarDays: number | null;
  calendarCode: ProjectCalendarCode;
  templateColor: string | null;
  priority: string | null;
  plannedCost: string;
  forecastCost: string;
  progress: number;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  description: string | null;
  sortOrder: number;
};

type WbsTreeItem = WbsItem & {
  children: WbsTreeItem[];
  level: number;
};

type WbsDependencyType = "FS" | "SS" | "FF" | "SF";
type ProjectCalendarCode = "RU" | "CN";

type WbsDependency = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
  lagDays: number;
  predecessor: Pick<WbsItem, "id" | "code" | "title">;
  successor: Pick<WbsItem, "id" | "code" | "title">;
};

type WbsDependencySnapshot = Pick<
  WbsDependency,
  "predecessorId" | "successorId" | "type" | "lagDays"
>;

type GanttLinkEndpoint = {
  itemId: string;
  side: "start" | "end";
};

type GanttLinkDraft = GanttLinkEndpoint & {
  pointerX: number;
  pointerY: number;
  replaceDependencyId?: string;
};

type WbsSnapshot = {
  wbsItems: WbsItem[];
  wbsDependencies: WbsDependencySnapshot[];
};

type ProjectCalendarOverride = {
  id: string;
  projectId: string;
  calendarCode: ProjectCalendarCode;
  date: string;
  isWorkingDay: boolean;
  description: string | null;
};

type WbsFormState = {
  parentId: string;
  code: string;
  title: string;
  type: WbsItemType;
  status: WbsItemStatus;
  owner: string;
  startDate: string;
  dueDate: string;
  baselineStartDate: string;
  baselineDueDate: string;
  forecastStartDate: string;
  forecastDueDate: string;
  wbsLevel: string;
  predecessor1: string;
  predecessor2: string;
  predecessor3: string;
  predecessor4: string;
  predecessor5: string;
  predecessor6: string;
  leadLagDays: string;
  workDays: string;
  calendarDays: string;
  calendarCode: ProjectCalendarCode;
  excelStartDate: string;
  excelEndDate: string;
  planWorkDays: string;
  planCalendarDays: string;
  templateColor: string;
  priority: string;
  plannedCost: string;
  forecastCost: string;
  progress: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  description: string;
  sortOrder: string;
};

type JiraFormState = {
  baseUrl: string;
  boardUrl: string;
  projectKey: string;
  issuesJql: string;
  openIssuesJql: string;
};

type IssueFormState = {
  title: string;
  severity: Issue["severity"];
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  jiraLinks: JiraLinkDraft[];
};

type Milestone = {
  id: string;
  code: string | null;
  title: string;
  dueDate: string;
  status: string;
  owner: string;
  description: string | null;
};

type ProjectArtifact = {
  id: string;
  title: string;
  type: string;
  owner: string;
  status: ArtifactStatus;
  url: string | null;
  description: string | null;
  sortOrder: number;
};

type RaidItemType = "RISK" | "ASSUMPTION" | "DEPENDENCY";
type RaidItemStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "MITIGATED"
  | "VALIDATED"
  | "BREACHED"
  | "CLOSED";

type RaidItem = {
  id: string;
  type: RaidItemType;
  title: string;
  description: string;
  owner: string;
  status: RaidItemStatus;
  probability: number;
  impact: number;
  riskScore: number;
  mitigationPlan: string | null;
  contingencyPlan: string | null;
  dueDate: string | null;
  residualRisk: number;
  validationDate: string | null;
  linkedRiskId: string | null;
  dependencyType: string | null;
  predecessor: string | null;
  successor: string | null;
  supplier: string | null;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  decisionRequired: boolean;
  escalationLevel: string;
  scheduleImpactDays: number;
  budgetImpact: string;
};

type RaidFormState = {
  type: RaidItemType;
  title: string;
  description: string;
  owner: string;
  status: RaidItemStatus;
  probability: string;
  impact: string;
  mitigationPlan: string;
  contingencyPlan: string;
  dueDate: string;
  residualRisk: string;
  validationDate: string;
  linkedRiskId: string;
  dependencyType: string;
  predecessor: string;
  successor: string;
  supplier: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  decisionRequired: boolean;
  escalationLevel: string;
  scheduleImpactDays: string;
  budgetImpact: string;
};

type ArtifactStatus =
  | "Draft"
  | "In Review"
  | "Approved"
  | "Baseline"
  | "Archived";

type ArtifactFormState = {
  title: string;
  type: string;
  owner: string;
  status: ArtifactStatus;
  url: string;
  description: string;
  sortOrder: string;
};

type IssueEditDraft = {
  title: string;
  severity: Issue["severity"];
  status: string;
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
};

type TaskJiraDraft = {
  jiraTicketKey: string;
  jiraTicketUrl: string;
};

type IssueJiraLink = {
  id: string;
  jiraKey: string;
  jiraUrl: string;
};

type JiraLinkDraft = {
  jiraKey: string;
  jiraUrl: string;
};

type Issue = {
  id: string;
  source: "INTERNAL" | "JIRA";
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string | null;
  initialDueDate: string | null;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  jiraLinks: IssueJiraLink[];
};

type JiraIssueSnapshot = {
  id: string;
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  issueType: string;
  updatedAt: string;
  syncedAt: string;
};

type ExecutiveOverview = {
  id: string;
  version: number;
  status: string;
  generatedAt: string | null;
  reviewRequestedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  publishedAt: string | null;
  executiveSummary: string;
  kpis: Array<{
    label: string;
    value: string;
    secondary: string;
    tone: "green" | "amber" | "red" | "neutral";
    source: string;
  }> | null;
  qualityGates: Array<{
    name: string;
    status: "OK" | "WARN" | "BLOCKED";
    detail: string;
    source: string;
  }> | null;
  risks: Array<{
    title: string;
    severity: string;
    owner: string;
    impact: string;
    dueDate: string | null;
    source: string;
  }> | null;
  nextSteps: Array<{
    title: string;
    owner: string;
    dueDate: string | null;
    source: string;
  }> | null;
  decisions: Array<{
    title: string;
    impactIfApproved: string;
    impactIfDelayed: string;
    deadline: string | null;
    source?: string;
  }>;
  evidence: Array<{
    metric: string;
    source: string;
  }>;
};

type GanttCssProperties = CSSProperties & {
  "--gantt-panel-height": string;
  "--gantt-panel-width": string;
  "--gantt-wbs-width": string;
  "--gantt-timeline-width": string;
};

type GanttScale = "month" | "quarter";
type RaidTypeFilter = "ALL" | RaidItemType;

type WbsTableCssProperties = CSSProperties & {
  "--wbs-table-template": string;
  "--wbs-level-width": string;
};

const WBS_LEVEL_MIN_WIDTH = 128;
const GANTT_PANEL_HEIGHT_DEFAULT = 456;
const GANTT_PANEL_WIDTH_DEFAULT = 0;
const GANTT_SCALE_WIDTH: Record<GanttScale, number> = {
  month: 120,
  quarter: 72,
};
const GANTT_HIERARCHY_LEVELS = [1, 2, 3, 4, 5] as const;
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

const emptyIssueForm: IssueFormState = {
  title: "",
  severity: "HIGH",
  owner: "",
  impact: "",
  decisionRequired: false,
  dueDate: "",
  jiraTicketKey: "",
  jiraTicketUrl: "",
  jiraLinks: [{ jiraKey: "", jiraUrl: "" }],
};

const emptyProjectForm: ProjectFormState = {
  parentId: "",
  code: "",
  name: "",
  portfolio: "",
  sponsor: "",
  projectManager: "",
  status: "ACTIVE",
  rag: "GREEN",
  startDate: "",
  targetDate: "",
  budgetPlanned: "0",
  budgetForecast: "0",
  scheduleVariance: "0",
  progress: "0",
  summary: "",
  sortOrder: "0",
};

function newProjectFormDefaults(): ProjectFormState {
  const startDate = new Date();
  const targetDate = addMonths(startDate, 1);
  const suffix = String(Date.now()).slice(-5);
  return {
    ...emptyProjectForm,
    code: `PRJ-${suffix}`,
    name: "Новый проект",
    portfolio: "Портфель проектов",
    sponsor: "Спонсор",
    projectManager: "Руководитель проекта",
    startDate: isoDate(startDate),
    targetDate: isoDate(targetDate),
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "Новый проект",
  };
}

const emptyArtifactForm: ArtifactFormState = {
  title: "",
  type: "Документ",
  owner: "",
  status: "Draft",
  url: "",
  description: "",
  sortOrder: "0",
};

const emptyRaidForm: RaidFormState = {
  type: "RISK",
  title: "",
  description: "",
  owner: "",
  status: "OPEN",
  probability: "3",
  impact: "3",
  mitigationPlan: "",
  contingencyPlan: "",
  dueDate: "",
  residualRisk: "0",
  validationDate: "",
  linkedRiskId: "",
  dependencyType: "",
  predecessor: "",
  successor: "",
  supplier: "",
  jiraTicketKey: "",
  jiraTicketUrl: "",
  decisionRequired: false,
  escalationLevel: "Проект",
  scheduleImpactDays: "0",
  budgetImpact: "0",
};

const WBS_TABLE_COLUMNS = [
  { key: "level", label: "Уровень", width: WBS_LEVEL_MIN_WIDTH },
  { key: "structure", label: "Структура", width: 420 },
  { key: "type", label: "Тип", width: 132 },
  { key: "status", label: "Статус", width: 136 },
  { key: "owner", label: "Исполнитель", width: 150 },
  { key: "start", label: "Старт", width: 138 },
  { key: "due", label: "Срок", width: 138 },
  { key: "workDays", label: "Раб. дни", width: 96 },
  { key: "calendarDays", label: "Кал. дни", width: 96 },
  { key: "calendar", label: "Календарь", width: 110 },
  { key: "progress", label: "%", width: 72 },
  { key: "predecessor1", label: "Предшественник 1", width: 148 },
  { key: "predecessor2", label: "Предшественник 2", width: 148 },
  { key: "predecessor3", label: "Предшественник 3", width: 148 },
  { key: "predecessor4", label: "Предшественник 4", width: 148 },
  { key: "predecessor5", label: "Предшественник 5", width: 148 },
  { key: "predecessor6", label: "Предшественник 6", width: 148 },
  { key: "leadLag", label: "Сдвиг", width: 92 },
] as const;

const WBS_PREDECESSOR_KEYS = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

const WBS_DIRTY_FIELDS: Array<keyof WbsFormState> = [
  "title",
  "type",
  "status",
  "owner",
  "startDate",
  "dueDate",
  "workDays",
  "calendarDays",
  "calendarCode",
  "progress",
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
  "leadLagDays",
  "wbsLevel",
];

const WBS_COLUMN_FIELDS: Record<WbsTableColumnKey, Array<keyof WbsFormState>> = {
  level: ["wbsLevel"],
  structure: ["title"],
  type: ["type"],
  status: ["status"],
  owner: ["owner"],
  start: ["startDate"],
  due: ["dueDate"],
  workDays: ["workDays"],
  calendarDays: ["calendarDays"],
  calendar: ["calendarCode"],
  progress: ["progress"],
  predecessor1: ["predecessor1"],
  predecessor2: ["predecessor2"],
  predecessor3: ["predecessor3"],
  predecessor4: ["predecessor4"],
  predecessor5: ["predecessor5"],
  predecessor6: ["predecessor6"],
  leadLag: ["leadLagDays"],
};

const PROJECT_CALENDAR_LABELS: Record<ProjectCalendarCode, string> = {
  RU: "RU календарь",
  CN: "CN календарь",
};

const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

type WbsTableColumnKey = (typeof WBS_TABLE_COLUMNS)[number]["key"];
type WbsTableColumn = (typeof WBS_TABLE_COLUMNS)[number];

function normalizeWbsColumnOrder(order?: WbsTableColumnKey[]) {
  const knownKeys = new Set(WBS_TABLE_COLUMNS.map((column) => column.key));
  const orderedKeys = order?.length
    ? order.filter((key) => knownKeys.has(key))
    : WBS_TABLE_COLUMNS.map((column) => column.key);
  const fixedKeys: WbsTableColumnKey[] = ["level", "structure"];
  const movableKeys = orderedKeys.filter(
    (key) => key !== "level" && key !== "structure",
  );
  const missingKeys = WBS_TABLE_COLUMNS.map((column) => column.key).filter(
    (key) =>
      key !== "level" &&
      key !== "structure" &&
      !movableKeys.includes(key),
  );

  return [...fixedKeys, ...movableKeys, ...missingKeys];
}

function normalizeWbsHiddenColumns(hidden?: WbsTableColumnKey[]) {
  const knownKeys = new Set(WBS_TABLE_COLUMNS.map((column) => column.key));
  return [
    ...new Set(
      (hidden ?? []).filter(
        (key) =>
          knownKeys.has(key) && key !== "level" && key !== "structure",
      ),
    ),
  ];
}

function normalizeWbsColumnWidths(
  widths?: Partial<Record<WbsTableColumnKey, number>>,
) {
  const defaultWidths = Object.fromEntries(
    WBS_TABLE_COLUMNS.map((column) => [column.key, column.width]),
  ) as Record<WbsTableColumnKey, number>;

  return {
    ...defaultWidths,
    ...widths,
    level: Math.max(
      WBS_LEVEL_MIN_WIDTH,
      widths?.level ?? defaultWidths.level,
    ),
  };
}

const GANTT_ROW_HEIGHT = 36;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function artifactToForm(artifact: ProjectArtifact): ArtifactFormState {
  return {
    title: artifact.title,
    type: artifact.type,
    owner: artifact.owner,
    status: artifact.status,
    url: artifact.url ?? "",
    description: artifact.description ?? "",
    sortOrder: String(artifact.sortOrder),
  };
}

function defaultPassportRows(project: ProjectDetails): PassportRow[] {
  return [
    { id: "portfolio", field: "Портфель", description: project.portfolio },
    { id: "sponsor", field: "Спонсор", description: project.sponsor },
    { id: "projectManager", field: "РП", description: project.projectManager },
    { id: "status", field: "Статус", description: projectStatusLabel(project.status) },
    { id: "rag", field: "Индикатор", description: projectHealthLabel(project.rag) },
    { id: "startDate", field: "Старт", description: date(project.startDate) },
    { id: "targetDate", field: "Целевая дата", description: date(project.targetDate) },
  ];
}

function normalizePassportRows(project: ProjectDetails | null): PassportRow[] {
  if (!project) return [];
  const rows = project.uiState?.passportRows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return defaultPassportRows(project);
  }
  return rows.map((row, index) => ({
    id: row.id || `passport-row-${index + 1}`,
    field: row.field ?? "",
    description: row.description ?? "",
  }));
}

function raidToForm(item: RaidItem): RaidFormState {
  return {
    type: item.type,
    title: item.title,
    description: item.description,
    owner: item.owner,
    status: item.status,
    probability: String(item.probability),
    impact: String(item.impact),
    mitigationPlan: item.mitigationPlan ?? "",
    contingencyPlan: item.contingencyPlan ?? "",
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    residualRisk: String(item.residualRisk),
    validationDate: item.validationDate ? item.validationDate.slice(0, 10) : "",
    linkedRiskId: item.linkedRiskId ?? "",
    dependencyType: item.dependencyType ?? "",
    predecessor: item.predecessor ?? "",
    successor: item.successor ?? "",
    supplier: item.supplier ?? "",
    jiraTicketKey: item.jiraTicketKey ?? "",
    jiraTicketUrl: item.jiraTicketUrl ?? "",
    decisionRequired: item.decisionRequired,
    escalationLevel: item.escalationLevel,
    scheduleImpactDays: String(item.scheduleImpactDays),
    budgetImpact: String(item.budgetImpact),
  };
}

function issueToDraft(issue: Issue): IssueEditDraft {
  return {
    title: issue.title,
    severity: issue.severity,
    status: issue.status,
    owner: issue.owner,
    impact: issue.impact,
    decisionRequired: issue.decisionRequired,
    dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : "",
    jiraTicketKey: issue.jiraTicketKey ?? "",
    jiraTicketUrl: issue.jiraTicketUrl ?? "",
  };
}

function wbsToForm(item: WbsItem): WbsFormState {
  return {
    parentId: item.parentId ?? "",
    code: item.code,
    title: item.title,
    type: item.type,
    status: item.status,
    owner: item.owner,
    startDate: item.startDate ? item.startDate.slice(0, 10) : "",
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    baselineStartDate: item.baselineStartDate
      ? item.baselineStartDate.slice(0, 10)
      : "",
    baselineDueDate: item.baselineDueDate
      ? item.baselineDueDate.slice(0, 10)
      : "",
    forecastStartDate: item.forecastStartDate
      ? item.forecastStartDate.slice(0, 10)
      : "",
    forecastDueDate: item.forecastDueDate
      ? item.forecastDueDate.slice(0, 10)
      : "",
    wbsLevel: item.wbsLevel === null ? "" : String(item.wbsLevel),
    predecessor1: item.predecessor1 ?? "",
    predecessor2: item.predecessor2 ?? "",
    predecessor3: item.predecessor3 ?? "",
    predecessor4: item.predecessor4 ?? "",
    predecessor5: item.predecessor5 ?? "",
    predecessor6: item.predecessor6 ?? "",
    leadLagDays: String(item.leadLagDays),
    workDays: item.workDays === null ? "" : String(item.workDays),
    calendarDays: item.calendarDays === null ? "" : String(item.calendarDays),
    excelStartDate: item.excelStartDate ? item.excelStartDate.slice(0, 10) : "",
    excelEndDate: item.excelEndDate ? item.excelEndDate.slice(0, 10) : "",
    planWorkDays:
      item.planWorkDays === null ? "" : String(item.planWorkDays),
    planCalendarDays:
      item.planCalendarDays === null ? "" : String(item.planCalendarDays),
    calendarCode: item.calendarCode ?? "RU",
    templateColor: item.templateColor ?? "",
    priority: item.priority ?? "",
    plannedCost: String(item.plannedCost),
    forecastCost: String(item.forecastCost),
    progress: String(item.progress),
    jiraTicketKey: item.jiraTicketKey ?? "",
    jiraTicketUrl: item.jiraTicketUrl ?? "",
    description: item.description ?? "",
    sortOrder: String(item.sortOrder),
  };
}

function projectToRegistryDraft(project: ProjectListItem): ProjectRegistryDraft {
  return {
    parentId: project.parentId ?? "",
    code: project.code,
    name: project.name,
    projectManager: project.projectManager,
    status: project.status,
    rag: project.rag,
    sortOrder: String(project.sortOrder),
  };
}

function projectsToRegistryDrafts(projects: ProjectListItem[]) {
  return Object.fromEntries(
    projects.map((project) => [project.id, projectToRegistryDraft(project)]),
  );
}

function date(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function shortDate(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

function daysBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
}

function signedDaysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function signedDaysUntil(value: string | null) {
  if (!value) return null;
  const target = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDaysLeft(days: number | null) {
  if (days === null) return "не задано";
  if (days === 0) return "сегодня";
  return `${days > 0 ? days : Math.abs(days)} дн.${days < 0 ? " проср." : ""}`;
}

function calendarDelayDays(initialValue: string | null, currentValue: string | null) {
  if (!initialValue || !currentValue) return 0;
  const initialDate = startOfDay(new Date(initialValue));
  const currentDate = startOfDay(new Date(currentValue));
  if (Number.isNaN(initialDate.getTime()) || Number.isNaN(currentDate.getTime())) {
    return 0;
  }
  return Math.max(
    0,
    Math.round((currentDate.getTime() - initialDate.getTime()) / 86_400_000),
  );
}

function isImportedSummary(value: string | null | undefined) {
  return Boolean(value?.trim().toLowerCase().startsWith("imported from "));
}

function signedWorkingDaysUntil(value: string | null) {
  if (!value) return null;
  const target = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  if (Number.isNaN(target.getTime())) return null;
  const direction = target.getTime() >= today.getTime() ? 1 : -1;
  const cursor = new Date(today);
  let days = 0;
  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + direction);
    if (isDefaultWorkingDay(cursor)) {
      days += direction;
    }
  }
  return days;
}

function responseErrorMessage(result: unknown, fallback: string) {
  if (!result || typeof result !== "object") return fallback;
  const error = "error" in result ? result.error : result;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;
  if ("formErrors" in error && Array.isArray(error.formErrors)) {
    const formErrors = error.formErrors.filter(
      (item): item is string => typeof item === "string",
    );
    if (formErrors.length > 0) return formErrors.join(", ");
  }
  if ("fieldErrors" in error && error.fieldErrors && typeof error.fieldErrors === "object") {
    const fieldErrors = Object.entries(error.fieldErrors).flatMap(([, value]) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
    if (fieldErrors.length > 0) return fieldErrors.join(", ");
  }
  return fallback;
}

function projectOptionLabel(project: ProjectListItem) {
  return `${project.code} - ${project.name}`;
}

function projectStatusLabel(status: ProjectListItem["status"]) {
  return labels.projectStatus[status];
}

function projectHealthLabel(rag: RagStatus) {
  return labels.rag[rag];
}

function ragOptionLabel(rag: RagStatus) {
  const labels: Record<RagStatus, string> = {
    GREEN: "Зеленый",
    AMBER: "Желтый",
    RED: "Красный",
  };
  return labels[rag];
}

function wbsTypeLabel(type: WbsItemType) {
  return labels.wbsType[type];
}

function wbsStatusLabel(status: WbsItemStatus) {
  return labels.wbsStatus[status];
}

function issueSeverityLabel(severity: Issue["severity"]) {
  return labels.issueSeverity[severity];
}

function issueStatusLabel(status: string) {
  return labels.openIssueStatus[status as keyof typeof labels.openIssueStatus] ?? status;
}

function artifactStatusLabel(status: string) {
  const labels: Record<string, string> = {
    Draft: "Черновик",
    "In Review": "На согласовании",
    Approved: "Одобрен",
    Baseline: "Базовый план",
    Archived: "Архив",
  };
  return labels[status] ?? status;
}

function flattenWbsDescendants(item: WbsTreeItem): WbsTreeItem[] {
  return item.children.flatMap((child) => [
    child,
    ...flattenWbsDescendants(child),
  ]);
}

function wbsToneClass(
  item: Pick<WbsItem, "dueDate" | "status" | "type">,
) {
  if (item.type === "MILESTONE") return "tone-o";
  if (item.status === "DONE") return "tone-g";
  if (item.status === "AT_RISK" || item.status === "BLOCKED") return "tone-r";
  if (
    item.dueDate &&
    new Date(item.dueDate) < startOfDay(new Date())
  ) {
    return "tone-p";
  }
  if (item.status === "IN_PROGRESS") return "tone-b";
  return "tone-x";
}

function milestoneStateLabel(milestone: WbsItem, precedingTasks: WbsItem[]) {
  const today = startOfDay(new Date());
  if (milestone.status === "DONE") {
    return { label: "Веха пройдена", tone: "green" };
  }
  if (
    milestone.dueDate &&
    startOfDay(new Date(milestone.dueDate)) < today
  ) {
    return { label: "Веха просрочена", tone: "red" };
  }

  const lastTasks = precedingTasks
    .filter((item) => item.status !== "CANCELLED")
    .slice(-5);
  if (
    lastTasks.length > 0 &&
    lastTasks.every((item) => item.status === "NOT_STARTED")
  ) {
    return { label: "Последние задачи не начаты", tone: "gray" };
  }
  if (lastTasks.some((item) => item.status === "IN_PROGRESS")) {
    return { label: "Последние задачи в работе", tone: "blue" };
  }
  return { label: "Веха запланирована", tone: "gray" };
}

function summaryToneClass(item: WbsTreeItem) {
  const descendants = flattenWbsDescendants(item);
  if (
    descendants.length > 0 &&
    descendants.every((descendant) => descendant.status === "DONE")
  ) {
    return "tone-g";
  }
  if (
    item.status === "IN_PROGRESS" ||
    descendants.some((descendant) => descendant.status === "IN_PROGRESS")
  ) {
    return "tone-b";
  }
  if (
    item.status === "AT_RISK" ||
    item.status === "BLOCKED" ||
    descendants.some(
      (descendant) =>
        descendant.status === "AT_RISK" || descendant.status === "BLOCKED",
    )
  ) {
    return "tone-r";
  }
  return wbsToneClass(item);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "numeric",
  }).format(value);
}

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarMonthDays(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const leadingEmpty = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from(
    { length: leadingEmpty },
    () => null,
  );
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, monthIndex, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function isDefaultWorkingDay(dateValue: Date) {
  const day = dateValue.getDay();
  return day !== 0 && day !== 6;
}

function raidTypeLabel(type: RaidItemType) {
  return labels.raidType[type];
}

function raidStatusLabel(status: RaidItemStatus) {
  return labels.raidStatus[status];
}

function riskTone(score: number) {
  if (score >= 15) return "red";
  if (score >= 8) return "amber";
  return "green";
}

function overviewStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Черновик",
    GENERATED: "Сгенерировано",
    PM_REVIEW: "Проверка РП",
    APPROVED: "Одобрено",
    PUBLISHED: "Опубликовано",
  };
  return labels[status] ?? status;
}

function gateStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OK: "В норме",
    WARN: "Предупреждение",
    BLOCKED: "Заблокировано",
  };
  return labels[status] ?? status;
}

function dateTime(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildWbsTree(items: WbsItem[]) {
  const byId = new Map<string, WbsTreeItem>();
  const roots: WbsTreeItem[] = [];

  items.forEach((item) => {
    byId.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach((item) => {
    const treeItem = byId.get(item.id);
    if (!treeItem) return;
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) {
      parent.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }
  });

  const flatten = (nodes: WbsTreeItem[], level = 0): WbsTreeItem[] =>
    nodes.flatMap((node) => {
      node.level = level;
      return [node, ...flatten(node.children, level + 1)];
    });

  return flatten(roots);
}

function wbsDisplayLevel(item: Pick<WbsTreeItem, "level" | "wbsLevel">) {
  return Math.max(0, (item.wbsLevel ?? item.level + 1) - 1);
}

function wbsDraftDisplayLevel(
  item: Pick<WbsTreeItem, "level" | "wbsLevel">,
  draft: Pick<WbsFormState, "wbsLevel">,
) {
  const draftLevel = draft.wbsLevel ? Number(draft.wbsLevel) : null;
  return Math.max(0, (draftLevel ?? item.wbsLevel ?? item.level + 1) - 1);
}

function collapsedWbsIdsForLevel(items: WbsTreeItem[], level: number) {
  const deepestVisibleLevel = Math.max(1, level);
  return new Set(
    items
      .filter(
        (item) =>
          item.children.length > 0 &&
          wbsDisplayLevel(item) >= deepestVisibleLevel - 1,
      )
      .map((item) => item.id),
  );
}

function setsAreEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function buildRenumberedWbsCodes(
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
) {
  const counters: number[] = [];
  const codes = new Map<string, string>();

  for (const item of items) {
    const draft = drafts[item.id];
    const requestedLevel = draft?.wbsLevel
      ? Number(draft.wbsLevel)
      : item.wbsLevel ?? item.level + 1;
    const level = Math.max(1, requestedLevel);
    while (counters.length < level - 1) {
      counters.push(1);
    }
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    counters.length = level;
    codes.set(item.id, counters.join("."));
  }

  return codes;
}

function resolveDraftPredecessorCode(
  code: string,
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
  renumberedCodes: Map<string, string>,
) {
  const normalizedCode = code.trim();
  if (!normalizedCode) return "";

  const currentItem = items.find((item) => item.code === normalizedCode);
  if (currentItem) {
    return renumberedCodes.get(currentItem.id) ?? currentItem.code;
  }

  const draftItem = items.find(
    (item) => (drafts[item.id]?.code ?? item.code) === normalizedCode,
  );
  if (draftItem) {
    return renumberedCodes.get(draftItem.id) ?? draftItem.code;
  }

  return normalizedCode;
}

function wbsSnapshotsEqual(left: WbsSnapshot, right: WbsSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parentIdFromWbsLevel(
  itemId: string,
  nextLevel: number | null,
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
) {
  if (!nextLevel || nextLevel <= 1) return null;
  const itemIndex = items.findIndex((item) => item.id === itemId);
  if (itemIndex <= 0) return null;

  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    const candidateDraft = drafts[candidate.id];
    const candidateLevel = candidateDraft?.wbsLevel
      ? Number(candidateDraft.wbsLevel)
      : candidate.wbsLevel ?? candidate.level + 1;
    if (candidateLevel < nextLevel) return candidate.id;
  }

  return null;
}

function buildProjectTree(items: ProjectListItem[]) {
  const byId = new Map<string, ProjectTreeItem>();
  const roots: ProjectTreeItem[] = [];

  items.forEach((item) => {
    byId.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach((item) => {
    const treeItem = byId.get(item.id);
    if (!treeItem) return;
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) {
      parent.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }
  });

  const flatten = (nodes: ProjectTreeItem[], level = 0): ProjectTreeItem[] =>
    nodes.flatMap((node) => {
      node.level = level;
      return [node, ...flatten(node.children, level + 1)];
    });

  return flatten(roots);
}

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [activeView, setActiveView] = useState<AppView>("portfolio");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingJira, setSavingJira] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [publishingOverview, setPublishingOverview] = useState(false);
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState<string | null>(null);
  const [selectedCalendarYear, setSelectedCalendarYear] = useState<number | null>(
    null,
  );
  const [savingProjectRegistryId, setSavingProjectRegistryId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jiraForm, setJiraForm] = useState<JiraFormState>({
    baseUrl: "",
    boardUrl: "",
    projectKey: "",
    issuesJql: "",
    openIssuesJql: "",
  });
  const [issueForm, setIssueForm] = useState<IssueFormState>(emptyIssueForm);
  const [newProjectForm, setNewProjectForm] =
    useState<ProjectFormState>(() => newProjectFormDefaults());
  const [projectRegistryDrafts, setProjectRegistryDrafts] = useState<
    Record<string, ProjectRegistryDraft>
  >({});
  const [artifactDrafts, setArtifactDrafts] = useState<
    Record<string, ArtifactFormState>
  >({});
  const [passportRows, setPassportRows] = useState<PassportRow[]>([]);
  const [savingPassportRows, setSavingPassportRows] = useState(false);
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(
    null,
  );
  const [raidForm, setRaidForm] = useState<RaidFormState>(emptyRaidForm);
  const [raidDrafts, setRaidDrafts] = useState<Record<string, RaidFormState>>(
    {},
  );
  const [expandedRaidId, setExpandedRaidId] = useState<string | null>(null);
  const [wbsDrafts, setWbsDrafts] = useState<Record<string, WbsFormState>>({});
  const [collapsedWbsIds, setCollapsedWbsIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showGanttDependencies, setShowGanttDependencies] = useState(true);
  const [showGanttBaseline, setShowGanttBaseline] = useState(true);
  const [showGanttForecast, setShowGanttForecast] = useState(true);
  const [ganttScale, setGanttScale] = useState<GanttScale>("month");
  const [showWbsColumnMenu, setShowWbsColumnMenu] = useState(false);
  const [ganttWbsWidth, setGanttWbsWidth] = useState(360);
  const [ganttPanelHeight, setGanttPanelHeight] = useState(
    GANTT_PANEL_HEIGHT_DEFAULT,
  );
  const [ganttPanelWidth, setGanttPanelWidth] = useState(
    GANTT_PANEL_WIDTH_DEFAULT,
  );
  const [wbsColumnWidths, setWbsColumnWidths] = useState<
    Record<WbsTableColumnKey, number>
  >(() => normalizeWbsColumnWidths());
  const [wbsColumnOrder, setWbsColumnOrder] = useState<WbsTableColumnKey[]>(
    () => normalizeWbsColumnOrder(),
  );
  const [wbsHiddenColumns, setWbsHiddenColumns] = useState<WbsTableColumnKey[]>(
    () => normalizeWbsHiddenColumns(),
  );
  const [draggedWbsColumn, setDraggedWbsColumn] =
    useState<WbsTableColumnKey | null>(null);
  const [draggedWbsItemId, setDraggedWbsItemId] = useState<string | null>(null);
  const [wbsDropTargetId, setWbsDropTargetId] = useState<string | null>(null);
  const [wbsUndoStack, setWbsUndoStack] = useState<WbsSnapshot[]>([]);
  const [wbsRedoStack, setWbsRedoStack] = useState<WbsSnapshot[]>([]);
  const [restoringWbsSnapshot, setRestoringWbsSnapshot] = useState(false);
  const [activeWbsItemId, setActiveWbsItemId] = useState<string | null>(null);
  const [hoveredGanttItemId, setHoveredGanttItemId] = useState<string | null>(
    null,
  );
  const [ganttLinkDraft, setGanttLinkDraft] = useState<GanttLinkDraft | null>(
    null,
  );
  const ganttTimelineRef = useRef<HTMLDivElement | null>(null);
  const ganttLinkCompletedRef = useRef(false);
  const [selectedWbsIds, setSelectedWbsIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingWbsBulk, setSavingWbsBulk] = useState(false);
  const wbsUndoStackRef = useRef<WbsSnapshot[]>([]);
  const wbsRedoStackRef = useRef<WbsSnapshot[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskJiraDraft>>(
    {},
  );
  const [issueLinkDrafts, setIssueLinkDrafts] = useState<
    Record<string, JiraLinkDraft>
  >({});
  const [issueEditDrafts, setIssueEditDrafts] = useState<
    Record<string, IssueEditDraft>
  >({});
  const [issueFormErrors, setIssueFormErrors] = useState<
    Partial<Record<"title" | "jiraTicketUrl", string>>
  >({});
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [issueDrawerMode, setIssueDrawerMode] = useState<
    "create" | "edit" | null
  >(null);
  const [issueDrawerIssueId, setIssueDrawerIssueId] = useState<string | null>(
    null,
  );
  const [raidTypeFilter, setRaidTypeFilter] =
    useState<RaidTypeFilter>("ALL");
  const [raidDecisionOnly, setRaidDecisionOnly] = useState(false);
  const [raidOverdueOnly, setRaidOverdueOnly] = useState(false);
  const [raidHighOnly, setRaidHighOnly] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [executivePresentationMode, setExecutivePresentationMode] =
    useState(false);

  useEffect(() => {
    apiClient
      .get<ProjectListItem[]>("/api/projects", "Не удалось загрузить список проектов")
      .then((data: ProjectListItem[]) => {
        const firstProject = data[0];
        setProjects(data);
        setProjectRegistryDrafts(projectsToRegistryDrafts(data));
        setSelectedProjectId(firstProject?.id ?? null);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить список проектов",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const setWbsUndoHistory = useCallback((nextStack: WbsSnapshot[]) => {
    wbsUndoStackRef.current = nextStack;
    setWbsUndoStack(nextStack);
  }, []);

  const setWbsRedoHistory = useCallback((nextStack: WbsSnapshot[]) => {
    wbsRedoStackRef.current = nextStack;
    setWbsRedoStack(nextStack);
  }, []);

  const latestOverview = project?.overviews[0];
  const projectTree = useMemo(() => buildProjectTree(projects), [projects]);
  const selectedProjectListItem = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const recentProjects = useMemo(
    () =>
      recentProjectIds
        .map((projectId) => projects.find((item) => item.id === projectId))
        .filter((item): item is ProjectListItem => Boolean(item))
        .slice(0, 4),
    [projects, recentProjectIds],
  );
  const filteredProjectOptions = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((item) =>
      [item.code, item.name, item.projectManager, item.portfolio, item.summary]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [projectSearch, projects]);
  const portfolioStats = useMemo(() => {
    const activeProjects = projects.filter(
      (item) => item.status === "ACTIVE",
    ).length;
    const redProjects = projects.filter((item) => item.rag === "RED").length;
    const amberProjects = projects.filter(
      (item) => item.rag === "AMBER",
    ).length;
    const openIssues = projects.reduce(
      (sum, item) => sum + item._count.issues,
      0,
    );
    const averageProgress =
      projects.length === 0
        ? 0
        : Math.round(
            projects.reduce((sum, item) => sum + item.progress, 0) /
              projects.length,
          );

    return {
      activeProjects,
      redProjects,
      amberProjects,
      openIssues,
      averageProgress,
    };
  }, [projects]);
  const wbsTree = useMemo(
    () => buildWbsTree(project?.wbsItems ?? []),
    [project?.wbsItems],
  );
  const visibleWbsTree = useMemo(() => {
    const hiddenLevels: number[] = [];
    return wbsTree.filter((item) => {
      while (
        hiddenLevels.length > 0 &&
        item.level <= hiddenLevels[hiddenLevels.length - 1]
      ) {
        hiddenLevels.pop();
      }
      if (hiddenLevels.length > 0) return false;
      if (collapsedWbsIds.has(item.id)) {
        hiddenLevels.push(item.level);
      }
      return true;
    });
  }, [collapsedWbsIds, wbsTree]);
  const activeWbsHierarchyLevel = useMemo(() => {
    if (collapsedWbsIds.size === 0) return null;
    for (const level of GANTT_HIERARCHY_LEVELS) {
      if (setsAreEqual(collapsedWbsIds, collapsedWbsIdsForLevel(wbsTree, level))) {
        return level;
      }
    }
    return null;
  }, [collapsedWbsIds, wbsTree]);
  const draftWbsCodes = useMemo(
    () => buildRenumberedWbsCodes(wbsTree, wbsDrafts),
    [wbsDrafts, wbsTree],
  );
  const structureMilestones = useMemo(() => {
    const items = project?.wbsItems ?? [];
    return items
      .filter((item) => item.type === "MILESTONE")
      .map((milestone) => {
        const calendarDaysLeft = signedDaysUntil(milestone.dueDate);
        const workDaysLeft = signedWorkingDaysUntil(milestone.dueDate);
        const milestoneDue = milestone.dueDate
          ? startOfDay(new Date(milestone.dueDate))
          : null;
        const itemsBeforeMilestone = milestoneDue
          ? items.filter(
              (item) =>
                item.type !== "MILESTONE" &&
                item.dueDate &&
                startOfDay(new Date(item.dueDate)) <= milestoneDue,
            )
          : [];
        const state = milestoneStateLabel(milestone, itemsBeforeMilestone);

        return {
          milestone,
          calendarDaysLeft,
          workDaysLeft,
          state,
        };
      })
      .sort((left, right) =>
        String(left.milestone.dueDate ?? "").localeCompare(
          String(right.milestone.dueDate ?? ""),
        ),
      );
  }, [project?.wbsItems]);
  const milestoneTimeline = useMemo(() => {
    const datedMilestones = structureMilestones.filter(
      (entry) =>
        entry.milestone.dueDate &&
        !Number.isNaN(new Date(entry.milestone.dueDate).getTime()),
    );
    if (datedMilestones.length === 0) {
      return {
        items: [],
        startDate: null,
        endDate: null,
      };
    }

    const dates = datedMilestones.map((entry) =>
      startOfDay(new Date(entry.milestone.dueDate as string)),
    );
    const minTime = Math.min(...dates.map((item) => item.getTime()));
    const maxTime = Math.max(...dates.map((item) => item.getTime()));
    const step =
      datedMilestones.length > 1 ? 88 / (datedMilestones.length - 1) : 0;

    return {
      items: datedMilestones.map((entry, index) => {
        const offset = datedMilestones.length === 1 ? 50 : 6 + step * index;

        return {
          ...entry,
          offset,
          side: index % 2 === 0 ? "top" : "bottom",
        };
      }),
      startDate: new Date(minTime).toISOString(),
      endDate: new Date(maxTime).toISOString(),
    };
  }, [structureMilestones]);
  const overviewDashboard = useMemo(() => {
    const today = startOfDay(new Date());
    const wbsItems = project?.wbsItems ?? [];
    const openIssues = project?.issues.filter(
      (issue) => issue.status !== "Closed" && issue.status !== "Resolved",
    ) ?? [];
    const overdueItems = wbsItems.filter(
      (item) =>
        item.status !== "DONE" &&
        item.status !== "CANCELLED" &&
        item.dueDate !== null &&
        startOfDay(new Date(item.dueDate)) < today,
    );
    const riskItems = project?.raidItems.filter(
      (item) =>
        item.status !== "CLOSED" &&
        item.status !== "VALIDATED" &&
        (item.type === "RISK" || item.type === "DEPENDENCY"),
    ) ?? [];
    const decisionItems = openIssues.filter(
      (issue) => issue.decisionRequired,
    ).length;
    const nextMilestone = structureMilestones.find(
      (entry) =>
        entry.milestone.dueDate &&
        startOfDay(new Date(entry.milestone.dueDate)) >= today,
    );

    return {
      openIssues,
      overdueItems,
      riskItems,
      decisionItems,
      nextMilestone,
    };
  }, [project?.issues, project?.raidItems, project?.wbsItems, structureMilestones]);
  const raidSummary = useMemo(() => {
    const raidItems = project?.raidItems ?? [];
    const activeRaid = raidItems.filter(
      (item) => item.status !== "CLOSED" && item.status !== "VALIDATED",
    );
    const highRisks = activeRaid.filter(
      (item) => item.type === "RISK" && item.riskScore >= 15,
    );
    const problems = activeRaid.filter((item) => item.type === "DEPENDENCY");
    const assumptions = activeRaid.filter((item) => item.type === "ASSUMPTION");
    const decisions = raidItems.filter((item) => item.decisionRequired).length;
    const scheduleImpactDays = activeRaid.reduce(
      (sum, item) => sum + item.scheduleImpactDays,
      0,
    );

    return {
      activeRaid: activeRaid.length,
      highRisks: highRisks.length,
      problems: problems.length,
      assumptions: assumptions.length,
      decisions,
      scheduleImpactDays,
    };
  }, [project?.raidItems]);
  const filteredRaidItems = useMemo(() => {
    const today = startOfDay(new Date());
    return (project?.raidItems ?? []).filter((item) => {
      if (raidTypeFilter !== "ALL" && item.type !== raidTypeFilter) return false;
      if (raidDecisionOnly && !item.decisionRequired) return false;
      if (
        raidOverdueOnly &&
        (!item.dueDate ||
          item.status === "CLOSED" ||
          item.status === "VALIDATED" ||
          startOfDay(new Date(item.dueDate)) >= today)
      ) {
        return false;
      }
      if (raidHighOnly && item.riskScore < 15) return false;
      return true;
    });
  }, [
    project?.raidItems,
    raidDecisionOnly,
    raidHighOnly,
    raidOverdueOnly,
    raidTypeFilter,
  ]);
  const riskMatrix = useMemo(() => {
    const cells = new Map<string, number>();
    for (const item of project?.raidItems ?? []) {
      if (item.type !== "RISK" || item.status === "CLOSED") continue;
      const probability = Math.max(1, Math.min(5, item.probability));
      const impact = Math.max(1, Math.min(5, item.impact));
      const key = `${probability}:${impact}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    return cells;
  }, [project?.raidItems]);
  const groupedRaidItems = useMemo(
    () => ({
      risks: filteredRaidItems.filter((item) => item.type === "RISK"),
      problems: filteredRaidItems.filter((item) => item.type === "DEPENDENCY"),
      assumptions: filteredRaidItems.filter((item) => item.type === "ASSUMPTION"),
    }),
    [filteredRaidItems],
  );
  const topOverdueItems = useMemo(
    () =>
      overviewDashboard.overdueItems
        .map((item) => {
          const overdueDays = signedDaysUntil(item.dueDate);
          return {
            item,
            days: overdueDays === null ? 0 : Math.abs(overdueDays),
            impact:
              item.type === "MILESTONE"
                ? "Сдвигает контрольную веху"
                : item.status === "BLOCKED"
                  ? "Блокирует последующие работы"
                  : "Требует перепланирования срока",
          };
        })
        .sort((left, right) => right.days - left.days)
        .slice(0, 3),
    [overviewDashboard.overdueItems],
  );
  const wbsGantt = useMemo(() => {
    const validDate = (value: string | null) => {
      const parsed = value ? new Date(value) : null;
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    };
    const datedItems = visibleWbsTree
      .map((item) => {
        const start = validDate(item.startDate);
        const end = validDate(item.dueDate);
        if (!start || !end) {
          return null;
        }
        return {
          item,
          start,
          end,
          baselineStart: validDate(item.baselineStartDate),
          baselineEnd: validDate(item.baselineDueDate),
          forecastStart: validDate(item.forecastStartDate),
          forecastEnd: validDate(item.forecastDueDate),
        };
      })
      .filter(
        (
          item,
        ): item is {
          item: WbsTreeItem;
          start: Date;
          end: Date;
          baselineStart: Date | null;
          baselineEnd: Date | null;
          forecastStart: Date | null;
          forecastEnd: Date | null;
        } => item !== null,
      );

    if (datedItems.length === 0) {
      return {
        start: null as Date | null,
        end: null as Date | null,
        months: [] as Array<{ label: string; offset: number; width: number }>,
        quarters: [] as Array<{ label: string; offset: number; width: number }>,
        weeks: [] as Array<{ label: string; offset: number }>,
        todayOffset: null as number | null,
        dependencyLines: [] as Array<{
          id: string;
          predecessorId: string;
          successorId: string;
          type: WbsDependencyType;
          fromSide: "start" | "end";
          fromMilestone: boolean;
          fromX: number;
          fromY: number;
          fromSlotOffset: number;
          toSide: "start" | "end";
          toMilestone: boolean;
          toX: number;
          toY: number;
          toSlotOffset: number;
          direction: "forward" | "backward";
          styleSlot: number;
        }>,
        height: 0,
        criticalIds: new Set<string>(),
        items: [],
      };
    }

    const timelineDates = datedItems.flatMap((entry) =>
      [
        entry.start,
        entry.end,
        entry.baselineStart,
        entry.baselineEnd,
        entry.forecastStart,
        entry.forecastEnd,
      ].filter((dateValue): dateValue is Date => dateValue !== null),
    );
    const rawStart = new Date(
      Math.min(...timelineDates.map((item) => item.getTime())),
    );
    const rawEnd = new Date(
      Math.max(...timelineDates.map((item) => item.getTime())),
    );
    const start = startOfMonth(rawStart);
    const end = addMonths(startOfMonth(rawEnd), 1);
    const totalDays = Math.max(1, daysBetween(start, end));
    const periodPosition = (periodStart: Date, periodEnd: Date) => {
      const clippedStart = periodStart < start ? start : periodStart;
      const clippedEnd = periodEnd > end ? end : periodEnd;
      return {
        offset: Math.max(
          0,
          Math.min(100, (signedDaysBetween(start, clippedStart) / totalDays) * 100),
        ),
        width: Math.max(
          0,
          Math.min(
            100,
            (signedDaysBetween(clippedStart, clippedEnd) / totalDays) * 100,
          ),
        ),
      };
    };
    const months = [];
    for (
      let cursor = startOfMonth(start);
      cursor < end;
      cursor = addMonths(cursor, 1)
    ) {
      const monthEnd = addMonths(cursor, 1);
      const position = periodPosition(cursor, monthEnd);
      months.push({
        label: monthLabel(cursor),
        offset: position.offset,
        width: position.width,
      });
    }
    const quarters = [];
    for (
      let cursor = new Date(
        start.getFullYear(),
        Math.floor(start.getMonth() / 3) * 3,
        1,
      );
      cursor < end;
      cursor = addMonths(cursor, 3)
    ) {
      const quarterEnd = addMonths(cursor, 3);
      const position = periodPosition(cursor, quarterEnd);
      quarters.push({
        label: `${Math.floor(cursor.getMonth() / 3) + 1} кв. ${cursor.getFullYear()}`,
        offset: position.offset,
        width: position.width,
      });
    }
    const weeks = [];
    const firstWeekStart = startOfDay(start);
    firstWeekStart.setDate(
      firstWeekStart.getDate() - ((firstWeekStart.getDay() + 6) % 7),
    );
    for (
      let cursor = firstWeekStart;
      cursor < end;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
    ) {
      if (cursor <= start) continue;
      weeks.push({
        label: shortDate(cursor.toISOString()),
        offset: (daysBetween(start, cursor) / totalDays) * 100,
      });
    }

    const durationById = new Map(
      datedItems.map(({ item, start: itemStart, end: itemEnd }) => [
        item.id,
        Math.max(1, daysBetween(itemStart, itemEnd) + 1),
      ]),
    );
    const successorGraph = new Map<string, string[]>();
    for (const dependency of project?.wbsDependencies ?? []) {
      if (
        !durationById.has(dependency.predecessorId) ||
        !durationById.has(dependency.successorId)
      ) {
        continue;
      }
      successorGraph.set(dependency.predecessorId, [
        ...(successorGraph.get(dependency.predecessorId) ?? []),
        dependency.successorId,
      ]);
    }
    const scoreCache = new Map<string, number>();
    const score = (itemId: string, path = new Set<string>()): number => {
      if (scoreCache.has(itemId)) return scoreCache.get(itemId) ?? 0;
      if (path.has(itemId)) return 0;
      const downstream = successorGraph.get(itemId) ?? [];
      const value =
        (durationById.get(itemId) ?? 1) +
        Math.max(
          0,
          ...downstream.map((successorId) =>
            score(successorId, new Set([...path, itemId])),
          ),
        );
      scoreCache.set(itemId, value);
      return value;
    };
    const criticalIds = new Set<string>();
    if ((project?.wbsDependencies ?? []).length > 0) {
      let current = datedItems
        .map(({ item }) => item.id)
        .sort((left, right) => score(right) - score(left))[0];
      while (current) {
        criticalIds.add(current);
        const next = (successorGraph.get(current) ?? []).sort(
          (left, right) => score(right) - score(left),
        )[0];
        current = next;
      }
    }

    const range = (rangeStart: Date | null, rangeEnd: Date | null) => {
      if (!rangeStart || !rangeEnd) return null;
      return {
        offset: (daysBetween(start, rangeStart) / totalDays) * 100,
        width: Math.max(
          0.15,
          ((daysBetween(rangeStart, rangeEnd) + 1) / totalDays) * 100,
        ),
      };
    };

    const items = datedItems.map(
      ({
        item,
        start: itemStart,
        end: itemEnd,
        baselineStart,
        baselineEnd,
        forecastStart,
        forecastEnd,
      }) => {
      const summary =
        item.children.length > 0 ||
        item.type === "PHASE" ||
        item.type === "WORK_PACKAGE";
      const milestone = item.type === "MILESTONE";
      return {
        item,
        start: itemStart,
        end: itemEnd,
        offset: (daysBetween(start, itemStart) / totalDays) * 100,
        width: Math.max(
          item.type === "MILESTONE" ? 0.8 : 0.15,
          ((daysBetween(itemStart, itemEnd) + 1) / totalDays) * 100,
        ),
        milestone,
        critical:
          !milestone &&
          (criticalIds.has(item.id) ||
            item.status === "BLOCKED" ||
            item.status === "AT_RISK"),
        summary,
        baselineRange: range(baselineStart, baselineEnd),
        forecastRange: range(forecastStart, forecastEnd),
        scheduleVarianceDays:
          baselineEnd && forecastEnd ? daysBetween(baselineEnd, forecastEnd) : 0,
        toneClass: milestone
          ? "tone-o"
          : summary
            ? summaryToneClass(item)
            : wbsToneClass(item),
      };
      },
    );
    const rowById = new Map(items.map((entry, index) => [entry.item.id, index]));
    const barById = new Map(items.map((entry) => [entry.item.id, entry]));
    const dependencySides = (dependency: WbsDependency) => {
      const fromSide =
        dependency.type === "SS" || dependency.type === "SF"
          ? ("start" as const)
          : ("end" as const);
      const toSide =
        dependency.type === "FF" || dependency.type === "SF"
          ? ("end" as const)
          : ("start" as const);
      return { fromSide, toSide };
    };
    const endpointKey = (itemId: string, side: "start" | "end") =>
      `${itemId}:${side}`;
    const visibleDependencies = (project?.wbsDependencies ?? []).filter(
      (dependency) =>
        barById.has(dependency.predecessorId) &&
        barById.has(dependency.successorId) &&
        rowById.has(dependency.predecessorId) &&
        rowById.has(dependency.successorId),
    );
    const endpointCounts = new Map<string, number>();
    for (const dependency of visibleDependencies) {
      const { fromSide, toSide } = dependencySides(dependency);
      const fromKey = endpointKey(dependency.predecessorId, fromSide);
      const toKey = endpointKey(dependency.successorId, toSide);
      endpointCounts.set(fromKey, (endpointCounts.get(fromKey) ?? 0) + 1);
      endpointCounts.set(toKey, (endpointCounts.get(toKey) ?? 0) + 1);
    }
    const endpointIndexes = new Map<string, number>();
    const takeEndpointSlot = (key: string) => {
      const index = endpointIndexes.get(key) ?? 0;
      endpointIndexes.set(key, index + 1);
      return index;
    };
    const slotOffset = (index: number, total: number) =>
      total <= 1 ? 0 : (index - (total - 1) / 2) * 5;
    const dependencyLines = visibleDependencies
      .map((dependency) => {
        const predecessor = barById.get(dependency.predecessorId);
        const successor = barById.get(dependency.successorId);
        const predecessorRow = rowById.get(dependency.predecessorId);
        const successorRow = rowById.get(dependency.successorId);
        if (
          !predecessor ||
          !successor ||
          predecessorRow === undefined ||
          successorRow === undefined
        ) {
          return null;
        }
        const predecessorStart = predecessor.offset;
        const predecessorEnd = predecessor.milestone
          ? predecessor.offset
          : predecessor.offset + predecessor.width;
        const successorStart = successor.offset;
        const successorEnd = successor.milestone
          ? successor.offset
          : successor.offset + successor.width;
        const { fromSide, toSide } = dependencySides(dependency);
        const fromKey = endpointKey(dependency.predecessorId, fromSide);
        const toKey = endpointKey(dependency.successorId, toSide);
        const fromSlot = takeEndpointSlot(fromKey);
        const toSlot = takeEndpointSlot(toKey);
        const fromSlotOffset = slotOffset(
          fromSlot,
          endpointCounts.get(fromKey) ?? 1,
        );
        const toSlotOffset = slotOffset(toSlot, endpointCounts.get(toKey) ?? 1);
        const from = fromSide === "start" ? predecessorStart : predecessorEnd;
        const to = toSide === "start" ? successorStart : successorEnd;
        const direction = to >= from ? ("forward" as const) : ("backward" as const);
        return {
          id: dependency.id,
          predecessorId: dependency.predecessorId,
          successorId: dependency.successorId,
          type: dependency.type,
          fromSide,
          fromMilestone: predecessor.milestone,
          fromX: Math.max(0, Math.min(100, from)),
          fromY:
            predecessorRow * GANTT_ROW_HEIGHT +
            GANTT_ROW_HEIGHT / 2 +
            fromSlotOffset,
          fromSlotOffset,
          toSide,
          toMilestone: successor.milestone,
          toX: Math.max(0, Math.min(100, to)),
          toY: successorRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2 + toSlotOffset,
          toSlotOffset,
          direction,
          styleSlot: Math.max(fromSlot, toSlot) % 6,
        };
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          predecessorId: string;
          successorId: string;
          type: WbsDependencyType;
          fromSide: "start" | "end";
          fromMilestone: boolean;
          fromX: number;
          fromY: number;
          fromSlotOffset: number;
          toSide: "start" | "end";
          toMilestone: boolean;
          toX: number;
          toY: number;
          toSlotOffset: number;
          direction: "forward" | "backward";
          styleSlot: number;
        } => item !== null,
      );

    const today = new Date();
    const todayOffset =
      today >= start && today < end
        ? (daysBetween(start, today) / totalDays) * 100
        : null;

    return {
      start,
      end,
      months,
      quarters,
      weeks,
      todayOffset,
      dependencyLines,
      height: items.length * GANTT_ROW_HEIGHT,
      criticalIds,
      items,
    };
  }, [project?.wbsDependencies, visibleWbsTree]);
  const wbsColumnsByKey = useMemo(
    () =>
      new Map<WbsTableColumnKey, WbsTableColumn>(
        WBS_TABLE_COLUMNS.map((column) => [column.key, column]),
      ),
    [],
  );
  const orderedWbsColumns = useMemo(
    () =>
      wbsColumnOrder
        .map((key) => wbsColumnsByKey.get(key))
        .filter(
          (column): column is WbsTableColumn =>
            Boolean(column) && !wbsHiddenColumns.includes(column.key),
        ),
    [wbsColumnOrder, wbsColumnsByKey, wbsHiddenColumns],
  );
  const wbsTableTemplate = useMemo(
    () =>
      orderedWbsColumns
        .map((column) => `${wbsColumnWidths[column.key]}px`)
        .join(" "),
    [orderedWbsColumns, wbsColumnWidths],
  );
  const wbsLevelWidth = wbsColumnWidths.level;
  const dirtyWbsItemIds = useMemo(() => {
    const dirtyIds = new Set<string>();
    for (const item of project?.wbsItems ?? []) {
      const draft = wbsDrafts[item.id];
      if (!draft) continue;
      const source = wbsToForm(item);
      const hasDirtyField = WBS_DIRTY_FIELDS.some(
        (field) => draft[field] !== source[field],
      );
      if (hasDirtyField || draftWbsCodes.get(item.id) !== item.code) {
        dirtyIds.add(item.id);
      }
    }
    return dirtyIds;
  }, [draftWbsCodes, project?.wbsItems, wbsDrafts]);
  const activeGanttLinkIds = useMemo(() => {
    const sourceId = hoveredGanttItemId ?? activeWbsItemId;
    const predecessors = new Set<string>();
    const successors = new Set<string>();
    if (!hoveredGanttItemId) return { sourceId, predecessors, successors };
    for (const dependency of project?.wbsDependencies ?? []) {
      if (dependency.successorId === hoveredGanttItemId) {
        predecessors.add(dependency.predecessorId);
      }
      if (dependency.predecessorId === hoveredGanttItemId) {
        successors.add(dependency.successorId);
      }
    }
    return { sourceId, predecessors, successors };
  }, [activeWbsItemId, hoveredGanttItemId, project?.wbsDependencies]);
  const projectCalendarYears = useMemo(() => {
    const years: number[] = [];
    const collectYear = (value: string | null | undefined) => {
      if (!value) return;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        years.push(parsed.getFullYear());
      }
    };
    collectYear(project?.startDate);
    for (const item of project?.wbsItems ?? []) {
      collectYear(item.startDate);
      collectYear(item.dueDate);
      collectYear(item.baselineStartDate);
      collectYear(item.baselineDueDate);
      collectYear(item.forecastStartDate);
      collectYear(item.forecastDueDate);
    }
    const startYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear();
    return [startYear, startYear + 1, startYear + 2];
  }, [project?.startDate, project?.wbsItems]);
  const calendarYear = selectedCalendarYear ?? projectCalendarYears[1] ?? new Date().getFullYear();
  const calendarOverridesByKey = useMemo(() => {
    const map = new Map<string, ProjectCalendarOverride>();
    for (const override of project?.calendarOverrides ?? []) {
      map.set(
        `${override.calendarCode}:${isoDate(new Date(override.date))}`,
        override,
      );
    }
    return map;
  }, [project?.calendarOverrides]);
  async function syncJira() {
    if (!project) return;
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/jira/sync`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось синхронизировать Jira");
      }
      const refreshed = await fetch(
        `${apiBase}/api/projects/${project.id}/overview`,
      );
      applyProject(await refreshed.json());
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Не удалось синхронизировать Jira",
      );
    } finally {
      setSyncing(false);
    }
  }

  const applyProject = useCallback(
    (nextProject: ProjectDetails) => {
      setProject(nextProject);
      setWbsUndoHistory([]);
      setWbsRedoHistory([]);
      setSidebarCollapsed(nextProject.uiState?.sidebarCollapsed ?? false);
      setWbsColumnOrder(
        normalizeWbsColumnOrder(nextProject.uiState?.wbsColumnOrder),
      );
      setWbsHiddenColumns(
        normalizeWbsHiddenColumns(nextProject.uiState?.wbsHiddenColumns),
      );
      setWbsColumnWidths((current) =>
        normalizeWbsColumnWidths({
          ...current,
          ...(nextProject.uiState?.wbsColumnWidths ?? {}),
        }),
      );
      setGanttWbsWidth(
        clampNumber(nextProject.uiState?.ganttWbsWidth ?? 360, 260, 640),
      );
      setGanttPanelHeight(
        clampNumber(
          nextProject.uiState?.ganttPanelHeight ?? GANTT_PANEL_HEIGHT_DEFAULT,
          320,
          900,
        ),
      );
      setGanttPanelWidth(
        clampNumber(
          nextProject.uiState?.ganttPanelWidth ?? GANTT_PANEL_WIDTH_DEFAULT,
          0,
          2400,
        ),
      );
      setPassportRows(normalizePassportRows(nextProject));
      setSelectedCalendarYear((currentYear) => {
        const startDate = nextProject.startDate
          ? new Date(nextProject.startDate)
          : new Date();
        const startYear = startDate.getFullYear();
        const allowedYears = [startYear, startYear + 1, startYear + 2];
        return currentYear && allowedYears.includes(currentYear)
          ? currentYear
          : startYear + 1;
      });
      setJiraForm({
        baseUrl: nextProject.jiraIntegration?.baseUrl ?? "",
        boardUrl: nextProject.jiraIntegration?.boardUrl ?? "",
        projectKey: nextProject.jiraIntegration?.projectKey ?? "",
        issuesJql: nextProject.jiraIntegration?.issuesJql ?? "",
        openIssuesJql: nextProject.jiraIntegration?.openIssuesJql ?? "",
      });
      setTaskDrafts(
        Object.fromEntries(
          nextProject.tasks.map((task) => [
            task.id,
            {
              jiraTicketKey: task.jiraTicketKey ?? "",
              jiraTicketUrl: task.jiraTicketUrl ?? "",
            },
          ]),
        ),
      );
      setIssueLinkDrafts(
        Object.fromEntries(
          nextProject.issues.map((issue) => [
            issue.id,
            { jiraKey: "", jiraUrl: "" },
          ]),
        ),
      );
      setIssueEditDrafts(
        Object.fromEntries(
          nextProject.issues.map((issue) => [issue.id, issueToDraft(issue)]),
        ),
      );
      setExpandedIssueId((currentIssueId) =>
        nextProject.issues.some((issue) => issue.id === currentIssueId)
          ? currentIssueId
          : null,
      );
      setIssueDrawerIssueId((currentIssueId) =>
        nextProject.issues.some((issue) => issue.id === currentIssueId)
          ? currentIssueId
          : null,
      );
      setWbsDrafts(
        Object.fromEntries(
          nextProject.wbsItems.map((item) => [item.id, wbsToForm(item)]),
        ),
      );
      setActiveWbsItemId((currentItemId) =>
        nextProject.wbsItems.some((item) => item.id === currentItemId)
          ? currentItemId
          : null,
      );
      setSelectedWbsIds(
        (currentIds) =>
          new Set(
            [...currentIds].filter((itemId) =>
              nextProject.wbsItems.some((item) => item.id === itemId),
            ),
          ),
      );
      setCollapsedWbsIds(
        (currentIds) =>
          new Set(
            [...currentIds].filter((itemId) =>
              nextProject.wbsItems.some((item) => item.id === itemId),
            ),
          ),
      );
      setArtifactDrafts(
        Object.fromEntries(
          nextProject.artifacts.map((item) => [item.id, artifactToForm(item)]),
        ),
      );
      setExpandedArtifactId((currentArtifactId) =>
        nextProject.artifacts.some((item) => item.id === currentArtifactId)
          ? currentArtifactId
          : null,
      );
      setRaidDrafts(
        Object.fromEntries(
          nextProject.raidItems.map((item) => [item.id, raidToForm(item)]),
        ),
      );
      setExpandedRaidId((currentRaidId) =>
        nextProject.raidItems.some((item) => item.id === currentRaidId)
          ? currentRaidId
          : null,
      );
    },
    [setWbsRedoHistory, setWbsUndoHistory],
  );

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    fetch(`${apiBase}/api/projects/${selectedProjectId}/overview`)
      .then((response) => response.json())
      .then((data: ProjectDetails) => {
        if (!cancelled) {
          applyProject(data);
        }
      })
      .catch(() => setError("Не удалось загрузить проект"));
    return () => {
      cancelled = true;
    };
  }, [applyProject, selectedProjectId]);

  function applyWbsSnapshotResult(
    nextItems: WbsItem[],
    nextDependencies?: WbsDependency[],
  ) {
    setProject((current) =>
      current
        ? {
            ...current,
            wbsItems: nextItems,
            wbsDependencies: nextDependencies ?? current.wbsDependencies,
          }
        : current,
    );
    setWbsDrafts(
      Object.fromEntries(nextItems.map((item) => [item.id, wbsToForm(item)])),
    );
    setCollapsedWbsIds(
      (currentIds) =>
        new Set(
          [...currentIds].filter((itemId) =>
            nextItems.some((item) => item.id === itemId),
          ),
        ),
    );
  }

  function applyWbsItems(nextItems: WbsItem[]) {
    applyWbsSnapshotResult(nextItems);
  }

  function getCurrentWbsSnapshot(): WbsSnapshot | null {
    if (!project) return null;
    return {
      wbsItems: project.wbsItems.map((item) => ({ ...item })),
      wbsDependencies: project.wbsDependencies.map((dependency) => ({
        predecessorId: dependency.predecessorId,
        successorId: dependency.successorId,
        type: dependency.type,
        lagDays: dependency.lagDays,
      })),
    };
  }

  function rememberWbsSnapshot() {
    const snapshot = getCurrentWbsSnapshot();
    if (!snapshot) return null;
    const previous = wbsUndoStackRef.current.at(-1);
    if (!previous || !wbsSnapshotsEqual(previous, snapshot)) {
      setWbsUndoHistory([...wbsUndoStackRef.current, snapshot].slice(-10));
    }
    setWbsRedoHistory([]);
    return snapshot;
  }

  async function restoreWbsSnapshot(
    snapshot: WbsSnapshot,
    direction: "undo" | "redo",
  ) {
    if (!project || restoringWbsSnapshot) return;
    const currentSnapshot = getCurrentWbsSnapshot();
    if (!currentSnapshot) return;
    setRestoringWbsSnapshot(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-snapshot/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось восстановить Структуру");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(result.wbsItems, result.wbsDependencies);
      } else {
        await refreshProject(project.id);
      }
      if (direction === "undo") {
        setWbsRedoHistory([...wbsRedoStackRef.current, currentSnapshot].slice(-10));
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
        setNotice("Откат Структуры выполнен");
      } else {
        setWbsUndoHistory([...wbsUndoStackRef.current, currentSnapshot].slice(-10));
        setWbsRedoHistory(wbsRedoStackRef.current.slice(0, -1));
        setNotice("Изменение Структуры восстановлено");
      }
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Не удалось восстановить Структуру",
      );
    } finally {
      setRestoringWbsSnapshot(false);
    }
  }

  async function undoWbsChange() {
    const snapshot = wbsUndoStackRef.current.at(-1);
    if (!snapshot) return;
    await restoreWbsSnapshot(snapshot, "undo");
  }

  async function redoWbsChange() {
    const snapshot = wbsRedoStackRef.current.at(-1);
    if (!snapshot) return;
    await restoreWbsSnapshot(snapshot, "redo");
  }

  async function saveWbsBaseline() {
    if (!project) return;
    if (
      !window.confirm(
        "Зафиксировать текущую Структуру как базовый план? Текущие даты станут датами базового плана.",
      )
    ) {
      return;
    }
    setSavingBaseline(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-baseline`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось сохранить базовый план");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(result.wbsItems, result.wbsDependencies);
      } else {
        await refreshProject(project.id);
      }
      setNotice("Базовый план Структуры сохранен");
    } catch (baselineError) {
      setError(
        baselineError instanceof Error
          ? baselineError.message
          : "Не удалось сохранить базовый план",
      );
    } finally {
      setSavingBaseline(false);
    }
  }

  async function toggleCalendarDay(
    calendarCode: ProjectCalendarCode,
    dateValue: Date,
  ) {
    if (!project) return;
    const dateKey = isoDate(dateValue);
    const overrideKey = `${calendarCode}:${dateKey}`;
    const currentOverride = calendarOverridesByKey.get(overrideKey);
    const currentWorkingDay =
      currentOverride?.isWorkingDay ?? isDefaultWorkingDay(dateValue);
    setSavingCalendar(overrideKey);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/calendar-overrides`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calendarCode,
            date: dateKey,
            isWorkingDay: !currentWorkingDay,
            description: !currentWorkingDay
              ? "Рабочий день"
              : "Выходной / праздничный день",
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось сохранить календарь");
      }
      setProject((current) => {
        if (!current) return current;
        const withoutCurrent = current.calendarOverrides.filter(
          (override) =>
            !(
              override.calendarCode === calendarCode &&
              isoDate(new Date(override.date)) === dateKey
            ),
        );
        return {
          ...current,
          calendarOverrides: [...withoutCurrent, result],
        };
      });
      await refreshProject(project.id);
    } catch (calendarError) {
      setError(
        calendarError instanceof Error
          ? calendarError.message
          : "Не удалось сохранить календарь",
      );
    } finally {
      setSavingCalendar(null);
    }
  }

  async function refreshProject(projectId = project?.id) {
    if (!projectId) return;
    const refreshed = await apiClient.get<ProjectDetails>(
      `/api/projects/${projectId}/overview`,
      "Не удалось загрузить проект",
    );
    applyProject(refreshed);
  }

  async function saveJiraIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSavingJira(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/jira-integration`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jiraForm),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить Jira",
        );
      }
      await refreshProject(project.id);
      setNotice("Jira-настройки сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить Jira",
      );
    } finally {
      setSavingJira(false);
    }
  }

  async function reloadProjects(selectedId?: string) {
    const data = await apiClient.get<ProjectListItem[]>(
      "/api/projects",
      "Не удалось загрузить список проектов",
    );
    setProjects(data);
    setProjectRegistryDrafts(projectsToRegistryDrafts(data));
    if (selectedId) {
      setSelectedProjectId(selectedId);
    }
  }

  async function saveProjectUiState(
    patch: ProjectUiState,
    options?: {
      sidebarCollapsed?: boolean;
      wbsColumnOrder?: WbsTableColumnKey[];
      wbsHiddenColumns?: WbsTableColumnKey[];
      wbsColumnWidths?: Record<WbsTableColumnKey, number>;
      ganttPanelHeight?: number;
      ganttPanelWidth?: number;
      ganttWbsWidth?: number;
    },
  ) {
    if (!project) return;
    const nextUiState: ProjectUiState = {
      ...(project.uiState ?? {}),
      sidebarCollapsed: options?.sidebarCollapsed ?? sidebarCollapsed,
      wbsColumnOrder: options?.wbsColumnOrder ?? wbsColumnOrder,
      wbsHiddenColumns: options?.wbsHiddenColumns ?? wbsHiddenColumns,
      wbsColumnWidths: options?.wbsColumnWidths ?? wbsColumnWidths,
      ganttPanelHeight: options?.ganttPanelHeight ?? ganttPanelHeight,
      ganttPanelWidth: options?.ganttPanelWidth ?? ganttPanelWidth,
      ganttWbsWidth: options?.ganttWbsWidth ?? ganttWbsWidth,
      ...patch,
    };
    setProject((current) =>
      current ? { ...current, uiState: nextUiState } : current,
    );
    const response = await fetch(`${apiBase}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiState: nextUiState }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error ?? "Не удалось сохранить настройки интерфейса");
    }
  }

  function projectPayload(form: ProjectFormState) {
    return {
      ...form,
      parentId: form.parentId || null,
      budgetPlanned: Number(form.budgetPlanned),
      budgetForecast: Number(form.budgetForecast),
      scheduleVariance: Number(form.scheduleVariance),
      progress: Number(form.progress),
      sortOrder: Number(form.sortOrder),
    };
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectPayload(newProjectForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать проект",
        );
      }
      if (!result.id) {
        throw new Error("API не вернул идентификатор созданного проекта");
      }
      setNewProjectForm(newProjectFormDefaults());
      setActiveView("project-structure");
      setSelectedProjectId(result.id);
      setProject(null);
      await reloadProjects(result.id);
      await refreshProject(result.id);
      setNotice(`Проект ${result.code} создан`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать проект",
      );
    }
  }

  function updateProjectRegistryDraft(
    projectId: string,
    patch: Partial<ProjectRegistryDraft>,
  ) {
    setProjectRegistryDrafts((current) => {
      const sourceProject = projects.find((item) => item.id === projectId);
      const currentDraft =
        current[projectId] ??
        (sourceProject ? projectToRegistryDraft(sourceProject) : null);
      if (!currentDraft) return current;
      return {
        ...current,
        [projectId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  }

  async function savePortfolioProjectIdentity(projectId: string) {
    const draft = projectRegistryDrafts[projectId];
    if (!draft) return;
    const sourceProject = projects.find((item) => item.id === projectId);
    const code = draft.code.trim();
    const name = draft.name.trim();
    if (!code || !name) {
      setError("Код и наименование проекта обязательны");
      return;
    }
    if (
      sourceProject &&
      sourceProject.code === code &&
      sourceProject.name === name
    ) {
      return;
    }
    setSavingProjectRegistryId(projectId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
          result?.error ||
            "Не удалось сохранить проект",
        );
      }
      await reloadProjects();
      if (project?.id === projectId) {
        await refreshProject(projectId);
      }
      setNotice(`Проект ${code} обновлен`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить проект",
      );
    } finally {
      setSavingProjectRegistryId(null);
    }
  }

  async function saveProjectRegistryItem(projectId: string) {
    const draft = projectRegistryDrafts[projectId];
    if (!draft) return;
    setSavingProjectRegistryId(projectId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: draft.parentId || null,
          projectManager: draft.projectManager.trim() || "Руководитель проекта",
          status: draft.status,
          rag: draft.rag,
          sortOrder: Number(draft.sortOrder) || 0,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось сохранить проект",
        );
      }
      await reloadProjects(selectedProjectId ?? projectId);
      if (project?.id === projectId) {
        await refreshProject(projectId);
      }
      setNotice("Параметры проекта обновлены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить проект",
      );
    } finally {
      setSavingProjectRegistryId(null);
    }
  }

  function updatePassportRow(rowId: string, patch: Partial<PassportRow>) {
    setPassportRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId ? { ...row, ...patch } : row,
      ),
    );
  }

  function addPassportRow(afterIndex: number) {
    const nextRow: PassportRow = {
      id: `passport-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      field: "Новое поле",
      description: "",
    };
    setPassportRows((currentRows) => [
      ...currentRows.slice(0, afterIndex + 1),
      nextRow,
      ...currentRows.slice(afterIndex + 1),
    ]);
  }

  function deletePassportRow(rowId: string) {
    setPassportRows((currentRows) =>
      currentRows.length <= 1
        ? currentRows
        : currentRows.filter((row) => row.id !== rowId),
    );
  }

  async function savePassportRows() {
    if (!project) return;
    setSavingPassportRows(true);
    setError(null);
    setNotice(null);
    try {
      const rows = passportRows.map((row) => ({
        ...row,
        field: row.field.trim() || "Поле",
        description: row.description.trim(),
      }));
      await saveProjectUiState({ passportRows: rows });
      setPassportRows(rows);
      await refreshProject(project.id);
      setNotice("Паспорт проекта сохранен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить паспорт проекта",
      );
    } finally {
      setSavingPassportRows(false);
    }
  }

  function artifactPayload(form: ArtifactFormState) {
    return {
      ...form,
      url: form.url || null,
      description: form.description || null,
      sortOrder: Number(form.sortOrder),
    };
  }

  function updateArtifactDraft(
    artifactId: string,
    patch: Partial<ArtifactFormState>,
  ) {
    const current = artifactDrafts[artifactId];
    if (!current) return;
    setArtifactDrafts({
      ...artifactDrafts,
      [artifactId]: { ...current, ...patch },
    });
  }

  async function saveArtifact(artifactId: string) {
    const draft = artifactDrafts[artifactId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/project-artifacts/${artifactId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(artifactPayload(draft)),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить артефакт",
        );
      }
      await refreshProject();
      setNotice("Артефакт обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить артефакт",
      );
    }
  }

  async function deleteArtifact(artifactId: string) {
    if (!window.confirm("Удалить артефакт проекта?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/project-artifacts/${artifactId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить артефакт");
      }
      await refreshProject();
      setNotice("Артефакт удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить артефакт",
      );
    }
  }

  async function createArtifactRow(afterArtifactId?: string) {
    if (!project) return;
    const currentArtifacts = [...project.artifacts].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    const afterIndex = afterArtifactId
      ? currentArtifacts.findIndex((artifact) => artifact.id === afterArtifactId)
      : currentArtifacts.length - 1;
    const sortOrder =
      afterIndex >= 0
        ? currentArtifacts[afterIndex].sortOrder + 1
        : currentArtifacts.length + 1;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/artifacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            artifactPayload({
              ...emptyArtifactForm,
              title: "Новый артефакт",
              owner: project.projectManager,
              sortOrder: String(sortOrder),
            }),
          ),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать артефакт",
        );
      }
      const orderedIds = currentArtifacts.map((artifact) => artifact.id);
      const insertIndex = afterIndex >= 0 ? afterIndex + 1 : orderedIds.length;
      orderedIds.splice(insertIndex, 0, result.id);
      await fetch(`${apiBase}/api/projects/${project.id}/artifacts/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      await refreshProject(project.id);
      setExpandedArtifactId(result.id);
      setNotice("Артефакт добавлен");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать артефакт",
      );
    }
  }

  async function moveArtifact(artifactId: string, direction: -1 | 1) {
    if (!project) return;
    const sortedArtifacts = [...project.artifacts].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    const currentIndex = sortedArtifacts.findIndex(
      (artifact) => artifact.id === artifactId,
    );
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedArtifacts.length) {
      return;
    }
    const nextArtifacts = [...sortedArtifacts];
    [nextArtifacts[currentIndex], nextArtifacts[nextIndex]] = [
      nextArtifacts[nextIndex],
      nextArtifacts[currentIndex],
    ];
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/artifacts/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: nextArtifacts.map((artifact) => artifact.id),
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось переместить артефакт");
      }
      await refreshProject(project.id);
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Не удалось переместить артефакт",
      );
    }
  }

  function raidPayload(form: RaidFormState) {
    return {
      ...form,
      owner: form.owner || "",
      probability: Number(form.probability),
      impact: Number(form.impact),
      mitigationPlan: form.mitigationPlan || null,
      contingencyPlan: form.contingencyPlan || null,
      dueDate: form.dueDate || null,
      residualRisk: Number(form.residualRisk),
      validationDate: form.validationDate || null,
      linkedRiskId: form.linkedRiskId || null,
      dependencyType: form.dependencyType || null,
      predecessor: form.predecessor || null,
      successor: form.successor || null,
      supplier: form.supplier || null,
      jiraTicketKey: form.jiraTicketKey || null,
      jiraTicketUrl: form.jiraTicketUrl || null,
      scheduleImpactDays: Number(form.scheduleImpactDays),
      budgetImpact: Number(form.budgetImpact),
    };
  }

  function updateRaidDraft(itemId: string, patch: Partial<RaidFormState>) {
    const current = raidDrafts[itemId];
    if (!current) return;
    setRaidDrafts({
      ...raidDrafts,
      [itemId]: { ...current, ...patch },
    });
  }

  async function createRaidItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/raid-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(raidPayload(raidForm)),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать запись о риске",
        );
      }
      setRaidForm({ ...emptyRaidForm, type: raidForm.type });
      await refreshProject(project.id);
      setExpandedRaidId(result.id);
      setNotice("Запись о риске создана");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать запись о риске",
      );
    }
  }

  async function saveRaidItem(itemId: string) {
    const draft = raidDrafts[itemId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/raid-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raidPayload(draft)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить запись о риске",
        );
      }
      await refreshProject();
      setNotice("Запись о риске обновлена");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить запись о риске",
      );
    }
  }

  async function deleteRaidItem(itemId: string) {
    if (!window.confirm("Удалить запись о риске?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/raid-items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить запись о риске");
      }
      await refreshProject();
      setNotice("Запись о риске удалена");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить запись о риске",
      );
    }
  }

  function wbsPayload(itemId: string, form: WbsFormState) {
    const nextLevel = form.wbsLevel ? Number(form.wbsLevel) : null;
    return {
      ...form,
      parentId: parentIdFromWbsLevel(itemId, nextLevel, wbsTree, wbsDrafts),
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      baselineStartDate: form.baselineStartDate || null,
      baselineDueDate: form.baselineDueDate || null,
      forecastStartDate: form.forecastStartDate || null,
      forecastDueDate: form.forecastDueDate || null,
      code: draftWbsCodes.get(itemId) ?? form.code,
      wbsLevel: nextLevel,
      ...Object.fromEntries(
        WBS_PREDECESSOR_KEYS.map((key) => [key, form[key] || null]),
      ),
      leadLagDays: Number(form.leadLagDays),
      workDays: form.workDays ? Number(form.workDays) : null,
      calendarDays: form.calendarDays ? Number(form.calendarDays) : null,
      excelStartDate: form.excelStartDate || null,
      excelEndDate: form.excelEndDate || null,
      planWorkDays: form.planWorkDays ? Number(form.planWorkDays) : null,
      planCalendarDays: form.planCalendarDays
        ? Number(form.planCalendarDays)
        : null,
      calendarCode: form.calendarCode,
      templateColor: form.templateColor || null,
      priority: form.priority || null,
      plannedCost: Number(form.plannedCost),
      forecastCost: Number(form.forecastCost),
      progress: Number(form.progress),
      jiraTicketKey: form.jiraTicketKey || null,
      jiraTicketUrl: form.jiraTicketUrl || null,
      description: form.description || null,
      sortOrder: Number(form.sortOrder),
    };
  }

  function updateWbsDraft(itemId: string, patch: Partial<WbsFormState>) {
    const current = wbsDrafts[itemId];
    if (!current) return;
    setWbsDrafts({
      ...wbsDrafts,
      [itemId]: { ...current, ...patch },
    });
  }

  function isWbsCellDirty(
    columnKey: WbsTableColumnKey,
    item: WbsTreeItem,
    draft: WbsFormState,
  ) {
    const source = wbsToForm(item);
    if (columnKey === "structure") {
      return draft.title !== source.title || draftWbsCodes.get(item.id) !== item.code;
    }
    return WBS_COLUMN_FIELDS[columnKey].some(
      (field) => draft[field] !== source[field],
    );
  }

  function toggleWbsSelection(itemId: string, checked: boolean) {
    setSelectedWbsIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }

  function updateSelectedWbsDrafts(patch: Partial<WbsFormState>) {
    if (selectedWbsIds.size === 0) return;
    setWbsDrafts((current) => {
      const next = { ...current };
      for (const itemId of selectedWbsIds) {
        if (!next[itemId]) continue;
        next[itemId] = { ...next[itemId], ...patch };
      }
      return next;
    });
  }

  async function saveDirtyWbsItems() {
    if (dirtyWbsItemIds.size === 0) return;
    setSavingWbsBulk(true);
    try {
      for (const itemId of dirtyWbsItemIds) {
        await saveWbsItem(itemId, { silent: true });
      }
      setNotice("Изменения Структуры сохранены");
    } finally {
      setSavingWbsBulk(false);
    }
  }

  function normalizeWbsPasteValue(
    field: keyof WbsFormState,
    value: string,
  ): string | ProjectCalendarCode | WbsItemType | WbsItemStatus {
    const trimmedValue = value.trim();
    if (field === "type") {
      const matchedType = ([
        "PHASE",
        "WORK_PACKAGE",
        "DELIVERABLE",
        "MILESTONE",
        "TASK",
      ] as WbsItemType[]).find(
        (type) =>
          type.toLowerCase() === trimmedValue.toLowerCase() ||
          wbsTypeLabel(type).toLowerCase() === trimmedValue.toLowerCase(),
      );
      return matchedType ?? "TASK";
    }
    if (field === "status") {
      const matchedStatus = ([
        "NOT_STARTED",
        "IN_PROGRESS",
        "AT_RISK",
        "BLOCKED",
        "DONE",
        "CANCELLED",
      ] as WbsItemStatus[]).find(
        (status) =>
          status.toLowerCase() === trimmedValue.toLowerCase() ||
          wbsStatusLabel(status).toLowerCase() === trimmedValue.toLowerCase(),
      );
      return matchedStatus ?? "NOT_STARTED";
    }
    if (field === "calendarCode") {
      return trimmedValue.toUpperCase() === "CN" ? "CN" : "RU";
    }
    return trimmedValue;
  }

  function handleWbsPaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!activeWbsItemId || !clipboardText || !/[\t\n\r]/.test(clipboardText)) {
      return;
    }
    const startIndex = visibleWbsTree.findIndex(
      (item) => item.id === activeWbsItemId,
    );
    if (startIndex === -1) return;
    const pastedRows = clipboardText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((row) => row.length > 0)
      .map((row) => row.split("\t"));
    if (pastedRows.length === 0) return;
    event.preventDefault();
    setWbsDrafts((current) => {
      const next = { ...current };
      pastedRows.forEach((row, rowIndex) => {
        const item = visibleWbsTree[startIndex + rowIndex];
        if (!item || !next[item.id]) return;
        let draft = { ...next[item.id] };
        row.forEach((cellValue, columnIndex) => {
          const column = orderedWbsColumns[columnIndex];
          if (!column) return;
          const fields = WBS_COLUMN_FIELDS[column.key];
          const field = fields[0];
          if (!field || field === "code" || field === "parentId") return;
          draft = {
            ...draft,
            [field]: normalizeWbsPasteValue(field, cellValue),
          };
        });
        next[item.id] = draft;
      });
      return next;
    });
    setNotice(`Вставлено строк из Excel: ${pastedRows.length}`);
  }

  function saveWbsDraftPatch(
    itemId: string,
    patch: Partial<WbsFormState>,
    options: { silent?: boolean } = {},
  ) {
    const current = wbsDrafts[itemId];
    if (!current) return;
    const nextDraft = { ...current, ...patch };
    setWbsDrafts({
      ...wbsDrafts,
      [itemId]: nextDraft,
    });
    void saveWbsItem(itemId, { ...options, draftOverride: nextDraft });
  }

  function toggleWbsCollapse(itemId: string) {
    setCollapsedWbsIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function setWbsHierarchyLevel(level: number) {
    setCollapsedWbsIds((current) => {
      const next = collapsedWbsIdsForLevel(wbsTree, level);
      return setsAreEqual(current, next) ? new Set() : next;
    });
  }

  function startGanttResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = ganttWbsWidth;
    let latestWidth = startWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        640,
        Math.max(260, startWidth + moveEvent.clientX - startX),
      );
      latestWidth = nextWidth;
      setGanttWbsWidth(nextWidth);
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        { ganttWbsWidth: latestWidth },
        { ganttWbsWidth: latestWidth },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function startGanttPanelResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    axis: "width" | "height" | "both",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const currentPanelWidth =
      event.currentTarget.closest(".gantt-panel")?.getBoundingClientRect()
        .width ?? ganttPanelWidth;
    const startWidth = ganttPanelWidth > 0 ? ganttPanelWidth : currentPanelWidth;
    const startHeight = ganttPanelHeight;
    let latestWidth = startWidth;
    let latestHeight = startHeight;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (axis === "width" || axis === "both") {
        latestWidth = clampNumber(
          startWidth + moveEvent.clientX - startX,
          760,
          2400,
        );
        setGanttPanelWidth(latestWidth);
      }
      if (axis === "height" || axis === "both") {
        latestHeight = clampNumber(
          startHeight + moveEvent.clientY - startY,
          320,
          900,
        );
        setGanttPanelHeight(latestHeight);
      }
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        {
          ganttPanelHeight: latestHeight,
          ganttPanelWidth: latestWidth,
        },
        {
          ganttPanelHeight: latestHeight,
          ganttPanelWidth: latestWidth,
        },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function startWbsColumnResize(
    columnKey: WbsTableColumnKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = wbsColumnWidths[columnKey];
    let latestWidths = wbsColumnWidths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        760,
        Math.max(56, startWidth + moveEvent.clientX - startX),
      );
      setWbsColumnWidths((current) => {
        latestWidths = {
          ...current,
          [columnKey]: nextWidth,
        };
        return latestWidths;
      });
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        { wbsColumnWidths: latestWidths },
        { wbsColumnWidths: latestWidths },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function moveWbsColumn(
    sourceKey: WbsTableColumnKey,
    targetKey: WbsTableColumnKey,
  ) {
    if (
      sourceKey === targetKey ||
      sourceKey === "level" ||
      targetKey === "level" ||
      sourceKey === "structure" ||
      targetKey === "structure"
    ) {
      return;
    }
    setWbsColumnOrder((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      const targetIndex = current.indexOf(targetKey);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = normalizeWbsColumnOrder(current);
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      const normalizedNext = normalizeWbsColumnOrder(next);
      void saveProjectUiState(
        { wbsColumnOrder: normalizedNext },
        { wbsColumnOrder: normalizedNext },
      );
      return normalizedNext;
    });
  }

  function toggleWbsColumn(columnKey: WbsTableColumnKey) {
    if (columnKey === "level" || columnKey === "structure") return;
    setWbsHiddenColumns((current) => {
      const currentNormalized = normalizeWbsHiddenColumns(current);
      const isHidden = currentNormalized.includes(columnKey);
      const next = isHidden
        ? currentNormalized.filter((key) => key !== columnKey)
        : normalizeWbsHiddenColumns([...currentNormalized, columnKey]);
      void saveProjectUiState(
        { wbsHiddenColumns: next },
        { wbsHiddenColumns: next },
      );
      return next;
    });
  }

  function startWbsColumnDrag(
    columnKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    if (columnKey === "level" || columnKey === "structure") {
      event.preventDefault();
      return;
    }
    setDraggedWbsColumn(columnKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnKey);
  }

  function dropWbsColumn(
    targetKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    const sourceKey =
      (event.dataTransfer.getData("text/plain") as WbsTableColumnKey) ||
      draggedWbsColumn;
    if (sourceKey) moveWbsColumn(sourceKey, targetKey);
    setDraggedWbsColumn(null);
  }

  function renderWbsCell(
    columnKey: WbsTableColumnKey,
    item: WbsTreeItem,
    draft: WbsFormState,
  ) {
    switch (columnKey) {
      case "structure":
        return (
          <div
            className="wbs-work-cell"
            style={{
              paddingLeft: `${wbsDraftDisplayLevel(item, draft) * 18 + 8}px`,
            }}
          >
            {item.children.length > 0 ? (
              <button
                type="button"
                className="tree-toggle"
                onClick={() => toggleWbsCollapse(item.id)}
                aria-label={
                  collapsedWbsIds.has(item.id)
                    ? "Раскрыть элемент Структуры"
                    : "Схлопнуть элемент Структуры"
                }
              >
                {collapsedWbsIds.has(item.id) ? "+" : "-"}
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <input
              type="checkbox"
              className="wbs-row-select"
              checked={selectedWbsIds.has(item.id)}
              onChange={(event) =>
                toggleWbsSelection(item.id, event.target.checked)
              }
              onClick={(event) => event.stopPropagation()}
              aria-label={`Выбрать строку ${draft.code}`}
            />
            <span
              className={`wbs-color-dot ${item.type === "MILESTONE" ? "tone-o" : wbsToneClass(item)}`}
            />
            <input
              className="wbs-code-input"
              readOnly
              value={draftWbsCodes.get(item.id) ?? draft.code}
            />
            <input
              className="wbs-title-input"
              value={draft.title}
              onChange={(event) =>
                updateWbsDraft(item.id, { title: event.target.value })
              }
              onBlur={() => void saveWbsItem(item.id, { silent: true })}
            />
          </div>
        );
      case "level":
        return (
          <div className="wbs-level-cell">
            <div
              className="wbs-level-stepper"
              aria-label="Изменить уровень вложения"
            >
              <button
                type="button"
                onClick={() => {
                  const currentLevel = draft.wbsLevel
                    ? Number(draft.wbsLevel)
                    : 1;
                  const nextLevel = String(Math.max(1, currentLevel - 1));
                  saveWbsDraftPatch(
                    item.id,
                    { wbsLevel: nextLevel },
                    { silent: true },
                  );
                }}
                aria-label="Уменьшить уровень вложения"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentLevel = draft.wbsLevel
                    ? Number(draft.wbsLevel)
                    : 1;
                  const nextLevel = String(Math.min(12, currentLevel + 1));
                  saveWbsDraftPatch(
                    item.id,
                    { wbsLevel: nextLevel },
                    { silent: true },
                  );
                }}
                aria-label="Увеличить уровень вложения"
              >
                +
              </button>
            </div>
            <input
              type="number"
              className="wbs-level-input"
              value={draft.wbsLevel}
              onChange={(event) =>
                updateWbsDraft(item.id, { wbsLevel: event.target.value })
              }
              onBlur={() => void saveWbsItem(item.id, { silent: true })}
            />
            <div className="wbs-row-controls">
              <button
                type="button"
                className="wbs-row-drag-handle"
                draggable
                onDragStart={(event) => {
                  setDraggedWbsItemId(item.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-wbs-item", item.id);
                }}
                onDragEnd={() => {
                  setDraggedWbsItemId(null);
                  setWbsDropTargetId(null);
                }}
                aria-label="Перетащить строку Структуры"
              >
                ::
              </button>
              <button
                type="button"
                className="wbs-row-delete-button"
                onClick={() => deleteWbsItem(item.id)}
                aria-label="Удалить строку Структуры"
              >
                x
              </button>
            </div>
            <button
              type="button"
              className="wbs-inline-insert-button"
              onClick={() => {
                const afterIndex = visibleWbsTree.findIndex(
                  (visibleItem) => visibleItem.id === item.id,
                );
                if (afterIndex >= 0) void insertWbsRow(afterIndex);
              }}
              aria-label="Добавить строку Структуры ниже"
            >
              +
            </button>
          </div>
        );
      case "type":
        return (
          <select
            value={draft.type}
            onChange={(event) => {
              updateWbsDraft(item.id, {
                type: event.target.value as WbsItemType,
              });
            }}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          >
            <option value="PHASE">{wbsTypeLabel("PHASE")}</option>
            <option value="WORK_PACKAGE">{wbsTypeLabel("WORK_PACKAGE")}</option>
            <option value="DELIVERABLE">{wbsTypeLabel("DELIVERABLE")}</option>
            <option value="MILESTONE">{wbsTypeLabel("MILESTONE")}</option>
            <option value="TASK">{wbsTypeLabel("TASK")}</option>
          </select>
        );
      case "status":
        return (
          <select
            value={draft.status}
            onChange={(event) => {
              updateWbsDraft(item.id, {
                status: event.target.value as WbsItemStatus,
              });
            }}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          >
            <option value="NOT_STARTED">{wbsStatusLabel("NOT_STARTED")}</option>
            <option value="IN_PROGRESS">{wbsStatusLabel("IN_PROGRESS")}</option>
            <option value="AT_RISK">{wbsStatusLabel("AT_RISK")}</option>
            <option value="BLOCKED">{wbsStatusLabel("BLOCKED")}</option>
            <option value="DONE">{wbsStatusLabel("DONE")}</option>
            <option value="CANCELLED">{wbsStatusLabel("CANCELLED")}</option>
          </select>
        );
      case "owner":
        return (
          <input
            value={draft.owner}
            onChange={(event) =>
              updateWbsDraft(item.id, { owner: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "start":
        return (
          <input
            type="date"
            value={draft.startDate}
            onChange={(event) =>
              updateWbsDraft(item.id, {
                startDate: event.target.value,
                excelStartDate: event.target.value,
              })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "due":
        return (
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) =>
              updateWbsDraft(item.id, {
                dueDate: event.target.value,
                excelEndDate: event.target.value,
              })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "workDays":
        return (
          <input
            type="number"
            value={draft.workDays}
            onChange={(event) =>
              updateWbsDraft(item.id, { workDays: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "calendarDays":
        return (
          <input
            type="number"
            value={draft.calendarDays}
            onChange={(event) =>
              updateWbsDraft(item.id, { calendarDays: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "calendar":
        return (
          <select
            value={draft.calendarCode}
            onChange={(event) => {
              updateWbsDraft(item.id, {
                calendarCode: event.target.value as ProjectCalendarCode,
              });
            }}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          >
            <option value="RU">RU</option>
            <option value="CN">CN</option>
          </select>
        );
      case "progress":
        return (
          <input
            type="number"
            min="0"
            max="100"
            value={draft.progress}
            onChange={(event) =>
              updateWbsDraft(item.id, { progress: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "predecessor1":
      case "predecessor2":
      case "predecessor3":
      case "predecessor4":
      case "predecessor5":
      case "predecessor6":
        return (
          <input
            value={resolveDraftPredecessorCode(
              draft[columnKey],
              wbsTree,
              wbsDrafts,
              draftWbsCodes,
            )}
            onChange={(event) =>
              updateWbsDraft(item.id, { [columnKey]: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
            placeholder="Код"
          />
        );
      case "leadLag":
        return (
          <input
            type="number"
            value={draft.leadLagDays}
            onChange={(event) =>
              updateWbsDraft(item.id, { leadLagDays: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      default:
        return null;
    }
  }

  async function saveWbsItem(
    itemId: string,
    options: { silent?: boolean; draftOverride?: WbsFormState } = {},
  ) {
    if (!project) return;
    const draft = options.draftOverride ?? wbsDrafts[itemId];
    if (!draft) return;
    const currentItem = project.wbsItems.find((item) => item.id === itemId);
    const nextPayload = wbsPayload(itemId, draft);
    const currentPayload = currentItem
      ? wbsPayload(itemId, wbsToForm(currentItem))
      : null;
    const rowChanged =
      currentPayload !== null &&
      JSON.stringify(nextPayload) !== JSON.stringify(currentPayload);
    const predecessorsChanged =
      currentItem !== undefined &&
      (WBS_PREDECESSOR_KEYS.some(
        (key) => nextPayload[key] !== currentItem[key],
      ) ||
        nextPayload.leadLagDays !== currentItem.leadLagDays);
    if (
      currentItem &&
      !rowChanged
    ) {
      return;
    }
    if (rowChanged) rememberWbsSnapshot();
    setError(null);
    if (!options.silent) setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPayload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить элемент Структуры",
        );
      }
      const predecessorResult = await saveWbsPredecessors(itemId, {
        remember: !predecessorsChanged,
      });
      if (predecessorResult?.wbsItems) {
        applyWbsSnapshotResult(
          predecessorResult.wbsItems,
          predecessorResult.wbsDependencies,
        );
        if (!options.silent) setNotice("Элемент Структуры обновлен");
        return;
      }
      const renumberResponse = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/renumber`,
        { method: "POST" },
      );
      if (!renumberResponse.ok) {
        const renumberResult = await renumberResponse.json();
        throw new Error(
          renumberResult.error ?? "Не удалось перенумеровать Структуру",
        );
      }
      const renumberResult = await renumberResponse.json();
      if (renumberResult.wbsItems) {
        applyWbsItems(renumberResult.wbsItems);
      } else {
        await refreshProject();
      }
      if (renumberResult.wbsDependencies) {
        setProject((current) =>
          current
            ? { ...current, wbsDependencies: renumberResult.wbsDependencies }
            : current,
        );
      }
      if (!options.silent) setNotice("Элемент Структуры обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить элемент Структуры",
      );
    }
  }

  async function insertWbsRow(afterIndex: number) {
    if (!project) return;
    setError(null);
    setNotice(null);
    const previousItem = visibleWbsTree[afterIndex];
    if (!previousItem) return;
    const nextItem = visibleWbsTree[afterIndex + 1] ?? null;

    rememberWbsSnapshot();
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/insert-after`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            afterItemId: previousItem.id,
            beforeItemId: nextItem?.id ?? null,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось вставить строку Структуры",
        );
      }
      if (result?.wbsItems) {
        applyWbsItems(result.wbsItems);
        if (result.wbsDependencies) {
          setProject((current) =>
            current
              ? { ...current, wbsDependencies: result.wbsDependencies }
              : current,
          );
        }
      } else {
        await refreshProject(project.id);
      }
    } catch (insertError) {
      setError(
        insertError instanceof Error
          ? insertError.message
          : "Не удалось вставить строку Структуры",
      );
    }
  }

  async function reorderWbsRows(sourceId: string, targetId: string) {
    if (!project || sourceId === targetId) return;
    const sourceIndex = wbsTree.findIndex((item) => item.id === sourceId);
    const targetIndex = wbsTree.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourceLevel = wbsTree[sourceIndex].level;
    let sourceEndIndex = sourceIndex + 1;
    while (
      sourceEndIndex < wbsTree.length &&
      wbsTree[sourceEndIndex].level > sourceLevel
    ) {
      sourceEndIndex += 1;
    }
    if (targetIndex > sourceIndex && targetIndex < sourceEndIndex) {
      return;
    }

    const movedBlock = wbsTree.slice(sourceIndex, sourceEndIndex);
    const remainingItems = [
      ...wbsTree.slice(0, sourceIndex),
      ...wbsTree.slice(sourceEndIndex),
    ];
    const nextTargetIndex = remainingItems.findIndex(
      (item) => item.id === targetId,
    );
    if (nextTargetIndex === -1) return;

    const nextItems = [...remainingItems];
    nextItems.splice(nextTargetIndex, 0, ...movedBlock);

    const normalizedItems = nextItems.map((item, index) => ({
      ...item,
      sortOrder: (index + 1) * 10,
    }));
    const previousSnapshot = rememberWbsSnapshot();
    applyWbsItems(normalizedItems);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: normalizedItems.map((item) => item.id),
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось переместить строку Структуры",
        );
      }
      if (result?.wbsItems) {
        applyWbsItems(result.wbsItems);
      }
      if (result?.wbsDependencies) {
        setProject((current) =>
          current ? { ...current, wbsDependencies: result.wbsDependencies } : current,
        );
      }
    } catch (reorderError) {
      if (previousSnapshot) {
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
      }
      await refreshProject(project.id);
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "Не удалось переместить строку Структуры",
      );
    } finally {
      setDraggedWbsItemId(null);
      setWbsDropTargetId(null);
    }
  }

  async function saveWbsPredecessors(
    itemId: string,
    options: { remember?: boolean } = {},
  ) {
    if (!project) return null;
    const draft = wbsDrafts[itemId];
    if (!draft) return null;
    const wbsByCode = new Map<string, WbsItem>();
    for (const item of project.wbsItems) {
      wbsByCode.set(item.code, item);
      const draftCode = draftWbsCodes.get(item.id);
      if (draftCode) {
        wbsByCode.set(draftCode, item);
      }
    }
    const desiredPredecessors = WBS_PREDECESSOR_KEYS.map((key) =>
      resolveDraftPredecessorCode(
        draft[key],
        wbsTree,
        wbsDrafts,
        draftWbsCodes,
      ),
    )
      .map((code) => code.trim())
      .filter(Boolean)
      .map((code) => {
        const predecessor = wbsByCode.get(code);
        if (!predecessor) {
          throw new Error(`Предшественник ${code} не найден в Структуре`);
        }
        return {
          predecessorId: predecessor.id,
          type: "FS" as WbsDependencyType,
          lagDays: Number(draft.leadLagDays),
        };
      });
    const uniquePredecessors = new Set(
      desiredPredecessors.map((draft) => draft.predecessorId),
    );
    if (uniquePredecessors.size !== desiredPredecessors.length) {
      throw new Error("Один предшественник нельзя указывать дважды");
    }
    if (uniquePredecessors.has(itemId)) {
      throw new Error("Элемент Структуры не может быть своим предшественником");
    }

    const existingDependencies = project.wbsDependencies.filter(
      (dependency) => dependency.successorId === itemId,
    );
    const dependenciesChanged =
      existingDependencies.length !== desiredPredecessors.length ||
      existingDependencies.some(
        (dependency) =>
          !desiredPredecessors.some(
            (draft) =>
              draft.predecessorId === dependency.predecessorId &&
              draft.type === dependency.type &&
              draft.lagDays === dependency.lagDays,
          ),
      );
    if (dependenciesChanged && options.remember !== false) {
      rememberWbsSnapshot();
    }
    let latestSnapshot: { wbsItems?: WbsItem[]; wbsDependencies?: WbsDependency[] } | null =
      null;
    for (const dependency of existingDependencies) {
      const shouldKeep = desiredPredecessors.some(
        (draft) =>
          draft.predecessorId === dependency.predecessorId &&
          draft.type === dependency.type,
      );
      if (!shouldKeep) {
        const response = await fetch(
          `${apiBase}/api/wbs-dependencies/${dependency.id}`,
          { method: "DELETE" },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result.error ?? "Не удалось удалить связь Структуры");
        }
        latestSnapshot = result;
      }
    }

    for (const draft of desiredPredecessors) {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-dependencies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predecessorId: draft.predecessorId,
            successorId: itemId,
            type: draft.type,
            lagDays: draft.lagDays,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить связь Структуры",
        );
      }
      latestSnapshot = result;
    }
    return latestSnapshot;
  }

  function ganttEndpointToDependencyType(
    fromSide: GanttLinkEndpoint["side"],
    toSide: GanttLinkEndpoint["side"],
  ): WbsDependencyType {
    if (fromSide === "start" && toSide === "start") return "SS";
    if (fromSide === "start" && toSide === "end") return "SF";
    if (fromSide === "end" && toSide === "end") return "FF";
    return "FS";
  }

  function pointerToGanttPosition(event: PointerEvent | ReactPointerEvent) {
    const timeline = ganttTimelineRef.current;
    if (!timeline) return null;
    const rect = timeline.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
      y: event.clientY - rect.top,
    };
  }

  async function deleteGanttDependency(dependencyId: string) {
    if (!project) {
      setGanttLinkDraft(null);
      return;
    }
    rememberWbsSnapshot();
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/wbs-dependencies/${dependencyId}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить связь на Гантте");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(result.wbsItems, result.wbsDependencies);
      } else {
        await refreshProject(project.id);
      }
      setNotice("Связь на Гантте удалена");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить связь на Гантте",
      );
    } finally {
      setGanttLinkDraft(null);
    }
  }

  function startGanttLinkDrag(
    endpoint: GanttLinkEndpoint,
    event: ReactPointerEvent<Element>,
    replaceDependencyId?: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const position = pointerToGanttPosition(event);
    if (!position) return;
    ganttLinkCompletedRef.current = false;
    setActiveWbsItemId(endpoint.itemId);
    setGanttLinkDraft({
      ...endpoint,
      pointerX: Math.max(0, Math.min(100, position.x)),
      pointerY: position.y,
      replaceDependencyId,
    });

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let draggedBeyondThreshold = false;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (
        Math.hypot(
          moveEvent.clientX - startClientX,
          moveEvent.clientY - startClientY,
        ) > 4
      ) {
        draggedBeyondThreshold = true;
      }
      const nextPosition = pointerToGanttPosition(moveEvent);
      if (!nextPosition) return;
      setGanttLinkDraft((current) =>
        current
          ? {
              ...current,
              pointerX: Math.max(0, Math.min(100, nextPosition.x)),
              pointerY: nextPosition.y,
            }
          : current,
      );
    };
    const onPointerUp = () => {
      window.setTimeout(() => {
        if (ganttLinkCompletedRef.current) {
          ganttLinkCompletedRef.current = false;
          return;
        }
        if (replaceDependencyId && draggedBeyondThreshold) {
          void deleteGanttDependency(replaceDependencyId);
        } else {
          setGanttLinkDraft(null);
        }
      }, 0);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function completeGanttLinkDrag(
    endpoint: GanttLinkEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    ganttLinkCompletedRef.current = true;
    if (!project || !ganttLinkDraft || ganttLinkDraft.itemId === endpoint.itemId) {
      setGanttLinkDraft(null);
      return;
    }
    const predecessorId = ganttLinkDraft.itemId;
    const successorId = endpoint.itemId;
    const type = ganttEndpointToDependencyType(ganttLinkDraft.side, endpoint.side);
    rememberWbsSnapshot();
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        ganttLinkDraft.replaceDependencyId
          ? `${apiBase}/api/wbs-dependencies/${ganttLinkDraft.replaceDependencyId}`
          : `${apiBase}/api/projects/${project.id}/wbs-dependencies`,
        {
          method: ganttLinkDraft.replaceDependencyId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predecessorId,
            successorId,
            type,
            lagDays: 0,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось создать связь на Гантте",
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(result.wbsItems, result.wbsDependencies);
      } else {
        await refreshProject(project.id);
      }
      setNotice(
        ganttLinkDraft.replaceDependencyId
          ? "Связь на Гантте изменена"
          : "Связь на Гантте создана",
      );
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Не удалось создать связь на Гантте",
      );
    } finally {
      setGanttLinkDraft(null);
    }
  }

  async function deleteWbsItem(itemId: string) {
    if (!window.confirm("Удалить только выбранную строку Структуры?")) return;
    setError(null);
    setNotice(null);
    rememberWbsSnapshot();
    try {
      const response = await fetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить элемент Структуры");
      }
      if (result?.wbsItems) {
        applyWbsItems(result.wbsItems);
        if (result.wbsDependencies) {
          setProject((current) =>
            current
              ? { ...current, wbsDependencies: result.wbsDependencies }
              : current,
          );
        }
      } else {
        await refreshProject();
      }
      setNotice("Элемент Структуры удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить элемент Структуры",
      );
    }
  }

  async function createOpenIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const nextErrors: Partial<Record<"title" | "jiraTicketUrl", string>> = {};
    if (!issueForm.title.trim()) {
      nextErrors.title = "Заполните заголовок";
    }
    if (issueForm.jiraTicketUrl.trim()) {
      try {
        new URL(issueForm.jiraTicketUrl.trim());
      } catch {
        nextErrors.jiraTicketUrl = "Некорректный Jira URL";
      }
    }
    setIssueFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setCreatingIssue(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...issueForm,
        owner: issueForm.owner.trim(),
        impact: issueForm.impact.trim(),
        dueDate: issueForm.dueDate || null,
        jiraTicketKey: issueForm.jiraTicketKey.trim() || null,
        jiraTicketUrl: issueForm.jiraTicketUrl.trim() || null,
        jiraLinks: issueForm.jiraLinks.filter(
          (link) => link.jiraKey.trim() && link.jiraUrl.trim(),
        ),
      };
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/open-issues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          responseErrorMessage(result, "Не удалось создать открытый вопрос"),
        );
      }
      setIssueForm(emptyIssueForm);
      setIssueFormErrors({});
      await refreshProject(project.id);
      setIssueDrawerMode(null);
      setIssueDrawerIssueId(null);
      setNotice("Открытый вопрос создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать открытый вопрос",
      );
    } finally {
      setCreatingIssue(false);
    }
  }

  async function saveTaskJiraLink(taskId: string) {
    const draft = taskDrafts[taskId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/tasks/${taskId}/jira-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraTicketKey: draft.jiraTicketKey || null,
          jiraTicketUrl: draft.jiraTicketUrl || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить ссылку",
        );
      }
      await refreshProject();
      setNotice("Ссылка задачи на Jira сохранена");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить ссылку",
      );
    }
  }

  function updateIssueFormLink(index: number, patch: Partial<JiraLinkDraft>) {
    setIssueForm({
      ...issueForm,
      jiraLinks: issueForm.jiraLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    });
  }

  function addIssueFormLink() {
    setIssueForm({
      ...issueForm,
      jiraLinks: [...issueForm.jiraLinks, { jiraKey: "", jiraUrl: "" }],
    });
  }

  function removeIssueFormLink(index: number) {
    setIssueForm({
      ...issueForm,
      jiraLinks:
        issueForm.jiraLinks.length === 1
          ? [{ jiraKey: "", jiraUrl: "" }]
          : issueForm.jiraLinks.filter((_, linkIndex) => linkIndex !== index),
    });
  }

  async function addIssueJiraLink(issueId: string) {
    const draft = issueLinkDrafts[issueId];
    if (!draft?.jiraKey || !draft?.jiraUrl) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/open-issues/${issueId}/jira-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось добавить задачу Jira",
        );
      }
      await refreshProject();
      setNotice("Задача Jira добавлена к открытому вопросу");
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Не удалось добавить задачу Jira",
      );
    }
  }

  async function removeIssueJiraLink(issueId: string, linkId: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/open-issues/${issueId}/jira-links/${linkId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить задачу Jira");
      }
      await refreshProject();
      setNotice("Задача Jira удалена из открытого вопроса");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить задачу Jira",
      );
    }
  }

  function updateIssueDraft(issueId: string, patch: Partial<IssueEditDraft>) {
    const current = issueEditDrafts[issueId];
    if (!current) return;
    setIssueEditDrafts({
      ...issueEditDrafts,
      [issueId]: { ...current, ...patch },
    });
  }

  async function saveOpenIssue(issueId: string) {
    const draft = issueEditDrafts[issueId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          dueDate: draft.dueDate || null,
          jiraTicketKey: draft.jiraTicketKey || null,
          jiraTicketUrl: draft.jiraTicketUrl || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить открытый вопрос",
        );
      }
      await refreshProject();
      setIssueDrawerMode(null);
      setIssueDrawerIssueId(null);
      setNotice("Открытый вопрос обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить открытый вопрос",
      );
    }
  }

  async function closeOpenIssue(issueId: string) {
    const current = issueEditDrafts[issueId];
    if (!current) return;
    setIssueEditDrafts({
      ...issueEditDrafts,
      [issueId]: { ...current, status: "Resolved", decisionRequired: false },
    });
    await saveOpenIssueWithPayload(issueId, {
      status: "Resolved",
      decisionRequired: false,
    });
  }

  async function saveOpenIssueWithPayload(
    issueId: string,
    payload: Partial<IssueEditDraft>,
  ) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить открытый вопрос",
        );
      }
      await refreshProject();
      setNotice("Открытый вопрос обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить открытый вопрос",
      );
    }
  }

  async function generateOverview() {
    if (!project) return;
    setGeneratingOverview(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/executive-overviews/generate`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось сгенерировать обзор");
      }
      await refreshProject(project.id);
      setNotice(`Обзор для руководства v${result.version} сгенерирован`);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Не удалось сгенерировать обзор",
      );
    } finally {
      setGeneratingOverview(false);
    }
  }

  async function publishOverview() {
    if (!latestOverview) return;
    setPublishingOverview(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/executive-overviews/${latestOverview.id}/publish`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось опубликовать обзор");
      }
      await refreshProject();
      setNotice(`Обзор для руководства v${result.version} опубликован`);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Не удалось опубликовать обзор",
      );
    } finally {
      setPublishingOverview(false);
    }
  }

  async function moveOverviewStatus(status: "PM_REVIEW" | "APPROVED") {
    if (!latestOverview) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/executive-overviews/${latestOverview.id}/status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            approvedBy: status === "APPROVED" ? "Проектный офис" : null,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось сменить статус обзора");
      }
      await refreshProject();
      setNotice(`Обзор для руководства v${result.version}: ${overviewStatusLabel(result.status)}`);
    } catch (workflowError) {
      setError(
        workflowError instanceof Error
          ? workflowError.message
          : "Не удалось сменить статус обзора",
      );
    }
  }

  function openView(nextView: AppView) {
    setError(null);
    setNotice(null);
    setActiveView(nextView);
  }

  function selectProject(projectId: string, nextView: AppView = activeView) {
    setError(null);
    setNotice(null);
    setSelectedProjectId(projectId);
    setProjectSearch("");
    setShowProjectPicker(false);
    setRecentProjectIds((current) => [
      projectId,
      ...current.filter((item) => item !== projectId),
    ].slice(0, 6));
    openView(
      nextView === "portfolio" || nextView === "project-create"
        ? "project-overview"
        : nextView,
    );
  }

  const viewTitle: Record<AppView, string> = {
    portfolio: "Портфель проектов",
    "project-create": "Создать новый проект",
    "project-overview": project
      ? `${project.code} - Обзор и вехи`
      : "Обзор и вехи",
    "project-passport": project
      ? `${project.code} - Паспорт проекта`
      : "Паспорт проекта",
    "project-structure": project ? `${project.code} - Структура` : "Структура",
    "project-gantt": project ? `${project.code} - Гантт` : "Гантт",
    "project-issues": project
      ? `${project.code} - Открытые вопросы`
      : "Открытые вопросы",
    "project-raid": project
      ? `${project.code} - Риски и проблемы`
      : "Риски и проблемы",
    "project-calendars": project
      ? `${project.code} - Календари`
      : "Календари",
    "project-artifacts": project
      ? `${project.code} - Артефакты проекта`
      : "Артефакты проекта",
    admin: "Администрирование",
  };
  const projectViewTitle: Record<AppView, string> = {
    portfolio: "Портфель проектов",
    "project-create": "Создать новый проект",
    "project-overview": "Обзор и вехи",
    "project-passport": "Паспорт проекта",
    "project-structure": "Структура",
    "project-gantt": "Гантт",
    "project-issues": "Открытые вопросы",
    "project-raid": "Риски и проблемы",
    "project-calendars": "Календари",
    "project-artifacts": "Артефакты проекта",
    admin: "Администрирование",
  };
  const projectViews: AppView[] = [
    "project-create",
    "project-overview",
    "project-passport",
    "project-structure",
    "project-gantt",
    "project-issues",
    "project-raid",
    "project-calendars",
    "project-artifacts",
  ];
  const isProjectView = projectViews.includes(activeView);
  const isProjectSectionView = isProjectView && activeView !== "project-create";
  const navLabel = (icon: ReactNode, label: string) => (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
        {sidebarCollapsed && <span className="nav-tooltip">{label}</span>}
      </span>
      <span className="nav-text">{label}</span>
    </>
  );
  const toggleSidebar = () => {
    const nextCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(nextCollapsed);
    void saveProjectUiState(
      { sidebarCollapsed: nextCollapsed },
      { sidebarCollapsed: nextCollapsed },
    );
  };

  if (loading) {
    return (
      <main className="loading">Загрузка системы управления проектами...</main>
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={
          sidebarCollapsed
            ? "Развернуть боковую панель"
            : "Свернуть боковую панель"
        }
        title={
          sidebarCollapsed
            ? "Развернуть боковую панель"
            : "Свернуть боковую панель"
        }
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">УП</span>
          <span className="brand-text">
            <b>Система УП</b>
            <small>Контур управления</small>
          </span>
        </div>
        <nav>
          <button
            type="button"
            className={activeView === "portfolio" ? "active" : ""}
            onClick={() => openView("portfolio")}
            aria-label="Портфель проектов"
          >
            {navLabel(<BriefcaseBusiness size={17} />, "Портфель проектов")}
          </button>
          <button
            type="button"
            className={activeView === "project-create" ? "active" : ""}
            onClick={() => openView("project-create")}
            aria-label="Создать новый проект"
          >
            {navLabel(<Plus size={17} />, "Создать новый проект")}
          </button>
          <div className="project-picker">
            <button
              type="button"
              className="project-picker-trigger"
              onClick={() => setShowProjectPicker((current) => !current)}
              aria-expanded={showProjectPicker}
            >
              <span>
                {selectedProjectListItem
                  ? projectOptionLabel(selectedProjectListItem)
                  : "Выбрать проект"}
              </span>
              <ChevronDown size={15} />
            </button>
            {showProjectPicker && (
              <div className="project-picker-popover">
                <label className="project-search">
                  <Search size={15} />
                  <input
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="Поиск по коду, имени, РП"
                  />
                </label>
                {recentProjects.length > 0 && !projectSearch.trim() && (
                  <div className="project-picker-section">
                    <span>Недавние</span>
                    {recentProjects.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => selectProject(item.id, "project-overview")}
                      >
                        <b>{item.code}</b>
                        <small>{item.name}</small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="project-picker-section">
                  <span>Все проекты</span>
                  {filteredProjectOptions.map((item) => (
                    <button
                      type="button"
                      className={item.id === selectedProjectId ? "selected" : ""}
                      key={item.id}
                      onClick={() => selectProject(item.id, "project-overview")}
                    >
                      <b>{item.code}</b>
                      <small>{item.name}</small>
                    </button>
                  ))}
                  {filteredProjectOptions.length === 0 && (
                    <em>Проекты не найдены</em>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className={isProjectSectionView ? "active" : ""}
            onClick={() =>
              openView(
                selectedProjectId ? "project-overview" : "project-create",
              )
            }
            aria-label="Проекты"
          >
            {navLabel(<FolderTree size={17} />, "Проекты")}
          </button>
          <div className="sidebar-group">
            {selectedProjectListItem && (
              <div className="project-menu">
                <button
                  type="button"
                  className={
                    activeView === "project-overview"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-overview")}
                  aria-label="Обзор и вехи"
                >
                  {navLabel(<LayoutDashboard size={17} />, "Обзор и вехи")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-passport"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-passport")}
                  aria-label="Паспорт проекта"
                >
                  {navLabel(<FileText size={17} />, "Паспорт проекта")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-structure"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-structure")}
                  aria-label="Структура"
                >
                  {navLabel(<ListChecks size={17} />, "Структура")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-gantt"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-gantt")}
                  aria-label="Гантт"
                >
                  {navLabel(<GanttChartSquare size={17} />, "Гантт")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-issues"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-issues")}
                  aria-label="Открытые вопросы"
                >
                  {navLabel(<ShieldAlert size={17} />, "Открытые вопросы")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-raid"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-raid")}
                  aria-label="Риски и проблемы"
                >
                  {navLabel(<BarChart3 size={17} />, "Риски и проблемы")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-calendars"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-calendars")}
                  aria-label="Календари"
                >
                  {navLabel(<CalendarDays size={17} />, "Календари")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-artifacts"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => openView("project-artifacts")}
                  aria-label="Артефакты проекта"
                >
                  {navLabel(<FileArchive size={17} />, "Артефакты проекта")}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={activeView === "admin" ? "active" : ""}
            onClick={() => openView("admin")}
            aria-label="Администрирование"
          >
            {navLabel(<Settings size={17} />, "Администрирование")}
          </button>
        </nav>
      </aside>

      <main
        className={`workspace ${executivePresentationMode ? "presentation-mode" : ""}`}
      >
        <header
          className={`topbar ${project && isProjectView && activeView !== "project-create" ? "project-topbar" : ""}`}
        >
          <div className="topbar-main">
            {project && isProjectView && activeView !== "project-create" ? (
              <>
                <span className="topbar-section">
                  {projectViewTitle[activeView]}
                </span>
                <h1>
                  <span>{project.code}</span>
                  {project.name}
                </h1>
              </>
            ) : (
              <h1>{viewTitle[activeView]}</h1>
            )}
          </div>
          {project && activeView !== "portfolio" && (
            <div className="topbar-project">
              <span>Статус: {projectStatusLabel(project.status)}</span>
              <span>РП: {project.projectManager}</span>
              <span>Срок: {date(project.targetDate)}</span>
              <b className={`rag ${project.rag.toLowerCase()}`}>
                {projectHealthLabel(project.rag)}
              </b>
            </div>
          )}
        </header>
        <div className="toast-stack" aria-live="polite">
          {error && (
            <div className="toast error">
              <button
                type="button"
                aria-label="Закрыть уведомление об ошибке"
                onClick={() => setError(null)}
              >
                x
              </button>
              <strong>Ошибка</strong>
              <p>{error}</p>
            </div>
          )}
          {notice && (
            <div className="toast success">
              <button
                type="button"
                aria-label="Закрыть уведомление"
                onClick={() => setNotice(null)}
              >
                x
              </button>
              <strong>Готово</strong>
              <p>{notice}</p>
            </div>
          )}
        </div>

        {(project ||
          activeView === "portfolio" ||
          activeView === "project-create" ||
          activeView === "admin") && (
          <>
            {activeView === "portfolio" && (
              <section className="summary-grid">
                <div className="metric">
                  <span>Активные проекты</span>
                  <strong>{portfolioStats.activeProjects}</strong>
                  <small>Всего проектов: {projects.length}</small>
                </div>
                <div className="metric">
                  <span>Прогресс портфеля</span>
                  <strong>{portfolioStats.averageProgress}%</strong>
                  <div className="progress">
                    <i
                      style={{ width: `${portfolioStats.averageProgress}%` }}
                    />
                  </div>
                </div>
                <div className="metric">
                  <span>Риск-профиль</span>
                  <strong>
                    {portfolioStats.redProjects} /{" "}
                    {portfolioStats.amberProjects}
                  </strong>
                  <small>Критичные / под риском</small>
                </div>
                <div className="metric">
                  <span>Открытые вопросы</span>
                  <strong>{portfolioStats.openIssues}</strong>
                  <small>Открытые проблемы по портфелю</small>
                </div>
              </section>
            )}

            {project && activeView === "project-overview" && (
              <section className="summary-grid">
                <button
                  type="button"
                  className="metric metric-button"
                  onClick={() => openView("project-passport")}
                >
                  <span>Статус проекта</span>
                  <strong className={`rag ${project.rag.toLowerCase()}`}>
                    {projectHealthLabel(project.rag)}
                  </strong>
                  <small>
                    {isImportedSummary(project.summary)
                      ? "Сводка проекта требует заполнения"
                      : project.summary}
                  </small>
                </button>
                <button
                  type="button"
                  className="metric metric-button"
                  onClick={() => openView("project-structure")}
                >
                  <span>Прогресс</span>
                  <strong>{project.progress}%</strong>
                  <div className="progress">
                    <i style={{ width: `${project.progress}%` }} />
                  </div>
                </button>
                <button
                  type="button"
                  className="metric metric-button"
                  onClick={() => openView("project-gantt")}
                >
                  <span>Отклонение сроков</span>
                  <strong>
                    {project.scheduleVariance > 0 ? "+" : ""}
                    {project.scheduleVariance} дней
                  </strong>
                  <small>Относительно базового плана</small>
                </button>
                <button
                  type="button"
                  className="metric metric-button"
                  onClick={() => openView("project-issues")}
                >
                  <span>Открытые вопросы</span>
                  <strong>{project.issues.length}</strong>
                  <small>Требуют контроля РП</small>
                </button>
              </section>
            )}

            {project && activeView === "project-overview" && (
              <section className="overview-action-grid">
                <button type="button" onClick={() => openView("project-overview")}>
                  <span>Ближайшая веха</span>
                  <strong>
                    {overviewDashboard.nextMilestone
                      ? overviewDashboard.nextMilestone.milestone.title
                      : "Нет будущих вех"}
                  </strong>
                  <small>
                    {overviewDashboard.nextMilestone
                      ? `${formatDaysLeft(overviewDashboard.nextMilestone.workDaysLeft)} раб. / ${formatDaysLeft(overviewDashboard.nextMilestone.calendarDaysLeft)} кал.`
                      : "Проверьте Структуру проекта"}
                  </small>
                </button>
                <button type="button" onClick={() => openView("project-structure")}>
                  <span>Просроченные элементы</span>
                  <strong>{overviewDashboard.overdueItems.length}</strong>
                  <small>
                    {topOverdueItems[0]
                      ? `${topOverdueItems[0].item.code}: ${topOverdueItems[0].days} дн.`
                      : "Просрочки по Структуре нет"}
                  </small>
                </button>
                <button type="button" onClick={() => openView("project-raid")}>
                  <span>Риски и проблемы</span>
                  <strong>{overviewDashboard.riskItems.length}</strong>
                  <small>Активные записи под контролем</small>
                </button>
                <button type="button" onClick={() => openView("project-issues")}>
                  <span>Нужны решения</span>
                  <strong>{overviewDashboard.decisionItems}</strong>
                  <small>Только открытые вопросы</small>
                </button>
              </section>
            )}

            {project &&
              activeView === "project-overview" &&
              topOverdueItems.length > 0 && (
                <section className="overview-overdue-panel">
                  <div>
                    <h3>Просроченные элементы</h3>
                    <p>Что просрочено, на сколько дней и какой управленческий эффект.</p>
                  </div>
                  <div className="overview-overdue-list">
                    {topOverdueItems.map(({ item, days, impact }) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => openView("project-structure")}
                      >
                        <b>{item.code}</b>
                        <span>{item.title}</span>
                        <strong>{days} кал. дн.</strong>
                        <small>{impact}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )}

            {activeView === "portfolio" && (
              <section className="projects-tree-section">
                <article className="panel project-tree-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Портфель проектов</h2>
                      <p>
                        Иерархия проектов, статусы и ответственные руководители
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openView("project-create")}
                    >
                      Создать проект
                    </button>
                  </div>
                  <div className="project-tree-list">
                    <div className="project-tree-head">
                      <span>Код проекта</span>
                      <span>Имя проекта</span>
                      <span />
                      <span>РП</span>
                      <span>Прогресс</span>
                      <span>Индикатор</span>
                    </div>
                    {projectTree.map((item) => {
                      const draft =
                        projectRegistryDrafts[item.id] ??
                        projectToRegistryDraft(item);
                      return (
                        <div
                          className={`project-tree-row ${item.id === selectedProjectId ? "active" : ""}`}
                          key={item.id}
                        >
                          <input
                            className="project-tree-code-input"
                            value={draft.code}
                            onChange={(event) =>
                              updateProjectRegistryDraft(item.id, {
                                code: event.target.value,
                              })
                            }
                            onBlur={() =>
                              void savePortfolioProjectIdentity(item.id)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            style={
                              {
                                marginLeft: `${item.level * 18}px`,
                                "--project-indent": `${item.level * 18}px`,
                              } as CSSProperties
                            }
                            aria-label={`Код проекта ${item.name}`}
                            disabled={savingProjectRegistryId === item.id}
                          />
                          <input
                            className="project-tree-name-input"
                            value={draft.name}
                            onChange={(event) =>
                              updateProjectRegistryDraft(item.id, {
                                name: event.target.value,
                              })
                            }
                            onBlur={() =>
                              void savePortfolioProjectIdentity(item.id)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            aria-label={`Имя проекта ${item.code}`}
                            disabled={savingProjectRegistryId === item.id}
                          />
                          <button
                            type="button"
                            className="project-tree-open"
                            onClick={() =>
                              selectProject(item.id, "project-overview")
                            }
                          >
                            Открыть
                          </button>
                          <span>{item.projectManager}</span>
                          <span>{item.progress}%</span>
                          <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                        </div>
                      );
                    })}
                    {projects.length === 0 && (
                      <div className="empty-state">Проекты еще не созданы.</div>
                    )}
                  </div>
                </article>
              </section>
            )}

            <section className="content-grid">
              {activeView === "project-create" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Создать проект</h2>
                      <p>Быстрый ввод нового проекта с базовыми полями проектного офиса</p>
                    </div>
                  </div>
	                  <form
	                    className="form-grid compact-form"
	                    onSubmit={createProject}
	                  >
	                    <div className="form-section-title span-2">Основное</div>
	                    <label>
	                      Код
                      <input
                        value={newProjectForm.code}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            code: event.target.value,
                          })
                        }
                        placeholder="CRM"
                      />
                    </label>
                    <label>
                      Наименование
                      <input
                        value={newProjectForm.name}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            name: event.target.value,
                          })
                        }
                        placeholder="Миграция CRM"
                      />
                    </label>
                    <label>
                      Родительский проект
                      <select
                        value={newProjectForm.parentId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">Корень</option>
                        {projectTree.map((item) => (
                          <option key={item.id} value={item.id}>
                            {"- ".repeat(item.level)}
                            {item.code} - {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Порядок
                      <input
                        type="number"
                        value={newProjectForm.sortOrder}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sortOrder: event.target.value,
                          })
                        }
	                        />
	                      </label>
	                    <div className="form-section-title span-2">Команда и статус</div>
	                    <label>
	                      Портфель
                      <input
                        value={newProjectForm.portfolio}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            portfolio: event.target.value,
                          })
                        }
                        placeholder="Цифровая трансформация"
                      />
                    </label>
                    <label>
                      РП
                      <input
                        value={newProjectForm.projectManager}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            projectManager: event.target.value,
                          })
                        }
                        placeholder="Руководитель проекта"
                      />
                    </label>
                    <label>
                      Спонсор
                      <input
                        value={newProjectForm.sponsor}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sponsor: event.target.value,
                          })
                        }
                        placeholder="Финансовый директор / ИТ-директор"
                      />
                    </label>
                    <label>
                      Индикатор
                      <select
                        value={newProjectForm.rag}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            rag: event.target.value as RagStatus,
                          })
                        }
                      >
                        <option value="GREEN">{ragOptionLabel("GREEN")}</option>
                        <option value="AMBER">{ragOptionLabel("AMBER")}</option>
	                        <option value="RED">{ragOptionLabel("RED")}</option>
	                      </select>
	                    </label>
	                    <div className="form-section-title span-2">Сроки</div>
	                    <label>
	                      Старт
                      <input
                        type="date"
                        value={newProjectForm.startDate}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            startDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Целевая дата
                      <input
                        type="date"
                        value={newProjectForm.targetDate}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            targetDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Прогресс
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newProjectForm.progress}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            progress: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Отклонение сроков
                      <input
                        type="number"
                        value={newProjectForm.scheduleVariance}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            scheduleVariance: event.target.value,
                          })
                        }
	                        />
	                      </label>
	                    <div className="form-section-title span-2">Управленческая сводка</div>
	                    <label className="span-2">
	                      Сводка
                      <textarea
                        value={newProjectForm.summary}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            summary: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit">Создать проект</button>
                    </div>
                  </form>
                </article>
              )}

              {activeView === "admin" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: реестр проектов</h2>
                      <p>
                        Управление кодами, наименованиями и иерархией проектов
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openView("project-create")}
                    >
                      Создать проект
                    </button>
                  </div>
                  <div className="project-admin-table">
                    <div className="project-admin-head">
                      <span>Код</span>
                      <span>Наименование</span>
                      <span>Родитель</span>
                      <span>РП</span>
                      <span>Статус</span>
                      <span>Индикатор</span>
                      <span>Порядок</span>
                      <span />
                    </div>
                    {projectTree.map((item) => {
                      const draft =
                        projectRegistryDrafts[item.id] ??
                        projectToRegistryDraft(item);
                      return (
                        <div className="project-admin-row" key={item.id}>
                          <div className="project-admin-readonly">
                            <span>Код</span>
                            <b>{item.code}</b>
                          </div>
                          <div
                            className="project-admin-readonly project-admin-name"
                            style={{
                              paddingLeft: `${Math.min(item.level * 18, 72) + 10}px`,
                            }}
                          >
                            <span>Наименование</span>
                            <b>{item.name}</b>
                          </div>
                          <label>
                            <span>Родитель</span>
                            <select
                              value={draft.parentId}
                              onChange={(event) =>
                                updateProjectRegistryDraft(item.id, {
                                  parentId: event.target.value,
                                })
                              }
                            >
                              <option value="">Корень</option>
                              {projectTree
                                .filter((option) => option.id !== item.id)
                                .map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {"- ".repeat(option.level)}
                                    {projectOptionLabel(option)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            <span>РП</span>
                            <input
                              value={draft.projectManager}
                              onChange={(event) =>
                                updateProjectRegistryDraft(item.id, {
                                  projectManager: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Статус</span>
                            <select
                              value={draft.status}
                              onChange={(event) =>
                                updateProjectRegistryDraft(item.id, {
                                  status: event.target
                                    .value as ProjectRegistryDraft["status"],
                                })
                              }
                            >
                              <option value="DRAFT">{projectStatusLabel("DRAFT")}</option>
                              <option value="ACTIVE">{projectStatusLabel("ACTIVE")}</option>
                              <option value="ON_HOLD">{projectStatusLabel("ON_HOLD")}</option>
                              <option value="CLOSED">{projectStatusLabel("CLOSED")}</option>
                            </select>
                          </label>
                          <label>
                            <span>Индикатор</span>
                            <select
                              value={draft.rag}
                              onChange={(event) =>
                                updateProjectRegistryDraft(item.id, {
                                  rag: event.target.value as RagStatus,
                                })
                              }
                            >
                              <option value="GREEN">{ragOptionLabel("GREEN")}</option>
                              <option value="AMBER">{ragOptionLabel("AMBER")}</option>
                              <option value="RED">{ragOptionLabel("RED")}</option>
                            </select>
                          </label>
                          <label>
                            <span>Порядок</span>
                            <input
                              type="number"
                              value={draft.sortOrder}
                              onChange={(event) =>
                                updateProjectRegistryDraft(item.id, {
                                  sortOrder: event.target.value,
                                })
                              }
                            />
                          </label>
                          <div className="project-admin-actions">
                            <button
                              type="button"
                              onClick={() =>
                                selectProject(item.id, "project-overview")
                              }
                            >
                              Открыть
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void saveProjectRegistryItem(item.id)
                              }
                              disabled={savingProjectRegistryId === item.id}
                            >
                              {savingProjectRegistryId === item.id
                                ? "Сохраняю..."
                                : "Сохранить"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {projects.length === 0 && (
                      <div className="empty-state">Проекты еще не созданы.</div>
                    )}
                  </div>
                </article>
              )}

              {project && activeView === "project-overview" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Вехи</h2>
                    </div>
                    {project.jiraIntegration && (
                      <a
                        className="button"
                        href={project.jiraIntegration.boardUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть доску Jira
                      </a>
                    )}
                  </div>
                  <div className="milestone-timeline">
                    {milestoneTimeline.items.length > 0 ? (
                      <div className="milestone-timeline-canvas">
                        <div className="milestone-axis" aria-hidden="true" />
                        <div className="milestone-axis-arrow" aria-hidden="true" />
                        {milestoneTimeline.items.map(
                          ({
                            milestone,
                            workDaysLeft,
                            calendarDaysLeft,
                            state,
                            offset,
                            side,
                          }) => (
                            <button
                              type="button"
                              className={`milestone-point ${side} ${state.tone}`}
                              key={milestone.id}
                              onClick={() => openView("project-structure")}
                              style={{ left: `${offset}%` }}
                              title={`${milestone.code} ${milestone.title}: ${date(milestone.dueDate)}. ${state.label}. ${formatDaysLeft(workDaysLeft)} раб., ${formatDaysLeft(calendarDaysLeft)} кал.`}
                            >
                              <span className="milestone-marker" />
                              <span className="milestone-label">
                                {milestone.title}
                              </span>
                              <span className="milestone-date">
                                {shortDate(milestone.dueDate)}
                              </span>
                            </button>
                          ),
                        )}
                        <div className="milestone-range">
                          <span>{shortDate(milestoneTimeline.startDate)}</span>
                          <span>{shortDate(milestoneTimeline.endDate)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state">
                        В Структуре пока нет элементов типа «Веха».
                      </div>
                    )}
                  </div>
                </article>
              )}

              {project && activeView === "project-passport" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Паспорт проекта</h2>
                      <p>Редактируемый набор полей паспорта проекта</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addPassportRow(passportRows.length - 1)}
                    >
                      + Добавить поле
                    </button>
                  </div>
                  <div className="passport-table">
                    <div className="passport-head">
                      <span>Поле</span>
                      <span>Описание</span>
                      <span />
                    </div>
                    {passportRows.map((row, index) => (
                      <div className="passport-row" key={row.id}>
                        <input
                          value={row.field}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              field: event.target.value,
                            })
                          }
                          placeholder="Наименование поля"
                        />
                        <textarea
                          value={row.description}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              description: event.target.value,
                            })
                          }
                          rows={2}
                          placeholder="Описание или значение"
                        />
                        <div className="passport-row-controls">
                          <button
                            type="button"
                            className="wbs-inline-insert-button"
                            onClick={() => addPassportRow(index)}
                            aria-label="Добавить поле ниже"
                            title="Добавить поле ниже"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="wbs-row-delete-button"
                            onClick={() => deletePassportRow(row.id)}
                            aria-label="Удалить поле"
                            title="Удалить поле"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions passport-actions">
                    <button
                      type="button"
                      onClick={() => void savePassportRows()}
                      disabled={savingPassportRows}
                    >
                      {savingPassportRows ? "Сохраняю..." : "Сохранить паспорт"}
                    </button>
                  </div>
                </article>
              )}

              {project &&
                (activeView === "project-structure" ||
                  activeView === "project-gantt") && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>
                        {activeView === "project-structure"
                          ? "Структура"
                          : "Гантт"}
                      </h2>
                      <p>
                        {activeView === "project-structure"
                          ? "Иерархия работ проекта, сроки, ответственные, календарь и связи с предшественниками"
                          : "Временная шкала проекта, связи и базовый план"}
                      </p>
                    </div>
			                  </div>
		                  <div className="wbs-gantt-layout">
	                    {activeView === "project-structure" && (
	                      <>
		                    <div className="wbs-history-toolbar" aria-label="История Структуры">
                      <button
                        type="button"
                        onClick={() => void undoWbsChange()}
                        onMouseDown={(event) => event.preventDefault()}
                        disabled={
                          restoringWbsSnapshot || wbsUndoStack.length === 0
                        }
                        aria-label="Откатить последнее изменение Структуры"
                        title="Назад"
                      >
                        ← Назад
                      </button>
                      <button
                        type="button"
                        onClick={() => void redoWbsChange()}
                        onMouseDown={(event) => event.preventDefault()}
                        disabled={
                          restoringWbsSnapshot || wbsRedoStack.length === 0
                        }
                        aria-label="Вернуть отмененное изменение Структуры"
                        title="Вперед"
                      >
                        Вперед →
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveDirtyWbsItems()}
                        disabled={savingWbsBulk || dirtyWbsItemIds.size === 0}
                      >
                        {savingWbsBulk ? "Сохраняю..." : "Сохранить изменения"}
                      </button>
		                      <button
		                        type="button"
		                        onClick={() => void saveWbsBaseline()}
		                        disabled={savingBaseline || project.wbsItems.length === 0}
		                      >
		                        Зафиксировать базовый план
		                      </button>
		                      <div className="segmented-control hierarchy-control" aria-label="Глубина иерархии Структуры">
		                        {GANTT_HIERARCHY_LEVELS.map((level) => (
		                          <button
		                            type="button"
		                            key={level}
		                            className={activeWbsHierarchyLevel === level ? "active" : ""}
		                            onClick={() => setWbsHierarchyLevel(level)}
		                            title={`Показать структуру до ${level} уровня`}
		                          >
		                            {level}
		                          </button>
		                        ))}
		                      </div>
		                      <div className="column-menu">
		                        <button
		                          type="button"
	                          onClick={() =>
	                            setShowWbsColumnMenu((current) => !current)
	                          }
	                        >
	                          Колонки
	                        </button>
	                        {showWbsColumnMenu && (
	                          <div className="column-menu-popover">
	                            {WBS_TABLE_COLUMNS.filter(
	                              (column) =>
	                                column.key !== "level" &&
	                                column.key !== "structure",
	                            ).map((column) => (
	                              <label key={column.key}>
		                                <input
		                                  type="checkbox"
		                                  checked={!wbsHiddenColumns.includes(column.key)}
		                                  onChange={() => toggleWbsColumn(column.key)}
		                                />
	                                {column.label}
	                              </label>
	                            ))}
	                          </div>
	                        )}
	                      </div>
                      <span
                        className={`wbs-save-state ${dirtyWbsItemIds.size > 0 ? "dirty" : "saved"}`}
                      >
                        {dirtyWbsItemIds.size > 0
                          ? `Не сохранено: ${dirtyWbsItemIds.size}`
                          : "Сохранено"}
                      </span>
	                    </div>
                      {selectedWbsIds.size > 0 && (
                        <div className="wbs-bulk-toolbar">
                          <span>Выбрано: {selectedWbsIds.size}</span>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              updateSelectedWbsDrafts({
                                status: event.target.value as WbsItemStatus,
                              });
                              event.currentTarget.value = "";
                            }}
                            aria-label="Массово изменить статус"
                          >
                            <option value="">Статус</option>
                            <option value="NOT_STARTED">
                              {wbsStatusLabel("NOT_STARTED")}
                            </option>
                            <option value="IN_PROGRESS">
                              {wbsStatusLabel("IN_PROGRESS")}
                            </option>
                            <option value="AT_RISK">
                              {wbsStatusLabel("AT_RISK")}
                            </option>
                            <option value="BLOCKED">
                              {wbsStatusLabel("BLOCKED")}
                            </option>
                            <option value="DONE">{wbsStatusLabel("DONE")}</option>
                            <option value="CANCELLED">
                              {wbsStatusLabel("CANCELLED")}
                            </option>
                          </select>
                          <input
                            placeholder="Исполнитель"
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              updateSelectedWbsDrafts({
                                owner: event.currentTarget.value,
                              });
                              event.currentTarget.value = "";
                            }}
                            onBlur={(event) => {
                              if (!event.currentTarget.value.trim()) return;
                              updateSelectedWbsDrafts({
                                owner: event.currentTarget.value,
                              });
                              event.currentTarget.value = "";
                            }}
                          />
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              updateSelectedWbsDrafts({
                                calendarCode:
                                  event.target.value as ProjectCalendarCode,
                              });
                              event.currentTarget.value = "";
                            }}
                            aria-label="Массово изменить календарь"
                          >
                            <option value="">Календарь</option>
                            <option value="RU">RU</option>
                            <option value="CN">CN</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setSelectedWbsIds(new Set())}
                          >
                            Снять выбор
                          </button>
                        </div>
                      )}
                    <div className="wbs-table-shell">
                      <div
                        className="wbs-excel-table"
                        onPaste={handleWbsPaste}
                        style={
                          {
                            "--wbs-table-template": wbsTableTemplate,
                            "--wbs-level-width": `${wbsLevelWidth}px`,
                          } as WbsTableCssProperties
                        }
                      >
                        <div className="wbs-table-head">
                          {orderedWbsColumns.map((column) => (
                            <span
                              key={column.key}
                              draggable={
                                column.key !== "level" &&
                                column.key !== "structure"
                              }
                            className={
                              draggedWbsColumn === column.key
                                ? `wbs-column-header ${column.key === "level" ? "level-column" : ""} ${column.key === "structure" ? "structure-column" : ""} dragging`
                                : `wbs-column-header ${column.key === "level" ? "level-column" : ""} ${column.key === "structure" ? "structure-column" : ""}`
                            }
                              onDragStart={(event) =>
                                startWbsColumnDrag(column.key, event)
                              }
                              onDragOver={(event) => {
                                if (
                                  draggedWbsColumn &&
                                  column.key !== "level" &&
                                  column.key !== "structure"
                                ) {
                                  event.preventDefault();
                                }
                              }}
                              onDrop={(event) => dropWbsColumn(column.key, event)}
                              onDragEnd={() => setDraggedWbsColumn(null)}
                            >
                              <span className="wbs-column-title">{column.label}</span>
                              <button
                                type="button"
                                className="wbs-column-resizer"
                                onPointerDown={(event) =>
                                  startWbsColumnResize(column.key, event)
                                }
                                aria-label={`Изменить ширину колонки ${column.label}`}
                              />
                            </span>
                          ))}
                        </div>
                        {visibleWbsTree.map((item) => {
                          const draft = wbsDrafts[item.id];
                          if (!draft) return null;
                          return (
                            <div
                              key={item.id}
                              className={`wbs-row-stack ${draggedWbsItemId === item.id ? "dragging" : ""} ${wbsDropTargetId === item.id ? "drop-target" : ""}`}
                              onDragOver={(event) => {
                                if (
                                  !draggedWbsItemId ||
                                  draggedWbsItemId === item.id
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                setWbsDropTargetId(item.id);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const sourceId =
                                  event.dataTransfer.getData("application/x-wbs-item") ||
                                  draggedWbsItemId;
                                if (sourceId) {
                                  void reorderWbsRows(sourceId, item.id);
                                }
                              }}
                              onDragLeave={() =>
                                setWbsDropTargetId((current) =>
                                  current === item.id ? null : current,
                                )
                              }
                            >
                              <div
                                className={`wbs-table-row ${item.type === "MILESTONE" ? "milestone" : ""} ${activeWbsItemId === item.id ? "active" : ""}`}
                                onClick={() => setActiveWbsItemId(item.id)}
                              >
                                {orderedWbsColumns.map((column) => (
                                  <div
                                    key={`${item.id}-${column.key}`}
                                    className={`${isWbsCellDirty(column.key, item, draft) ? "dirty" : ""} ${
                                      column.key === "level"
                                        ? "wbs-cell-level"
                                        : column.key === "structure"
                                        ? "wbs-cell-structure"
                                        : "wbs-cell"
                                    }`}
                                  >
                                    {renderWbsCell(column.key, item, draft)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {project.wbsItems.length === 0 && (
                          <div className="empty-state">Структура еще не создана.</div>
                        )}
                      </div>
                    </div>
                      </>
	                    )}
	                    {activeView === "project-gantt" && (
	                      <>
	                        <div className="gantt-controls">
	                          <div className="gantt-controls-row">
	                            <button
	                              type="button"
	                              onClick={() => void undoWbsChange()}
	                              onMouseDown={(event) => event.preventDefault()}
	                              disabled={
	                                restoringWbsSnapshot ||
	                                wbsUndoStack.length === 0
	                              }
	                              aria-label="Откатить последнее изменение Гантта"
	                              title="Назад"
	                            >
	                              ← Назад
	                            </button>
	                            <button
	                              type="button"
	                              onClick={() => void redoWbsChange()}
	                              onMouseDown={(event) => event.preventDefault()}
	                              disabled={
	                                restoringWbsSnapshot ||
	                                wbsRedoStack.length === 0
	                              }
	                              aria-label="Вернуть отмененное изменение Гантта"
	                              title="Вперед"
	                            >
	                              Вперед →
	                            </button>
	                            <div className="segmented-control" aria-label="Масштаб Гантта">
	                              <button
	                                type="button"
	                                className={ganttScale === "month" ? "active" : ""}
	                                onClick={() => setGanttScale("month")}
	                              >
	                                Месяцы
	                              </button>
	                              <button
	                                type="button"
	                                className={ganttScale === "quarter" ? "active" : ""}
	                                onClick={() => setGanttScale("quarter")}
	                              >
	                                Кварталы
	                              </button>
	                            </div>
	                            <button
	                              type="button"
	                              onClick={() =>
	                                document
	                                  .querySelector(".gantt-today")
	                                  ?.scrollIntoView({
	                                    inline: "center",
	                                    block: "nearest",
	                                    behavior: "smooth",
	                                  })
	                              }
	                            >
	                              Сегодня
	                            </button>
	                            <button
	                              type="button"
	                              className={showGanttDependencies ? "active" : ""}
	                              onClick={() =>
	                                setShowGanttDependencies((current) => !current)
	                              }
	                            >
	                              Связи
	                            </button>
	                            <button
	                              type="button"
	                              className={showGanttBaseline ? "active" : ""}
	                              onClick={() =>
	                                setShowGanttBaseline((current) => !current)
	                              }
	                            >
	                              Базовый план
	                            </button>
	                            <button
	                              type="button"
	                              className={showGanttForecast ? "active" : ""}
	                              onClick={() =>
	                                setShowGanttForecast((current) => !current)
	                              }
	                            >
	                                Прогноз
	                              </button>
	                            <div className="segmented-control hierarchy-control" aria-label="Глубина иерархии Гантта">
	                              {GANTT_HIERARCHY_LEVELS.map((level) => (
	                                <button
	                                  type="button"
	                                  key={level}
	                                  className={activeWbsHierarchyLevel === level ? "active" : ""}
	                                  onClick={() => setWbsHierarchyLevel(level)}
	                                  title={`Показать иерархию до ${level} уровня`}
	                                >
	                                  {level}
	                                </button>
	                              ))}
	                            </div>
	                          </div>
	                          <div className="status-legend gantt-status-legend" aria-label="Легенда статусов">
	                            <span><i className="tone-b" />В работе</span>
	                            <span><i className="tone-g" />Сделано</span>
	                            <span><i className="tone-r" />Провалено</span>
	                            <span><i className="tone-p" />Просрочено</span>
	                            <span><i className="tone-x" />Не начато</span>
	                            <span><i className="tone-o" />Веха</span>
	                          </div>
	                        </div>
	                        <div
	                          className="gantt-panel"
	                          style={
	                            {
	                              "--gantt-panel-height": `${ganttPanelHeight}px`,
	                              "--gantt-panel-width":
	                                ganttPanelWidth > 0
	                                  ? `${ganttPanelWidth}px`
	                                  : "100%",
	                              "--gantt-wbs-width": `${ganttWbsWidth}px`,
	                              "--gantt-timeline-width": `${Math.max(
	                                520,
	                                (ganttScale === "quarter"
	                                  ? wbsGantt.quarters.length
	                                  : wbsGantt.months.length) *
	                                  GANTT_SCALE_WIDTH[ganttScale],
	                              )}px`,
	                            } as GanttCssProperties
	                          }
	                        >
	                    <div className="gantt-head">
                          <span>Структура</span>
                      <button
                        type="button"
                        className="gantt-resizer"
                        onPointerDown={startGanttResize}
                        aria-label="Изменить ширину колонки Структуры"
                      />
                      <div className="gantt-scale">
                        {wbsGantt.months.length > 0 ? (
                          (ganttScale === "quarter"
                            ? wbsGantt.quarters
                            : wbsGantt.months
                          ).map((period) => (
                            <span
                              key={period.label}
                              style={{
                                left: `${period.offset}%`,
                                width: `${period.width}%`,
                              }}
                            >
                              {period.label}
                            </span>
                          ))
                        ) : (
                          <span>Шкала времени</span>
                        )}
                      </div>
                    </div>
                    <div className="gantt-body">
                      {wbsGantt.items.length === 0 && (
                        <div className="empty-state">
                          Для Гантта нужны start и due даты элементов Структуры.
                        </div>
                      )}
                      {wbsGantt.items.length > 0 && (
                        <>
                          <div className="gantt-labels">
                            {wbsGantt.items.map(
                              ({ item, critical, milestone, toneClass }) => (
                                <div
                                  className={`gantt-label ${critical ? "critical" : ""} ${
                                    activeWbsItemId === item.id ? "active" : ""
                                  } ${
                                    activeGanttLinkIds.predecessors.has(item.id)
                                      ? "predecessor"
                                      : ""
                                  } ${
                                    activeGanttLinkIds.successors.has(item.id)
                                      ? "successor"
                                      : ""
                                  }`}
                                  key={item.id}
                                  style={{
                                    paddingLeft: `${wbsDisplayLevel(item) * 14 + 10}px`,
                                  }}
                                  onClick={() => setActiveWbsItemId(item.id)}
                                  onMouseEnter={() => setHoveredGanttItemId(item.id)}
                                  onMouseLeave={() => setHoveredGanttItemId(null)}
                                >
                                  {item.children.length > 0 ? (
                                    <button
                                      type="button"
                                      className="tree-toggle"
                                      onClick={() => toggleWbsCollapse(item.id)}
                                      aria-label={
                                        collapsedWbsIds.has(item.id)
                                          ? "Раскрыть элемент Структуры"
                                          : "Схлопнуть элемент Структуры"
                                      }
                                    >
                                      {collapsedWbsIds.has(item.id) ? "+" : "-"}
                                    </button>
                                  ) : (
                                    <span className="tree-spacer" />
                                  )}
                                  <span
                                    className={`wbs-color-dot ${milestone ? "tone-o" : toneClass}`}
                                  />
                                  <b>{item.code}</b>
                                  <span>{item.title}</span>
                                </div>
                              ),
                            )}
                          </div>
                          <button
                            type="button"
                            className="gantt-resizer body"
                            onPointerDown={startGanttResize}
                            aria-label="Изменить ширину колонки Структуры"
                          />
                          <div
                            className="gantt-timeline"
                            ref={ganttTimelineRef}
                            style={{ minHeight: `${wbsGantt.height}px` }}
                          >
                            <div className="gantt-month-grid" aria-hidden="true">
                              {(ganttScale === "quarter"
                                ? wbsGantt.quarters
                                : wbsGantt.months
                              ).map((period) => (
                                <span
                                  key={period.label}
                                  style={{
                                    left: `${period.offset}%`,
                                    width: `${period.width}%`,
                                  }}
                                />
                              ))}
                            </div>
                            <div className="gantt-sub-grid" aria-hidden="true">
                              {(ganttScale === "quarter"
                                ? wbsGantt.months
                                : wbsGantt.weeks
                              ).map((period) => (
                                <span
                                  key={`${ganttScale}-${period.label}`}
                                  style={{ left: `${period.offset}%` }}
                                />
                              ))}
                            </div>
                            {wbsGantt.todayOffset !== null && (
                              <span
                                className="gantt-today"
                                style={{ left: `${wbsGantt.todayOffset}%` }}
                                title={`Сегодня: ${date(new Date().toISOString())}`}
                              />
                            )}
                            {showGanttDependencies && (
                              <svg
                                className={`gantt-links ${ganttLinkDraft ? "drawing" : ""}`}
                                viewBox={`0 0 100 ${wbsGantt.height}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                              >
                                {wbsGantt.dependencyLines.map((line) => {
                                  const endpointInset = 0.35;
                                  const startX = line.fromMilestone
                                    ? line.fromX
                                    : Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          line.fromX +
                                            (line.fromSide === "start"
                                              ? endpointInset
                                              : -endpointInset),
                                        ),
                                      );
                                  const endX = line.toMilestone
                                    ? line.toX
                                    : Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          line.toX +
                                            (line.toSide === "start"
                                              ? endpointInset
                                              : -endpointInset),
                                        ),
                                      );
                                  const horizontalGap = Math.abs(endX - startX);
                                  const connectorStub =
                                    horizontalGap === 0
                                      ? 0.8
                                      : horizontalGap >= 2.2
                                        ? 1.1
                                        : Math.max(0.2, horizontalGap / 2);
                                  const bendX =
                                    line.direction === "forward"
                                      ? Math.min(
                                          99,
                                          startX + connectorStub,
                                        )
                                      : Math.max(
                                          1,
                                          startX - connectorStub,
                                        );
                                  return (
                                    <path
                                      className={
                                        `slot-${line.styleSlot}${
                                          activeGanttLinkIds.sourceId &&
                                          (line.predecessorId ===
                                            activeGanttLinkIds.sourceId ||
                                            line.successorId ===
                                              activeGanttLinkIds.sourceId)
                                            ? " active"
                                            : ""
                                        }${
                                          ganttLinkDraft?.replaceDependencyId ===
                                          line.id
                                            ? " moving"
                                            : ""
                                        }`
                                      }
                                      onPointerDown={(event) =>
                                        startGanttLinkDrag(
                                          {
                                            itemId: line.predecessorId,
                                            side: line.fromSide,
                                          },
                                          event,
                                          line.id,
                                        )
                                      }
                                      d={`M ${startX} ${line.fromY} L ${bendX} ${line.fromY} L ${bendX} ${line.toY} L ${endX} ${line.toY}`}
                                      key={line.id}
                                      data-dependency-type={line.type}
                                      aria-label="Связь Гантта"
                                    />
                                  );
                                })}
                                {ganttLinkDraft &&
                                  (() => {
                                    const source = wbsGantt.items.find(
                                      (entry) => entry.item.id === ganttLinkDraft.itemId,
                                    );
                                    if (!source) return null;
                                    const sourceX =
                                      ganttLinkDraft.side === "start"
                                        ? source.offset
                                        : source.offset + (source.milestone ? 0 : source.width);
                                    const sourceY =
                                      wbsGantt.items.findIndex(
                                        (entry) => entry.item.id === source.item.id,
                                      ) *
                                        GANTT_ROW_HEIGHT +
                                      GANTT_ROW_HEIGHT / 2;
                                    return (
                                      <path
                                        className="draft"
                                        d={`M ${sourceX} ${sourceY} L ${ganttLinkDraft.pointerX} ${ganttLinkDraft.pointerY}`}
                                      />
                                    );
                                  })()}
                              </svg>
                            )}
                            {wbsGantt.items.map(
                              ({
                                item,
                                offset,
                                width,
                                milestone,
                                critical,
                                summary,
                                baselineRange,
                                forecastRange,
                                scheduleVarianceDays,
                                toneClass,
                              }) => (
                                <div
                                  className={`gantt-track-row ${
                                    activeWbsItemId === item.id ? "active" : ""
                                  } ${
                                    activeGanttLinkIds.predecessors.has(item.id)
                                      ? "predecessor"
                                      : ""
                                  } ${
                                    activeGanttLinkIds.successors.has(item.id)
                                      ? "successor"
                                      : ""
                                  } ${
                                    ganttLinkDraft ? "linking" : ""
                                  }`}
                                  key={item.id}
                                  style={{ height: `${GANTT_ROW_HEIGHT}px` }}
                                  onClick={() => setActiveWbsItemId(item.id)}
                                  onMouseEnter={() => setHoveredGanttItemId(item.id)}
                                  onMouseLeave={() => setHoveredGanttItemId(null)}
                                >
                                  {showGanttBaseline && baselineRange && (
                                    <i
                                      className="gantt-overlay baseline"
                                      style={{
                                        left: `${baselineRange.offset}%`,
                                        width: `${baselineRange.width}%`,
                                      }}
                                      title={`${item.code} базовый план: ${date(item.baselineStartDate)} - ${date(item.baselineDueDate)}`}
                                    />
                                  )}
                                  {showGanttForecast && forecastRange && (
                                    <i
                                      className={`gantt-overlay forecast ${scheduleVarianceDays > 0 ? "slipped" : ""}`}
                                      style={{
                                        left: `${forecastRange.offset}%`,
                                        width: `${forecastRange.width}%`,
                                      }}
                                      title={`${item.code} прогноз: ${date(item.forecastStartDate)} - ${date(item.forecastDueDate)}`}
                                    />
                                  )}
                                  <i
                                    className={`gantt-bar ${item.status.toLowerCase().replaceAll("_", "-")} ${toneClass} ${milestone ? "milestone" : ""} ${summary ? "summary" : ""} ${critical ? "critical" : ""}`}
                                    style={{
                                      left: `${offset}%`,
                                      width: milestone ? undefined : `${width}%`,
                                    }}
                                    title={`${item.code} ${item.title}: ${date(item.startDate)} - ${date(item.dueDate)}`}
                                  >
                                    <button
                                      type="button"
                                      className="gantt-link-handle start"
                                      onPointerDown={(event) =>
                                        startGanttLinkDrag(
                                          { itemId: item.id, side: "start" },
                                          event,
                                        )
                                      }
                                      onPointerUp={(event) =>
                                        void completeGanttLinkDrag(
                                          { itemId: item.id, side: "start" },
                                          event,
                                        )
                                      }
                                      aria-label={`Начало связи ${item.code}`}
                                      title="Начало связи"
                                    />
                                    <button
                                      type="button"
                                      className="gantt-link-handle end"
                                      onPointerDown={(event) =>
                                        startGanttLinkDrag(
                                          { itemId: item.id, side: "end" },
                                          event,
                                        )
                                      }
                                      onPointerUp={(event) =>
                                        void completeGanttLinkDrag(
                                          { itemId: item.id, side: "end" },
                                          event,
                                        )
                                      }
                                      aria-label={`Конец связи ${item.code}`}
                                      title="Конец связи"
                                    />
                                  </i>
                                </div>
                              ),
                            )}
                          </div>
                        </>
                      )}
                      {project.wbsItems.length > visibleWbsTree.length && (
                        <div className="gantt-note">
                          Часть иерархии схлопнута. Раскройте нужные фазы,
                          чтобы увидеть дочерние задачи и связи.
                        </div>
                      )}
                      <button
                        type="button"
                        className="gantt-panel-resizer horizontal"
                        onPointerDown={(event) =>
                          startGanttPanelResize(event, "width")
                        }
                        aria-label="Изменить ширину поля Гантта"
                        title="Изменить ширину поля Гантта"
                      />
                      <button
                        type="button"
                        className="gantt-panel-resizer vertical"
                        onPointerDown={(event) =>
                          startGanttPanelResize(event, "height")
                        }
                        aria-label="Изменить высоту поля Гантта"
                        title="Изменить высоту поля Гантта"
                      />
                      <button
                        type="button"
                        className="gantt-panel-resizer corner"
                        onPointerDown={(event) =>
                          startGanttPanelResize(event, "both")
                        }
                        aria-label="Изменить размер поля Гантта"
                        title="Изменить размер поля Гантта"
                      />
	                        </div>
	                        </div>
	                      </>
	                    )}
                  </div>
                </article>
              )}

              {project && activeView === "project-calendars" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Календари</h2>
                      <p>
                        RU и CN календари проекта: клик по дню меняет рабочий
                        день на выходной или праздник и наоборот
                      </p>
                    </div>
                  </div>
                  <div className="calendar-page">
                    <div className="calendar-controls">
                      <span>Год</span>
                      <div className="segmented-control" aria-label="Год календарей">
                        {projectCalendarYears.map((year) => (
                          <button
                            type="button"
                            key={year}
                            className={calendarYear === year ? "active" : ""}
                            onClick={() => setSelectedCalendarYear(year)}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(["RU", "CN"] as ProjectCalendarCode[]).map(
                      (calendarCode) => (
                        <section className="calendar-board" key={calendarCode}>
                          <div className="calendar-board-title">
                            <h3>{PROJECT_CALENDAR_LABELS[calendarCode]}</h3>
                            <span>{calendarYear}</span>
                          </div>
                          <div className="calendar-months">
                            {Array.from({ length: 12 }, (_, monthIndex) => (
                              <div className="calendar-month" key={monthIndex}>
                                <strong>{MONTH_LABELS[monthIndex]}</strong>
                                <div className="calendar-weekdays">
                                  {WEEKDAY_LABELS.map((label) => (
                                    <span key={label}>{label}</span>
                                  ))}
                                </div>
                                <div className="calendar-days">
                                  {calendarMonthDays(
                                    calendarYear,
                                    monthIndex,
                                  ).map((dayValue, index) => {
                                    if (!dayValue) {
                                      return (
                                        <span
                                          className="calendar-day empty"
                                          key={`empty-${index}`}
                                        />
                                      );
                                    }
                                    const dateKey = isoDate(dayValue);
                                    const overrideKey = `${calendarCode}:${dateKey}`;
                                    const override =
                                      calendarOverridesByKey.get(overrideKey);
                                    const isWorkingDay =
                                      override?.isWorkingDay ??
                                      isDefaultWorkingDay(dayValue);
                                    return (
                                      <button
                                        type="button"
                                        className={`calendar-day ${isWorkingDay ? "working" : "holiday"} ${override ? "custom" : ""}`}
                                        key={dateKey}
                                        onClick={() =>
                                          void toggleCalendarDay(
                                            calendarCode,
                                            dayValue,
                                          )
                                        }
                                        disabled={
                                          savingCalendar === overrideKey
                                        }
                                        title={
                                          isWorkingDay
                                            ? "Рабочий день"
                                            : "Выходной / праздник"
                                        }
                                      >
                                        {dayValue.getDate()}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ),
                    )}
                  </div>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: подключение Jira</h2>
                      <p>
                        Настройки проекта для ссылок, снимков и JQL открытых
                        вопросов
                      </p>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={saveJiraIntegration}>
                    <label>
                      Базовый URL Jira
                      <input
                        value={jiraForm.baseUrl}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            baseUrl: event.target.value,
                          })
                        }
                        placeholder="https://company.atlassian.net"
                      />
                    </label>
                    <label>
                      URL доски Jira
                      <input
                        value={jiraForm.boardUrl}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            boardUrl: event.target.value,
                          })
                        }
                        placeholder="https://company.atlassian.net/jira/software/projects/ERP/boards/12"
                      />
                    </label>
                    <label>
                      Ключ проекта
                      <input
                        value={jiraForm.projectKey}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            projectKey: event.target.value,
                          })
                        }
                        placeholder="ERP"
                      />
                    </label>
                    <label>
                      JQL задач
                      <textarea
                        value={jiraForm.issuesJql}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            issuesJql: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <label className="span-2">
                      JQL открытых вопросов
                      <textarea
                        value={jiraForm.openIssuesJql}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            openIssuesJql: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingJira}>
                        {savingJira
                          ? "Сохраняю..."
                          : "Сохранить Jira настройки"}
                      </button>
                    </div>
                  </form>
                </article>
              )}

              {project && activeView === "project-issues" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Реестр открытых вопросов</h2>
                      <p>
                        Единый список открытых проблем из Jira и внутренних
                        управленческих вопросов
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIssueForm(emptyIssueForm);
                        setIssueDrawerIssueId(null);
                        setIssueDrawerMode("create");
                      }}
                    >
                      Создать вопрос
                    </button>
                  </div>
                  <div className="issue-list">
                    <div className="issue-list-head" aria-hidden="true">
                      <span>Наименование</span>
                      <span>Ключ Jira</span>
                      <span>Срок</span>
                      <span>Отставание</span>
                      <span>Ответственный</span>
                      <span />
                    </div>
                    {project.issues.map((issue) => {
                      const delayDays = calendarDelayDays(
                        issue.initialDueDate,
                        issue.dueDate,
                      );
                      return (
                      <div className="issue-row" key={issue.id}>
                          <button
                            type="button"
                            className="issue-summary-row"
                            aria-expanded={expandedIssueId === issue.id}
                            aria-controls={`issue-details-${issue.id}`}
                            onClick={() =>
                              setExpandedIssueId(
                                expandedIssueId === issue.id ? null : issue.id,
                              )
                            }
                          >
                            <span className="issue-summary-title">
                              {issue.title}
                            </span>
                            <span className="issue-summary-cell">
                              {issue.jiraTicketKey ||
                                issue.jiraLinks[0]?.jiraKey ||
                                "не задан"}
                            </span>
                            <span className="issue-summary-cell">
                              {date(issue.dueDate)}
                            </span>
                            <span
                              className={`issue-summary-cell ${delayDays > 0 ? "issue-delay" : ""}`}
                            >
                              {delayDays > 0 ? `+${delayDays} дн.` : "нет"}
                            </span>
                            <span className="issue-summary-cell">
                              {issue.owner || "не назначен"}
                            </span>
                            <span className="issue-chevron" aria-hidden="true">
                              {expandedIssueId === issue.id ? "-" : "+"}
                            </span>
                          </button>
                        {expandedIssueId === issue.id && (
                          <div
                            className="issue-details-panel"
                            id={`issue-details-${issue.id}`}
                          >
                            <div className="issue-detail-meta">
                              <span
                                className={`severity ${issue.severity.toLowerCase()}`}
                              >
                                {issueSeverityLabel(issue.severity)}
                              </span>
                              <span>Статус: {issueStatusLabel(issue.status)}</span>
                              <span>
                                Источник: {issue.source === "JIRA" ? "Jira" : "Внутренний"}
                              </span>
                              {issue.initialDueDate && (
                                <span>
                                  Первичный срок: {date(issue.initialDueDate)}
                                </span>
                              )}
                              {delayDays > 0 && (
                                <b>Сдвиг срока: +{delayDays} кал. дн.</b>
                              )}
                              {issue.decisionRequired && <b>Требует решения</b>}
                            </div>
                            <div className="issue-impact">
                              <span>Влияние</span>
                              <p>{issue.impact}</p>
                            </div>
                            <div className="issue-actions issue-details-actions">
                              <button
                                type="button"
                                onClick={() => {
                                  setIssueDrawerIssueId(issue.id);
                                  setIssueDrawerMode("edit");
                                }}
                              >
                                Редактировать
                              </button>
                              <button
                                type="button"
                                onClick={() => closeOpenIssue(issue.id)}
                              >
                                Решено
                              </button>
                            </div>
                            <div className="jira-link-list">
                              {issue.jiraLinks.map((link) => (
                                <span className="jira-chip" key={link.id}>
                                  <a
                                    href={link.jiraUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {link.jiraKey}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeIssueJiraLink(issue.id, link.id)
                                    }
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                              {issue.jiraLinks.length === 0 && (
                                <span className="muted-inline">
                                  Задачи Jira не связаны
                                </span>
                              )}
                            </div>
                            <div className="issue-link-edit">
                              <input
                                value={issueLinkDrafts[issue.id]?.jiraKey ?? ""}
                                onChange={(event) =>
                                  setIssueLinkDrafts({
                                    ...issueLinkDrafts,
                                    [issue.id]: {
                                      ...(issueLinkDrafts[issue.id] ?? {
                                        jiraUrl: "",
                                      }),
                                      jiraKey: event.target.value,
                                    },
                                  })
                                }
                                placeholder="Ключ Jira"
                              />
                              <input
                                value={issueLinkDrafts[issue.id]?.jiraUrl ?? ""}
                                onChange={(event) =>
                                  setIssueLinkDrafts({
                                    ...issueLinkDrafts,
                                    [issue.id]: {
                                      ...(issueLinkDrafts[issue.id] ?? {
                                        jiraKey: "",
                                      }),
                                      jiraUrl: event.target.value,
                                    },
                                  })
                                }
                                placeholder="Jira URL"
                              />
                              <button
                                type="button"
                                onClick={() => addIssueJiraLink(issue.id)}
                              >
                              Добавить
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Снимок задач Jira</h2>
                      <p>
                        Для отчетности и обзора для руководства, не замена Jira
                        канбан
                      </p>
                    </div>
                    <button
                      className="button"
                      type="button"
                      onClick={syncJira}
                      disabled={syncing}
                    >
                      {syncing ? "Синхронизирую..." : "Синхронизировать"}
                    </button>
                  </div>
                  <div className="table">
                    <div className="table-head">
                      <span>Ключ</span>
                      <span>Статус</span>
                      <span>Приоритет</span>
                      <span>Исполнитель</span>
                    </div>
                    {project.jiraSnapshots.map((issue) => (
                      <a
                        className="table-row"
                        key={issue.id}
                        href={issue.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{issue.issueKey}</span>
                        <span>{issue.status}</span>
                        <span>{issue.priority}</span>
                        <span>{issue.assignee ?? "не назначен"}</span>
                      </a>
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Управленческие задачи</h2>
                      <p>Каждая задача может ссылаться на задачу Jira</p>
                    </div>
                  </div>
                  <div className="task-list">
                    {project.tasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <div>
                          <h3>{task.title}</h3>
                          <p>
                            {task.owner} / {task.status} / срок{" "}
                            {date(task.dueDate)}
                          </p>
                          <div className="task-edit">
                            <input
                              value={taskDrafts[task.id]?.jiraTicketKey ?? ""}
                              onChange={(event) =>
                                setTaskDrafts({
                                  ...taskDrafts,
                                  [task.id]: {
                                    ...(taskDrafts[task.id] ?? {
                                      jiraTicketUrl: "",
                                    }),
                                    jiraTicketKey: event.target.value,
                                  },
                                })
                              }
                              placeholder="Ключ Jira"
                            />
                            <input
                              value={taskDrafts[task.id]?.jiraTicketUrl ?? ""}
                              onChange={(event) =>
                                setTaskDrafts({
                                  ...taskDrafts,
                                  [task.id]: {
                                    ...(taskDrafts[task.id] ?? {
                                      jiraTicketKey: "",
                                    }),
                                    jiraTicketUrl: event.target.value,
                                  },
                                })
                              }
                              placeholder="Jira URL"
                            />
                            <button
                              type="button"
                              onClick={() => saveTaskJiraLink(task.id)}
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                        {task.jiraTicketUrl ? (
                          <a
                            className="ticket"
                            href={task.jiraTicketUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {task.jiraTicketKey}
                          </a>
                        ) : (
                          <span className="ticket empty">нет связи с Jira</span>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "project-raid" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Риски и проблемы</h2>
                      <p>
                        Риски, проблемы и допущения с влиянием на сроки и обзор
                        для руководства
                      </p>
                    </div>
                  </div>
                  <div className="raid-board">
                    <div className="raid-main-column">
                    <div className="wbs-kpis raid-kpis">
                      <div>
                        <span>Активные записи</span>
                        <strong>{raidSummary.activeRaid}</strong>
                        <small>открыто / в работе / нарушено</small>
                      </div>
                      <div>
                        <span>Высокие риски</span>
                        <strong>{raidSummary.highRisks}</strong>
                        <small>оценка 15+</small>
                      </div>
                      <div>
                        <span>Проблемы</span>
                        <strong>{raidSummary.problems}</strong>
                        <small>активные записи</small>
                      </div>
                      <div>
                        <span>Допущения</span>
                        <strong>{raidSummary.assumptions}</strong>
                        <small>активные записи</small>
                      </div>
                    </div>
                    <section className="raid-register">
                      <div className="subhead">Реестр рисков и проблем</div>
                      <section className="raid-filter-card">
                        <div className="subhead">Фильтры</div>
                        <div className="raid-filter-bar">
                          {[
                            ["ALL", "Все"],
                            ["RISK", raidTypeLabel("RISK")],
                            ["DEPENDENCY", raidTypeLabel("DEPENDENCY")],
                            ["ASSUMPTION", raidTypeLabel("ASSUMPTION")],
                          ].map(([value, label]) => (
                            <button
                              type="button"
                              key={value}
                              className={raidTypeFilter === value ? "active" : ""}
                              onClick={() => setRaidTypeFilter(value as RaidTypeFilter)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="raid-check-filters">
                          <label>
                            <input
                              type="checkbox"
                              checked={raidDecisionOnly}
                              onChange={(event) =>
                                setRaidDecisionOnly(event.target.checked)
                              }
                            />
                            Требуют решения
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={raidOverdueOnly}
                              onChange={(event) =>
                                setRaidOverdueOnly(event.target.checked)
                              }
                            />
                            Просрочены
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={raidHighOnly}
                              onChange={(event) =>
                                setRaidHighOnly(event.target.checked)
                              }
                            />
                            Высокий риск
                          </label>
                        </div>
                      </section>
                      {([
                        { key: "risks", title: "Риски", items: groupedRaidItems.risks },
                        {
                          key: "problems",
                          title: "Проблемы",
                          items: groupedRaidItems.problems,
                        },
                        {
                          key: "assumptions",
                          title: "Допущения",
                          items: groupedRaidItems.assumptions,
                        },
                      ] as const).map(({ key, title, items }) => (
                        <section className="raid-section" key={key}>
                          <h3>{title}</h3>
                      <div className="raid-list">
                        <div className="raid-head">
                          <span>Запись</span>
                          <span>Ключ Jira</span>
                          <span>Оценка</span>
                          <span>Срок</span>
                          <span>Ответственный</span>
                          <span />
                        </div>
                        {items.map((item) => (
                          <div className="raid-item" key={item.id}>
                            <button
                              type="button"
                              className="raid-row"
                              onClick={() =>
                                setExpandedRaidId(
                                  expandedRaidId === item.id ? null : item.id,
                                )
                              }
                            >
                              <span className="raid-title">{item.title}</span>
                              <span>{item.jiraTicketKey || "не задан"}</span>
                              <span className={`risk-score ${riskTone(item.riskScore)}`}>
                                {item.riskScore}
                              </span>
                              <span>{date(item.dueDate)}</span>
                              <span>{item.owner}</span>
                              <span className="issue-chevron">
                                {expandedRaidId === item.id ? "-" : "+"}
                              </span>
                            </button>
                            {expandedRaidId === item.id && raidDrafts[item.id] && (
                              <div className="raid-details">
                                <div className="raid-detail-meta">
                                  <span>{raidStatusLabel(item.status)}</span>
                                  <span>{raidTypeLabel(item.type)}</span>
                                  <span>Остаточный риск: {item.residualRisk}</span>
                                  <span>
                                    Сроки: {item.scheduleImpactDays} дн.
                                  </span>
                                  {item.jiraTicketKey && (
                                    <span>Jira: {item.jiraTicketKey}</span>
                                  )}
	                                  {item.decisionRequired && (
                                    <b>Требует решения</b>
                                  )}
                                </div>
                                <p>{item.description}</p>
                                {item.jiraTicketUrl && (
                                  <a
                                    className="jira-detail-link"
                                    href={item.jiraTicketUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {item.jiraTicketKey || item.jiraTicketUrl}
                                  </a>
                                )}
                                <div className="raid-edit-grid">
                                  <select
                                    value={raidDrafts[item.id].type}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        type: event.target.value as RaidItemType,
                                      })
                                    }
                                  >
                                    <option value="RISK">{raidTypeLabel("RISK")}</option>
                                    <option value="ASSUMPTION">
                                      {raidTypeLabel("ASSUMPTION")}
                                    </option>
                                    <option value="DEPENDENCY">
                                      {raidTypeLabel("DEPENDENCY")}
                                    </option>
                                  </select>
                                  <select
                                    value={raidDrafts[item.id].status}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        status: event.target.value as RaidItemStatus,
                                      })
                                    }
                                  >
                                    <option value="OPEN">{raidStatusLabel("OPEN")}</option>
                                    <option value="IN_PROGRESS">
                                      {raidStatusLabel("IN_PROGRESS")}
                                    </option>
                                    <option value="MITIGATED">
                                      {raidStatusLabel("MITIGATED")}
                                    </option>
                                    <option value="VALIDATED">
                                      {raidStatusLabel("VALIDATED")}
                                    </option>
                                    <option value="BREACHED">
                                      {raidStatusLabel("BREACHED")}
                                    </option>
                                    <option value="CLOSED">
                                      {raidStatusLabel("CLOSED")}
                                    </option>
                                  </select>
                                  <input
                                    value={raidDrafts[item.id].title}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        title: event.target.value,
                                      })
                                    }
                                    placeholder="Наименование"
                                  />
                                  <input
                                    value={raidDrafts[item.id].owner}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        owner: event.target.value,
                                      })
                                    }
                                    placeholder="Ответственный"
                                  />
                                  <input
                                    value={raidDrafts[item.id].jiraTicketKey}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        jiraTicketKey: event.target.value,
                                      })
                                    }
                                    placeholder="Ключ Jira"
                                  />
                                  <input
                                    value={raidDrafts[item.id].jiraTicketUrl}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        jiraTicketUrl: event.target.value,
                                      })
                                    }
                                    placeholder="Jira URL"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    value={raidDrafts[item.id].probability}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        probability: event.target.value,
                                      })
                                    }
                                    placeholder="Вероятность"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    value={raidDrafts[item.id].impact}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        impact: event.target.value,
                                      })
                                    }
                                    placeholder="Влияние"
                                  />
                                  <input
                                    type="date"
                                    value={raidDrafts[item.id].dueDate}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        dueDate: event.target.value,
                                      })
                                    }
                                  />
                                  <input
                                    type="date"
                                    value={raidDrafts[item.id].validationDate}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        validationDate: event.target.value,
                                      })
                                    }
                                  />
                                  <input
                                    value={raidDrafts[item.id].predecessor}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        predecessor: event.target.value,
                                      })
                                    }
                                    placeholder="Предшественник"
                                  />
                                  <input
                                    value={raidDrafts[item.id].successor}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        successor: event.target.value,
                                      })
                                    }
                                    placeholder="Последователь"
                                  />
                                  <input
                                    value={raidDrafts[item.id].supplier}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        supplier: event.target.value,
                                      })
                                    }
                                    placeholder="Поставщик"
                                  />
                                  <input
                                    type="number"
                                    value={raidDrafts[item.id].scheduleImpactDays}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        scheduleImpactDays: event.target.value,
                                      })
                                    }
                                    placeholder="Дни по срокам"
                                  />
	                                  <label className="checkbox-line compact-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={raidDrafts[item.id].decisionRequired}
                                      onChange={(event) =>
                                        updateRaidDraft(item.id, {
                                          decisionRequired: event.target.checked,
                                        })
                                      }
                                    />
                                    Требует решения
                                  </label>
                                  <textarea
                                    className="span-2"
                                    value={raidDrafts[item.id].description}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        description: event.target.value,
                                      })
                                    }
                                    rows={2}
                                  />
                                  <textarea
                                    value={raidDrafts[item.id].mitigationPlan}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        mitigationPlan: event.target.value,
                                      })
                                    }
                                    rows={2}
                                    placeholder="План действий"
                                  />
                                  <textarea
                                    value={raidDrafts[item.id].contingencyPlan}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        contingencyPlan: event.target.value,
                                      })
                                    }
                                    rows={2}
                                    placeholder="Резервный план"
                                  />
                                  <div className="issue-actions">
                                    <button
                                      type="button"
                                      onClick={() => saveRaidItem(item.id)}
                                    >
                                      Сохранить запись
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() => deleteRaidItem(item.id)}
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div className="empty-state">Записей пока нет.</div>
                        )}
                      </div>
                        </section>
                      ))}
                    </section>
                    </div>
                    <div className="raid-side-column">
                      <section className="risk-matrix-card">
                        <div className="subhead">Матрица рисков</div>
                        <div className="risk-matrix" aria-label="Матрица рисков">
                          {[5, 4, 3, 2, 1].map((impact) =>
                            [1, 2, 3, 4, 5].map((probability) => {
                              const count =
                                riskMatrix.get(`${probability}:${impact}`) ?? 0;
                              const score = probability * impact;
                              return (
                                <span
                                  className={`risk-matrix-cell ${riskTone(score)}`}
                                  key={`${probability}-${impact}`}
                                  title={`Вероятность ${probability}, влияние ${impact}`}
                                >
                                  {count > 0 ? count : ""}
                                </span>
                              );
                            }),
                          )}
                        </div>
                      </section>
		                    <form className="raid-form stack-form" onSubmit={createRaidItem}>
		                      <h3>Новая запись</h3>
	                      <div className="form-section-title">Основное</div>
	                      <div className="two-col">
                        <label>
                          Тип
                          <select
                            value={raidForm.type}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                type: event.target.value as RaidItemType,
                              })
                            }
                          >
                            <option value="RISK">{raidTypeLabel("RISK")}</option>
                            <option value="ASSUMPTION">
                              {raidTypeLabel("ASSUMPTION")}
                            </option>
                            <option value="DEPENDENCY">
                              {raidTypeLabel("DEPENDENCY")}
                            </option>
                          </select>
                        </label>
                        <label>
                          Ответственный
                          <input
                            value={raidForm.owner}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder="Ответственный"
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          Ключ Jira
                          <input
                            value={raidForm.jiraTicketKey}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                jiraTicketKey: event.target.value,
                              })
                            }
                            placeholder="ERP-1842"
                          />
                        </label>
                        <label>
                          Jira URL
                          <input
                            value={raidForm.jiraTicketUrl}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                jiraTicketUrl: event.target.value,
                              })
                            }
                            placeholder="https://company.atlassian.net/browse/ERP-1842"
                          />
                        </label>
                      </div>
                      <label>
                        Наименование
                        <input
                          value={raidForm.title}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="Поставщик может не подтвердить SLA"
                        />
                      </label>
                      <label>
                        Описание
                        <textarea
                          value={raidForm.description}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              description: event.target.value,
                            })
                          }
	                          rows={3}
	                        />
	                      </label>
	                      <div className="form-section-title">Оценка и влияние</div>
	                      <div className="two-col">
                        <label>
                          Вероятность
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={raidForm.probability}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                probability: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Влияние
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={raidForm.impact}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                impact: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          Срок
                          <input
                            type="date"
                            value={raidForm.dueDate}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
		                      </div>
	                      <div className="form-section-title">План действий</div>
	                      <label>
	                        План действий
                        <textarea
                          value={raidForm.mitigationPlan}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              mitigationPlan: event.target.value,
                            })
                          }
                          rows={2}
                        />
                      </label>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={raidForm.decisionRequired}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              decisionRequired: event.target.checked,
                            })
                          }
                        />
                        Требует решения
                      </label>
                      <button type="submit">Создать запись</button>
                    </form>
                    </div>
                  </div>
                </article>
              )}

              {project && activeView === "project-artifacts" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Артефакты проекта</h2>
                      <p>
                        Рабочие управленческие артефакты, собранные из данных
                        проекта
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void createArtifactRow()}
                    >
                      + Добавить строку
                    </button>
                  </div>
                  <div className="artifact-list">
                    <div className="artifact-head">
                      <span />
                      <span>Артефакт</span>
                      <span>Тип</span>
                      <span>Ответственный</span>
                      <span>Статус</span>
                      <span>URL</span>
                      <span />
                    </div>
                    {project.artifacts.map((artifact, index) => (
                      <div className="artifact-item" key={artifact.id}>
                        <div
                          className="artifact-row"
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setExpandedArtifactId(
                              expandedArtifactId === artifact.id
                                ? null
                                : artifact.id,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setExpandedArtifactId(
                              expandedArtifactId === artifact.id
                                ? null
                                : artifact.id,
                            );
                          }}
                        >
                          <span className="artifact-row-controls">
                            <button
                              type="button"
                              className="wbs-inline-insert-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void createArtifactRow(artifact.id);
                              }}
                              title="Добавить строку ниже"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="wbs-row-drag-handle"
                              onClick={(event) => {
                                event.stopPropagation();
                                void moveArtifact(artifact.id, -1);
                              }}
                              disabled={index === 0}
                              title="Переместить выше"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="wbs-row-drag-handle"
                              onClick={(event) => {
                                event.stopPropagation();
                                void moveArtifact(artifact.id, 1);
                              }}
                              disabled={index === project.artifacts.length - 1}
                              title="Переместить ниже"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="wbs-row-delete-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteArtifact(artifact.id);
                              }}
                              title="Удалить"
                            >
                              x
                            </button>
                          </span>
                          <span>{artifact.title}</span>
                          <span>{artifact.type}</span>
                          <span>{artifact.owner}</span>
                          <span>{artifactStatusLabel(artifact.status)}</span>
                          <span>{artifact.url ? "Ссылка" : "не задан"}</span>
                          <span className="issue-chevron">
                            {expandedArtifactId === artifact.id ? "-" : "+"}
                          </span>
                        </div>
                        {expandedArtifactId === artifact.id && (
                          <div className="artifact-details">
                            {artifact.url && (
                              <a
                                href={artifact.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Открыть ссылку
                              </a>
                            )}
                            {artifact.description && (
                              <p>{artifact.description}</p>
                            )}
                            <div className="artifact-edit-grid">
                                  <label>
                                    Название
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.title ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          title: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Тип
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.type ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          type: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Ответственный
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.owner ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          owner: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Статус
                                    <select
                                      value={
                                        artifactDrafts[artifact.id]?.status ??
                                        "Draft"
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          status: event.target
                                            .value as ArtifactStatus,
                                        })
                                      }
                                      >
                                      <option value="Draft">
                                        {artifactStatusLabel("Draft")}
                                      </option>
                                      <option value="In Review">
                                        {artifactStatusLabel("In Review")}
                                      </option>
                                      <option value="Approved">
                                        {artifactStatusLabel("Approved")}
                                      </option>
                                      <option value="Baseline">
                                        {artifactStatusLabel("Baseline")}
                                      </option>
                                      <option value="Archived">
                                        {artifactStatusLabel("Archived")}
                                      </option>
                                    </select>
                                  </label>
                                  <label>
                                    Порядок
                                    <input
                                      type="number"
                                      value={
                                        artifactDrafts[artifact.id]
                                          ?.sortOrder ?? "0"
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          sortOrder: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="span-2">
                                    URL
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.url ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          url: event.target.value,
                                        })
                                      }
                                      placeholder="https://..."
                                    />
                                  </label>
                                  <label className="span-2">
                                    Описание
                                    <textarea
                                      value={
                                        artifactDrafts[artifact.id]
                                          ?.description ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          description: event.target.value,
                                        })
                                      }
                                      rows={3}
                                    />
                                  </label>
                                  <div className="artifact-actions span-2">
                                    <button
                                      type="button"
                                      onClick={() => saveArtifact(artifact.id)}
                                    >
                                      Сохранить
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() =>
                                        deleteArtifact(artifact.id)
                                      }
                                    >
                                      Удалить
                                    </button>
                                  </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {project.artifacts.length === 0 && (
                      <div className="empty-state">
                        Артефакты пока не заведены. Добавьте первую строку.
                      </div>
                    )}
                  </div>
                </article>
              )}

              {project && activeView === "project-overview" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Обзор для руководства</h2>
                      <p>
                        Детерминированная генерация управленческого пакета из текущих
                        данных проекта
                      </p>
                    </div>
                    <div className="overview-actions">
                      <button
                        type="button"
                        onClick={generateOverview}
                        disabled={generatingOverview}
                      >
                        {generatingOverview
                          ? "Генерирую..."
                          : "Сгенерировать новую версию"}
                      </button>
	                      <button
	                        type="button"
	                        onClick={publishOverview}
                        disabled={
                          !latestOverview ||
                          latestOverview.status !== "APPROVED" ||
                          publishingOverview
                        }
                      >
	                        {publishingOverview ? "Публикую..." : "Опубликовать"}
	                      </button>
	                      <button
	                        type="button"
	                        className={executivePresentationMode ? "active" : ""}
	                        onClick={() =>
	                          setExecutivePresentationMode((current) => !current)
	                        }
	                      >
	                        {executivePresentationMode
	                          ? "Выйти из презентации"
	                          : "Режим презентации"}
	                      </button>
	                      <button type="button" disabled={!latestOverview}>
	                        Экспорт PDF
	                      </button>
	                      <button type="button" disabled={!latestOverview}>
	                        Экспорт PPTX
	                      </button>
	                      <span className="version">
	                        v{latestOverview?.version ?? 0}
	                      </span>
                    </div>
                  </div>
                  {latestOverview && (
                    <>
                      <div className="overview-status-line">
                        <span>
                          Статус:{" "}
                          <b>{overviewStatusLabel(latestOverview.status)}</b>
                        </span>
                        <span>
                          Сгенерировано:{" "}
                          {latestOverview.generatedAt
                            ? dateTime(latestOverview.generatedAt)
                            : "не задано"}
                        </span>
                        <span>
                          Проверка: {dateTime(latestOverview.reviewRequestedAt)}
                        </span>
                        <span>
                          Одобрено: {dateTime(latestOverview.approvedAt)}
                        </span>
                        <span>
                          Опубликовано:{" "}
                          {latestOverview.publishedAt
                            ? dateTime(latestOverview.publishedAt)
                            : "не опубликовано"}
                        </span>
                      </div>
                      <div className="overview-workflow">
                        <button
                          type="button"
                          onClick={() => moveOverviewStatus("PM_REVIEW")}
                          disabled={
                            latestOverview.status === "PM_REVIEW" ||
                            latestOverview.status === "APPROVED" ||
                            latestOverview.status === "PUBLISHED"
                          }
                        >
                          Отправить РП на проверку
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOverviewStatus("APPROVED")}
                          disabled={
                            latestOverview.status === "APPROVED" ||
                            latestOverview.status === "PUBLISHED"
                          }
                        >
                          Одобрить
                        </button>
                        {latestOverview.approvedBy && (
                          <span>Одобрил: {latestOverview.approvedBy}</span>
                        )}
                      </div>
	                      <section className="overview-pack executive-hero">
	                        <div>
	                          <span>Управленческий обзор</span>
	                          <h2>{project.code} - {project.name}</h2>
                            <div className="executive-brief-grid">
                              <div>
                                <small>Статус</small>
                                <strong>{projectHealthLabel(project.rag)}</strong>
                              </div>
                              <div>
                                <small>Готовность</small>
                                <strong>{project.progress}%</strong>
                              </div>
                              <div>
                                <small>Ближайшая веха</small>
                                <strong>
                                  {overviewDashboard.nextMilestone
                                    ? overviewDashboard.nextMilestone.milestone.title
                                    : "не задана"}
                                </strong>
                              </div>
                              <div>
                                <small>Решения</small>
                                <strong>{overviewDashboard.decisionItems}</strong>
                              </div>
                            </div>
                            <ul className="executive-brief-list">
                              <li>
                                Срок: {date(project.targetDate)}, отклонение{" "}
                                {project.scheduleVariance > 0 ? "+" : ""}
                                {project.scheduleVariance} дней.
                              </li>
                              <li>
                                Открытые вопросы: {overviewDashboard.openIssues.length},
                                просроченные элементы Структуры:{" "}
                                {overviewDashboard.overdueItems.length}.
                              </li>
                              <li>
                                Риски и проблемы: {overviewDashboard.riskItems.length}
                                {" "}активных записей.
                              </li>
                            </ul>
	                        </div>
	                        <strong className={`rag ${project.rag.toLowerCase()}`}>
	                          {projectHealthLabel(project.rag)}
	                        </strong>
	                      </section>
	                      <section className="overview-pack">
	                        <h3>KPI для руководства</h3>
                        <div className="overview-kpis">
                          {(latestOverview.kpis ?? []).map((item) => (
                            <div
                              className={`overview-kpi ${item.tone}`}
                              key={item.label}
                            >
                              <span>{item.label}</span>
                              <strong>{item.value}</strong>
                              <small>{item.secondary}</small>
                              <em>{item.source}</em>
                            </div>
                          ))}
                        </div>
                      </section>
                      <section className="overview-pack">
                        <h3>Контрольные проверки качества</h3>
                        <div className="gate-list">
                          {(latestOverview.qualityGates ?? []).map((gate) => (
                            <div className="gate-row" key={gate.name}>
                              <span
                                className={`gate-status ${gate.status.toLowerCase()}`}
                              >
                                {gateStatusLabel(gate.status)}
                              </span>
                              <div>
                                <strong>{gate.name}</strong>
                                <p>{gate.detail}</p>
                                <small>{gate.source}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                      <div className="overview-columns">
                        <section>
                          <h3>Нужные решения</h3>
                          {latestOverview.decisions.length === 0 && (
                            <p>Решения руководства не требуются.</p>
                          )}
                          {latestOverview.decisions.map((decision) => (
                            <div className="decision" key={decision.title}>
                              <strong>{decision.title}</strong>
                              <span>При одобрении: {decision.impactIfApproved}</span>
                              <span>При задержке: {decision.impactIfDelayed}</span>
                              {decision.source && (
                                <span>Источник: {decision.source}</span>
                              )}
                            </div>
                          ))}
                        </section>
                        <section>
                          <h3>Ключевые риски и вопросы</h3>
                          <div className="overview-list">
                            {(latestOverview.risks ?? []).length === 0 && (
                              <p>Ключевые риски и вопросы не зафиксированы.</p>
                            )}
                            {(latestOverview.risks ?? []).map((risk) => (
                              <div className="risk-line" key={risk.title}>
                                <strong>{risk.title}</strong>
                                <span>
                                  {risk.severity} / {risk.owner} /{" "}
                                  {risk.dueDate ? date(risk.dueDate) : "срок не задан"}
                                </span>
                                <p>{risk.impact}</p>
                                <small>{risk.source}</small>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                      <div className="overview-columns">
                        <section>
                          <h3>Следующие действия</h3>
                          <div className="overview-list">
                            {(latestOverview.nextSteps ?? []).length === 0 && (
                              <p>Следующие действия не сформированы.</p>
                            )}
                            {(latestOverview.nextSteps ?? []).map((step) => (
                              <div className="action-line" key={step.title}>
                                <strong>{step.title}</strong>
                                <span>
                                  {step.owner} /{" "}
                                  {step.dueDate ? date(step.dueDate) : "срок не задан"}
                                </span>
                                <small>{step.source}</small>
                              </div>
                            ))}
                          </div>
                        </section>
                        <section>
                          <h3>Подтверждения</h3>
                          <div className="evidence-list">
                            {latestOverview.evidence.map((item) => (
                              <span key={`${item.metric}-${item.source}`}>
                                {item.metric}: {item.source}
                              </span>
                            ))}
                          </div>
                        </section>
                      </div>
                      {project.overviews.length > 1 && (
                        <section className="overview-pack">
                          <h3>История версий</h3>
                          <div className="overview-history">
                            {project.overviews.map((item) => (
                              <div key={item.id}>
                                <strong>v{item.version}</strong>
                                <span>{overviewStatusLabel(item.status)}</span>
                                <small>{dateTime(item.generatedAt)}</small>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  )}
                  {!latestOverview && (
                    <div className="empty-state">
                      Нажмите «Сгенерировать новую версию», чтобы собрать первый
                      обзор из статуса, сроков, снимка Jira и реестра открытых
                      вопросов.
                    </div>
                  )}
                </article>
              )}
            </section>
          </>
        )}
        {project && activeView === "project-issues" && issueDrawerMode && (
          <div
            className="drawer-backdrop"
            onClick={() => {
              setIssueDrawerMode(null);
              setIssueDrawerIssueId(null);
            }}
          >
            <aside
              className="side-drawer"
              aria-label={
                issueDrawerMode === "create"
                  ? "Создать открытый вопрос"
                  : "Редактировать открытый вопрос"
              }
              onClick={(event) => event.stopPropagation()}
            >
              <div className="drawer-title">
                <div>
                  <h2>
                    {issueDrawerMode === "create"
                      ? "Создать открытый вопрос"
                      : "Редактировать вопрос"}
                  </h2>
                  <p>Срок, ответственный, влияние и связь с Jira</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIssueDrawerMode(null);
                    setIssueDrawerIssueId(null);
                  }}
                  aria-label="Закрыть панель"
                >
                  x
                </button>
              </div>
              {issueDrawerMode === "create" && (
                <form className="stack-form" onSubmit={createOpenIssue}>
                  <label className={issueFormErrors.title ? "field-error" : ""}>
                    Заголовок
                    <input
                      value={issueForm.title}
                      onChange={(event) => {
                        setIssueFormErrors((current) => ({
                          ...current,
                          title: undefined,
                        }));
                        setIssueForm({
                          ...issueForm,
                          title: event.target.value,
                        });
                      }}
                      placeholder="Например: поставщик не подтвердил SLA"
                    />
                    {issueFormErrors.title && (
                      <small>{issueFormErrors.title}</small>
                    )}
                  </label>
                  <div className="two-col">
                    <label>
                      Критичность
                      <select
                        value={issueForm.severity}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            severity: event.target.value as Issue["severity"],
                          })
                        }
                      >
                        <option value="CRITICAL">
                          {issueSeverityLabel("CRITICAL")}
                        </option>
                        <option value="HIGH">{issueSeverityLabel("HIGH")}</option>
                        <option value="MEDIUM">
                          {issueSeverityLabel("MEDIUM")}
                        </option>
                        <option value="LOW">{issueSeverityLabel("LOW")}</option>
                      </select>
                    </label>
                    <label>
                      Ответственный
                      <input
                        value={issueForm.owner}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            owner: event.target.value,
                          })
                        }
                        placeholder="РП / поставщик / ИТ-эксплуатация"
                      />
                    </label>
                  </div>
                  <label>
                    Влияние
                    <textarea
                      value={issueForm.impact}
                      onChange={(event) =>
                        setIssueForm({
                          ...issueForm,
                          impact: event.target.value,
                        })
                      }
                      rows={3}
                      placeholder="Влияние на сроки, содержание или решение руководства"
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      Срок
                      <input
                        type="date"
                        value={issueForm.dueDate}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            dueDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={issueForm.decisionRequired}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            decisionRequired: event.target.checked,
                          })
                        }
                      />
                      Требует решения
                    </label>
                  </div>
                  <div className="jira-links-editor">
                    <div className="subhead">Ключ Jira</div>
                    <div className="issue-link-edit">
                      <input
                        value={issueForm.jiraTicketKey}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            jiraTicketKey: event.target.value,
                          })
                        }
                        placeholder="ERP-1842"
                      />
                      <input
                        className={issueFormErrors.jiraTicketUrl ? "input-error" : ""}
                        value={issueForm.jiraTicketUrl}
                        onChange={(event) => {
                          setIssueFormErrors((current) => ({
                            ...current,
                            jiraTicketUrl: undefined,
                          }));
                          setIssueForm({
                            ...issueForm,
                            jiraTicketUrl: event.target.value,
                          });
                        }}
                        placeholder="https://company.atlassian.net/browse/ERP-1842"
                      />
                    </div>
                    {issueFormErrors.jiraTicketUrl && (
                      <small className="field-error-text">
                        {issueFormErrors.jiraTicketUrl}
                      </small>
                    )}
                    <div className="subhead">Дополнительные задачи Jira</div>
                    {issueForm.jiraLinks.map((link, index) => (
                      <div className="issue-link-edit" key={index}>
                        <input
                          value={link.jiraKey}
                          onChange={(event) =>
                            updateIssueFormLink(index, {
                              jiraKey: event.target.value,
                            })
                          }
                          placeholder="ERP-1842"
                        />
                        <input
                          value={link.jiraUrl}
                          onChange={(event) =>
                            updateIssueFormLink(index, {
                              jiraUrl: event.target.value,
                            })
                          }
                          placeholder="https://company.atlassian.net/browse/ERP-1842"
                        />
                        <button
                          type="button"
                          onClick={() => removeIssueFormLink(index)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={addIssueFormLink}>
                      + Добавить задачу Jira
                    </button>
                  </div>
                  <button type="submit" disabled={creatingIssue}>
                    {creatingIssue ? "Создаю..." : "Создать вопрос"}
                  </button>
                </form>
              )}
              {issueDrawerMode === "edit" &&
                issueDrawerIssueId &&
                issueEditDrafts[issueDrawerIssueId] && (
                  <form
                    className="stack-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveOpenIssue(issueDrawerIssueId);
                    }}
                  >
                    <label>
                      Заголовок
                      <input
                        value={issueEditDrafts[issueDrawerIssueId].title}
                        onChange={(event) =>
                          updateIssueDraft(issueDrawerIssueId, {
                            title: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="two-col">
                      <label>
                        Критичность
                        <select
                          value={issueEditDrafts[issueDrawerIssueId].severity}
                          onChange={(event) =>
                            updateIssueDraft(issueDrawerIssueId, {
                              severity: event.target.value as Issue["severity"],
                            })
                          }
                        >
                          <option value="CRITICAL">
                            {issueSeverityLabel("CRITICAL")}
                          </option>
                          <option value="HIGH">{issueSeverityLabel("HIGH")}</option>
                          <option value="MEDIUM">
                            {issueSeverityLabel("MEDIUM")}
                          </option>
                          <option value="LOW">{issueSeverityLabel("LOW")}</option>
                        </select>
                      </label>
                      <label>
                        Статус
                        <select
                          value={issueEditDrafts[issueDrawerIssueId].status}
                          onChange={(event) =>
                            updateIssueDraft(issueDrawerIssueId, {
                              status: event.target.value,
                            })
                          }
                        >
                          <option value="Open">{issueStatusLabel("Open")}</option>
                          <option value="In Progress">
                            {issueStatusLabel("In Progress")}
                          </option>
                          <option value="Blocked">
                            {issueStatusLabel("Blocked")}
                          </option>
                          <option value="Resolved">
                            {issueStatusLabel("Resolved")}
                          </option>
                          <option value="Closed">
                            {issueStatusLabel("Closed")}
                          </option>
                        </select>
                      </label>
                    </div>
                    <div className="two-col">
                      <label>
                        Ответственный
                        <input
                          value={issueEditDrafts[issueDrawerIssueId].owner}
                          onChange={(event) =>
                            updateIssueDraft(issueDrawerIssueId, {
                              owner: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Срок
                        <input
                          type="date"
                          value={issueEditDrafts[issueDrawerIssueId].dueDate}
                          onChange={(event) =>
                            updateIssueDraft(issueDrawerIssueId, {
                              dueDate: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="two-col">
                      <label>
                        Ключ Jira
                        <input
                          value={issueEditDrafts[issueDrawerIssueId].jiraTicketKey}
                          onChange={(event) =>
                            updateIssueDraft(issueDrawerIssueId, {
                              jiraTicketKey: event.target.value,
                            })
                          }
                          placeholder="ERP-1842"
                        />
                      </label>
                      <label>
                        Jira URL
                        <input
                          value={issueEditDrafts[issueDrawerIssueId].jiraTicketUrl}
                          onChange={(event) =>
                            updateIssueDraft(issueDrawerIssueId, {
                              jiraTicketUrl: event.target.value,
                            })
                          }
                          placeholder="https://company.atlassian.net/browse/ERP-1842"
                        />
                      </label>
                    </div>
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={
                          issueEditDrafts[issueDrawerIssueId].decisionRequired
                        }
                        onChange={(event) =>
                          updateIssueDraft(issueDrawerIssueId, {
                            decisionRequired: event.target.checked,
                          })
                        }
                      />
                      Требует решения
                    </label>
                    <label>
                      Влияние
                      <textarea
                        value={issueEditDrafts[issueDrawerIssueId].impact}
                        onChange={(event) =>
                          updateIssueDraft(issueDrawerIssueId, {
                            impact: event.target.value,
                          })
                        }
                        rows={4}
                      />
                    </label>
                    <div className="issue-actions">
                      <button type="submit">Сохранить вопрос</button>
                      <button
                        type="button"
                        onClick={() => closeOpenIssue(issueDrawerIssueId)}
                      >
                        Решено
                      </button>
                    </div>
                  </form>
                )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
