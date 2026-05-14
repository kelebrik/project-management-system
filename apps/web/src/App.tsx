import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  | "project-wbs"
  | "project-issues"
  | "project-raid"
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
  artifacts: ProjectArtifact[];
  raidItems: RaidItem[];
  changeRequests: ChangeRequest[];
};

type ProjectUiState = {
  sidebarCollapsed?: boolean;
  wbsColumnOrder?: WbsTableColumnKey[];
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

type WbsDependency = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
  lagDays: number;
  predecessor: Pick<WbsItem, "id" | "code" | "title">;
  successor: Pick<WbsItem, "id" | "code" | "title">;
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

type MilestoneFormState = {
  title: string;
  dueDate: string;
  status: string;
  owner: string;
  description: string;
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
type ChangeRequestType = "SCOPE" | "BUDGET" | "SCHEDULE" | "RESOURCE";
type ChangeRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "IMPLEMENTED";

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

type ChangeRequest = {
  id: string;
  type: ChangeRequestType;
  title: string;
  description: string;
  owner: string;
  status: ChangeRequestStatus;
  impactAnalysis: string;
  affectedBaseline: string;
  implementationPlan: string | null;
  scheduleImpactDays: number;
  budgetImpact: string;
  scopeImpact: string | null;
  approvalRoute: string;
  decisionRequired: boolean;
  dueDate: string | null;
  approvedAt: string | null;
};

type ChangeRequestFormState = {
  type: ChangeRequestType;
  title: string;
  description: string;
  owner: string;
  status: ChangeRequestStatus;
  impactAnalysis: string;
  affectedBaseline: string;
  implementationPlan: string;
  scheduleImpactDays: string;
  budgetImpact: string;
  scopeImpact: string;
  approvalRoute: string;
  decisionRequired: boolean;
  dueDate: string;
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

const emptyMilestoneForm: MilestoneFormState = {
  title: "",
  dueDate: "",
  status: "Planned",
  owner: "",
  description: "",
};

const emptyArtifactForm: ArtifactFormState = {
  title: "",
  type: "Document",
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
  escalationLevel: "Project",
  scheduleImpactDays: "0",
  budgetImpact: "0",
};

const emptyChangeRequestForm: ChangeRequestFormState = {
  type: "SCHEDULE",
  title: "",
  description: "",
  owner: "",
  status: "DRAFT",
  impactAnalysis: "",
  affectedBaseline: "Schedule baseline",
  implementationPlan: "",
  scheduleImpactDays: "0",
  budgetImpact: "0",
  scopeImpact: "",
  approvalRoute: "PMO -> Sponsor",
  decisionRequired: false,
  dueDate: "",
};

const WBS_TABLE_COLUMNS = [
  { key: "level", label: "Level", width: 84 },
  { key: "structure", label: "Структура", width: 420 },
  { key: "type", label: "Type", width: 132 },
  { key: "status", label: "Status", width: 136 },
  { key: "owner", label: "Исполнитель", width: 150 },
  { key: "start", label: "Start", width: 138 },
  { key: "due", label: "Due", width: 138 },
  { key: "workDays", label: "Work days", width: 96 },
  { key: "calendarDays", label: "Cal. days", width: 96 },
  { key: "progress", label: "%", width: 72 },
  { key: "predecessor1", label: "Predecessor 1", width: 148 },
  { key: "predecessor2", label: "Predecessor 2", width: 148 },
  { key: "predecessor3", label: "Predecessor 3", width: 148 },
  { key: "leadLag", label: "Lead / Lag", width: 92 },
  { key: "actions", label: "", width: 132 },
] as const;

type WbsTableColumnKey = (typeof WBS_TABLE_COLUMNS)[number]["key"];
type WbsTableColumn = (typeof WBS_TABLE_COLUMNS)[number];

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

function changeRequestToForm(item: ChangeRequest): ChangeRequestFormState {
  return {
    type: item.type,
    title: item.title,
    description: item.description,
    owner: item.owner,
    status: item.status,
    impactAnalysis: item.impactAnalysis,
    affectedBaseline: item.affectedBaseline,
    implementationPlan: item.implementationPlan ?? "",
    scheduleImpactDays: String(item.scheduleImpactDays),
    budgetImpact: String(item.budgetImpact),
    scopeImpact: item.scopeImpact ?? "",
    approvalRoute: item.approvalRoute,
    decisionRequired: item.decisionRequired,
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
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

function emptyWbsFormFromContext(
  code: string,
  level: number,
  sortOrder: number,
): WbsFormState {
  return {
    parentId: "",
    code,
    title: "",
    type: "TASK",
    status: "NOT_STARTED",
    owner: "",
    startDate: "",
    dueDate: "",
    baselineStartDate: "",
    baselineDueDate: "",
    forecastStartDate: "",
    forecastDueDate: "",
    wbsLevel: String(level),
    predecessor1: "",
    predecessor2: "",
    predecessor3: "",
    leadLagDays: "0",
    workDays: "",
    calendarDays: "",
    excelStartDate: "",
    excelEndDate: "",
    planWorkDays: "",
    planCalendarDays: "",
    templateColor: "",
    priority: "",
    plannedCost: "0",
    forecastCost: "0",
    progress: "0",
    jiraTicketKey: "",
    jiraTicketUrl: "",
    description: "",
    sortOrder: String(sortOrder),
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

function currency(value: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value));
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

function projectOptionLabel(project: ProjectListItem) {
  return `${project.code} - ${project.name}`;
}

function ragLabel(rag: RagStatus) {
  return rag === "GREEN"
    ? "On Track"
    : rag === "AMBER"
      ? "At Risk"
      : "Critical";
}

function flattenWbsDescendants(item: WbsTreeItem): WbsTreeItem[] {
  return item.children.flatMap((child) => [
    child,
    ...flattenWbsDescendants(child),
  ]);
}

function wbsToneClass(
  item: Pick<WbsItem, "templateColor" | "status" | "type">,
) {
  if (item.type === "MILESTONE") return "tone-o";
  const templateColor = item.templateColor?.toLowerCase();
  if (templateColor && ["b", "g", "r", "o", "x"].includes(templateColor)) {
    return `tone-${templateColor}`;
  }
  if (item.status === "DONE") return "tone-g";
  if (item.status === "AT_RISK" || item.status === "BLOCKED") return "tone-r";
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

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "numeric",
  }).format(value);
}

function raidTypeLabel(type: RaidItemType) {
  const labels: Record<RaidItemType, string> = {
    RISK: "Risk",
    ASSUMPTION: "Assumption",
    DEPENDENCY: "Dependency",
  };
  return labels[type];
}

function raidStatusLabel(status: RaidItemStatus) {
  const labels: Record<RaidItemStatus, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    MITIGATED: "Mitigated",
    VALIDATED: "Validated",
    BREACHED: "Breached",
    CLOSED: "Closed",
  };
  return labels[status];
}

function changeRequestStatusLabel(status: ChangeRequestStatus) {
  const labels: Record<ChangeRequestStatus, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    IN_REVIEW: "In review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    IMPLEMENTED: "Implemented",
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
    DRAFT: "Draft",
    GENERATED: "Generated",
    PM_REVIEW: "PM review",
    APPROVED: "Approved",
    PUBLISHED: "Published",
  };
  return labels[status] ?? status;
}

function gateStatusLabel(status: string) {
  const labels: Record<string, string> = {
    OK: "OK",
    WARN: "Warning",
    BLOCKED: "Blocked",
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
    useState<ProjectFormState>(emptyProjectForm);
  const [milestoneForm, setMilestoneForm] =
    useState<MilestoneFormState>(emptyMilestoneForm);
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
  const [changeRequestForm, setChangeRequestForm] =
    useState<ChangeRequestFormState>(emptyChangeRequestForm);
  const [changeRequestDrafts, setChangeRequestDrafts] = useState<
    Record<string, ChangeRequestFormState>
  >({});
  const [expandedChangeRequestId, setExpandedChangeRequestId] = useState<
    string | null
  >(null);
  const [wbsDrafts, setWbsDrafts] = useState<Record<string, WbsFormState>>({});
  const [collapsedWbsIds, setCollapsedWbsIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showGanttDependencies, setShowGanttDependencies] = useState(true);
  const [showGanttBaseline, setShowGanttBaseline] = useState(true);
  const [showGanttForecast, setShowGanttForecast] = useState(true);
  const [ganttWbsWidth, setGanttWbsWidth] = useState(360);
  const [wbsColumnWidths, setWbsColumnWidths] = useState<
    Record<WbsTableColumnKey, number>
  >(() =>
    Object.fromEntries(
      WBS_TABLE_COLUMNS.map((column) => [column.key, column.width]),
    ) as Record<WbsTableColumnKey, number>,
  );
  const [wbsColumnOrder, setWbsColumnOrder] = useState<WbsTableColumnKey[]>(
    () => WBS_TABLE_COLUMNS.map((column) => column.key),
  );
  const [draggedWbsColumn, setDraggedWbsColumn] =
    useState<WbsTableColumnKey | null>(null);
  const [wbsInsertHoverIndex, setWbsInsertHoverIndex] = useState<number | null>(
    null,
  );
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

  useEffect(() => {
    fetch(`${apiBase}/api/projects`)
      .then((response) => response.json())
      .then((data: ProjectListItem[]) => {
        const firstProject = data[0];
        setProjects(data);
        setSelectedProjectId(firstProject?.id ?? null);
      })
      .catch(() => setError("Не удалось загрузить список проектов"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    fetch(`${apiBase}/api/projects/${selectedProjectId}/overview`)
      .then((response) => response.json())
      .then((data: ProjectDetails) => applyProject(data))
      .catch(() => setError("Не удалось загрузить проект"));
  }, [selectedProjectId]);

  const latestOverview = project?.overviews[0];
  const projectTree = useMemo(() => buildProjectTree(projects), [projects]);
  const selectedProjectListItem = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
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
  const budgetVariance = useMemo(() => {
    if (!project) return 0;
    return (
      (Number(project.budgetForecast) / Number(project.budgetPlanned) - 1) * 100
    );
  }, [project]);
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
  const draftWbsCodes = useMemo(
    () => buildRenumberedWbsCodes(wbsTree, wbsDrafts),
    [wbsDrafts, wbsTree],
  );
  const wbsMilestoneCodes = useMemo(
    () =>
      new Set(
        (project?.milestones ?? [])
          .map((item) => item.code)
          .filter((code): code is string => Boolean(code)),
      ),
    [project?.milestones],
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
  const raidSummary = useMemo(() => {
    const raidItems = project?.raidItems ?? [];
    const changeRequests = project?.changeRequests ?? [];
    const activeRaid = raidItems.filter(
      (item) => item.status !== "CLOSED" && item.status !== "VALIDATED",
    );
    const highRisks = activeRaid.filter(
      (item) => item.type === "RISK" && item.riskScore >= 15,
    );
    const decisions = [
      ...raidItems.filter((item) => item.decisionRequired),
      ...changeRequests.filter((item) => item.decisionRequired),
    ].length;
    const pendingCr = changeRequests.filter((item) =>
      ["SUBMITTED", "IN_REVIEW"].includes(item.status),
    ).length;
    const approvedImpact = changeRequests
      .filter((item) => item.status === "APPROVED")
      .reduce(
        (sum, item) => ({
          days: sum.days + item.scheduleImpactDays,
          budget: sum.budget + Number(item.budgetImpact),
        }),
        { days: 0, budget: 0 },
      );

    return {
      activeRaid: activeRaid.length,
      highRisks: highRisks.length,
      decisions,
      pendingCr,
      approvedImpact,
    };
  }, [project?.changeRequests, project?.raidItems]);
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
      const milestone =
        item.type === "MILESTONE" || wbsMilestoneCodes.has(item.code);
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
  }, [project?.wbsDependencies, visibleWbsTree, wbsMilestoneCodes]);
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
        .filter((column): column is WbsTableColumn => Boolean(column)),
    [wbsColumnOrder, wbsColumnsByKey],
  );
  const wbsTableTemplate = useMemo(
    () =>
      orderedWbsColumns
        .map((column) => `${wbsColumnWidths[column.key]}px`)
        .join(" "),
    [orderedWbsColumns, wbsColumnWidths],
  );
  const projectArtifacts = useMemo(() => {
    if (!project) return [];
    const systemArtifacts = [
      {
        id: "system-passport",
        title: "Паспорт проекта",
        type: "Project charter",
        owner: project.projectManager,
        status: project.summary ? "Ready" : "Draft",
        source: project.code,
        action: "project-passport" as AppView,
      },
      {
        id: "system-wbs",
        title: "WBS baseline",
        type: "Planning baseline",
        owner: "PMO",
        status: project.wbsItems.length > 0 ? "Ready" : "Draft",
        source: `${project.wbsItems.length} WBS items`,
        action: "project-wbs" as AppView,
      },
      {
        id: "system-issues",
        title: "Open Issues List",
        type: "RAID log",
        owner: project.projectManager,
        status: project.issues.length > 0 ? "Active" : "Empty",
        source: `${project.issues.length} open issues`,
        action: "project-issues" as AppView,
      },
      {
        id: "system-raid",
        title: "RAID + Change Control",
        type: "Management control",
        owner: project.projectManager,
        status:
          project.raidItems.length + project.changeRequests.length > 0
            ? "Active"
            : "Empty",
        source: `${project.raidItems.length} RAID / ${project.changeRequests.length} CR`,
        action: "project-raid" as AppView,
      },
      {
        id: "system-overview",
        title: "Executive Overview",
        type: "Management pack",
        owner: "PMO",
        status: latestOverview ? latestOverview.status : "Not generated",
        source: latestOverview ? `v${latestOverview.version}` : "no version",
        action: "project-overview" as AppView,
      },
      {
        id: "system-jira",
        title: "Jira board snapshot",
        type: "Integration evidence",
        owner: "Admin Back",
        status: project.jiraIntegration?.syncStatus ?? "Not configured",
        source: `${project.jiraSnapshots.length} Jira issues`,
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
        source: item.url ? "Link" : "Registry",
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
        throw new Error(result.error ?? "Jira sync failed");
      }
      const refreshed = await fetch(
        `${apiBase}/api/projects/${project.id}/overview`,
      );
      applyProject(await refreshed.json());
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : "Jira sync failed",
      );
    } finally {
      setSyncing(false);
    }
  }

  function applyProject(nextProject: ProjectDetails) {
    setProject(nextProject);
    setSidebarCollapsed(nextProject.uiState?.sidebarCollapsed ?? false);
    setWbsColumnOrder(
      nextProject.uiState?.wbsColumnOrder?.length
        ? nextProject.uiState.wbsColumnOrder
        : WBS_TABLE_COLUMNS.map((column) => column.key),
    );
    setWbsColumnWidths((current) => ({
      ...current,
      ...(nextProject.uiState?.wbsColumnWidths ?? {}),
    }));
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
    setChangeRequestDrafts(
      Object.fromEntries(
        nextProject.changeRequests.map((item) => [
          item.id,
          changeRequestToForm(item),
        ]),
      ),
    );
    setExpandedChangeRequestId((currentRequestId) =>
      nextProject.changeRequests.some((item) => item.id === currentRequestId)
        ? currentRequestId
        : null,
    );
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
    if (selectedId) {
      setSelectedProjectId(selectedId);
    }
  }

  async function saveProjectUiState(
    patch: ProjectUiState,
    options?: {
      sidebarCollapsed?: boolean;
      wbsColumnOrder?: WbsTableColumnKey[];
      wbsColumnWidths?: Record<WbsTableColumnKey, number>;
    },
  ) {
    if (!project) return;
    const nextUiState: ProjectUiState = {
      ...(project.uiState ?? {}),
      sidebarCollapsed: options?.sidebarCollapsed ?? sidebarCollapsed,
      wbsColumnOrder: options?.wbsColumnOrder ?? wbsColumnOrder,
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
      setNewProjectForm(emptyProjectForm);
      await reloadProjects(result.id);
      setNotice(`Проект ${result.code} создан`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать проект",
      );
    }
  }

  async function saveProjectProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectPayload(projectForm)),
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

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(milestoneForm),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать веху",
        );
      }
      setMilestoneForm(emptyMilestoneForm);
      await refreshProject(project.id);
      setNotice("Веха создана");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать веху",
      );
    }
  }

  async function updateMilestoneStatus(milestoneId: string, status: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось обновить веху",
        );
      }
      await refreshProject();
      setNotice("Статус вехи обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось обновить веху",
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
            "Не удалось создать RAID запись",
        );
      }
      setRaidForm({ ...emptyRaidForm, type: raidForm.type });
      await refreshProject(project.id);
      setExpandedRaidId(result.id);
      setNotice("RAID запись создана");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать RAID запись",
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
            "Не удалось сохранить RAID запись",
        );
      }
      await refreshProject();
      setNotice("RAID запись обновлена");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить RAID запись",
      );
    }
  }

  async function deleteRaidItem(itemId: string) {
    if (!window.confirm("Удалить RAID запись?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/raid-items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить RAID запись");
      }
      await refreshProject();
      setNotice("RAID запись удалена");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить RAID запись",
      );
    }
  }

  function changeRequestPayload(form: ChangeRequestFormState) {
    return {
      ...form,
      implementationPlan: form.implementationPlan || null,
      scopeImpact: form.scopeImpact || null,
      dueDate: form.dueDate || null,
      scheduleImpactDays: Number(form.scheduleImpactDays),
      budgetImpact: Number(form.budgetImpact),
    };
  }

  function updateChangeRequestDraft(
    requestId: string,
    patch: Partial<ChangeRequestFormState>,
  ) {
    const current = changeRequestDrafts[requestId];
    if (!current) return;
    setChangeRequestDrafts({
      ...changeRequestDrafts,
      [requestId]: { ...current, ...patch },
    });
  }

  async function createChangeRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/change-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changeRequestPayload(changeRequestForm)),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать change request",
        );
      }
      setChangeRequestForm(emptyChangeRequestForm);
      await refreshProject(project.id);
      setExpandedChangeRequestId(result.id);
      setNotice("Change request создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать change request",
      );
    }
  }

  async function saveChangeRequest(requestId: string) {
    const draft = changeRequestDrafts[requestId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/change-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changeRequestPayload(draft)),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить change request",
        );
      }
      await refreshProject();
      setNotice("Change request обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить change request",
      );
    }
  }

  async function deleteChangeRequest(requestId: string) {
    if (!window.confirm("Удалить change request?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/change-requests/${requestId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить change request");
      }
      await refreshProject();
      setNotice("Change request удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить change request",
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
      sourceKey === "structure" ||
      sourceKey === "actions" ||
      targetKey === "structure" ||
      targetKey === "actions"
    ) {
      return;
    }
    setWbsColumnOrder((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      const targetIndex = current.indexOf(targetKey);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      void saveProjectUiState(
        { wbsColumnOrder: next },
        { wbsColumnOrder: next },
      );
      return next;
    });
  }

  function startWbsColumnDrag(
    columnKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    if (columnKey === "structure" || columnKey === "actions") {
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
                    ? "Раскрыть WBS элемент"
                    : "Схлопнуть WBS элемент"
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
            />
          </div>
        );
      case "level":
        return (
          <input
            type="number"
            value={draft.wbsLevel}
            onChange={(event) =>
              updateWbsDraft(item.id, { wbsLevel: event.target.value })
            }
          />
        );
      case "type":
        return (
          <select
            value={draft.type}
            onChange={(event) =>
              updateWbsDraft(item.id, {
                type: event.target.value as WbsItemType,
              })
            }
          >
            <option value="PHASE">Phase</option>
            <option value="WORK_PACKAGE">Work package</option>
            <option value="DELIVERABLE">Deliverable</option>
            <option value="MILESTONE">Milestone</option>
            <option value="TASK">Task</option>
          </select>
        );
      case "status":
        return (
          <select
            value={draft.status}
            onChange={(event) =>
              updateWbsDraft(item.id, {
                status: event.target.value as WbsItemStatus,
              })
            }
          >
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="AT_RISK">At risk</option>
            <option value="BLOCKED">Blocked</option>
            <option value="DONE">Done</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        );
      case "owner":
        return (
          <input
            value={draft.owner}
            onChange={(event) =>
              updateWbsDraft(item.id, { owner: event.target.value })
            }
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
          />
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
            placeholder="WBS code"
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
            placeholder="WBS code"
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
            placeholder="WBS code"
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
          />
        );
      case "actions":
        return (
          <div className="wbs-row-actions">
            <button type="button" onClick={() => saveWbsItem(item.id)}>
              Save
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => deleteWbsItem(item.id)}
            >
              Delete
            </button>
          </div>
        );
      default:
        return null;
    }
  }

  async function saveWbsItem(itemId: string) {
    if (!project) return;
    const draft = wbsDrafts[itemId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wbsPayload(itemId, draft)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить WBS элемент",
        );
      }
      await saveWbsPredecessors(itemId);
      const renumberResponse = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/renumber`,
        { method: "POST" },
      );
      if (!renumberResponse.ok) {
        const renumberResult = await renumberResponse.json();
        throw new Error(
          renumberResult.error ?? "Не удалось перенумеровать WBS",
        );
      }
      await refreshProject();
      setNotice("WBS элемент обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить WBS элемент",
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
    const previousLevel = previousItem.wbsLevel ?? previousItem.level + 1;
    const previousCode = draftWbsCodes.get(previousItem.id) ?? previousItem.code;
    const parentCode = previousCode.includes(".")
      ? previousCode.split(".").slice(0, -1).join(".")
      : "";
    const lastSegment = Number(previousCode.split(".").at(-1) ?? "0");
    const nextCode = `${parentCode ? `${parentCode}.` : ""}${lastSegment + 1}`;
    const previousSortOrder = previousItem.sortOrder;
    const nextSortOrder =
      nextItem?.sortOrder ?? previousSortOrder + 10;
    const sortOrder =
      nextSortOrder > previousSortOrder
        ? Math.floor((previousSortOrder + nextSortOrder) / 2)
        : previousSortOrder + 1;
    const parentId =
      previousLevel > 1
        ? parentIdFromWbsLevel(
            previousItem.id,
            previousLevel,
            wbsTree,
            wbsDrafts,
          )
        : null;
    const form = emptyWbsFormFromContext(nextCode, previousLevel, sortOrder);

    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}/wbs-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          parentId,
          code: nextCode,
          wbsLevel: previousLevel,
          leadLagDays: 0,
          plannedCost: 0,
          forecastCost: 0,
          progress: 0,
          sortOrder,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось вставить WBS строку",
        );
      }
      await fetch(`${apiBase}/api/projects/${project.id}/wbs-items/renumber`, {
        method: "POST",
      });
      await refreshProject(project.id);
      setWbsInsertHoverIndex(null);
      setNotice("WBS строка добавлена");
    } catch (insertError) {
      setError(
        insertError instanceof Error
          ? insertError.message
          : "Не удалось вставить WBS строку",
      );
    }
  }

  async function saveWbsPredecessors(itemId: string) {
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
          throw new Error(`Predecessor ${code} не найден в WBS`);
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
      throw new Error("Один predecessor нельзя указывать дважды");
    }
    if (uniquePredecessors.has(itemId)) {
      throw new Error("WBS элемент не может быть своим predecessor");
    }

    const existingDependencies = project.wbsDependencies.filter(
      (dependency) => dependency.successorId === itemId,
    );
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
          throw new Error(result.error ?? "Не удалось удалить связь WBS");
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
            "Не удалось сохранить связь WBS",
        );
      }
    }
  }

  async function deleteWbsItem(itemId: string) {
    if (!window.confirm("Удалить WBS элемент и все дочерние элементы?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить WBS элемент");
      }
      await refreshProject();
      setNotice("WBS элемент удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить WBS элемент",
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
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать issue",
        );
      }
      setIssueForm(emptyIssueForm);
      await refreshProject(project.id);
      setNotice("Open issue создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать issue",
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
      setNotice("Jira-ссылка задачи сохранена");
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
            "Не удалось добавить Jira ticket",
        );
      }
      await refreshProject();
      setNotice("Jira ticket добавлен к Open Issue");
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Не удалось добавить Jira ticket",
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
        throw new Error(result.error ?? "Не удалось удалить Jira ticket");
      }
      await refreshProject();
      setNotice("Jira ticket удален из Open Issue");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить Jira ticket",
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
            "Не удалось сохранить issue",
        );
      }
      await refreshProject();
      setNotice("Open Issue обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить issue",
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
            "Не удалось сохранить issue",
        );
      }
      await refreshProject();
      setNotice("Open Issue обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить issue",
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
        throw new Error(result.error ?? "Не удалось сгенерировать overview");
      }
      await refreshProject(project.id);
      setNotice(`Executive overview v${result.version} сгенерирован`);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Не удалось сгенерировать overview",
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
        throw new Error(result.error ?? "Не удалось опубликовать overview");
      }
      await refreshProject();
      setNotice(`Executive overview v${result.version} опубликован`);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Не удалось опубликовать overview",
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
            approvedBy: status === "APPROVED" ? "PMO" : null,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось сменить статус overview");
      }
      await refreshProject();
      setNotice(`Executive overview v${result.version}: ${overviewStatusLabel(result.status)}`);
    } catch (workflowError) {
      setError(
        workflowError instanceof Error
          ? workflowError.message
          : "Не удалось сменить статус overview",
      );
    }
  }

  function selectProject(projectId: string, nextView: AppView = activeView) {
    setSelectedProjectId(projectId);
    setActiveView(
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
    "project-wbs": project ? `${project.code} - WBS и Гантт` : "WBS и Гантт",
    "project-issues": project ? `${project.code} - Open Issues` : "Open Issues",
    "project-raid": project
      ? `${project.code} - RAID и изменения`
      : "RAID и изменения",
    "project-artifacts": project
      ? `${project.code} - Артефакты проекта`
      : "Артефакты проекта",
    admin: "Admin Back",
  };

  const viewEyebrow =
    activeView === "admin"
      ? "Web UI Back для администратора системы"
      : activeView === "portfolio"
        ? "Web UI Front / портфель"
        : "Web UI Front / проект";
  const projectViews: AppView[] = [
    "project-create",
    "project-overview",
    "project-passport",
    "project-wbs",
    "project-issues",
    "project-raid",
    "project-artifacts",
  ];
  const isProjectView = projectViews.includes(activeView);
  const navLabel = (icon: string, label: string) => (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-text">{label}</span>
      {sidebarCollapsed && <span className="nav-tooltip">{label}</span>}
    </>
  );

  if (loading) {
    return (
      <main className="loading">Загрузка системы управления проектами...</main>
    );
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PM</span>
          <span className="brand-text">
            <b>PM System</b>
            <small>Контур управления</small>
          </span>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => {
              const nextCollapsed = !sidebarCollapsed;
              setSidebarCollapsed(nextCollapsed);
              void saveProjectUiState(
                { sidebarCollapsed: nextCollapsed },
                { sidebarCollapsed: nextCollapsed },
              );
            }}
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
            {sidebarCollapsed ? ">" : "<"}
          </button>
        </div>
        <nav>
          <button
            type="button"
            className={activeView === "portfolio" ? "active" : ""}
            onClick={() => setActiveView("portfolio")}
            aria-label="Портфель проектов"
          >
            {navLabel("PF", "Портфель проектов")}
          </button>
          <button
            type="button"
            className={isProjectView ? "active" : ""}
            onClick={() =>
              setActiveView(
                selectedProjectId ? "project-overview" : "project-create",
              )
            }
            aria-label="Проекты"
          >
            {navLabel("PR", "Проекты")}
          </button>
          <div className="sidebar-group">
            <button
              type="button"
              className={
                activeView === "project-create" ? "active nested" : "nested"
              }
              onClick={() => setActiveView("project-create")}
              aria-label="Создать новый проект"
            >
              {navLabel("+", "Создать новый проект")}
            </button>
            <label className="project-picker">
              <select
                value={selectedProjectId ?? ""}
                onChange={(event) => {
                  if (event.target.value) {
                    selectProject(event.target.value, "project-overview");
                  }
                }}
              >
                <option value="">Выбрать проект</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {projectOptionLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            {selectedProjectListItem && (
              <div className="project-menu">
                <button
                  type="button"
                  className={
                    activeView === "project-overview"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-overview")}
                  aria-label="Обзор и вехи"
                >
                  {navLabel("OV", "Обзор и вехи")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-passport"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-passport")}
                  aria-label="Паспорт проекта"
                >
                  {navLabel("PP", "Паспорт проекта")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-wbs"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-wbs")}
                  aria-label="WBS и Гантт"
                >
                  {navLabel("WB", "WBS и Гантт")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-issues"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-issues")}
                  aria-label="Open Issues"
                >
                  {navLabel("OI", "Open Issues")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-raid"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-raid")}
                  aria-label="RAID и изменения"
                >
                  {navLabel("RI", "RAID и изменения")}
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-artifacts"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-artifacts")}
                  aria-label="Артефакты проекта"
                >
                  {navLabel("AR", "Артефакты проекта")}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={activeView === "admin" ? "active" : ""}
            onClick={() => setActiveView("admin")}
            aria-label="Admin Back"
          >
            {navLabel("AD", "Admin Back")}
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{viewEyebrow}</p>
            <h1>{viewTitle[activeView]}</h1>
          </div>
          {project && activeView !== "portfolio" && (
            <div className="topbar-project">
              <span>{project.status}</span>
              <b className={`rag ${project.rag.toLowerCase()}`}>
                {ragLabel(project.rag)}
              </b>
            </div>
          )}
        </header>

        {error && <div className="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {(project ||
          activeView === "portfolio" ||
          activeView === "project-create") && (
          <>
            {activeView === "portfolio" && (
              <section className="summary-grid">
                <div className="metric">
                  <span>Active Projects</span>
                  <strong>{portfolioStats.activeProjects}</strong>
                  <small>Всего проектов: {projects.length}</small>
                </div>
                <div className="metric">
                  <span>Portfolio Progress</span>
                  <strong>{portfolioStats.averageProgress}%</strong>
                  <div className="progress">
                    <i
                      style={{ width: `${portfolioStats.averageProgress}%` }}
                    />
                  </div>
                </div>
                <div className="metric">
                  <span>Risk Profile</span>
                  <strong>
                    {portfolioStats.redProjects} /{" "}
                    {portfolioStats.amberProjects}
                  </strong>
                  <small>Red / Amber проекты</small>
                </div>
                <div className="metric">
                  <span>Open Issues</span>
                  <strong>{portfolioStats.openIssues}</strong>
                  <small>Открытые проблемы по портфелю</small>
                </div>
              </section>
            )}

            {project && activeView === "project-overview" && (
                <section className="summary-grid">
                  <div className="metric">
                    <span>Project Health</span>
                    <strong className={`rag ${project.rag.toLowerCase()}`}>
                      {ragLabel(project.rag)}
                    </strong>
                    <small>{project.summary}</small>
                  </div>
                  <div className="metric">
                    <span>Progress</span>
                    <strong>{project.progress}%</strong>
                    <div className="progress">
                      <i style={{ width: `${project.progress}%` }} />
                    </div>
                  </div>
                  <div className="metric">
                    <span>Schedule Variance</span>
                    <strong>
                      {project.scheduleVariance > 0 ? "+" : ""}
                      {project.scheduleVariance} дней
                    </strong>
                    <small>Относительно baseline</small>
                  </div>
                  <div className="metric">
                    <span>Budget Forecast</span>
                    <strong>
                      {budgetVariance > 0 ? "+" : ""}
                      {budgetVariance.toFixed(1)}%
                    </strong>
                    <small>{currency(project.budgetForecast)}</small>
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
                      onClick={() => setActiveView("project-create")}
                    >
                      Создать проект
                    </button>
                  </div>
                  <div className="project-tree-list">
                    <div className="project-tree-head">
                      <span>Проект</span>
                      <span>PM</span>
                      <span>Прогресс</span>
                      <span>RAG</span>
                    </div>
                    {projectTree.map((item) => (
                      <button
                        type="button"
                        className={`project-tree-row ${item.id === selectedProjectId ? "active" : ""}`}
                        key={item.id}
                        onClick={() =>
                          selectProject(item.id, "project-overview")
                        }
                      >
                        <span
                          className="project-tree-title"
                          style={{ paddingLeft: `${item.level * 18}px` }}
                        >
                          <b>{item.code}</b>
                          {item.name}
                        </span>
                        <span>{item.projectManager}</span>
                        <span>{item.progress}%</span>
                        <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                      </button>
                    ))}
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
                      <p>Быстрый intake нового проекта с базовыми полями PMO</p>
                    </div>
                  </div>
                  <form
                    className="form-grid compact-form"
                    onSubmit={createProject}
                  >
                    <label>
                      Code
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
                      Name
                      <input
                        value={newProjectForm.name}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            name: event.target.value,
                          })
                        }
                        placeholder="CRM migration"
                      />
                    </label>
                    <label>
                      Parent
                      <select
                        value={newProjectForm.parentId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">Root</option>
                        {projectTree.map((item) => (
                          <option key={item.id} value={item.id}>
                            {"- ".repeat(item.level)}
                            {item.code} - {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sort
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
                    <label>
                      Portfolio
                      <input
                        value={newProjectForm.portfolio}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            portfolio: event.target.value,
                          })
                        }
                        placeholder="Digital Transformation"
                      />
                    </label>
                    <label>
                      PM
                      <input
                        value={newProjectForm.projectManager}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            projectManager: event.target.value,
                          })
                        }
                        placeholder="Project manager"
                      />
                    </label>
                    <label>
                      Sponsor
                      <input
                        value={newProjectForm.sponsor}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sponsor: event.target.value,
                          })
                        }
                        placeholder="CFO / CIO"
                      />
                    </label>
                    <label>
                      RAG
                      <select
                        value={newProjectForm.rag}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            rag: event.target.value as RagStatus,
                          })
                        }
                      >
                        <option value="GREEN">Green</option>
                        <option value="AMBER">Amber</option>
                        <option value="RED">Red</option>
                      </select>
                    </label>
                    <label>
                      Start
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
                      Target
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
                      Budget planned
                      <input
                        type="number"
                        value={newProjectForm.budgetPlanned}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            budgetPlanned: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Budget forecast
                      <input
                        type="number"
                        value={newProjectForm.budgetForecast}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            budgetForecast: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Progress
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
                      Schedule variance
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
                    <label className="span-2">
                      Summary
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

              {project && activeView === "project-overview" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>{project.name}</h2>
                      <p>
                        {project.portfolio} / Sponsor: {project.sponsor}
                      </p>
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
                  <dl className="details">
                    <div>
                      <dt>PM</dt>
                      <dd>{project.projectManager}</dd>
                    </div>
                    <div>
                      <dt>Бюджет</dt>
                      <dd>{currency(project.budgetPlanned)}</dd>
                    </div>
                    <div>
                      <dt>Старт</dt>
                      <dd>{date(project.startDate)}</dd>
                    </div>
                    <div>
                      <dt>Цель</dt>
                      <dd>{date(project.targetDate)}</dd>
                    </div>
                  </dl>
                  <div className="jql">
                    <span>Executive summary source</span>
                    <code>{project.summary}</code>
                  </div>
                </article>
              )}

              {project && activeView === "project-passport" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Паспорт проекта</h2>
                      <p>
                        Управление health, сроками, бюджетом и базовой сводкой
                        проекта
                      </p>
                    </div>
                  </div>
                  <form
                    className="form-grid compact-form"
                    onSubmit={saveProjectProfile}
                  >
                    <label>
                      Name
                      <input
                        value={projectForm.name}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Portfolio
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
                    <label>
                      Sponsor
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
                      PM
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
                    <label>
                      Parent
                      <select
                        value={projectForm.parentId}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">Root</option>
                        {projectTree
                          .filter((item) => item.id !== project.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {"- ".repeat(item.level)}
                              {item.code} - {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Sort
                      <input
                        type="number"
                        value={projectForm.sortOrder}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            sortOrder: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Status
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
                        <option value="DRAFT">Draft</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ON_HOLD">On hold</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </label>
                    <label>
                      RAG
                      <select
                        value={projectForm.rag}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            rag: event.target.value as RagStatus,
                          })
                        }
                      >
                        <option value="GREEN">Green</option>
                        <option value="AMBER">Amber</option>
                        <option value="RED">Red</option>
                      </select>
                    </label>
                    <label>
                      Start
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
                      Target
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
                      Budget planned
                      <input
                        type="number"
                        value={projectForm.budgetPlanned}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            budgetPlanned: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Budget forecast
                      <input
                        type="number"
                        value={projectForm.budgetForecast}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            budgetForecast: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Progress
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
                      Schedule variance
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
                    <label className="span-2">
                      Summary
                      <textarea
                        value={projectForm.summary}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            summary: event.target.value,
                          })
                        }
                        rows={3}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit">Сохранить паспорт</button>
                    </div>
                  </form>
                </article>
              )}

              {project && activeView === "project-overview" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Milestones</h2>
                      <p>
                        Контроль ближайших вех проекта и их статусов для
                        executive overview
                      </p>
                    </div>
                  </div>
                  <div className="milestone-grid">
                    <div className="milestone-list">
                      {project.milestones.map((milestone) => (
                        <div className="milestone-row" key={milestone.id}>
                          <div>
                            <strong>{milestone.title}</strong>
                            <p>
                              {date(milestone.dueDate)} / {milestone.owner}
                            </p>
                            {milestone.description && (
                              <span>{milestone.description}</span>
                            )}
                          </div>
                          <select
                            value={milestone.status}
                            onChange={(event) =>
                              updateMilestoneStatus(
                                milestone.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="Planned">Planned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="At Risk">At Risk</option>
                            <option value="Done">Done</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>
                      ))}
                      {project.milestones.length === 0 && (
                        <div className="empty-state">Вехи еще не заданы.</div>
                      )}
                    </div>
                    <form
                      className="stack-form compact-form"
                      onSubmit={createMilestone}
                    >
                      <label>
                        Title
                        <input
                          value={milestoneForm.title}
                          onChange={(event) =>
                            setMilestoneForm({
                              ...milestoneForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="UAT старт"
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Due date
                          <input
                            type="date"
                            value={milestoneForm.dueDate}
                            onChange={(event) =>
                              setMilestoneForm({
                                ...milestoneForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Status
                          <select
                            value={milestoneForm.status}
                            onChange={(event) =>
                              setMilestoneForm({
                                ...milestoneForm,
                                status: event.target.value,
                              })
                            }
                          >
                            <option value="Planned">Planned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="At Risk">At Risk</option>
                            <option value="Done">Done</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Owner
                        <input
                          value={milestoneForm.owner}
                          onChange={(event) =>
                            setMilestoneForm({
                              ...milestoneForm,
                              owner: event.target.value,
                            })
                          }
                          placeholder="PMO / QA Lead / Sponsor"
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={milestoneForm.description}
                          onChange={(event) =>
                            setMilestoneForm({
                              ...milestoneForm,
                              description: event.target.value,
                            })
                          }
                          rows={3}
                        />
                      </label>
                      <button type="submit">Добавить веху</button>
                    </form>
                  </div>
                </article>
              )}

              {project && activeView === "project-wbs" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>WBS и Гантт</h2>
                      <p>
                        Иерархия работ проекта: фазы, work packages,
                        deliverables и задачи со связью на Jira
                      </p>
                    </div>
                    <div className="wbs-toolbar" aria-label="WBS actions">
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
                        Baseline
                      </button>
                      <button
                        type="button"
                        className={showGanttForecast ? "active" : ""}
                        onClick={() =>
                          setShowGanttForecast((current) => !current)
                        }
                      >
                        Forecast
                      </button>
                      <button
                        type="button"
                        onClick={() => setCollapsedWbsIds(new Set())}
                      >
                        Раскрыть все
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedWbsIds(
                            new Set(
                              wbsTree
                                .filter((item) => item.children.length > 0)
                                .map((item) => item.id),
                            ),
                          )
                        }
                      >
                        Схлопнуть фазы
                      </button>
                    </div>
                  </div>
                  <div className="wbs-kpis">
                    <div>
                      <span>Items</span>
                      <strong>{project.wbsItems.length}</strong>
                    </div>
                    <div>
                      <span>Done</span>
                      <strong>{wbsSummary.completed}</strong>
                    </div>
                    <div>
                      <span>At risk / blocked</span>
                      <strong>{wbsSummary.atRisk}</strong>
                    </div>
                    <div>
                      <span>Milestones</span>
                      <strong>{project.milestones.length}</strong>
                    </div>
                    <div>
                      <span>Dependencies</span>
                      <strong>{project.wbsDependencies.length}</strong>
                    </div>
                    <div>
                      <span>Forecast variance</span>
                      <strong>{wbsSummary.scheduleVarianceDays} дн.</strong>
                      <small>{wbsSummary.slipped} slipped WBS</small>
                    </div>
                    <div>
                      <span>Visible</span>
                      <strong>{visibleWbsTree.length}</strong>
                      <small>С учетом схлопывания</small>
                    </div>
                  </div>
                  <div className="wbs-gantt-layout">
                    <div className="wbs-table-shell">
                      <div
                        className="wbs-excel-table"
                        style={{ "--wbs-table-template": wbsTableTemplate } as CSSProperties}
                      >
                        <div className="wbs-table-head">
                          {orderedWbsColumns.map((column) => (
                            <span
                              key={column.key}
                              draggable={
                                column.key !== "structure" &&
                                column.key !== "actions"
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
                                  column.key !== "structure" &&
                                  column.key !== "actions"
                                ) {
                                  event.preventDefault();
                                }
                              }}
                              onDrop={(event) => dropWbsColumn(column.key, event)}
                              onDragEnd={() => setDraggedWbsColumn(null)}
                            >
                              <span className="wbs-column-title">{column.label}</span>
                              {column.key !== "actions" && (
                                <button
                                  type="button"
                                  className="wbs-column-resizer"
                                  onPointerDown={(event) =>
                                    startWbsColumnResize(column.key, event)
                                  }
                                  aria-label={`Изменить ширину колонки ${column.label}`}
                                />
                              )}
                            </span>
                          ))}
                        </div>
                        {visibleWbsTree.map((item, index) => {
                          const draft = wbsDrafts[item.id];
                          if (!draft) return null;
                          return (
                            <div key={item.id} className="wbs-row-stack">
                              <div
                                className="wbs-insert-slot"
                                onMouseEnter={() => setWbsInsertHoverIndex(index)}
                                onMouseLeave={() =>
                                  setWbsInsertHoverIndex((current) =>
                                    current === index ? null : current,
                                  )
                                }
                              >
                                {wbsInsertHoverIndex === index && (
                                  <button
                                    type="button"
                                    className="wbs-insert-button"
                                    onClick={() => void insertWbsRow(index)}
                                  >
                                    + Добавить строку
                                  </button>
                                )}
                              </div>
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
                                        : column.key === "actions"
                                          ? "wbs-cell-actions"
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
                          <div className="empty-state">WBS еще не создан.</div>
                        )}
                      </div>
                    </div>
                    <div
                      className="gantt-panel"
                      style={
                        {
                          "--gantt-wbs-width": `${ganttWbsWidth}px`,
                          "--gantt-timeline-width": `${Math.max(
                            520,
                            wbsGantt.months.length * 120,
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
                        aria-label="Изменить ширину WBS колонки"
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
                          <span>Timeline</span>
                        )}
                      </div>
                    </div>
                    <div className="gantt-body">
                      {wbsGantt.items.length === 0 && (
                        <div className="empty-state">
                          Для Гантта нужны start и due даты WBS элементов.
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
                                          ? "Раскрыть WBS элемент"
                                          : "Схлопнуть WBS элемент"
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
                            aria-label="Изменить ширину WBS колонки"
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
                                      title={`${item.code} baseline: ${date(item.baselineStartDate)} - ${date(item.baselineDueDate)}`}
                                    />
                                  )}
                                  {showGanttForecast && forecastRange && (
                                    <i
                                      className={`gantt-overlay forecast ${scheduleVarianceDays > 0 ? "slipped" : ""}`}
                                      style={{
                                        left: `${forecastRange.offset}%`,
                                        width: `${forecastRange.width}%`,
                                      }}
                                      title={`${item.code} forecast: ${date(item.forecastStartDate)} - ${date(item.forecastDueDate)}`}
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
                  </div>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Admin Back: Jira connector</h2>
                      <p>
                        Настройки проекта для deep links, snapshots и Open
                        Issues JQL
                      </p>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={saveJiraIntegration}>
                    <label>
                      Jira base URL
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
                      Jira board URL
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
                      Project key
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
                      Issues JQL
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
                      Open issues JQL
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
                      <h2>Open Issues List</h2>
                      <p>
                        Единый список открытых проблем из Jira и внутреннего
                        RAID
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
                                {issue.severity}
                              </span>
                              <span>Статус: {issue.status}</span>
                              <span>Источник: {issue.source}</span>
                              {issue.decisionRequired && <b>Требует решения</b>}
                            </div>
                            <div className="issue-impact">
                              <span>Impact</span>
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
                                  placeholder="Title"
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
                                  <option value="CRITICAL">Critical</option>
                                  <option value="HIGH">High</option>
                                  <option value="MEDIUM">Medium</option>
                                  <option value="LOW">Low</option>
                                </select>
                                <select
                                  value={issueEditDrafts[issue.id].status}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      status: event.target.value,
                                    })
                                  }
                                >
                                  <option value="Open">Open</option>
                                  <option value="In Progress">
                                    In Progress
                                  </option>
                                  <option value="Blocked">Blocked</option>
                                  <option value="Resolved">Resolved</option>
                                  <option value="Closed">Closed</option>
                                </select>
                                <input
                                  value={issueEditDrafts[issue.id].owner}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      owner: event.target.value,
                                    })
                                  }
                                  placeholder="Owner"
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
                                  Decision
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
                                    Save issue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => closeOpenIssue(issue.id)}
                                  >
                                    Resolve
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
                                  Jira tickets not linked
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
                                placeholder="Jira key"
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
                                Add
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
                      <h2>Создать Open Issue</h2>
                      <p>
                        Внутренний RAID issue или управленческая проблема со
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
                        Severity
                        <select
                          value={issueForm.severity}
                          onChange={(event) =>
                            setIssueForm({
                              ...issueForm,
                              severity: event.target.value as Issue["severity"],
                            })
                          }
                        >
                          <option value="CRITICAL">Critical</option>
                          <option value="HIGH">High</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="LOW">Low</option>
                        </select>
                      </label>
                      <label>
                        Owner
                        <input
                          value={issueForm.owner}
                          onChange={(event) =>
                            setIssueForm({
                              ...issueForm,
                              owner: event.target.value,
                            })
                          }
                          placeholder="PM / Vendor / IT Ops"
                        />
                      </label>
                    </div>
                    <label>
                      Impact
                      <textarea
                        value={issueForm.impact}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            impact: event.target.value,
                          })
                        }
                        rows={3}
                        placeholder="Влияние на сроки, бюджет, scope или решение руководства"
                      />
                    </label>
                    <div className="two-col">
                      <label>
                        Due date
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
                      <div className="subhead">Связанные Jira tickets</div>
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
                            Remove
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addIssueFormLink}>
                        + Add Jira ticket
                      </button>
                    </div>
                    <button type="submit" disabled={creatingIssue}>
                      {creatingIssue ? "Создаю..." : "Создать issue"}
                    </button>
                  </form>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Jira Issues Snapshot</h2>
                      <p>
                        Для отчетности и executive overview, не замена Jira
                        Kanban
                      </p>
                    </div>
                    <button
                      className="button"
                      type="button"
                      onClick={syncJira}
                      disabled={syncing}
                    >
                      {syncing ? "Sync..." : "Sync now"}
                    </button>
                  </div>
                  <div className="table">
                    <div className="table-head">
                      <span>Key</span>
                      <span>Status</span>
                      <span>Priority</span>
                      <span>Assignee</span>
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
                        <span>{issue.assignee ?? "unassigned"}</span>
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
                      <p>Каждая задача может ссылаться на Jira ticket</p>
                    </div>
                  </div>
                  <div className="task-list">
                    {project.tasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <div>
                          <h3>{task.title}</h3>
                          <p>
                            {task.owner} / {task.status} / due{" "}
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
                              placeholder="Jira key"
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
                              Save
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
                          <span className="ticket empty">no Jira link</span>
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
                      <h2>RAID и управление изменениями</h2>
                      <p>
                        Риски, допущения, зависимости и change requests с
                        влиянием на сроки, бюджет и executive overview
                      </p>
                    </div>
                  </div>
                  <div className="wbs-kpis">
                    <div>
                      <span>Active RAID</span>
                      <strong>{raidSummary.activeRaid}</strong>
                      <small>open / in progress / breached</small>
                    </div>
                    <div>
                      <span>High risks</span>
                      <strong>{raidSummary.highRisks}</strong>
                      <small>score 15+</small>
                    </div>
                    <div>
                      <span>Pending CR</span>
                      <strong>{raidSummary.pendingCr}</strong>
                      <small>submitted / in review</small>
                    </div>
                    <div>
                      <span>Approved impact</span>
                      <strong>{raidSummary.approvedImpact.days} дн.</strong>
                      <small>{currency(String(raidSummary.approvedImpact.budget))}</small>
                    </div>
                  </div>
                  <div className="raid-layout">
                    <section>
                      <div className="subhead">RAID register</div>
                      <div className="raid-list">
                        <div className="raid-head">
                          <span>Запись</span>
                          <span>Тип</span>
                          <span>Score</span>
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
                                  <span>Residual: {item.residualRisk}</span>
                                  <span>
                                    Schedule: {item.scheduleImpactDays} days
                                  </span>
                                  <span>
                                    Budget: {currency(item.budgetImpact)}
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
                                    <option value="RISK">Risk</option>
                                    <option value="ASSUMPTION">Assumption</option>
                                    <option value="DEPENDENCY">Dependency</option>
                                  </select>
                                  <select
                                    value={raidDrafts[item.id].status}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        status: event.target.value as RaidItemStatus,
                                      })
                                    }
                                  >
                                    <option value="OPEN">Open</option>
                                    <option value="IN_PROGRESS">In progress</option>
                                    <option value="MITIGATED">Mitigated</option>
                                    <option value="VALIDATED">Validated</option>
                                    <option value="BREACHED">Breached</option>
                                    <option value="CLOSED">Closed</option>
                                  </select>
                                  <input
                                    value={raidDrafts[item.id].title}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        title: event.target.value,
                                      })
                                    }
                                    placeholder="Title"
                                  />
                                  <input
                                    value={raidDrafts[item.id].owner}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        owner: event.target.value,
                                      })
                                    }
                                    placeholder="Owner"
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
                                    placeholder="Probability"
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
                                    placeholder="Impact"
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
                                    placeholder="Predecessor"
                                  />
                                  <input
                                    value={raidDrafts[item.id].successor}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        successor: event.target.value,
                                      })
                                    }
                                    placeholder="Successor"
                                  />
                                  <input
                                    value={raidDrafts[item.id].supplier}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        supplier: event.target.value,
                                      })
                                    }
                                    placeholder="Supplier"
                                  />
                                  <input
                                    type="number"
                                    value={raidDrafts[item.id].scheduleImpactDays}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        scheduleImpactDays: event.target.value,
                                      })
                                    }
                                    placeholder="Schedule days"
                                  />
                                  <input
                                    type="number"
                                    value={raidDrafts[item.id].budgetImpact}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        budgetImpact: event.target.value,
                                      })
                                    }
                                    placeholder="Budget impact"
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
                                    Decision
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
                                    placeholder="Mitigation plan"
                                  />
                                  <textarea
                                    value={raidDrafts[item.id].contingencyPlan}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        contingencyPlan: event.target.value,
                                      })
                                    }
                                    rows={2}
                                    placeholder="Contingency plan"
                                  />
                                  <div className="issue-actions">
                                    <button
                                      type="button"
                                      onClick={() => saveRaidItem(item.id)}
                                    >
                                      Save RAID
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() => deleteRaidItem(item.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {project.raidItems.length === 0 && (
                          <div className="empty-state">RAID записей пока нет.</div>
                        )}
                      </div>
                    </section>
                    <form className="raid-form stack-form" onSubmit={createRaidItem}>
                      <h3>Новая RAID запись</h3>
                      <div className="two-col">
                        <label>
                          Type
                          <select
                            value={raidForm.type}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                type: event.target.value as RaidItemType,
                              })
                            }
                          >
                            <option value="RISK">Risk</option>
                            <option value="ASSUMPTION">Assumption</option>
                            <option value="DEPENDENCY">Dependency</option>
                          </select>
                        </label>
                        <label>
                          Owner
                          <input
                            value={raidForm.owner}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder="Risk owner"
                          />
                        </label>
                      </div>
                      <label>
                        Title
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
                        Description
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
                      <div className="two-col">
                        <label>
                          Probability
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
                          Impact
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
                          Due date
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
                        <label>
                          Budget impact
                          <input
                            type="number"
                            value={raidForm.budgetImpact}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                budgetImpact: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Mitigation plan
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
                      <button type="submit">Создать RAID запись</button>
                    </form>
                  </div>
                </article>
              )}

              {project && activeView === "project-raid" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Change Requests</h2>
                      <p>
                        Scope, budget, schedule и resource изменения с
                        approval workflow
                      </p>
                    </div>
                  </div>
                  <div className="raid-layout">
                    <section>
                      <div className="raid-list">
                        <div className="cr-head">
                          <span>Change request</span>
                          <span>Type</span>
                          <span>Status</span>
                          <span>Impact</span>
                          <span>Owner</span>
                          <span />
                        </div>
                        {project.changeRequests.map((request) => (
                          <div className="raid-item" key={request.id}>
                            <button
                              type="button"
                              className="cr-row"
                              onClick={() =>
                                setExpandedChangeRequestId(
                                  expandedChangeRequestId === request.id
                                    ? null
                                    : request.id,
                                )
                              }
                            >
                              <span className="raid-title">
                                {request.title}
                              </span>
                              <span>{request.type}</span>
                              <span>{changeRequestStatusLabel(request.status)}</span>
                              <span>
                                {request.scheduleImpactDays} дн. /{" "}
                                {currency(request.budgetImpact)}
                              </span>
                              <span>{request.owner}</span>
                              <span className="issue-chevron">
                                {expandedChangeRequestId === request.id
                                  ? "-"
                                  : "+"}
                              </span>
                            </button>
                            {expandedChangeRequestId === request.id &&
                              changeRequestDrafts[request.id] && (
                                <div className="raid-details">
                                  <div className="raid-detail-meta">
                                    <span>{request.affectedBaseline}</span>
                                    <span>{request.approvalRoute}</span>
                                    {request.approvedAt && (
                                      <span>
                                        Approved: {date(request.approvedAt)}
                                      </span>
                                    )}
                                    {request.decisionRequired && (
                                      <b>Требует решения</b>
                                    )}
                                  </div>
                                  <p>{request.description}</p>
                                  <div className="raid-edit-grid">
                                    <select
                                      value={changeRequestDrafts[request.id].type}
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          type: event.target.value as ChangeRequestType,
                                        })
                                      }
                                    >
                                      <option value="SCOPE">Scope</option>
                                      <option value="BUDGET">Budget</option>
                                      <option value="SCHEDULE">Schedule</option>
                                      <option value="RESOURCE">Resource</option>
                                    </select>
                                    <select
                                      value={changeRequestDrafts[request.id].status}
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          status: event.target.value as ChangeRequestStatus,
                                        })
                                      }
                                    >
                                      <option value="DRAFT">Draft</option>
                                      <option value="SUBMITTED">Submitted</option>
                                      <option value="IN_REVIEW">In review</option>
                                      <option value="APPROVED">Approved</option>
                                      <option value="REJECTED">Rejected</option>
                                      <option value="IMPLEMENTED">Implemented</option>
                                    </select>
                                    <input
                                      value={changeRequestDrafts[request.id].title}
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          title: event.target.value,
                                        })
                                      }
                                      placeholder="Title"
                                    />
                                    <input
                                      value={changeRequestDrafts[request.id].owner}
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          owner: event.target.value,
                                        })
                                      }
                                      placeholder="Owner"
                                    />
                                    <input
                                      type="number"
                                      value={
                                        changeRequestDrafts[request.id]
                                          .scheduleImpactDays
                                      }
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          scheduleImpactDays: event.target.value,
                                        })
                                      }
                                      placeholder="Schedule days"
                                    />
                                    <input
                                      type="number"
                                      value={
                                        changeRequestDrafts[request.id]
                                          .budgetImpact
                                      }
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          budgetImpact: event.target.value,
                                        })
                                      }
                                      placeholder="Budget impact"
                                    />
                                    <input
                                      value={
                                        changeRequestDrafts[request.id]
                                          .affectedBaseline
                                      }
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          affectedBaseline: event.target.value,
                                        })
                                      }
                                      placeholder="Affected baseline"
                                    />
                                    <input
                                      type="date"
                                      value={changeRequestDrafts[request.id].dueDate}
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          dueDate: event.target.value,
                                        })
                                      }
                                    />
                                    <textarea
                                      className="span-2"
                                      value={
                                        changeRequestDrafts[request.id]
                                          .impactAnalysis
                                      }
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          impactAnalysis: event.target.value,
                                        })
                                      }
                                      rows={2}
                                    />
                                    <textarea
                                      value={
                                        changeRequestDrafts[request.id]
                                          .implementationPlan
                                      }
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          implementationPlan: event.target.value,
                                        })
                                      }
                                      rows={2}
                                      placeholder="Implementation plan"
                                    />
                                    <textarea
                                      value={
                                        changeRequestDrafts[request.id].scopeImpact
                                      }
                                      onChange={(event) =>
                                        updateChangeRequestDraft(request.id, {
                                          scopeImpact: event.target.value,
                                        })
                                      }
                                      rows={2}
                                      placeholder="Scope impact"
                                    />
                                    <label className="checkbox-line compact-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={
                                          changeRequestDrafts[request.id]
                                            .decisionRequired
                                        }
                                        onChange={(event) =>
                                          updateChangeRequestDraft(request.id, {
                                            decisionRequired:
                                              event.target.checked,
                                          })
                                        }
                                      />
                                      Decision
                                    </label>
                                    <div className="issue-actions">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          saveChangeRequest(request.id)
                                        }
                                      >
                                        Save CR
                                      </button>
                                      <button
                                        type="button"
                                        className="danger-button"
                                        onClick={() =>
                                          deleteChangeRequest(request.id)
                                        }
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                          </div>
                        ))}
                        {project.changeRequests.length === 0 && (
                          <div className="empty-state">
                            Change requests пока нет.
                          </div>
                        )}
                      </div>
                    </section>
                    <form
                      className="raid-form stack-form"
                      onSubmit={createChangeRequest}
                    >
                      <h3>Новый Change Request</h3>
                      <div className="two-col">
                        <label>
                          Type
                          <select
                            value={changeRequestForm.type}
                            onChange={(event) =>
                              setChangeRequestForm({
                                ...changeRequestForm,
                                type: event.target.value as ChangeRequestType,
                              })
                            }
                          >
                            <option value="SCOPE">Scope</option>
                            <option value="BUDGET">Budget</option>
                            <option value="SCHEDULE">Schedule</option>
                            <option value="RESOURCE">Resource</option>
                          </select>
                        </label>
                        <label>
                          Owner
                          <input
                            value={changeRequestForm.owner}
                            onChange={(event) =>
                              setChangeRequestForm({
                                ...changeRequestForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder="Sponsor / PMO"
                          />
                        </label>
                      </div>
                      <label>
                        Title
                        <input
                          value={changeRequestForm.title}
                          onChange={(event) =>
                            setChangeRequestForm({
                              ...changeRequestForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="Утвердить перенос UAT"
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={changeRequestForm.description}
                          onChange={(event) =>
                            setChangeRequestForm({
                              ...changeRequestForm,
                              description: event.target.value,
                            })
                          }
                          rows={2}
                        />
                      </label>
                      <label>
                        Impact analysis
                        <textarea
                          value={changeRequestForm.impactAnalysis}
                          onChange={(event) =>
                            setChangeRequestForm({
                              ...changeRequestForm,
                              impactAnalysis: event.target.value,
                            })
                          }
                          rows={3}
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Schedule days
                          <input
                            type="number"
                            value={changeRequestForm.scheduleImpactDays}
                            onChange={(event) =>
                              setChangeRequestForm({
                                ...changeRequestForm,
                                scheduleImpactDays: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Budget impact
                          <input
                            type="number"
                            value={changeRequestForm.budgetImpact}
                            onChange={(event) =>
                              setChangeRequestForm({
                                ...changeRequestForm,
                                budgetImpact: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Affected baseline
                        <input
                          value={changeRequestForm.affectedBaseline}
                          onChange={(event) =>
                            setChangeRequestForm({
                              ...changeRequestForm,
                              affectedBaseline: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={changeRequestForm.decisionRequired}
                          onChange={(event) =>
                            setChangeRequestForm({
                              ...changeRequestForm,
                              decisionRequired: event.target.checked,
                            })
                          }
                        />
                        Требует решения
                      </label>
                      <button type="submit">Создать CR</button>
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
                                setActiveView(artifact.action);
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
                                      <option value="Draft">Draft</option>
                                      <option value="In Review">
                                        In Review
                                      </option>
                                      <option value="Approved">Approved</option>
                                      <option value="Baseline">Baseline</option>
                                      <option value="Archived">Archived</option>
                                    </select>
                                  </label>
                                  <label>
                                    Sort
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
                          placeholder="Solution design"
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
                            placeholder="Document / Link / Baseline"
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
                            <option value="Draft">Draft</option>
                            <option value="In Review">In Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Baseline">Baseline</option>
                            <option value="Archived">Archived</option>
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
                            placeholder="PMO / Architect"
                          />
                        </label>
                        <label>
                          Sort
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
                      <h2>Executive Overview</h2>
                      <p>
                        Детерминированная генерация management pack из текущих
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
                          ? "Generating..."
                          : "Generate new version"}
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
                        {publishingOverview ? "Publishing..." : "Publish"}
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
                          Status:{" "}
                          <b>{overviewStatusLabel(latestOverview.status)}</b>
                        </span>
                        <span>
                          Generated:{" "}
                          {latestOverview.generatedAt
                            ? dateTime(latestOverview.generatedAt)
                            : "не задано"}
                        </span>
                        <span>
                          Review: {dateTime(latestOverview.reviewRequestedAt)}
                        </span>
                        <span>
                          Approved: {dateTime(latestOverview.approvedAt)}
                        </span>
                        <span>
                          Published:{" "}
                          {latestOverview.publishedAt
                            ? dateTime(latestOverview.publishedAt)
                            : "not published"}
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
                          Send to PM review
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOverviewStatus("APPROVED")}
                          disabled={
                            latestOverview.status === "APPROVED" ||
                            latestOverview.status === "PUBLISHED"
                          }
                        >
                          Approve
                        </button>
                        {latestOverview.approvedBy && (
                          <span>Approved by {latestOverview.approvedBy}</span>
                        )}
                      </div>
                      <p className="overview-summary">
                        {latestOverview.executiveSummary}
                      </p>
                      <section className="overview-pack">
                        <h3>Executive KPI</h3>
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
                        <h3>Quality gates</h3>
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
                              <span>Approve: {decision.impactIfApproved}</span>
                              <span>Delay: {decision.impactIfDelayed}</span>
                              {decision.source && (
                                <span>Source: {decision.source}</span>
                              )}
                            </div>
                          ))}
                        </section>
                        <section>
                          <h3>Top risks / issues</h3>
                          <div className="overview-list">
                            {(latestOverview.risks ?? []).length === 0 && (
                              <p>Ключевые риски и issues не зафиксированы.</p>
                            )}
                            {(latestOverview.risks ?? []).map((risk) => (
                              <div className="risk-line" key={risk.title}>
                                <strong>{risk.title}</strong>
                                <span>
                                  {risk.severity} / {risk.owner} /{" "}
                                  {risk.dueDate ? date(risk.dueDate) : "no due"}
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
                          <h3>Next actions</h3>
                          <div className="overview-list">
                            {(latestOverview.nextSteps ?? []).length === 0 && (
                              <p>Следующие действия не сформированы.</p>
                            )}
                            {(latestOverview.nextSteps ?? []).map((step) => (
                              <div className="action-line" key={step.title}>
                                <strong>{step.title}</strong>
                                <span>
                                  {step.owner} /{" "}
                                  {step.dueDate ? date(step.dueDate) : "no due"}
                                </span>
                                <small>{step.source}</small>
                              </div>
                            ))}
                          </div>
                        </section>
                        <section>
                          <h3>Evidence</h3>
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
                          <h3>Version history</h3>
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
                      Нажмите Generate new version, чтобы собрать первый
                      overview из health, бюджета, Jira snapshot и Open Issues
                      List.
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
