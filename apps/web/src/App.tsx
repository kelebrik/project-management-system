import {
  type CSSProperties,
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

type ProjectUiState = {
  sidebarCollapsed?: boolean;
  wbsColumnOrder?: WbsTableColumnKey[];
  wbsHiddenColumns?: WbsTableColumnKey[];
  wbsColumnWidths?: Partial<Record<WbsTableColumnKey, number>>;
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
  "--gantt-wbs-width": string;
  "--gantt-timeline-width": string;
};

type GanttScale = "month" | "quarter";

type WbsTableCssProperties = CSSProperties & {
  "--wbs-table-template": string;
  "--wbs-level-width": string;
};

const WBS_LEVEL_MIN_WIDTH = 128;
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
  { key: "leadLag", label: "Сдвиг", width: 92 },
] as const;

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

function projectToForm(
  project: ProjectDetails | ProjectListItem,
): ProjectFormState {
  return {
    parentId: project.parentId ?? "",
    code: project.code,
    name: project.name,
    portfolio: project.portfolio,
    sponsor: project.sponsor,
    projectManager: project.projectManager,
    status: project.status,
    rag: project.rag,
    startDate:
      "startDate" in project ? String(project.startDate).slice(0, 10) : "",
    targetDate:
      "targetDate" in project ? String(project.targetDate).slice(0, 10) : "",
    budgetPlanned: String(project.budgetPlanned),
    budgetForecast: String(project.budgetForecast),
    scheduleVariance: String(project.scheduleVariance),
    progress: String(project.progress),
    summary: project.summary,
    sortOrder: String(project.sortOrder),
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

function daysBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
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
  const labels: Record<ProjectListItem["status"], string> = {
    DRAFT: "Черновик",
    ACTIVE: "Активен",
    ON_HOLD: "На паузе",
    CLOSED: "Закрыт",
  };
  return labels[status];
}

function projectHealthLabel(rag: RagStatus) {
  return rag === "GREEN"
    ? "В графике"
    : rag === "AMBER"
      ? "Под риском"
      : "Критично";
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
  const labels: Record<WbsItemType, string> = {
    PHASE: "Фаза",
    WORK_PACKAGE: "Пакет работ",
    DELIVERABLE: "Результат",
    MILESTONE: "Веха",
    TASK: "Задача",
  };
  return labels[type];
}

function wbsStatusLabel(status: WbsItemStatus) {
  const labels: Record<WbsItemStatus, string> = {
    NOT_STARTED: "Не начата",
    IN_PROGRESS: "В работе",
    AT_RISK: "Под риском",
    BLOCKED: "Провалено",
    DONE: "Сделано",
    CANCELLED: "Отменено",
  };
  return labels[status];
}

function issueSeverityLabel(severity: Issue["severity"]) {
  const labels: Record<Issue["severity"], string> = {
    LOW: "Низкая",
    MEDIUM: "Средняя",
    HIGH: "Высокая",
    CRITICAL: "Критичная",
  };
  return labels[severity];
}

function issueStatusLabel(status: string) {
  const labels: Record<string, string> = {
    Open: "Открыто",
    "In Progress": "В работе",
    Blocked: "Заблокировано",
    Resolved: "Решено",
    Closed: "Закрыто",
  };
  return labels[status] ?? status;
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
  const labels: Record<RaidItemType, string> = {
    RISK: "Риск",
    ASSUMPTION: "Допущение",
    DEPENDENCY: "Проблема",
  };
  return labels[type];
}

function raidStatusLabel(status: RaidItemStatus) {
  const labels: Record<RaidItemStatus, string> = {
    OPEN: "Открыто",
    IN_PROGRESS: "В работе",
    MITIGATED: "Смягчено",
    VALIDATED: "Подтверждено",
    BREACHED: "Нарушено",
    CLOSED: "Закрыто",
  };
  return labels[status];
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
  const [projectForm, setProjectForm] =
    useState<ProjectFormState>(emptyProjectForm);
  const [newProjectForm, setNewProjectForm] =
    useState<ProjectFormState>(() => newProjectFormDefaults());
  const [projectRegistryDrafts, setProjectRegistryDrafts] = useState<
    Record<string, ProjectRegistryDraft>
  >({});
  const [artifactForm, setArtifactForm] =
    useState<ArtifactFormState>(emptyArtifactForm);
  const [artifactDrafts, setArtifactDrafts] = useState<
    Record<string, ArtifactFormState>
  >({});
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
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [executivePresentationMode, setExecutivePresentationMode] =
    useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/projects`)
      .then((response) => response.json())
      .then((data: ProjectListItem[]) => {
        const firstProject = data[0];
        setProjects(data);
        setProjectRegistryDrafts(projectsToRegistryDrafts(data));
        setSelectedProjectId(firstProject?.id ?? null);
      })
      .catch(() => setError("Не удалось загрузить список проектов"))
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
  const wbsSummary = useMemo(() => {
    const items = project?.wbsItems ?? [];
    const completed = items.filter((item) => item.status === "DONE").length;
    const atRisk = items.filter(
      (item) => item.status === "AT_RISK" || item.status === "BLOCKED",
    ).length;
    const scheduleVarianceDays = items
      .filter((item) => item.baselineDueDate && item.forecastDueDate)
      .reduce(
        (maxVariance, item) =>
          Math.max(
            maxVariance,
            daysBetween(
              new Date(item.baselineDueDate as string),
              new Date(item.forecastDueDate as string),
            ),
          ),
        0,
      );
    const slipped = items.filter(
      (item) =>
        item.baselineDueDate &&
        item.forecastDueDate &&
        daysBetween(
          new Date(item.baselineDueDate),
          new Date(item.forecastDueDate),
        ) > 0,
    ).length;
    return { completed, atRisk, scheduleVarianceDays, slipped };
  }, [project?.wbsItems]);
  const structureMilestones = useMemo(() => {
    const items = project?.wbsItems ?? [];
    const itemIndex = new Map(items.map((item, index) => [item.id, index]));
    const milestoneBlocker = (item: WbsItem) => {
      if (item.status === "BLOCKED") {
        return { item, label: "Провалено", rank: 5, toneClass: "tone-r" };
      }
      if (
        item.status !== "DONE" &&
        item.dueDate !== null &&
        new Date(item.dueDate) < startOfDay(new Date())
      ) {
        return { item, label: "Просрочено", rank: 4, toneClass: "tone-p" };
      }
      if (item.status === "AT_RISK") {
        return { item, label: "Под риском", rank: 3, toneClass: "tone-r" };
      }
      return null;
    };
    return items
      .filter((item) => item.type === "MILESTONE")
      .map((milestone) => {
        const milestoneIndex = itemIndex.get(milestone.id) ?? items.length;
        const previousItems = items.slice(0, milestoneIndex);
        const blockingItems = previousItems
          .map(milestoneBlocker)
          .filter((item): item is NonNullable<typeof item> => item !== null);
        const worstItem = blockingItems.sort(
          (left, right) =>
            right.rank - left.rank ||
            String(left.item.dueDate ?? "").localeCompare(
              String(right.item.dueDate ?? ""),
            ),
        )[0];
        const calendarDaysLeft = signedDaysUntil(milestone.dueDate);
        const workDaysLeft = signedWorkingDaysUntil(milestone.dueDate);

        return {
          milestone,
          calendarDaysLeft,
          workDaysLeft,
          control:
            blockingItems.length === 0
              ? "В графике"
              : `${worstItem.label}: ${worstItem.item.code}`,
          toneClass: blockingItems.length === 0 ? "tone-g" : worstItem.toneClass,
        };
      })
      .sort((left, right) =>
        String(left.milestone.dueDate ?? "").localeCompare(
          String(right.milestone.dueDate ?? ""),
        ),
      );
  }, [project?.wbsItems]);
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
        todayOffset: null as number | null,
        dependencyLines: [] as Array<{
          id: string;
          fromSide: "start" | "end";
          fromMilestone: boolean;
          fromX: number;
          fromY: number;
          toSide: "start" | "end";
          toMilestone: boolean;
          toX: number;
          toY: number;
          direction: "forward" | "backward";
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
    const months = [];
    for (
      let cursor = startOfMonth(start);
      cursor < end;
      cursor = addMonths(cursor, 1)
    ) {
      const monthEnd = addMonths(cursor, 1);
      months.push({
        label: monthLabel(cursor),
        offset: (daysBetween(start, cursor) / totalDays) * 100,
        width: (daysBetween(cursor, monthEnd) / totalDays) * 100,
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
    const dependencyLines = (project?.wbsDependencies ?? [])
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
        const fromSide =
          dependency.type === "SS" || dependency.type === "SF"
            ? ("start" as const)
            : ("end" as const);
        const toSide =
          dependency.type === "FF" || dependency.type === "SF"
            ? ("end" as const)
            : ("start" as const);
        const from = fromSide === "start" ? predecessorStart : predecessorEnd;
        const to = toSide === "start" ? successorStart : successorEnd;
        const direction = to >= from ? ("forward" as const) : ("backward" as const);
        return {
          id: dependency.id,
          fromSide,
          fromMilestone: predecessor.milestone,
          fromX: Math.max(0, Math.min(100, from)),
          fromY: predecessorRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2,
          toSide,
          toMilestone: successor.milestone,
          toX: Math.max(0, Math.min(100, to)),
          toY: successorRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2,
          direction,
        };
      })
      .filter(
        (
          item,
        ): item is {
          id: string;
          fromSide: "start" | "end";
          fromMilestone: boolean;
          fromX: number;
          fromY: number;
          toSide: "start" | "end";
          toMilestone: boolean;
          toX: number;
          toY: number;
          direction: "forward" | "backward";
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
  const calendarYear = useMemo(() => {
    const sourceDate = project?.startDate ? new Date(project.startDate) : new Date();
    return sourceDate.getFullYear();
  }, [project]);
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
  const projectArtifacts = useMemo(() => {
    if (!project) return [];
    const systemArtifacts = [
      {
        id: "system-passport",
        title: "Паспорт проекта",
        type: "Паспорт проекта",
        owner: project.projectManager,
        status: project.summary ? "Готово" : "Черновик",
        source: project.code,
        action: "project-passport" as AppView,
      },
      {
        id: "system-wbs",
        title: "Базовый план Структуры",
        type: "Базовый план",
        owner: "Проектный офис",
        status: project.wbsItems.length > 0 ? "Готово" : "Черновик",
        source: `${project.wbsItems.length} элементов Структуры`,
        action: "project-structure" as AppView,
      },
      {
        id: "system-issues",
        title: "Реестр открытых вопросов",
        type: "Журнал рисков",
        owner: project.projectManager,
        status: project.issues.length > 0 ? "Активно" : "Пусто",
        source: `${project.issues.length} открытых вопросов`,
        action: "project-issues" as AppView,
      },
      {
        id: "system-raid",
        title: "Риски и проблемы",
        type: "Управленческий контроль",
        owner: project.projectManager,
        status:
          project.raidItems.length > 0
            ? "Активно"
            : "Пусто",
        source: `${project.raidItems.length} записей`,
        action: "project-raid" as AppView,
      },
      {
        id: "system-overview",
        title: "Обзор для руководства",
        type: "Управленческий пакет",
        owner: "Проектный офис",
        status: latestOverview
          ? overviewStatusLabel(latestOverview.status)
          : "Не сформировано",
        source: latestOverview ? `v${latestOverview.version}` : "нет версии",
        action: "project-overview" as AppView,
      },
      {
        id: "system-jira",
        title: "Снимок доски Jira",
        type: "Подтверждение интеграции",
        owner: "Администрирование",
        status: project.jiraIntegration?.syncStatus ?? "Не настроено",
        source: `${project.jiraSnapshots.length} задач Jira`,
        action: "admin" as AppView,
      },
    ];

    return [
      ...systemArtifacts.map((item) => ({
        ...item,
        kind: "system" as const,
      })),
      ...project.artifacts.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        owner: item.owner,
        status: item.status,
        source: item.url ? "Ссылка" : "Реестр",
        action: null,
        url: item.url,
        description: item.description,
        kind: "project" as const,
      })),
    ];
  }, [latestOverview, project]);

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
      setProjectForm(projectToForm(nextProject));
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
      setWbsDrafts(
        Object.fromEntries(
          nextProject.wbsItems.map((item) => [item.id, wbsToForm(item)]),
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
    const refreshed = await fetch(
      `${apiBase}/api/projects/${projectId}/overview`,
    );
    applyProject(await refreshed.json());
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
    const response = await fetch(`${apiBase}/api/projects`);
    const data: ProjectListItem[] = await response.json();
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
    },
  ) {
    if (!project) return;
    const nextUiState: ProjectUiState = {
      ...(project.uiState ?? {}),
      sidebarCollapsed: options?.sidebarCollapsed ?? sidebarCollapsed,
      wbsColumnOrder: options?.wbsColumnOrder ?? wbsColumnOrder,
      wbsHiddenColumns: options?.wbsHiddenColumns ?? wbsHiddenColumns,
      wbsColumnWidths: options?.wbsColumnWidths ?? wbsColumnWidths,
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

  async function saveProjectProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const formPayload = projectPayload(projectForm);
      const payload = {
        parentId: formPayload.parentId,
        portfolio: formPayload.portfolio,
        sponsor: formPayload.sponsor,
        projectManager: formPayload.projectManager,
        status: formPayload.status,
        rag: formPayload.rag,
        startDate: formPayload.startDate,
        targetDate: formPayload.targetDate,
        budgetPlanned: formPayload.budgetPlanned,
        budgetForecast: formPayload.budgetForecast,
        scheduleVariance: formPayload.scheduleVariance,
        progress: formPayload.progress,
        summary: formPayload.summary,
        sortOrder: formPayload.sortOrder,
      };
      const response = await fetch(`${apiBase}/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить проект",
        );
      }
      await reloadProjects(project.id);
      await refreshProject(project.id);
      setNotice("Паспорт проекта обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить проект",
      );
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

  async function createArtifact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/artifacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(artifactPayload(artifactForm)),
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
      setArtifactForm(emptyArtifactForm);
      await refreshProject(project.id);
      setExpandedArtifactId(result.id);
      setNotice("Артефакт создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать артефакт",
      );
    }
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
      predecessor1: form.predecessor1 || null,
      predecessor2: form.predecessor2 || null,
      predecessor3: form.predecessor3 || null,
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
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        640,
        Math.max(260, startWidth + moveEvent.clientX - startX),
      );
      setGanttWbsWidth(nextWidth);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
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
        return (
          <input
            value={resolveDraftPredecessorCode(
              draft.predecessor1,
              wbsTree,
              wbsDrafts,
              draftWbsCodes,
            )}
            onChange={(event) =>
              updateWbsDraft(item.id, { predecessor1: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
            placeholder="Код"
          />
        );
      case "predecessor2":
        return (
          <input
            value={resolveDraftPredecessorCode(
              draft.predecessor2,
              wbsTree,
              wbsDrafts,
              draftWbsCodes,
            )}
            onChange={(event) =>
              updateWbsDraft(item.id, { predecessor2: event.target.value })
            }
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
            placeholder="Код"
          />
        );
      case "predecessor3":
        return (
          <input
            value={resolveDraftPredecessorCode(
              draft.predecessor3,
              wbsTree,
              wbsDrafts,
              draftWbsCodes,
            )}
            onChange={(event) =>
              updateWbsDraft(item.id, { predecessor3: event.target.value })
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
      (nextPayload.predecessor1 !== currentItem.predecessor1 ||
        nextPayload.predecessor2 !== currentItem.predecessor2 ||
        nextPayload.predecessor3 !== currentItem.predecessor3 ||
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
      await saveWbsPredecessors(itemId, { remember: !predecessorsChanged });
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
    if (!project) return;
    const draft = wbsDrafts[itemId];
    if (!draft) return;
    const wbsByCode = new Map<string, WbsItem>();
    for (const item of project.wbsItems) {
      wbsByCode.set(item.code, item);
      const draftCode = draftWbsCodes.get(item.id);
      if (draftCode) {
        wbsByCode.set(draftCode, item);
      }
    }
    const desiredPredecessors = [
      resolveDraftPredecessorCode(
        draft.predecessor1,
        wbsTree,
        wbsDrafts,
        draftWbsCodes,
      ),
      resolveDraftPredecessorCode(
        draft.predecessor2,
        wbsTree,
        wbsDrafts,
        draftWbsCodes,
      ),
      resolveDraftPredecessorCode(
        draft.predecessor3,
        wbsTree,
        wbsDrafts,
        draftWbsCodes,
      ),
    ]
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
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? "Не удалось удалить связь Структуры");
        }
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
    setCreatingIssue(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...issueForm,
        dueDate: issueForm.dueDate || null,
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
      await refreshProject(project.id);
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
      </span>
      <span className="nav-text">{label}</span>
      {sidebarCollapsed && <span className="nav-tooltip">{label}</span>}
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
        <header className="topbar">
          <div>
            {project && isProjectView && activeView !== "project-create" ? (
              <h1>
                {project.code} - {project.name}
              </h1>
            ) : (
              <h1>{viewTitle[activeView]}</h1>
            )}
          </div>
          {project && activeView !== "portfolio" && (
            <div className="topbar-project">
              <span>{project.code}</span>
              <span>{projectStatusLabel(project.status)}</span>
              <b className={`rag ${project.rag.toLowerCase()}`}>
                {projectHealthLabel(project.rag)}
              </b>
            </div>
          )}
        </header>
        {project && activeView === "project-overview" && (
          <section className="project-context-bar">
            <div>
              <span>РП</span>
              <b>{project.projectManager}</b>
            </div>
            <div>
              <span>Срок</span>
              <b>{date(project.targetDate)}</b>
            </div>
            <div>
              <span>Прогресс</span>
              <b>{project.progress}%</b>
            </div>
            <div>
              <span>Открытые вопросы</span>
              <b>{project.issues.length}</b>
            </div>
            <div>
              <span>Вехи</span>
              <b>{structureMilestones.length}</b>
            </div>
          </section>
        )}

        {error && <div className="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

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
                <div className="metric">
                  <span>Статус проекта</span>
                  <strong className={`rag ${project.rag.toLowerCase()}`}>
                    {projectHealthLabel(project.rag)}
                  </strong>
                  <small>{project.summary}</small>
                </div>
                <div className="metric">
                  <span>Прогресс</span>
                  <strong>{project.progress}%</strong>
                  <div className="progress">
                    <i style={{ width: `${project.progress}%` }} />
                  </div>
                </div>
                <div className="metric">
                  <span>Отклонение сроков</span>
                  <strong>
                    {project.scheduleVariance > 0 ? "+" : ""}
                    {project.scheduleVariance} дней
                  </strong>
                  <small>Относительно базового плана</small>
                </div>
                <div className="metric">
                  <span>Открытые вопросы</span>
                  <strong>{project.issues.length}</strong>
                  <small>Требуют контроля РП</small>
                </div>
              </section>
            )}

            {project && activeView === "project-overview" && (
              <section className="wbs-kpis overview-wbs-kpis">
                <div>
                  <span>Элементы</span>
                  <strong>{project.wbsItems.length}</strong>
                </div>
                <div>
                  <span>Сделано</span>
                  <strong>{wbsSummary.completed}</strong>
                </div>
                <div>
                  <span>Под риском / провалено</span>
                  <strong>{wbsSummary.atRisk}</strong>
                </div>
                <div>
                  <span>Вехи</span>
                  <strong>{structureMilestones.length}</strong>
                </div>
                <div>
                  <span>Связи</span>
                  <strong>{project.wbsDependencies.length}</strong>
                </div>
                <div>
                  <span>Отклонение прогноза</span>
                  <strong>{wbsSummary.scheduleVarianceDays} дн.</strong>
                  <small>{wbsSummary.slipped} сдвинуто</small>
                </div>
                <div>
                  <span>Видимые</span>
                  <strong>{visibleWbsTree.length}</strong>
                  <small>С учетом схлопывания</small>
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
                  <div className="milestone-table">
                    <div className="milestone-head">
                      <span>Веха</span>
                      <span>Срок</span>
                      <span>Раб. дней</span>
                      <span>Кал. дней</span>
                      <span>Контроль</span>
                    </div>
                    {structureMilestones.map(
                      ({
                        milestone,
                        workDaysLeft,
                        calendarDaysLeft,
                        control,
                        toneClass,
                      }) => (
                        <div className="milestone-row" key={milestone.id}>
                          <span>
                            <b>{milestone.code}</b>
                            {milestone.title}
                          </span>
                          <span>{date(milestone.dueDate)}</span>
                          <span>{formatDaysLeft(workDaysLeft)}</span>
                          <span>{formatDaysLeft(calendarDaysLeft)}</span>
                          <span className="milestone-control">
                            <i className={toneClass} />
                            {control}
                          </span>
                        </div>
                      ),
                    )}
                    {structureMilestones.length === 0 && (
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
                      <p>Управление статусом, сроками и ответственными проекта</p>
                    </div>
                  </div>
	                  <form
	                    className="form-grid compact-form"
	                    onSubmit={saveProjectProfile}
	                  >
	                    <div className="form-section-title span-2">Основное</div>
	                    <div className="readonly-field">
	                      <span>Код проекта</span>
                      <b>{project.code}</b>
                    </div>
                    <div className="readonly-field">
                      <span>Имя проекта</span>
                      <b>{project.name}</b>
                    </div>
                    <label>
                      Портфель
                      <input
                        value={projectForm.portfolio}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            portfolio: event.target.value,
                          })
                        }
	                        />
	                      </label>
	                    <div className="form-section-title span-2">Команда</div>
	                    <label>
	                      Спонсор
                      <input
                        value={projectForm.sponsor}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            sponsor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      РП
                      <input
                        value={projectForm.projectManager}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            projectManager: event.target.value,
                          })
                        }
                      />
                    </label>
		                    <div className="form-section-title span-2">Статус и контроль</div>
	                    <label>
	                      Статус
                      <select
                        value={projectForm.status}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            status: event.target
                              .value as ProjectFormState["status"],
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
                      Индикатор
                      <select
                        value={projectForm.rag}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
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
                        value={projectForm.startDate}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            startDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Целевая дата
                      <input
                        type="date"
                        value={projectForm.targetDate}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
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
                        value={projectForm.progress}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            progress: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Отклонение сроков
                      <input
                        type="number"
                        value={projectForm.scheduleVariance}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            scheduleVariance: event.target.value,
                          })
                        }
	                        />
	                      </label>
                    <div className="form-actions span-2">
                      <button type="submit">Сохранить паспорт</button>
                    </div>
                  </form>
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
		                        onClick={() => void saveWbsBaseline()}
		                        disabled={savingBaseline || project.wbsItems.length === 0}
		                      >
		                        Зафиксировать базовый план
		                      </button>
		                      <button
		                        type="button"
		                        className={collapsedWbsIds.size === 0 ? "active" : ""}
		                        onClick={() => setCollapsedWbsIds(new Set())}
		                      >
		                        Все
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
	                    </div>
                    <div className="wbs-table-shell">
                      <div
                        className="wbs-excel-table"
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
                                className={`wbs-table-row ${item.type === "MILESTONE" ? "milestone" : ""}`}
                              >
                                {orderedWbsColumns.map((column) => (
                                  <div
                                    key={`${item.id}-${column.key}`}
                                    className={
                                      column.key === "level"
                                        ? "wbs-cell-level"
                                        : column.key === "structure"
                                        ? "wbs-cell-structure"
                                        : "wbs-cell"
                                    }
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
	                            <button
	                              type="button"
	                              className={collapsedWbsIds.size === 0 ? "active" : ""}
	                              onClick={() => setCollapsedWbsIds(new Set())}
	                            >
	                              Все
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
	                              "--gantt-wbs-width": `${ganttWbsWidth}px`,
	                              "--gantt-timeline-width": `${Math.max(
	                                520,
	                                wbsGantt.months.length * GANTT_SCALE_WIDTH[ganttScale],
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
                          wbsGantt.months.map((month) => (
                            <span
                              key={month.label}
                              style={{
                                left: `${month.offset}%`,
                                width: `${month.width}%`,
                              }}
                            >
                              {month.label}
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
                                  className={`gantt-label ${critical ? "critical" : ""}`}
                                  key={item.id}
                                  style={{
                                    paddingLeft: `${wbsDisplayLevel(item) * 14 + 10}px`,
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
                            style={{ minHeight: `${wbsGantt.height}px` }}
                          >
                            <div className="gantt-month-grid" aria-hidden="true">
                              {wbsGantt.months.map((month) => (
                                <span
                                  key={month.label}
                                  style={{
                                    left: `${month.offset}%`,
                                    width: `${month.width}%`,
                                  }}
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
                                className="gantt-links"
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
                                      d={`M ${startX} ${line.fromY} L ${bendX} ${line.fromY} L ${bendX} ${line.toY} L ${endX} ${line.toY}`}
                                      key={line.id}
                                    />
                                  );
                                })}
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
                                  className="gantt-track-row"
                                  key={item.id}
                                  style={{ height: `${GANTT_ROW_HEIGHT}px` }}
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
                                  />
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
                        Единый список открытых проблем из Jira и внутреннего
                        реестра рисков
                      </p>
                    </div>
                  </div>
                  <div className="issue-list">
                    <div className="issue-list-head" aria-hidden="true">
                      <span>Наименование</span>
                      <span>Срок</span>
                      <span>Ответственный</span>
                      <span />
                    </div>
                    {project.issues.map((issue) => (
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
                            {date(issue.dueDate)}
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
                              {issue.decisionRequired && <b>Требует решения</b>}
                            </div>
                            <div className="issue-impact">
                              <span>Влияние</span>
                              <p>{issue.impact}</p>
                            </div>
                            {issueEditDrafts[issue.id] && (
                              <div className="issue-edit-grid">
                                <input
                                  value={issueEditDrafts[issue.id].title}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      title: event.target.value,
                                    })
                                  }
                                  placeholder="Наименование"
                                />
                                <select
                                  value={issueEditDrafts[issue.id].severity}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      severity: event.target
                                        .value as Issue["severity"],
                                    })
                                  }
                                >
                                  <option value="CRITICAL">
                                    {issueSeverityLabel("CRITICAL")}
                                  </option>
                                  <option value="HIGH">
                                    {issueSeverityLabel("HIGH")}
                                  </option>
                                  <option value="MEDIUM">
                                    {issueSeverityLabel("MEDIUM")}
                                  </option>
                                  <option value="LOW">
                                    {issueSeverityLabel("LOW")}
                                  </option>
                                </select>
                                <select
                                  value={issueEditDrafts[issue.id].status}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      status: event.target.value,
                                    })
                                  }
                                >
                                  <option value="Open">
                                    {issueStatusLabel("Open")}
                                  </option>
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
                                <input
                                  value={issueEditDrafts[issue.id].owner}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      owner: event.target.value,
                                    })
                                  }
                                  placeholder="Ответственный"
                                />
                                <input
                                  type="date"
                                  value={issueEditDrafts[issue.id].dueDate}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      dueDate: event.target.value,
                                    })
                                  }
                                />
                                <label className="checkbox-line compact-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={
                                      issueEditDrafts[issue.id].decisionRequired
                                    }
                                    onChange={(event) =>
                                      updateIssueDraft(issue.id, {
                                        decisionRequired: event.target.checked,
                                      })
                                    }
                                  />
                                  Требует решения
                                </label>
                                <textarea
                                  className="span-2"
                                  value={issueEditDrafts[issue.id].impact}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      impact: event.target.value,
                                    })
                                  }
                                  rows={2}
                                />
                                <div className="issue-actions">
                                  <button
                                    type="button"
                                    onClick={() => saveOpenIssue(issue.id)}
                                  >
                                    Сохранить вопрос
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => closeOpenIssue(issue.id)}
                                  >
                                    Решено
                                  </button>
                                </div>
                              </div>
                            )}
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
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "project-issues" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Создать открытый вопрос</h2>
                      <p>
                        Внутренняя запись о риске или управленческая проблема со
                        ссылкой на Jira
                      </p>
                    </div>
                  </div>
                  <form className="stack-form" onSubmit={createOpenIssue}>
                    <label>
                      Заголовок
                      <input
                        value={issueForm.title}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            title: event.target.value,
                          })
                        }
                        placeholder="Например: поставщик не подтвердил SLA"
                      />
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
                      <div className="subhead">Связанные задачи Jira</div>
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
                  <div className="wbs-kpis">
                    <div>
                      <span>Активные риски</span>
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
                  <div className="raid-layout">
                    <section>
                      <div className="subhead">Реестр рисков и проблем</div>
                      <div className="raid-list">
                        <div className="raid-head">
                          <span>Запись</span>
                          <span>Тип</span>
                          <span>Оценка</span>
                          <span>Срок</span>
                          <span>Владелец</span>
                          <span />
                        </div>
                        {project.raidItems.map((item) => (
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
                              <span>{raidTypeLabel(item.type)}</span>
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
                                  <span>Остаточный риск: {item.residualRisk}</span>
                                  <span>
                                    Сроки: {item.scheduleImpactDays} дн.
                                  </span>
	                                  {item.decisionRequired && (
                                    <b>Требует решения</b>
                                  )}
                                </div>
                                <p>{item.description}</p>
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
                                    placeholder="Владелец"
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
                        {project.raidItems.length === 0 && (
                          <div className="empty-state">Записей пока нет.</div>
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
                          Владелец
                          <input
                            value={raidForm.owner}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder="Владелец"
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
                  </div>
                  <div className="artifact-layout">
                    <div className="artifact-list">
                      <div className="artifact-head">
                        <span>Артефакт</span>
                        <span>Тип</span>
                        <span>Владелец</span>
                        <span>Статус</span>
                        <span>Источник</span>
                      </div>
                      {projectArtifacts.map((artifact) => (
                        <div className="artifact-item" key={artifact.id}>
                          <button
                            type="button"
                            className="artifact-row"
                            onClick={() => {
                              if (
                                artifact.kind === "system" &&
                                artifact.action
                              ) {
                                openView(artifact.action);
                                return;
                              }
                              setExpandedArtifactId(
                                expandedArtifactId === artifact.id
                                  ? null
                                  : artifact.id,
                              );
                            }}
                          >
                            <span>{artifact.title}</span>
                            <span>{artifact.type}</span>
                            <span>{artifact.owner}</span>
                            <span>{artifact.status}</span>
                            <span>{artifact.source}</span>
                          </button>
                          {artifact.kind === "project" &&
                            expandedArtifactId === artifact.id && (
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
                                    Владелец
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
                    </div>
                    <form
                      className="stack-form compact-form artifact-form"
                      onSubmit={createArtifact}
                    >
                      <label>
                        Название
                        <input
                          value={artifactForm.title}
                          onChange={(event) =>
                            setArtifactForm({
                              ...artifactForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="Дизайн решения"
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Тип
                          <input
                            value={artifactForm.type}
                            onChange={(event) =>
                              setArtifactForm({
                                ...artifactForm,
                                type: event.target.value,
                              })
                            }
                            placeholder="Документ / ссылка / базовый план"
                          />
                        </label>
                        <label>
                          Статус
                          <select
                            value={artifactForm.status}
                            onChange={(event) =>
                              setArtifactForm({
                                ...artifactForm,
                                status: event.target.value as ArtifactStatus,
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
                      </div>
                      <div className="two-col">
                        <label>
                          Владелец
                          <input
                            value={artifactForm.owner}
                            onChange={(event) =>
                              setArtifactForm({
                                ...artifactForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder="Проектный офис / архитектор"
                          />
                        </label>
                        <label>
                          Порядок
                          <input
                            type="number"
                            value={artifactForm.sortOrder}
                            onChange={(event) =>
                              setArtifactForm({
                                ...artifactForm,
                                sortOrder: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        URL
                        <input
                          value={artifactForm.url}
                          onChange={(event) =>
                            setArtifactForm({
                              ...artifactForm,
                              url: event.target.value,
                            })
                          }
                          placeholder="https://..."
                        />
                      </label>
                      <label>
                        Описание
                        <textarea
                          value={artifactForm.description}
                          onChange={(event) =>
                            setArtifactForm({
                              ...artifactForm,
                              description: event.target.value,
                            })
                          }
                          rows={3}
                        />
                      </label>
                      <button type="submit">Добавить артефакт</button>
                    </form>
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
                      <p className="overview-summary">
                        {latestOverview.executiveSummary}
                      </p>
	                      <section className="overview-pack executive-hero">
	                        <div>
	                          <span>Управленческий обзор</span>
	                          <h2>{project.code} - {project.name}</h2>
	                          <p>{latestOverview.executiveSummary}</p>
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
      </main>
    </div>
  );
}

export default App;
