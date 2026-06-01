import {
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
  Archive,
  Trash2,
  FileArchive,
  FileText,
  HeartPulse,
  FolderTree,
  GanttChartSquare,
  GitBranch,
  HardDriveDownload,
  Import,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { labels } from "@pms/shared";
import { ApiError, apiClient } from "./api/client";
import {
  MILESTONE_SNAKE_HEIGHT,
  MILESTONE_SNAKE_WIDTH,
  sampleMilestoneSnakePath,
} from "./milestoneSnakePath";
import { PageBoundary } from "./pages";
import {
  inferWbsScheduleDriver,
  type WbsScheduleDriver,
} from "./wbsScheduleDriver";
import { shouldApplyProjectSnapshotAfterWbsSave } from "./wbsProjectLoadGuard";
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
  | "project-changes"
  | "project-resources"
  | "project-budget"
  | "project-calendars"
  | "project-artifacts"
  | "closed-projects"
  | "admin"
  | "admin-users"
  | "admin-roles"
  | "admin-dictionaries"
  | "admin-templates"
  | "admin-rag"
  | "admin-workflows"
  | "admin-jira"
  | "admin-integrations"
  | "admin-health"
  | "admin-backups"
  | "admin-config"
  | "admin-projects"
  | "admin-modules"
  | "admin-audit";
type ProjectSectionView = Extract<
  AppView,
  | "project-overview"
  | "project-passport"
  | "project-structure"
  | "project-gantt"
  | "project-issues"
  | "project-raid"
  | "project-changes"
  | "project-resources"
  | "project-budget"
  | "project-calendars"
  | "project-artifacts"
>;
type AdminSectionView = Extract<
  AppView,
  | "admin"
  | "admin-users"
  | "admin-roles"
  | "admin-dictionaries"
  | "admin-templates"
  | "admin-rag"
  | "admin-workflows"
  | "admin-jira"
  | "admin-integrations"
  | "admin-health"
  | "admin-backups"
  | "admin-config"
  | "admin-projects"
  | "admin-modules"
  | "admin-audit"
>;
type FullscreenWorkspaceView = Extract<
  AppView,
  "project-structure" | "project-gantt"
> | "overview-milestones-by-phase" | "overview-milestones-all";

type AuthMode = "checking" | "setup" | "login" | "ready";
const adminSectionViews: AdminSectionView[] = [
  "admin",
  "admin-users",
  "admin-roles",
  "admin-dictionaries",
  "admin-templates",
  "admin-rag",
  "admin-workflows",
  "admin-jira",
  "admin-integrations",
  "admin-health",
  "admin-backups",
  "admin-config",
  "admin-projects",
  "admin-modules",
  "admin-audit",
];
const writeProtectedViews = new Set<AppView>([
  "project-create",
  ...adminSectionViews,
]);
type UserRole =
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "TEAM_MEMBER"
  | "EXECUTIVE_VIEWER";

type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
};

type SystemUser = CurrentUser & {
  createdAt: string;
  updatedAt: string;
  hasPassword: boolean;
};

type AuditEvent = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  projectId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  metadata: unknown;
  createdAt: string;
};

type RolePermission = {
  id: string;
  role: UserRole;
  permission: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type DictionaryItem = {
  id: string;
  dictionary: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SystemSetting = {
  key: string;
  value: string;
  isSecret: boolean;
  hasValue: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminHealth = {
  ok: boolean;
  database: string;
  databaseLatencyMs: number;
  jiraConfigured: boolean;
  uptimeSeconds: number;
  startedAt: string;
  nodeEnv: string;
};

type BackupStatus = {
  ok: boolean;
  backupDir: string;
  retentionDays: number;
  totalBackups: number;
  latestBackup: {
    file: string;
    path: string;
    sizeBytes: number;
    updatedAt: string;
  } | null;
  latestChecksum: string | null;
  message: string;
};

type AdminConfig = {
  rolePermissions: RolePermission[];
  dictionaryItems: DictionaryItem[];
  systemSettings: SystemSetting[];
  projectModules: ProjectModule[];
  managedPermissions: string[];
  health: AdminHealth;
  backupStatus: BackupStatus;
};

type ProjectModuleKey =
  | "overview"
  | "passport"
  | "structure"
  | "gantt"
  | "issues"
  | "raid"
  | "changes"
  | "resources"
  | "budget"
  | "calendars"
  | "artifacts";

type ProjectModule = {
  key: ProjectModuleKey;
  label: string;
  description: string;
  route: string;
  enabled: boolean;
};

type SearchResult = {
  type: string;
  id: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  title: string;
  subtitle: string;
  url: string;
  updatedAt: string;
};

type SavedView = {
  id: string;
  ownerId: string | null;
  projectId: string | null;
  viewType: string;
  name: string;
  config: Record<string, unknown>;
  isShared: boolean;
  sortOrder: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiTokenInfo = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  isActive: boolean;
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  token?: string;
};

type WebhookEndpointInfo = {
  id: string;
  name: string;
  url: string;
  hasSecret: boolean;
  events: string[];
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

type WebhookDeliveryInfo = {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  attemptedAt: string | null;
  createdAt: string;
  endpoint?: { name: string };
};

type AdminIntegrations = {
  apiTokens: ApiTokenInfo[];
  webhookEndpoints: WebhookEndpointInfo[];
  webhookDeliveries: WebhookDeliveryInfo[];
  integrationSettings: SystemSetting[];
};

type ApiTokenDraft = {
  name: string;
  scopes: string;
  rateLimitPerMinute: string;
  expiresAt: string;
};

type WebhookDraft = {
  name: string;
  url: string;
  events: string;
  secret: string;
  isActive: boolean;
};

type AuthFormState = {
  email: string;
  name: string;
  password: string;
};

type UserFormState = {
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

type UserDraftState = {
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

type DictionaryItemDraft = {
  dictionary: string;
  code: string;
  label: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type SystemSettingsDraft = {
  jiraEnabled: boolean;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraMaxResults: string;
  gitlabEnabled: boolean;
  gitlabBaseUrl: string;
  gitlabToken: string;
  githubEnabled: boolean;
  githubBaseUrl: string;
  githubToken: string;
  azureDevOpsEnabled: boolean;
  azureDevOpsOrganizationUrl: string;
  azureDevOpsToken: string;
  biEnabled: boolean;
  biExportUrl: string;
  ragGreenFormula: string;
  ragAmberFormula: string;
  ragRedFormula: string;
  overviewWorkflow: string;
  baselineWorkflow: string;
  projectCloseWorkflow: string;
  wbsTemplates: string;
};

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
  closedIssues?: Issue[];
  jiraSnapshots: JiraIssueSnapshot[];
  overviews: ExecutiveOverview[];
  milestones: Milestone[];
  wbsItems: WbsItem[];
  wbsDependencies: WbsDependency[];
  criticalPath: WbsCriticalPath | null;
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
  wbsSort?: WbsSortState | null;
  ganttPanelHeight?: number;
  ganttPanelWidth?: number;
  ganttWbsWidth?: number;
  passportRows?: PassportRow[];
};

type EditableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isEditableElement(value: EventTarget | null): value is EditableElement {
  return (
    value instanceof HTMLInputElement ||
    value instanceof HTMLSelectElement ||
    value instanceof HTMLTextAreaElement
  );
}

type ProjectFormState = {
  parentId: string;
  copyBaselineFromProjectId: string;
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
  closedAt: string | null;
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

type WbsCriticalPathItem = {
  itemId: string;
  code: string;
  title: string;
  earlyStartDate: string;
  earlyFinishDate: string;
  lateStartDate: string;
  lateFinishDate: string;
  totalFloatWorkDays: number;
  isCritical: boolean;
  isNearCritical: boolean;
};

type WbsCriticalPath = {
  projectStartDate: string | null;
  projectFinishDate: string | null;
  criticalItemIds: string[];
  criticalDependencyIds: string[];
  criticalItemCount: number;
  nearCriticalItemCount: number;
  warnings: string[];
  items: WbsCriticalPathItem[];
};

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

type WbsSnapshotResponse = {
  item?: WbsItem;
  updatedCount?: number;
  wbsItems?: WbsItem[];
  wbsDependencies?: WbsDependency[];
  criticalPath?: WbsCriticalPath | null;
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

type RaidItemStatusUpdate = {
  id: string;
  raidItemId: string;
  statusAt: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

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
  statusUpdates: RaidItemStatusUpdate[];
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

type IssueStatusUpdate = {
  id: string;
  issueId: string;
  statusAt: string;
  text: string;
  createdAt: string;
  updatedAt: string;
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
  closedDelayDays: number | null;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  jiraLinks: IssueJiraLink[];
  statusUpdates: IssueStatusUpdate[];
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

type MilestonePointStyle = CSSProperties & {
  "--milestone-label-level": number;
  "--milestone-label-shift": string;
  "--milestone-connector-angle": string;
};

type MilestoneTone = "green" | "blue" | "red" | "gray";

type MilestoneState = {
  label: string;
  tone: MilestoneTone;
};

type StructureMilestone = {
  milestone: WbsItem;
  calendarDaysLeft: number | null;
  workDaysLeft: number | null;
  state: MilestoneState;
};

type MilestoneTimelineItem = StructureMilestone & {
  offset: number;
  side: "top" | "bottom";
  level: number;
  labelShiftPx: number;
};

type MilestoneTimelineLane = {
  id: string;
  code: string;
  title: string;
  items: MilestoneTimelineItem[];
};

type MilestoneTimelineModel = {
  lanes: MilestoneTimelineLane[];
  startDate: string;
  endDate: string;
  trackWidth: number;
  laneHeight: number;
  todayOffset: number | null;
  hasMilestonesOutsideRange: boolean;
};

type MilestoneSnakePoint = {
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
};

type MilestoneSnakeLabel = {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  connectorX: number;
  connectorY: number;
  dateY: number;
};

type MilestoneSnakeLayout = {
  entry: MilestoneTimelineItem;
  point: MilestoneSnakePoint;
  label: MilestoneSnakeLabel;
  lines: string[];
};

type MilestoneSnakePointLayout = {
  entry: MilestoneTimelineItem;
  point: MilestoneSnakePoint;
};

const WBS_LEVEL_MIN_WIDTH = 128;
const GANTT_PANEL_HEIGHT_DEFAULT = 456;
const GANTT_PANEL_WIDTH_DEFAULT = 0;
const GANTT_SCALE_WIDTH: Record<GanttScale, number> = {
  month: 120,
  quarter: 72,
};
const GANTT_HIERARCHY_LEVELS = [1, 2, 3, 4, 5] as const;
const GANTT_PANEL_WIDTH_MIN = 760;
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

const defaultProjectModules: ProjectModule[] = [
  {
    key: "overview",
    label: "Обзор и вехи",
    description: "Executive Overview, ключевые риски, решения и вехи проекта",
    route: "overview",
    enabled: true,
  },
  {
    key: "passport",
    label: "Паспорт проекта",
    description: "Редактируемые атрибуты паспорта проекта",
    route: "passport",
    enabled: true,
  },
  {
    key: "structure",
    label: "Структура",
    description: "Иерархия работ проекта, сроки, исполнители и предшественники",
    route: "wbs",
    enabled: true,
  },
  {
    key: "gantt",
    label: "Гантт",
    description: "Временная шкала, связи, базовый план и критический путь",
    route: "gantt",
    enabled: true,
  },
  {
    key: "issues",
    label: "Открытые вопросы",
    description: "Открытые и закрытые вопросы проекта с Jira-связями",
    route: "issues",
    enabled: true,
  },
  {
    key: "raid",
    label: "Риски и проблемы",
    description: "Риски, проблемы и допущения проекта",
    route: "risks",
    enabled: true,
  },
  {
    key: "changes",
    label: "Управление изменениями",
    description: "Запросы на изменение scope, сроков и управленческих решений",
    route: "changes",
    enabled: true,
  },
  {
    key: "resources",
    label: "Управление ресурсами",
    description: "Загрузка команды, исполнители и распределение работ",
    route: "resources",
    enabled: true,
  },
  {
    key: "budget",
    label: "Управление бюджетом",
    description: "Контур план-факт-прогноз бюджета проекта",
    route: "budget",
    enabled: true,
  },
  {
    key: "calendars",
    label: "Календари",
    description: "RU и CN производственные календари проекта",
    route: "calendars",
    enabled: true,
  },
  {
    key: "artifacts",
    label: "Артефакты проекта",
    description: "Управленческие артефакты и ссылки на документы",
    route: "artifacts",
    enabled: true,
  },
];

const projectModuleKeyByView: Record<ProjectSectionView, ProjectModuleKey> = {
  "project-overview": "overview",
  "project-passport": "passport",
  "project-structure": "structure",
  "project-gantt": "gantt",
  "project-issues": "issues",
  "project-raid": "raid",
  "project-changes": "changes",
  "project-resources": "resources",
  "project-budget": "budget",
  "project-calendars": "calendars",
  "project-artifacts": "artifacts",
};

const projectModuleViewByKey: Record<ProjectModuleKey, ProjectSectionView> = {
  overview: "project-overview",
  passport: "project-passport",
  structure: "project-structure",
  gantt: "project-gantt",
  issues: "project-issues",
  raid: "project-raid",
  changes: "project-changes",
  resources: "project-resources",
  budget: "project-budget",
  calendars: "project-calendars",
  artifacts: "project-artifacts",
};

function normalizeProjectModulesForUi(modules: ProjectModule[] = defaultProjectModules) {
  const byKey = new Map(modules.map((module) => [module.key, module]));
  return defaultProjectModules.map((module) => {
    const current = byKey.get(module.key);
    return {
      ...module,
      ...current,
      key: module.key,
      label: current?.label || module.label,
      description: current?.description || module.description,
      route: current?.route || module.route,
      enabled: current?.enabled ?? module.enabled,
    };
  });
}

function projectModulesToDraft(modules: ProjectModule[]) {
  return normalizeProjectModulesForUi(modules).reduce(
    (draft, module) => {
      draft[module.key] = module.enabled;
      return draft;
    },
    {} as Record<ProjectModuleKey, boolean>,
  );
}

const projectSectionSlugs: Record<ProjectSectionView, string> = {
  "project-overview": "overview",
  "project-passport": "passport",
  "project-structure": "wbs",
  "project-gantt": "gantt",
  "project-issues": "issues",
  "project-raid": "risks",
  "project-changes": "changes",
  "project-resources": "resources",
  "project-budget": "budget",
  "project-calendars": "calendars",
  "project-artifacts": "artifacts",
};

const appViewPaths: Record<AppView, string> = {
  portfolio: "/portfolio",
  "project-create": "/new-project",
  "project-overview": "/overview",
  "project-passport": "/passport",
  "project-structure": "/wbs",
  "project-gantt": "/gantt",
  "project-issues": "/issues",
  "project-raid": "/risks",
  "project-changes": "/changes",
  "project-resources": "/resources",
  "project-budget": "/budget",
  "project-calendars": "/calendars",
  "project-artifacts": "/artifacts",
  "closed-projects": "/closed-projects",
  admin: "/admin",
  "admin-users": "/admin/users",
  "admin-roles": "/admin/roles",
  "admin-dictionaries": "/admin/dictionaries",
  "admin-templates": "/admin/templates",
  "admin-rag": "/admin/rag",
  "admin-workflows": "/admin/workflows",
  "admin-jira": "/admin/jira",
  "admin-integrations": "/admin/integrations",
  "admin-health": "/admin/health",
  "admin-backups": "/admin/backups",
  "admin-config": "/admin/config",
  "admin-projects": "/admin/projects",
  "admin-modules": "/admin/modules",
  "admin-audit": "/admin/audit",
};

const projectPathViews: Record<string, ProjectSectionView> = {
  overview: "project-overview",
  passport: "project-passport",
  wbs: "project-structure",
  structure: "project-structure",
  gantt: "project-gantt",
  issues: "project-issues",
  "open-issues": "project-issues",
  risks: "project-raid",
  raid: "project-raid",
  changes: "project-changes",
  resources: "project-resources",
  budget: "project-budget",
  calendars: "project-calendars",
  calendar: "project-calendars",
  artifacts: "project-artifacts",
};

const appPathViews: Record<string, AppView> = {
  "/": "portfolio",
  "/portfolio": "portfolio",
  "/projects": "portfolio",
  "/new-project": "project-create",
  "/create-project": "project-create",
  "/overview": "project-overview",
  "/passport": "project-passport",
  "/wbs": "project-structure",
  "/structure": "project-structure",
  "/gantt": "project-gantt",
  "/issues": "project-issues",
  "/open-issues": "project-issues",
  "/risks": "project-raid",
  "/raid": "project-raid",
  "/changes": "project-changes",
  "/resources": "project-resources",
  "/budget": "project-budget",
  "/calendars": "project-calendars",
  "/calendar": "project-calendars",
  "/artifacts": "project-artifacts",
  "/closed-projects": "closed-projects",
  "/closed": "closed-projects",
  "/admin": "admin-projects",
  "/admin/users": "admin-users",
  "/admin/roles": "admin-roles",
  "/admin/dictionaries": "admin-dictionaries",
  "/admin/templates": "admin-templates",
  "/admin/rag": "admin-rag",
  "/admin/workflows": "admin-workflows",
  "/admin/jira": "admin-jira",
  "/admin/integrations": "admin-integrations",
  "/admin/health": "admin-health",
  "/admin/backups": "admin-backups",
  "/admin/config": "admin-config",
  "/admin/projects": "admin-projects",
  "/admin/modules": "admin-modules",
  "/admin/audit": "admin-audit",
};

function normalizeAppPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.toLowerCase();
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function appRouteFromPath(pathname: string) {
  const legacyView = appPathViews[normalizeAppPath(pathname)];
  if (legacyView) {
    return { view: legacyView, projectCode: null as string | null };
  }

  const segments = pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map(decodePathSegment);
  const [projectCode, section] = segments;
  const projectView = projectPathViews[section?.toLowerCase() ?? ""];
  if (projectCode && projectView) {
    return { view: projectView, projectCode };
  }

  return { view: "portfolio" as AppView, projectCode: null as string | null };
}

function appViewFromPath(pathname: string): AppView {
  return appRouteFromPath(pathname).view;
}

function isProjectSectionViewName(view: AppView): view is ProjectSectionView {
  return view in projectSectionSlugs;
}

function isAdminSectionViewName(view: AppView): view is AdminSectionView {
  return adminSectionViews.includes(view as AdminSectionView);
}

function appPathForView(view: AppView, projectCode?: string | null) {
  if (isProjectSectionViewName(view)) {
    const slug = projectSectionSlugs[view];
    return projectCode ? `/${encodeURIComponent(projectCode)}/${slug}` : `/${slug}`;
  }
  return appViewPaths[view] ?? "/portfolio";
}

function normalizeProjectRouteCode(value: string) {
  return value.trim().toLowerCase();
}

function initialAppView(): AppView {
  if (typeof window === "undefined") return "portfolio";
  return appViewFromPath(window.location.pathname);
}

function initialRouteProjectCode() {
  if (typeof window === "undefined") return null;
  return appRouteFromPath(window.location.pathname).projectCode;
}

async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const method = (init.method ?? "GET").toUpperCase();
  if (
    response.status === 401 &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    window.dispatchEvent(new CustomEvent("pms-auth-required"));
  }
  return response;
}

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
  copyBaselineFromProjectId: "",
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
  { key: "jiraTicketUrl", label: "Jira URL", width: 240 },
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
  "jiraTicketUrl",
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
  jiraTicketUrl: ["jiraTicketUrl"],
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

const JIRA_BLOCKING_TICKET_PLACEHOLDER = [
  {
    key: "STAROS-39855",
    summary: "[cvte968] Падает StarOS на старте",
    assignee: "Белобров Андрей Петрович",
    checked: true,
  },
  {
    key: "SDFW-11625",
    summary: "Скомпилировать и запустить CPCD и ZigbeeD",
    assignee: "Саломатов Павел Александрович",
    checked: true,
  },
  {
    key: "QATASK-15504",
    summary: "Провести регрессионное тестирование на имеющейся плате 968",
    assignee: "Иванов Артем Николаевич",
    checked: true,
  },
  {
    key: "CVTE-1479",
    summary: "[cvte968] FarField isn't working.",
    assignee: "Dacio Dai",
    checked: false,
  },
  {
    key: "CVTE-1474",
    summary: "[cvte968] Errors in logs",
    assignee: "Dacio Dai",
    checked: false,
  },
  {
    key: "CVTE-1467",
    summary: "codec issues on 968 board",
    assignee: "Dacio Dai",
    checked: false,
  },
] as const;

type WbsTableColumnKey = (typeof WBS_TABLE_COLUMNS)[number]["key"];
type WbsTableColumn = (typeof WBS_TABLE_COLUMNS)[number];
type WbsSortDirection = "asc" | "desc";
type WbsSortState = {
  columnKey: WbsTableColumnKey;
  direction: WbsSortDirection;
};

const WBS_SORT_COLLATOR = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});

function normalizeWbsSort(sort?: unknown): WbsSortState | null {
  if (!sort || typeof sort !== "object") return null;
  const candidate = sort as Partial<WbsSortState>;
  const knownKeys = new Set(WBS_TABLE_COLUMNS.map((column) => column.key));
  if (
    !candidate.columnKey ||
    !knownKeys.has(candidate.columnKey) ||
    (candidate.direction !== "asc" && candidate.direction !== "desc")
  ) {
    return null;
  }
  return {
    columnKey: candidate.columnKey,
    direction: candidate.direction,
  };
}

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

function sortableNumberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortableDateValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortableTextValue(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareWbsSortValues(
  left: string | number | null,
  right: string | number | null,
) {
  const leftEmpty = left === null || left === "";
  const rightEmpty = right === null || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return WBS_SORT_COLLATOR.compare(String(left), String(right));
}

function wbsSortValue(
  columnKey: WbsTableColumnKey,
  item: WbsTreeItem,
  draft?: WbsFormState,
): string | number | null {
  switch (columnKey) {
    case "level":
      return sortableNumberValue(draft?.wbsLevel ?? item.wbsLevel ?? item.level + 1);
    case "structure":
      return sortableTextValue(draft?.title ?? item.title);
    case "type":
      return sortableTextValue(wbsTypeLabel((draft?.type ?? item.type) as WbsItemType));
    case "status":
      return sortableTextValue(wbsStatusLabel((draft?.status ?? item.status) as WbsItemStatus));
    case "owner":
      return sortableTextValue(draft?.owner ?? item.owner);
    case "start":
      return sortableDateValue(draft?.startDate ?? item.startDate);
    case "due":
      return sortableDateValue(draft?.dueDate ?? item.dueDate);
    case "workDays":
      return sortableNumberValue(draft?.workDays ?? item.workDays);
    case "calendarDays":
      return sortableNumberValue(draft?.calendarDays ?? item.calendarDays);
    case "calendar":
      return sortableTextValue(draft?.calendarCode ?? item.calendarCode);
    case "progress":
      return sortableNumberValue(draft?.progress ?? item.progress);
    case "jiraTicketUrl":
      return sortableTextValue(draft?.jiraTicketUrl ?? item.jiraTicketUrl ?? item.jiraTicketKey);
    case "predecessor1":
      return sortableTextValue(draft?.predecessor1 ?? item.predecessor1);
    case "predecessor2":
      return sortableTextValue(draft?.predecessor2 ?? item.predecessor2);
    case "predecessor3":
      return sortableTextValue(draft?.predecessor3 ?? item.predecessor3);
    case "predecessor4":
      return sortableTextValue(draft?.predecessor4 ?? item.predecessor4);
    case "predecessor5":
      return sortableTextValue(draft?.predecessor5 ?? item.predecessor5);
    case "predecessor6":
      return sortableTextValue(draft?.predecessor6 ?? item.predecessor6);
    case "leadLag":
      return sortableNumberValue(draft?.leadLagDays ?? item.leadLagDays);
    default:
      return null;
  }
}

function compareWbsItemsForSort(
  left: WbsTreeItem,
  right: WbsTreeItem,
  drafts: Record<string, WbsFormState>,
  sort: WbsSortState,
) {
  const sorted =
    compareWbsSortValues(
      wbsSortValue(sort.columnKey, left, drafts[left.id]),
      wbsSortValue(sort.columnKey, right, drafts[right.id]),
    ) * (sort.direction === "asc" ? 1 : -1);
  if (sorted !== 0) return sorted;
  const orderDiff = left.sortOrder - right.sortOrder;
  if (orderDiff !== 0) return orderDiff;
  return WBS_SORT_COLLATOR.compare(left.code, right.code);
}

function sortWbsTreeForDisplay(
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
  sort: WbsSortState | null,
) {
  if (!sort) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const roots = items.filter(
    (item) => !item.parentId || !byId.has(item.parentId),
  );

  const flattenSorted = (nodes: WbsTreeItem[], level = 0): WbsTreeItem[] =>
    [...nodes]
      .sort((left, right) => compareWbsItemsForSort(left, right, drafts, sort))
      .flatMap((node) => {
        const sortedChildren = flattenSorted(node.children, level + 1);
        const directChildren = sortedChildren.filter(
          (child) => child.parentId === node.id,
        );
        return [
          {
            ...node,
            level,
            children: directChildren,
          },
          ...sortedChildren,
        ];
      });

  return flattenSorted(roots);
}

const GANTT_ROW_HEIGHT = 36;
const GANTT_LINK_STUB_PERCENT = 1.15;
const GANTT_LINK_DETOUR_PERCENT = 2.6;
const GANTT_LINK_ENDPOINT_GAP_PERCENT = 0.12;
const GANTT_LINK_RADIUS_X = 0.42;
const GANTT_LINK_RADIUS_Y = 7;

type GanttDependencyPathInput = {
  fromSide: "start" | "end";
  fromX: number;
  fromY: number;
  toSide: "start" | "end";
  toX: number;
  toY: number;
};

type GanttDependencyPathPoint = {
  x: number;
  y: number;
};

function ganttPathNumber(value: number) {
  return Number(value.toFixed(2));
}

function ganttPathDirection(side: "start" | "end") {
  return side === "end" ? 1 : -1;
}

function ganttTargetDirection(side: "start" | "end") {
  return side === "start" ? 1 : -1;
}

function pushGanttPathPoint(
  points: GanttDependencyPathPoint[],
  x: number,
  y: number,
) {
  const next = { x: ganttPathNumber(x), y: ganttPathNumber(y) };
  const previous = points.at(-1);
  if (previous && previous.x === next.x && previous.y === next.y) return;
  points.push(next);
}

function ganttTargetRowBoundary(fromY: number, toY: number) {
  const targetRow = Math.max(0, Math.floor(toY / GANTT_ROW_HEIGHT));
  return toY > fromY
    ? targetRow * GANTT_ROW_HEIGHT
    : (targetRow + 1) * GANTT_ROW_HEIGHT;
}

function ganttDependencyPathPoints(line: GanttDependencyPathInput) {
  const sourceDirection = ganttPathDirection(line.fromSide);
  const targetDirection = ganttTargetDirection(line.toSide);
  const sourceStubX = clampNumber(
    line.fromX + sourceDirection * GANTT_LINK_STUB_PERCENT,
    0,
    100,
  );
  const targetStubX = clampNumber(
    line.toX - targetDirection * GANTT_LINK_STUB_PERCENT,
    0,
    100,
  );
  const hasForwardClearance =
    sourceDirection === targetDirection &&
    (targetStubX - sourceStubX) * sourceDirection >=
      GANTT_LINK_STUB_PERCENT * 0.7;
  const sameRow = Math.abs(line.toY - line.fromY) < 1;
  const points: GanttDependencyPathPoint[] = [];
  const targetBoundaryY = sameRow
    ? line.toY
    : ganttTargetRowBoundary(line.fromY, line.toY);

  pushGanttPathPoint(points, line.fromX, line.fromY);
  pushGanttPathPoint(points, sourceStubX, line.fromY);

  if (hasForwardClearance && !sameRow) {
    const middleX = (sourceStubX + targetStubX) / 2;
    pushGanttPathPoint(points, middleX, line.fromY);
    pushGanttPathPoint(points, middleX, targetBoundaryY);
    pushGanttPathPoint(points, targetStubX, targetBoundaryY);
  } else if (hasForwardClearance && sameRow) {
    const laneY =
      line.fromY < GANTT_ROW_HEIGHT
        ? line.fromY + GANTT_ROW_HEIGHT * 0.52
        : line.fromY - GANTT_ROW_HEIGHT * 0.52;
    const middleX = (sourceStubX + targetStubX) / 2;
    pushGanttPathPoint(points, sourceStubX, laneY);
    pushGanttPathPoint(points, middleX, laneY);
    pushGanttPathPoint(points, targetStubX, laneY);
  } else if (sameRow) {
    const laneY =
      line.fromY < GANTT_ROW_HEIGHT
        ? line.fromY + GANTT_ROW_HEIGHT * 0.52
        : line.fromY - GANTT_ROW_HEIGHT * 0.52;
    const detourBase =
      sourceDirection > 0
        ? Math.max(line.fromX, line.toX)
        : Math.min(line.fromX, line.toX);
    const detourX = clampNumber(
      detourBase + sourceDirection * GANTT_LINK_DETOUR_PERCENT,
      0.4,
      99.6,
    );
    pushGanttPathPoint(points, sourceStubX, laneY);
    pushGanttPathPoint(points, detourX, laneY);
    pushGanttPathPoint(points, targetStubX, laneY);
  } else {
    const detourBase =
      sourceDirection > 0
        ? Math.max(line.fromX, line.toX)
        : Math.min(line.fromX, line.toX);
    const detourX = clampNumber(
      detourBase + sourceDirection * GANTT_LINK_DETOUR_PERCENT,
      0.4,
      99.6,
    );
    pushGanttPathPoint(points, detourX, line.fromY);
    pushGanttPathPoint(points, detourX, targetBoundaryY);
    pushGanttPathPoint(points, targetStubX, targetBoundaryY);
  }

  pushGanttPathPoint(points, targetStubX, line.toY);
  pushGanttPathPoint(points, line.toX, line.toY);

  return points;
}

function ganttRoundedDependencyPath(points: GanttDependencyPathPoint[]) {
  if (points.length < 2) return "";
  const path = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const previousHorizontal = previous.y === current.y;
    const nextHorizontal = next.y === current.y;

    if (previousHorizontal === nextHorizontal) {
      path.push(`L ${current.x} ${current.y}`);
      continue;
    }

    const previousDistance = previousHorizontal
      ? Math.abs(current.x - previous.x)
      : Math.abs(current.y - previous.y);
    const nextDistance = nextHorizontal
      ? Math.abs(next.x - current.x)
      : Math.abs(next.y - current.y);
    const beforeRadius = Math.min(
      previousHorizontal ? GANTT_LINK_RADIUS_X : GANTT_LINK_RADIUS_Y,
      previousDistance / 2,
    );
    const afterRadius = Math.min(
      nextHorizontal ? GANTT_LINK_RADIUS_X : GANTT_LINK_RADIUS_Y,
      nextDistance / 2,
    );
    const before = {
      x: previousHorizontal
        ? current.x - Math.sign(current.x - previous.x) * beforeRadius
        : current.x,
      y: previousHorizontal
        ? current.y
        : current.y - Math.sign(current.y - previous.y) * beforeRadius,
    };
    const after = {
      x: nextHorizontal
        ? current.x + Math.sign(next.x - current.x) * afterRadius
        : current.x,
      y: nextHorizontal
        ? current.y
        : current.y + Math.sign(next.y - current.y) * afterRadius,
    };

    path.push(`L ${ganttPathNumber(before.x)} ${ganttPathNumber(before.y)}`);
    path.push(
      `Q ${current.x} ${current.y} ${ganttPathNumber(after.x)} ${ganttPathNumber(after.y)}`,
    );
  }

  const last = points.at(-1);
  if (last) path.push(`L ${last.x} ${last.y}`);
  return path.join(" ");
}

function ganttDependencyPath(line: GanttDependencyPathInput) {
  return ganttRoundedDependencyPath(ganttDependencyPathPoints(line));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ganttPanelWidthBounds(panel: Element | null) {
  const parentWidth = panel?.parentElement?.getBoundingClientRect().width;
  const viewportWidth =
    typeof window === "undefined" ? undefined : window.innerWidth - 36;
  const availableWidth = Math.max(
    320,
    Math.floor(parentWidth ?? viewportWidth ?? 1200),
  );

  return {
    max: availableWidth,
    min: Math.min(GANTT_PANEL_WIDTH_MIN, availableWidth),
  };
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

function latestRaidStatusUpdate(item: RaidItem) {
  return [...(item.statusUpdates ?? [])].sort((left, right) => {
    const statusDelta =
      new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime();
    if (statusDelta !== 0) return statusDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
}

function latestIssueStatusUpdate(issue: Issue) {
  return [...(issue.statusUpdates ?? [])].sort((left, right) => {
    const statusDelta =
      new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime();
    if (statusDelta !== 0) return statusDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
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

const emptyAuthForm: AuthFormState = {
  email: "",
  name: "",
  password: "",
};

const emptyUserForm: UserFormState = {
  email: "",
  name: "",
  role: "PROJECT_MANAGER",
  isActive: true,
  password: "",
};

const emptyDictionaryDraft: DictionaryItemDraft = {
  dictionary: "wbs_type",
  code: "",
  label: "",
  description: "",
  sortOrder: "0",
  isActive: true,
};

const emptySystemSettingsDraft: SystemSettingsDraft = {
  jiraEnabled: false,
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  jiraMaxResults: "100",
  gitlabEnabled: false,
  gitlabBaseUrl: "",
  gitlabToken: "",
  githubEnabled: false,
  githubBaseUrl: "https://api.github.com",
  githubToken: "",
  azureDevOpsEnabled: false,
  azureDevOpsOrganizationUrl: "",
  azureDevOpsToken: "",
  biEnabled: false,
  biExportUrl: "",
  ragGreenFormula: "",
  ragAmberFormula: "",
  ragRedFormula: "",
  overviewWorkflow: "",
  baselineWorkflow: "",
  projectCloseWorkflow: "",
  wbsTemplates: "",
};

const adminPermissionOrder = [
  "project.read",
  "project.create",
  "project.update",
  "project.close",
  "project.delete",
  "wbs.read",
  "wbs.create",
  "wbs.update",
  "wbs.delete",
  "wbs.move",
  "wbs.baseline",
  "wbs.dependency",
  "issue.read",
  "issue.create",
  "issue.update",
  "issue.close",
  "issue.delete",
  "raid.read",
  "raid.create",
  "raid.update",
  "raid.close",
  "raid.delete",
  "overview.generate",
  "overview.publish",
  "overview.export",
  "admin.users",
  "admin.roles",
  "admin.dictionaries",
  "admin.templates",
  "admin.rag",
  "admin.workflow",
  "admin.jira",
  "admin.health",
  "admin.backup",
  "admin.config",
  "admin.audit",
  "admin.integrations",
];

const adminDictionaryLabels: Record<string, string> = {
  project_status: "Статусы проектов",
  project_type: "Типы проектов",
  risk_type: "Типы рисков",
  wbs_type: "Типы Структуры",
  wbs_status: "Статусы Структуры",
  issue_severity: "Критичность открытых вопросов",
  raid_type: "Типы рисков и проблем",
  raid_status: "Статусы рисков и проблем",
};

function userRoleLabel(role: UserRole) {
  return labels.userRole[role] ?? role;
}

function adminPermissionLabel(permission: string) {
  const labelsByPermission: Record<string, string> = {
    "project.read": "Просмотр проектов",
    "project.create": "Создание проектов",
    "project.update": "Редактирование паспорта проекта",
    "project.close": "Закрытие проектов",
    "project.delete": "Удаление проектов",
    "wbs.read": "Просмотр Структуры",
    "wbs.create": "Создание строк Структуры",
    "wbs.update": "Редактирование Структуры",
    "wbs.delete": "Удаление строк Структуры",
    "wbs.move": "Перемещение строк Структуры",
    "wbs.baseline": "Фиксация базового плана",
    "wbs.dependency": "Связи Структуры и Гантта",
    "issue.read": "Просмотр открытых вопросов",
    "issue.create": "Создание открытых вопросов",
    "issue.update": "Редактирование открытых вопросов",
    "issue.close": "Закрытие открытых вопросов",
    "issue.delete": "Удаление открытых вопросов",
    "raid.read": "Просмотр рисков и проблем",
    "raid.create": "Создание рисков и проблем",
    "raid.update": "Редактирование рисков и проблем",
    "raid.close": "Закрытие рисков и проблем",
    "raid.delete": "Удаление рисков и проблем",
    "overview.generate": "Генерация обзора",
    "overview.publish": "Публикация обзора",
    "overview.export": "Экспорт обзора",
    "admin.users": "Пользователи",
    "admin.roles": "Роли и права",
    "admin.dictionaries": "Справочники",
    "admin.templates": "Шаблоны Структуры",
    "admin.rag": "Формулы RAG",
    "admin.workflow": "Workflow согласований",
    "admin.jira": "Настройки Jira",
    "admin.health": "System health",
    "admin.backup": "Backup/restore status",
    "admin.config": "Import/export конфигурации",
    "admin.audit": "Журнал аудита",
    "admin.integrations": "Интеграции и API",
  };
  return labelsByPermission[permission] ?? permission;
}

function dictionaryLabel(dictionary: string) {
  return adminDictionaryLabels[dictionary] ?? dictionary;
}

function userToDraft(user: SystemUser): UserDraftState {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    password: "",
  };
}

function usersToDrafts(users: SystemUser[]) {
  return Object.fromEntries(users.map((user) => [user.id, userToDraft(user)]));
}

function dictionaryItemToDraft(item: DictionaryItem): DictionaryItemDraft {
  return {
    dictionary: item.dictionary,
    code: item.code,
    label: item.label,
    description: item.description ?? "",
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
  };
}

function dictionaryItemsToDrafts(items: DictionaryItem[]) {
  return Object.fromEntries(
    items.map((item) => [item.id, dictionaryItemToDraft(item)]),
  );
}

function systemSettingsToDraft(settings: SystemSetting[]): SystemSettingsDraft {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  return {
    jiraEnabled: byKey.get("jira.enabled")?.value === "true",
    jiraBaseUrl: byKey.get("jira.baseUrl")?.value ?? "",
    jiraEmail: byKey.get("jira.email")?.value ?? "",
    jiraApiToken: "",
    jiraMaxResults: byKey.get("jira.maxResults")?.value || "100",
    gitlabEnabled: byKey.get("gitlab.enabled")?.value === "true",
    gitlabBaseUrl: byKey.get("gitlab.baseUrl")?.value ?? "",
    gitlabToken: "",
    githubEnabled: byKey.get("github.enabled")?.value === "true",
    githubBaseUrl: byKey.get("github.baseUrl")?.value ?? "https://api.github.com",
    githubToken: "",
    azureDevOpsEnabled: byKey.get("azureDevOps.enabled")?.value === "true",
    azureDevOpsOrganizationUrl: byKey.get("azureDevOps.organizationUrl")?.value ?? "",
    azureDevOpsToken: "",
    biEnabled: byKey.get("bi.enabled")?.value === "true",
    biExportUrl: byKey.get("bi.exportUrl")?.value ?? "",
    ragGreenFormula: byKey.get("rag.formula.green")?.value ?? "",
    ragAmberFormula: byKey.get("rag.formula.amber")?.value ?? "",
    ragRedFormula: byKey.get("rag.formula.red")?.value ?? "",
    overviewWorkflow: byKey.get("workflow.overview")?.value ?? "",
    baselineWorkflow: byKey.get("workflow.baseline")?.value ?? "",
    projectCloseWorkflow: byKey.get("workflow.projectClose")?.value ?? "",
    wbsTemplates: byKey.get("wbs.templates")?.value ?? "",
  };
}

function systemSettingHasValue(settings: SystemSetting[], key: string) {
  return Boolean(settings.find((setting) => setting.key === key)?.hasValue);
}

function date(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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

function fileSize(value: number | null | undefined) {
  if (!value) return "0 Б";
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
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

function isHttpsUrl(value: string) {
  if (!value.trim()) return true;
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function projectOptionLabel(project: ProjectListItem) {
  return `${project.code} - ${project.name}`;
}

function auditActionLabel(action: string) {
  const labelsByAction: Record<string, string> = {
    "auth.bootstrap_admin": "Первичная настройка администратора",
    "auth.login": "Вход в систему",
    "auth.logout": "Выход из системы",
    "user.create": "Создание пользователя",
    "user.update": "Изменение пользователя",
    "user.password_change": "Смена пароля пользователя",
    "project.create": "Создание проекта",
    "project.update": "Изменение проекта",
    "project.close": "Закрытие проекта",
    "project.delete": "Удаление проекта",
    "overview.generate": "Генерация обзора",
    "overview.status": "Статус обзора",
    "overview.publish": "Публикация обзора",
    "admin.role_permission.update": "Изменение прав роли",
    "admin.dictionary.upsert": "Создание элемента справочника",
    "admin.dictionary.update": "Изменение элемента справочника",
    "admin.dictionary.deactivate": "Отключение элемента справочника",
    "admin.system_settings.update": "Изменение системных настроек",
  };
  return labelsByAction[action] ?? action;
}

function auditObjectLabel(event: AuditEvent) {
  if (event.objectType === "Project" && event.projectId) return "Проект";
  if (event.objectType === "User") return "Пользователь";
  if (event.objectType === "RolePermission") return "Право роли";
  if (event.objectType === "DictionaryItem") return "Справочник";
  if (event.objectType === "SystemSetting") return "Системные настройки";
  return event.objectType;
}

function projectStatusLabel(status: ProjectListItem["status"]) {
  return labels.projectStatus[status];
}

function projectHealthLabel(rag: RagStatus) {
  return labels.rag[rag];
}

function projectScheduleHealth(
  rag: RagStatus,
  scheduleVarianceDays: number,
) {
  if (scheduleVarianceDays > 10) {
    return {
      tone: "red" as const,
      label: `Отставание +${scheduleVarianceDays} дн.`,
    };
  }
  if (scheduleVarianceDays > 0) {
    return {
      tone: "amber" as const,
      label: `Отставание +${scheduleVarianceDays} дн.`,
    };
  }
  return {
    tone: rag.toLowerCase() as Lowercase<RagStatus>,
    label: projectHealthLabel(rag),
  };
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

function issuePrimaryJiraLink(issue: Issue) {
  const linkedIssue = issue.jiraTicketKey
    ? issue.jiraLinks.find((link) => link.jiraKey === issue.jiraTicketKey) ??
      issue.jiraLinks[0]
    : issue.jiraLinks[0];
  const key = issue.jiraTicketKey || linkedIssue?.jiraKey || "";
  const url = issue.jiraTicketUrl || linkedIssue?.jiraUrl || "";
  return { key, url };
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

function milestoneStateLabel(
  milestone: WbsItem,
  precedingTasks: WbsItem[],
): MilestoneState {
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

function splitPhaseTitle(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .reduce<string[]>((lines, word) => {
      const current = lines[lines.length - 1] ?? "";
      if (!current) return [word];
      if (`${current} ${word}`.length <= 12) {
        return [...lines.slice(0, -1), `${current} ${word}`];
      }
      return [...lines, word];
    }, [])
    .slice(0, 4);
}

function wrapText(value: string, maxLineLength: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  words.forEach((word) => {
    const current = lines[lines.length - 1] ?? "";
    if (!current) {
      lines.push(word);
      return;
    }
    if (`${current} ${word}`.length <= maxLineLength) {
      lines[lines.length - 1] = `${current} ${word}`;
      return;
    }
    if (lines.length < maxLines) {
      lines.push(word);
      return;
    }
    const lastLine = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] =
      lastLine.length > 0 ? `${lastLine.slice(0, Math.max(0, maxLineLength - 1))}…` : "…";
  });
  return lines.length > 0 ? lines : [value];
}

const MILESTONE_SNAKE_PATH_POINTS = sampleMilestoneSnakePath();
const MILESTONE_SNAKE_TOTAL_LENGTH =
  MILESTONE_SNAKE_PATH_POINTS[MILESTONE_SNAKE_PATH_POINTS.length - 1]
    ?.distance ?? 1;
const MILESTONE_SNAKE_PATH_D = MILESTONE_SNAKE_PATH_POINTS.map((point, index) =>
  `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
).join(" ");
const MILESTONE_SNAKE_START_PROGRESS = 0.018;
const MILESTONE_SNAKE_TODAY_PROGRESS = 0.3;
const MILESTONE_SNAKE_END_PROGRESS = 0.948;

function compressSnakeTimelineOffset(
  offset: number,
  todayOffset: number | null,
) {
  const boundedOffset = Math.max(0, Math.min(1, offset));
  const usableRange =
    MILESTONE_SNAKE_END_PROGRESS - MILESTONE_SNAKE_START_PROGRESS;

  if (
    todayOffset === null ||
    todayOffset <= 0 ||
    todayOffset >= 1 ||
    !Number.isFinite(todayOffset)
  ) {
    return MILESTONE_SNAKE_START_PROGRESS + boundedOffset * usableRange;
  }

  if (boundedOffset <= todayOffset) {
    const beforeTodayProgress = boundedOffset / todayOffset;
    return (
      MILESTONE_SNAKE_START_PROGRESS +
      beforeTodayProgress *
        (MILESTONE_SNAKE_TODAY_PROGRESS - MILESTONE_SNAKE_START_PROGRESS)
    );
  }

  const afterTodayProgress = (boundedOffset - todayOffset) / (1 - todayOffset);
  return (
    MILESTONE_SNAKE_TODAY_PROGRESS +
    afterTodayProgress *
      (MILESTONE_SNAKE_END_PROGRESS - MILESTONE_SNAKE_TODAY_PROGRESS)
  );
}

function interpolateSnakePoint(progress: number): MilestoneSnakePoint {
  const bounded = Math.max(0, Math.min(1, progress));
  const targetDistance = bounded * MILESTONE_SNAKE_TOTAL_LENGTH;
  const targetIndex = MILESTONE_SNAKE_PATH_POINTS.findIndex(
    (point) => point.distance >= targetDistance,
  );
  const nextIndex =
    targetIndex === -1 ? MILESTONE_SNAKE_PATH_POINTS.length - 1 : targetIndex;
  const previousIndex = Math.max(0, nextIndex - 1);
  const previous = MILESTONE_SNAKE_PATH_POINTS[previousIndex];
  const next = MILESTONE_SNAKE_PATH_POINTS[nextIndex];
  const localRange = Math.max(1, next.distance - previous.distance);
  const localProgress = (targetDistance - previous.distance) / localRange;
  const x = previous.x + (next.x - previous.x) * localProgress;
  const y = previous.y + (next.y - previous.y) * localProgress;
  const tangentLength = Math.max(1, Math.hypot(next.x - previous.x, next.y - previous.y));
  return {
    x,
    y,
    tangentX: (next.x - previous.x) / tangentLength,
    tangentY: (next.y - previous.y) / tangentLength,
  };
}

function rectOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const x = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x),
  );
  const y = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y),
  );
  return x * y;
}

function rectGap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const dx = Math.max(
    right.x - (left.x + left.width),
    left.x - (right.x + right.width),
    0,
  );
  const dy = Math.max(
    right.y - (left.y + left.height),
    left.y - (right.y + right.height),
    0,
  );
  return Math.hypot(dx, dy);
}

function snakeConnectorPoint(
  point: MilestoneSnakePoint,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
) {
  const nearestX = Math.max(boxX, Math.min(boxX + boxWidth, point.x));
  const nearestY = Math.max(boxY, Math.min(boxY + boxHeight, point.y));
  const distances = [
    { x: boxX, y: nearestY, value: Math.abs(point.x - boxX) },
    {
      x: boxX + boxWidth,
      y: nearestY,
      value: Math.abs(point.x - (boxX + boxWidth)),
    },
    { x: nearestX, y: boxY, value: Math.abs(point.y - boxY) },
    {
      x: nearestX,
      y: boxY + boxHeight,
      value: Math.abs(point.y - (boxY + boxHeight)),
    },
  ];
  return distances.sort((left, right) => left.value - right.value)[0];
}

function snakeLabelCandidates(point: MilestoneSnakePoint, title: string) {
  const compactTitle = title.length > 34;
  const sizes = compactTitle
    ? [
        { width: 126, maxLines: 4, preference: 8 },
        { width: 154, maxLines: 3, preference: 4 },
        { width: 190, maxLines: 2, preference: 0 },
      ]
    : [
        { width: 112, maxLines: 3, preference: 8 },
        { width: 136, maxLines: 2, preference: 4 },
        { width: 168, maxLines: 2, preference: 0 },
      ];
  const distances = [48, 84, 124, 170, 226, 288];
  const angles = [-165, -135, -105, -75, -45, -15, 15, 45, 75, 105, 135, 165, 0, 180];

  return sizes.flatMap((size) => {
    const maxLineLength = Math.max(10, Math.floor(size.width / 7.1));
    const lines = wrapText(title, maxLineLength, size.maxLines);
    const boxHeight = 32 + lines.length * 13;
    const makeCandidate = (
      unclampedX: number,
      unclampedY: number,
      preference: number,
    ) => {
      const boxX = Math.max(
        14,
        Math.min(MILESTONE_SNAKE_WIDTH - size.width - 14, unclampedX),
      );
      const boxY = Math.max(
        14,
        Math.min(MILESTONE_SNAKE_HEIGHT - boxHeight - 14, unclampedY),
      );
      const connector = snakeConnectorPoint(
        point,
        boxX,
        boxY,
        size.width,
        boxHeight,
      );
      return {
        label: {
          boxX,
          boxY,
          boxWidth: size.width,
          boxHeight,
          connectorX: connector.x,
          connectorY: connector.y,
          dateY: boxY + boxHeight - 10,
        },
        lines,
        clampPenalty:
          Math.abs(boxX - unclampedX) * 8 + Math.abs(boxY - unclampedY) * 8,
        preference: preference + size.preference,
      };
    };

    const radialCandidates = distances.flatMap((distance, distanceIndex) =>
      angles.map((angle, angleIndex) => {
        const radians = (angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        let unclampedX = point.x + cos * distance - size.width / 2;
        let unclampedY = point.y + sin * distance - boxHeight / 2;

        if (Math.abs(cos) > 0.72) {
          unclampedX =
            cos > 0
              ? point.x + distance
              : point.x - distance - size.width;
        }
        if (Math.abs(sin) > 0.72) {
          unclampedY =
            sin > 0
              ? point.y + distance
              : point.y - distance - boxHeight;
        }

        return makeCandidate(
          unclampedX,
          unclampedY,
          distanceIndex * 8 + angleIndex * 0.2,
        );
      }),
    );

    const gridColumns = 6;
    const gridRows = 7;
    const gridCandidates = Array.from({ length: gridColumns * gridRows }, (_, cell) => {
      const column = cell % gridColumns;
      const row = Math.floor(cell / gridColumns);
      const x =
        18 +
        ((MILESTONE_SNAKE_WIDTH - size.width - 36) * column) /
          Math.max(1, gridColumns - 1);
      const y =
        18 +
        ((MILESTONE_SNAKE_HEIGHT - boxHeight - 36) * row) /
          Math.max(1, gridRows - 1);
      const centerX = x + size.width / 2;
      const centerY = y + boxHeight / 2;
      const distancePenalty = Math.hypot(centerX - point.x, centerY - point.y) * 0.12;
      return makeCandidate(x, y, 56 + distancePenalty);
    });

    return [...radialCandidates, ...gridCandidates];
  });
}

function snakeAxisPenalty(label: MilestoneSnakeLabel, point: MilestoneSnakePoint) {
  const expanded = {
    x: label.boxX - 8,
    y: label.boxY - 8,
    width: label.boxWidth + 16,
    height: label.boxHeight + 16,
  };
  const pointInside =
    point.x >= expanded.x &&
    point.x <= expanded.x + expanded.width &&
    point.y >= expanded.y &&
    point.y <= expanded.y + expanded.height;
  let penalty = pointInside ? 5000 : 0;

  for (let index = 0; index < MILESTONE_SNAKE_PATH_POINTS.length; index += 18) {
    const axisPoint = MILESTONE_SNAKE_PATH_POINTS[index];
    if (
      axisPoint.x >= expanded.x &&
      axisPoint.x <= expanded.x + expanded.width &&
      axisPoint.y >= expanded.y &&
      axisPoint.y <= expanded.y + expanded.height
    ) {
      penalty += 120;
    }
  }

  return penalty;
}

function buildSnakeMilestoneLayouts(
  milestones: MilestoneTimelineItem[],
  startTime: number,
  range: number,
  todayOffset: number | null,
): MilestoneSnakeLayout[] {
  const entries = milestones.map((entry, originalIndex) => {
    const dueTime = entry.milestone.dueDate
      ? new Date(entry.milestone.dueDate).getTime()
      : startTime;
    const rawProgress = range === 0 ? 0.5 : (dueTime - startTime) / range;
    const progress = compressSnakeTimelineOffset(rawProgress, todayOffset);
    return {
      entry,
      originalIndex,
      point: interpolateSnakePoint(progress),
    };
  });
  const markerRects = entries.map(({ point }) => ({
    x: point.x - 14,
    y: point.y - 14,
    width: 28,
    height: 28,
  }));
  const orderedEntries = entries
    .map((entry) => {
      const nearest = entries.reduce((best, other) => {
        if (other.originalIndex === entry.originalIndex) return best;
        return Math.min(
          best,
          Math.hypot(other.point.x - entry.point.x, other.point.y - entry.point.y),
        );
      }, Number.POSITIVE_INFINITY);
      return { ...entry, nearest };
    })
    .sort((left, right) => left.nearest - right.nearest);
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const layouts: MilestoneSnakeLayout[] = new Array(milestones.length);

  orderedEntries.forEach(({ entry, originalIndex, point }) => {
    const candidates = snakeLabelCandidates(point, entry.milestone.title);
    const best = candidates
      .map((candidate) => {
        const rect = {
          x: candidate.label.boxX,
          y: candidate.label.boxY,
          width: candidate.label.boxWidth,
          height: candidate.label.boxHeight,
        };
        const collisionPenalty = placed.reduce((sum, occupied) => {
          const overlap = rectOverlap(rect, occupied);
          const gap = rectGap(rect, occupied);
          return sum + overlap * 80 + (gap < 26 ? (26 - gap) * 160 : 0);
        }, 0);
        const markerPenalty = markerRects.reduce((sum, marker, markerIndex) => {
          if (markerIndex === originalIndex) return sum;
          return sum + rectOverlap(rect, marker) * 80;
        }, 0);
        const distancePenalty =
          Math.hypot(
            candidate.label.connectorX - point.x,
            candidate.label.connectorY - point.y,
          ) * 0.18;
        const chronologicalPenalty = originalIndex * 0.4;
        return {
          ...candidate,
          score:
            collisionPenalty +
            markerPenalty +
            distancePenalty +
            chronologicalPenalty +
            candidate.preference +
            candidate.clampPenalty +
            snakeAxisPenalty(candidate.label, point),
        };
      })
      .sort((left, right) => left.score - right.score)[0];

    placed.push({
      x: best.label.boxX,
      y: best.label.boxY,
      width: best.label.boxWidth,
      height: best.label.boxHeight,
    });

    layouts[originalIndex] = {
      entry,
      point,
      label: best.label,
      lines: best.lines,
    };
  });

  return layouts;
}

function buildSnakeMilestonePointLayouts(
  milestones: MilestoneTimelineItem[],
  startTime: number,
  range: number,
  todayOffset: number | null,
): MilestoneSnakePointLayout[] {
  return milestones.map((entry) => {
    const dueTime = entry.milestone.dueDate
      ? new Date(entry.milestone.dueDate).getTime()
      : startTime;
    const rawProgress = range === 0 ? 0.5 : (dueTime - startTime) / range;
    const progress = compressSnakeTimelineOffset(rawProgress, todayOffset);
    return {
      entry,
      point: interpolateSnakePoint(progress),
    };
  });
}

function milestoneTimelineTodayOffsetByCount(
  milestones: StructureMilestone[],
  today: Date,
) {
  if (milestones.length === 0) return null;
  const todayTime = today.getTime();
  const beforeOrToday = milestones.filter((entry) => {
    const dueTime = entry.milestone.dueDate
      ? startOfDay(new Date(entry.milestone.dueDate)).getTime()
      : Number.NaN;
    return Number.isFinite(dueTime) && dueTime <= todayTime;
  }).length;
  const afterToday = milestones.length - beforeOrToday;

  if (beforeOrToday === 0) return 0;
  if (afterToday === 0) return 1;
  return beforeOrToday / milestones.length;
}

function compressMilestoneTimelineOffset(
  dueTime: number,
  minTime: number,
  todayTime: number,
  maxTime: number,
  todayOffset: number | null,
) {
  const totalRange = maxTime - minTime;
  const dateOffset = totalRange === 0 ? 0.5 : (dueTime - minTime) / totalRange;

  if (
    todayOffset === null ||
    !Number.isFinite(todayOffset) ||
    todayTime <= minTime ||
    todayTime >= maxTime
  ) {
    return Math.max(0, Math.min(1, dateOffset));
  }

  if (dueTime <= todayTime) {
    const beforeRange = todayTime - minTime;
    const beforeProgress = beforeRange === 0 ? 1 : (dueTime - minTime) / beforeRange;
    return Math.max(0, Math.min(1, beforeProgress * todayOffset));
  }

  const afterRange = maxTime - todayTime;
  const afterProgress = afterRange === 0 ? 0 : (dueTime - todayTime) / afterRange;
  return Math.max(
    0,
    Math.min(1, todayOffset + afterProgress * (1 - todayOffset)),
  );
}

function createMilestoneTimelineModel({
  milestones,
  lanes,
  today,
  timelineStart,
  timelineEnd,
  laneIdByMilestoneId,
  minTrackWidth = 1040,
}: {
  milestones: StructureMilestone[];
  lanes: MilestoneTimelineLane[];
  today: Date;
  timelineStart: Date;
  timelineEnd: Date;
  laneIdByMilestoneId?: Map<string, string>;
  minTrackWidth?: number;
}): MilestoneTimelineModel {
  const datedMilestones = milestones.filter(
    (entry) =>
      entry.milestone.dueDate &&
      !Number.isNaN(new Date(entry.milestone.dueDate).getTime()),
  );
  const visibleMilestones = datedMilestones.filter((entry) => {
    const dueDate = startOfDay(new Date(entry.milestone.dueDate as string));
    return dueDate >= timelineStart && dueDate <= timelineEnd;
  });
  const minTime = timelineStart.getTime();
  const maxTime = timelineEnd.getTime();
  const range = maxTime - minTime;
  const todayTime = today.getTime();
  const todayOffset =
    todayTime >= minTime && todayTime <= maxTime
      ? milestoneTimelineTodayOffsetByCount(visibleMilestones, today) ??
        (range === 0 ? 0 : (todayTime - minTime) / range)
      : null;

  if (visibleMilestones.length === 0) {
    return {
      lanes: [],
      startDate: timelineStart.toISOString(),
      endDate: timelineEnd.toISOString(),
      trackWidth: minTrackWidth,
      laneHeight: 154,
      todayOffset,
      hasMilestonesOutsideRange: datedMilestones.length > 0,
    };
  }

  const laneById = new Map(
    lanes.map((lane) => [
      lane.id,
      { ...lane, items: [] as MilestoneTimelineItem[] },
    ]),
  );
  const fallbackLane =
    laneById.get("all") ??
    laneById.get("unassigned") ??
    ({
      id: "unassigned",
      code: "",
      title: "Вехи",
      items: [] as MilestoneTimelineItem[],
    } satisfies MilestoneTimelineLane);

  visibleMilestones.forEach((entry) => {
    const dueTime = startOfDay(
      new Date(entry.milestone.dueDate as string),
    ).getTime();
    const offset = compressMilestoneTimelineOffset(
      dueTime,
      minTime,
      todayTime,
      maxTime,
      todayOffset,
    );
    const targetLane =
      laneById.get(laneIdByMilestoneId?.get(entry.milestone.id) ?? "") ??
      fallbackLane;
    targetLane.items.push({
      ...entry,
      offset,
      side: "top",
      level: 0,
      labelShiftPx: 0,
    });
  });

  if (!laneById.has(fallbackLane.id) && fallbackLane.items.length > 0) {
    laneById.set(fallbackLane.id, fallbackLane);
  }

  let maxLaneLevel = 0;
  const labelMinGap = 0.15;
  const modelLanes = Array.from(laneById.values()).filter(
    (lane) => lane.items.length > 0 || lane.id !== "unassigned",
  );
  const maxLaneMilestones = Math.max(
    1,
    ...modelLanes.map((lane) => lane.items.length),
  );
  const trackWidth = Math.max(minTrackWidth, maxLaneMilestones * 150);
  const labelHalfWidthOffset = 74 / trackWidth;

  modelLanes.forEach((lane) => {
    const sideLevels: Record<"top" | "bottom", number[]> = {
      top: [],
      bottom: [],
    };
    lane.items.sort(
      (left, right) =>
        String(left.milestone.dueDate ?? "").localeCompare(
          String(right.milestone.dueDate ?? ""),
        ) || left.milestone.sortOrder - right.milestone.sortOrder,
    );

    lane.items.forEach((item, index) => {
      const previous = index > 0 ? lane.items[index - 1] : null;
      if (previous && item.offset - previous.offset < 0.018) {
        item.offset = Math.min(0.985, previous.offset + 0.018);
      }
      const preferredSide = index % 2 === 0 ? "top" : "bottom";
      const lastOffsets = sideLevels[preferredSide];
      const reusableLevel = lastOffsets.findIndex(
        (lastOffset) => item.offset - lastOffset >= labelMinGap,
      );
      const level = reusableLevel === -1 ? lastOffsets.length : reusableLevel;
      if (level >= lastOffsets.length) {
        lastOffsets.push(item.offset);
      } else {
        lastOffsets[level] = item.offset;
      }
      item.side = preferredSide;
      item.level = level;
      maxLaneLevel = Math.max(maxLaneLevel, level);
    });

    let clusterStart = 0;
    const labelClusterGap = 0.062;
    while (clusterStart < lane.items.length) {
      let clusterEnd = clusterStart + 1;
      while (
        clusterEnd < lane.items.length &&
        lane.items[clusterEnd].offset - lane.items[clusterEnd - 1].offset <
          labelClusterGap
      ) {
        clusterEnd += 1;
      }
      const cluster = lane.items.slice(clusterStart, clusterEnd);
      const clusterCenter =
        cluster.reduce((sum, item) => sum + item.offset, 0) / cluster.length;
      cluster.forEach((item, clusterIndex) => {
        const isClustered = cluster.length > 1;
        const isNearLeftEdge = item.offset < labelHalfWidthOffset + 0.025;
        const isNearRightEdge = item.offset > 1 - labelHalfWidthOffset - 0.025;
        const isRightSideTopLabel =
          item.side === "top" &&
          item.offset > 0.62 &&
          item.offset < 1 - labelHalfWidthOffset - 0.015;
        const shouldNudgeRightSideTopLabel =
          isRightSideTopLabel && !isClustered;
        const isNearToday =
          timelineStart <= today &&
          today <= timelineEnd &&
          todayOffset !== null &&
          Math.abs(item.offset - todayOffset) < labelHalfWidthOffset * 0.85;
        const needsShift =
          isClustered ||
          isNearLeftEdge ||
          isNearRightEdge ||
          isNearToday ||
          shouldNudgeRightSideTopLabel;
        if (!needsShift) {
          item.labelShiftPx = 0;
          return;
        }

        let shiftDirection =
          item.offset < clusterCenter
            ? -1
            : item.offset > clusterCenter
              ? 1
              : item.side === "top"
                ? 1
                : -1;
        if (isNearLeftEdge) {
          shiftDirection = 1;
        } else if (isNearRightEdge) {
          shiftDirection = -1;
        } else if (isNearToday && todayOffset !== null) {
          shiftDirection = item.offset >= todayOffset ? 1 : -1;
        } else if (shouldNudgeRightSideTopLabel) {
          shiftDirection = 1;
        }

        const clusterDistance = Math.abs(clusterIndex - (cluster.length - 1) / 2);
        const rightSideTopBoost = shouldNudgeRightSideTopLabel
          ? item.offset >= clusterCenter
            ? 42
            : 28
          : 0;
        const shiftAmount = Math.min(
          isClustered ? 176 : 112,
          (isClustered ? 42 + clusterDistance * 28 : 48) +
            item.level * 18 +
            rightSideTopBoost,
        );
        item.labelShiftPx = shiftDirection * shiftAmount;
      });
      clusterStart = clusterEnd;
    }

    lane.items.forEach((item) => {
      if (item.side === "top" && item.offset > 0.68 && item.offset < 0.96) {
        item.labelShiftPx -= item.offset > 0.82 ? 10 : 6;
      }

      const isCrowdedRightClusterLabel =
        item.offset > 0.62 && item.offset < 0.92 && item.labelShiftPx < 0;
      if (isCrowdedRightClusterLabel) {
        const labelWidth = item.milestone.title.length > 12 ? 146 : 96;
        const maxLeftShift =
          item.side === "top"
            ? -Math.round(labelWidth * 0.42)
            : -Math.round(labelWidth * 0.52);
        item.labelShiftPx = Math.max(item.labelShiftPx, maxLeftShift);
      }
    });

    (["top", "bottom"] as const).forEach((side) => {
      const sideItems = lane.items
        .filter((item) => item.side === side)
        .sort(
          (left, right) =>
            left.offset * trackWidth +
            left.labelShiftPx -
            (right.offset * trackWidth + right.labelShiftPx),
        );
      let previousRight = Number.NEGATIVE_INFINITY;
      sideItems.forEach((item) => {
        const labelWidth = item.milestone.title.length > 12 ? 146 : 96;
        const center = item.offset * trackWidth + item.labelShiftPx;
        const left = center - labelWidth / 2;
        const minLeft = previousRight + (side === "top" ? 8 : 14);
        if (left < minLeft) {
          item.labelShiftPx += minLeft - left;
        }
        previousRight =
          item.offset * trackWidth + item.labelShiftPx + labelWidth / 2;
      });
    });
  });

  return {
    lanes: modelLanes,
    startDate: new Date(minTime).toISOString(),
    endDate: new Date(maxTime).toISOString(),
    trackWidth,
    laneHeight: 146 + maxLaneLevel * 52,
    todayOffset,
    hasMilestonesOutsideRange: datedMilestones.length > visibleMilestones.length,
  };
}

function printSectionAsPdf(sectionId: string, title: string) {
  if (!document.getElementById(sectionId)) return;
  const previousTitle = document.title;
  document.body.dataset.printTarget = sectionId;
  document.title = title;
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      delete document.body.dataset.printTarget;
      document.title = previousTitle;
    }, 150);
  }, 50);
}

function MilestoneLegend() {
  return (
    <div className="milestone-legend" aria-label="Легенда вех">
      <span>
        <i className="green" /> Пройдена
      </span>
      <span>
        <i className="blue" /> В работе перед вехой
      </span>
      <span>
        <i className="red" /> Просрочена
      </span>
      <span>
        <i className="gray" /> Не начата или запланирована
      </span>
      <span>
        <i className="today" /> Сегодня
      </span>
    </div>
  );
}

function MilestoneTimelineSection({
  sectionId,
  title,
  timeline,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenStructure,
  onPrint,
}: {
  sectionId: string;
  title: string;
  timeline: MilestoneTimelineModel;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenStructure: () => void;
  onPrint: () => void;
}) {
  return (
    <section className="milestone-section" data-print-section={sectionId} id={sectionId}>
      <div className="milestone-section-head">
        <h3>{title}</h3>
        <div className="milestone-section-actions">
          <MilestoneLegend />
          {onToggleFullscreen && (
            <button
              type="button"
              className="workspace-fullscreen-button"
              onClick={onToggleFullscreen}
              aria-label={
                isFullscreen
                  ? "Вернуть обычный режим вех по фазам"
                  : "Развернуть вехи по фазам на весь экран"
              }
              title={isFullscreen ? "Вернуть обычный режим" : "На весь экран"}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              {isFullscreen ? "Обычный режим" : "На весь экран"}
            </button>
          )}
          <button type="button" onClick={onPrint}>
            Сохранить в PDF
          </button>
        </div>
      </div>
      <div
        className="milestone-timeline"
        style={
          {
            "--milestone-track-width": `${timeline.trackWidth}px`,
            "--milestone-lane-height": `${timeline.laneHeight}px`,
          } as CSSProperties
        }
      >
        {timeline.lanes.length > 0 ? (
          <div className="milestone-lanes">
            <div className="milestone-scale">
              <span>{shortDate(timeline.startDate)}</span>
              <span>{shortDate(timeline.endDate)}</span>
            </div>
            {timeline.lanes.map((lane) => (
              <div className="milestone-lane" key={lane.id}>
                <div className="milestone-lane-title">
                  {lane.code && <span>{lane.code}</span>}
                  <strong>
                    {splitPhaseTitle(lane.title).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </strong>
                </div>
                <div className="milestone-lane-canvas">
                  <div className="milestone-axis" aria-hidden="true" />
                  <div className="milestone-axis-arrow" aria-hidden="true" />
                  {timeline.todayOffset !== null && (
                    <span
                      className="milestone-today"
                      aria-hidden="true"
                      style={{
                        left: `calc(18px + ${(timeline.todayOffset * 100).toFixed(3)}% - ${(timeline.todayOffset * 60).toFixed(3)}px)`,
                      }}
                    />
                  )}
                  {lane.items.map(
                    ({
                      milestone,
                      state,
                      offset,
                      side,
                      level,
                      labelShiftPx,
                    }) => (
                      <button
                        type="button"
                        className={`milestone-point ${side} ${state.tone}`}
                        key={milestone.id}
                        onClick={onOpenStructure}
                        style={
                          {
                            left: `calc(18px + ${(offset * 100).toFixed(3)}% - ${(offset * 60).toFixed(3)}px)`,
                            "--milestone-label-level": level,
                            "--milestone-label-shift": `${labelShiftPx}px`,
                            "--milestone-connector-angle":
                              labelShiftPx > 8
                                ? side === "top"
                                  ? "13deg"
                                  : "-13deg"
                                : labelShiftPx < -8
                                  ? side === "top"
                                    ? "-13deg"
                                    : "13deg"
                                  : side === "top"
                                    ? "-13deg"
                                    : "13deg",
                          } as MilestonePointStyle
                        }
                        title={`${milestone.code} ${milestone.title}: ${date(milestone.dueDate)}. ${state.label}.`}
                      >
                        <span className="milestone-marker" />
                        <span className="milestone-caption">
                          <span className="milestone-date">
                            {shortDate(milestone.dueDate)}
                          </span>
                          <span className="milestone-label">
                            {milestone.title}
                          </span>
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {timeline.hasMilestonesOutsideRange
              ? "В окне от -2 до +4 месяцев от текущей даты нет вех."
              : "В Структуре пока нет элементов типа «Веха»."}
          </div>
        )}
      </div>
    </section>
  );
}

function MilestoneSnakeTimelineSection({
  sectionId,
  title,
  timeline,
  isFullscreen,
  onToggleFullscreen,
  onOpenStructure,
  onPrint,
}: {
  sectionId: string;
  title: string;
  timeline: MilestoneTimelineModel;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenStructure: () => void;
  onPrint: () => void;
}) {
  const milestones = timeline.lanes.flatMap((lane) => lane.items);
  const startTime = new Date(timeline.startDate).getTime();
  const endTime = new Date(timeline.endDate).getTime();
  const range = endTime - startTime;
  const inlineMilestones = milestones;
  const milestoneLayouts = buildSnakeMilestoneLayouts(
    inlineMilestones,
    startTime,
    range,
    timeline.todayOffset,
  );
  const milestonePointLayouts = buildSnakeMilestonePointLayouts(
    milestones,
    startTime,
    range,
    timeline.todayOffset,
  );
  const monthTicks = (() => {
    const start = startOfMonth(new Date(timeline.startDate));
    const end = startOfMonth(new Date(timeline.endDate));
    const ticks: Array<{ label: string; point: MilestoneSnakePoint }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const rawProgress =
        range === 0 ? 0 : (cursor.getTime() - startTime) / range;
      ticks.push({
        label: monthLabel(cursor).replace(".", ""),
        point: interpolateSnakePoint(
          compressSnakeTimelineOffset(rawProgress, timeline.todayOffset),
        ),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  })();

  return (
    <section
      className="milestone-section milestone-snake-section"
      data-print-section={sectionId}
      id={sectionId}
    >
      <div className="milestone-section-head">
        <h3>{title}</h3>
        <div className="milestone-section-actions">
          <MilestoneLegend />
          <button
            type="button"
            className="workspace-fullscreen-button"
            onClick={onToggleFullscreen}
            aria-label={
              isFullscreen
                ? "Вернуть обычный режим всех вех"
                : "Развернуть все вехи на весь экран"
            }
            title={isFullscreen ? "Вернуть обычный режим" : "На весь экран"}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {isFullscreen ? "Обычный режим" : "На весь экран"}
          </button>
          <button type="button" onClick={onPrint}>
            Сохранить в PDF
          </button>
        </div>
      </div>
      <div className="milestone-snake-layout">
        <div className="milestone-snake-shell">
        {milestones.length > 0 ? (
          <svg
            className="milestone-snake-svg"
            viewBox={`0 0 ${MILESTONE_SNAKE_WIDTH} ${MILESTONE_SNAKE_HEIGHT}`}
            role="img"
            aria-label="Все вехи проекта на змеевидной временной шкале"
          >
            <defs>
              <marker
                id="milestoneSnakeArrow"
                markerHeight="10"
                markerWidth="10"
                orient="auto"
                refX="8"
                refY="5"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>
            <rect
              x="0"
              y="0"
              width={MILESTONE_SNAKE_WIDTH}
              height={MILESTONE_SNAKE_HEIGHT}
              rx="10"
              fill="#fff"
            />
            <path
              d={MILESTONE_SNAKE_PATH_D}
              className="milestone-snake-axis"
              markerEnd="url(#milestoneSnakeArrow)"
            />
            {monthTicks.map((tick) => (
              <g key={`${tick.label}-${tick.point.x}-${tick.point.y}`}>
                <line
                  className="milestone-snake-tick"
                  x1={tick.point.x - tick.point.tangentY * 14}
                  x2={tick.point.x + tick.point.tangentY * 14}
                  y1={tick.point.y + tick.point.tangentX * 14}
                  y2={tick.point.y - tick.point.tangentX * 14}
                />
                <text
                  className="milestone-snake-month"
                  x={tick.point.x}
                  y={tick.point.y + 34}
                >
                  {tick.label}
                </text>
              </g>
            ))}
            {timeline.todayOffset !== null && (() => {
              const todayPoint = interpolateSnakePoint(
                compressSnakeTimelineOffset(
                  timeline.todayOffset,
                  timeline.todayOffset,
                ),
              );
              return (
                <g>
                  <line
                    className="milestone-snake-today"
                    x1={todayPoint.x - todayPoint.tangentY * 42}
                    x2={todayPoint.x + todayPoint.tangentY * 42}
                    y1={todayPoint.y + todayPoint.tangentX * 42}
                    y2={todayPoint.y - todayPoint.tangentX * 42}
                  />
                  <text
                    className="milestone-snake-today-label"
                    x={todayPoint.x + 8}
                    y={todayPoint.y - 48}
                  >
                    сегодня
                  </text>
                </g>
              );
            })()}
            <g className="milestone-snake-label-layer">
              {milestoneLayouts.map(({ entry, point, label, lines }) => (
                <g
                  key={`label-${entry.milestone.id}`}
                  className={`milestone-snake-item ${entry.state.tone}`}
                  onClick={onOpenStructure}
                  tabIndex={0}
                >
                  <line
                    className="milestone-snake-connector"
                    x1={point.x}
                    x2={label.connectorX}
                    y1={point.y}
                    y2={label.connectorY}
                  />
                  <rect
                    className="milestone-snake-label-box"
                    x={label.boxX}
                    y={label.boxY}
                    width={label.boxWidth}
                    height={label.boxHeight}
                    rx="7"
                  />
                  {lines.map((line, lineIndex) => (
                    <text
                      className="milestone-snake-title"
                      key={`${entry.milestone.id}-${line}`}
                      x={label.boxX + 10}
                      y={label.boxY + 19 + lineIndex * 13}
                    >
                      {line}
                    </text>
                  ))}
                  <text
                    className="milestone-snake-date"
                    x={label.boxX + 10}
                    y={label.dateY}
                  >
                    {shortDate(entry.milestone.dueDate)}
                  </text>
                  <title>
                    {`${entry.milestone.code} ${entry.milestone.title}: ${date(entry.milestone.dueDate)}. ${entry.state.label}.`}
                  </title>
                </g>
              ))}
            </g>
            {milestonePointLayouts.map(({ entry, point }, index) => {
              return (
                <g
                  key={`point-${entry.milestone.id}`}
                  className={`milestone-snake-item ${entry.state.tone}`}
                  onClick={onOpenStructure}
                  tabIndex={0}
                >
                  <circle
                    className="milestone-snake-marker"
                    cx={point.x}
                    cy={point.y}
                    r="11"
                  />
                  <text
                    className="milestone-snake-marker-number"
                    x={point.x}
                    y={point.y + 4}
                  >
                    {index + 1}
                  </text>
                  <title>
                    {`${index + 1}. ${entry.milestone.code} ${entry.milestone.title}: ${date(entry.milestone.dueDate)}. ${entry.state.label}.`}
                  </title>
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="empty-state">
            {timeline.hasMilestonesOutsideRange
              ? "Вехи не попали в диапазон графика."
              : "В Структуре пока нет элементов типа «Веха»."}
          </div>
        )}
        </div>
      </div>
    </section>
  );
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

function addCalendarMonths(value: Date, months: number) {
  const targetMonth = value.getMonth() + months;
  const lastDayOfTargetMonth = new Date(
    value.getFullYear(),
    targetMonth + 1,
    0,
  ).getDate();
  return new Date(
    value.getFullYear(),
    targetMonth,
    Math.min(value.getDate(), lastDayOfTargetMonth),
  );
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

function rememberEditableInitialValue(target: EditableElement) {
  target.dataset.editInitialValue =
    target instanceof HTMLInputElement && target.type === "checkbox"
      ? String(target.checked)
      : target.value;
}

function setNativeEditableValue(target: EditableElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, "value");
  const prototype = Object.getPrototypeOf(target) as EditableElement;
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  const setter =
    prototypeDescriptor?.set && prototypeDescriptor.set !== descriptor?.set
      ? prototypeDescriptor.set
      : descriptor?.set;
  setter?.call(target, value);
}

function restoreEditableInitialValue(target: EditableElement) {
  const initialValue = target.dataset.editInitialValue;
  if (initialValue === undefined) return;
  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    target.checked = initialValue === "true";
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  setNativeEditableValue(target, initialValue);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function handleEditableKey(
  target: EditableElement,
  key: string,
  options: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    preventDefault: () => void;
    onEnter?: () => void;
    onEscape?: () => void;
  },
) {
  const isTextArea = target instanceof HTMLTextAreaElement;
  if (
    isTextArea &&
    key === "Enter" &&
    options.shiftKey
  ) {
    return;
  }
  if (key === "Enter" && (!isTextArea || options.metaKey || options.ctrlKey)) {
    options.preventDefault();
    options.onEnter?.();
    target.blur();
    return;
  }
  if (key === "Escape") {
    options.preventDefault();
    restoreEditableInitialValue(target);
    options.onEscape?.();
    target.blur();
  }
}

function editableKeyHandler(
  options: {
    onEnter?: () => void;
    onEscape?: () => void;
  } = {},
) {
  return (event: ReactKeyboardEvent<EditableElement>) => {
    handleEditableKey(event.currentTarget, event.key, {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      preventDefault: () => event.preventDefault(),
      ...options,
    });
  };
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
  const initialProjectCodeRef = useRef<string | null>(initialRouteProjectCode());
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authForm, setAuthForm] = useState<AuthFormState>(emptyAuthForm);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [activeView, setActiveView] = useState<AppView>(() => initialAppView());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingJira, setSavingJira] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState<string | null>(null);
  const [selectedCalendarYear, setSelectedCalendarYear] = useState<number | null>(
    null,
  );
  const [savingProjectRegistryId, setSavingProjectRegistryId] = useState<
    string | null
  >(null);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraftState>>(
    {},
  );
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [newUserForm, setNewUserForm] = useState<UserFormState>(emptyUserForm);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [dictionaryItems, setDictionaryItems] = useState<DictionaryItem[]>([]);
  const [dictionaryDrafts, setDictionaryDrafts] = useState<
    Record<string, DictionaryItemDraft>
  >({});
  const [selectedDictionary, setSelectedDictionary] = useState("wbs_type");
  const [newDictionaryDraft, setNewDictionaryDraft] =
    useState<DictionaryItemDraft>(emptyDictionaryDraft);
  const [savingDictionaryItemId, setSavingDictionaryItemId] =
    useState<string | null>(null);
  const [creatingDictionaryItem, setCreatingDictionaryItem] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [systemSettingsDraft, setSystemSettingsDraft] =
    useState<SystemSettingsDraft>(emptySystemSettingsDraft);
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);
  const [projectModules, setProjectModules] = useState<ProjectModule[]>(
    () => defaultProjectModules,
  );
  const [projectModuleDrafts, setProjectModuleDrafts] = useState<
    Record<ProjectModuleKey, boolean>
  >(() => projectModulesToDraft(defaultProjectModules));
  const [savingProjectModules, setSavingProjectModules] = useState(false);
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [adminIntegrations, setAdminIntegrations] =
    useState<AdminIntegrations | null>(null);
  const [apiTokenDraft, setApiTokenDraft] = useState<ApiTokenDraft>({
    name: "Внешняя интеграция",
    scopes: "project.read,wbs.read,issue.read,raid.read",
    rateLimitPerMinute: "120",
    expiresAt: "",
  });
  const [webhookDraft, setWebhookDraft] = useState<WebhookDraft>({
    name: "Webhook",
    url: "",
    events: "*",
    secret: "",
    isActive: true,
  });
  const [createdApiToken, setCreatedApiToken] = useState<string | null>(null);
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [configTransferText, setConfigTransferText] = useState("");
  const [importingConfig, setImportingConfig] = useState(false);
  const [savingRolePermissionId, setSavingRolePermissionId] =
    useState<string | null>(null);
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
  const [raidStatusDrafts, setRaidStatusDrafts] = useState<
    Record<string, { statusAt: string; text: string }>
  >({});
  const [expandedRaidId, setExpandedRaidId] = useState<string | null>(null);
  const [wbsDrafts, setWbsDrafts] = useState<Record<string, WbsFormState>>({});
  const projectRef = useRef<ProjectDetails | null>(null);
  const wbsDraftsRef = useRef<Record<string, WbsFormState>>({});
  const wbsSaveSequenceRef = useRef(0);
  const pendingWbsSaveCountRef = useRef(0);
  const latestWbsSaveSequenceByItemRef = useRef<Record<string, number>>({});
  const projectLoadSequenceRef = useRef(0);
  const [collapsedWbsIds, setCollapsedWbsIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showGanttDependencies, setShowGanttDependencies] = useState(true);
  const [showGanttBaseline, setShowGanttBaseline] = useState(false);
  const [showGanttForecast, setShowGanttForecast] = useState(false);
  const [showGanttCriticalPath, setShowGanttCriticalPath] = useState(false);
  const [showStructureCriticalPath, setShowStructureCriticalPath] =
    useState(false);
  const [fullscreenWorkspaceView, setFullscreenWorkspaceView] =
    useState<FullscreenWorkspaceView | null>(null);
  const isAuthenticated = Boolean(currentUser);
  const isAdminUser = currentUser?.role === "ADMIN";
  const isClosedProject = project?.status === "CLOSED";
  const isReadOnly = !isAuthenticated || isClosedProject;
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
  const [wbsSort, setWbsSort] = useState<WbsSortState | null>(null);
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
  const [issueStatusDrafts, setIssueStatusDrafts] = useState<
    Record<string, { statusAt: string; text: string }>
  >({});
  const [issueFormErrors, setIssueFormErrors] = useState<
    Partial<Record<"title" | "jiraTicketUrl", string>>
  >({});
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [issueDrawerMode, setIssueDrawerMode] = useState<
    "create" | null
  >(null);
  const [raidTypeFilter, setRaidTypeFilter] =
    useState<RaidTypeFilter>("ALL");
  const [raidDecisionOnly, setRaidDecisionOnly] = useState(false);
  const [raidOverdueOnly, setRaidOverdueOnly] = useState(false);
  const [raidHighOnly, setRaidHighOnly] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [savingSavedView, setSavingSavedView] = useState(false);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);

  const handleEditableFocus = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      if (!isEditableElement(event.target)) return;
      if (event.target.closest(".wbs-excel-table")) return;
      rememberEditableInitialValue(event.target);
    },
    [],
  );

  const handleEditableKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isEditableElement(event.target)) return;
      if (event.target.closest(".wbs-excel-table")) return;
      handleEditableKey(event.target, event.key, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        preventDefault: () => event.preventDefault(),
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function initializeAuth() {
      setLoading(true);
      try {
        const me = await apiClient.get<{ user: CurrentUser }>(
          "/api/auth/me",
          "Не удалось проверить сессию",
        );
        if (cancelled) return;
        setCurrentUser(me.user);
        setAuthMode("ready");
      } catch (authError) {
        if (cancelled) return;
        if (authError instanceof ApiError && authError.status === 401) {
          try {
            const setup = await apiClient.get<{ needsSetup: boolean }>(
              "/api/auth/setup-status",
              "Не удалось проверить первичную настройку",
            );
            if (cancelled) return;
            setAuthMode(setup.needsSetup ? "setup" : "ready");
          } catch (setupError) {
            setAuthMode("ready");
            setError(
              setupError instanceof Error
                ? setupError.message
                : "Не удалось проверить первичную настройку",
            );
          }
        } else {
          setAuthMode("ready");
          setError(
            authError instanceof Error
              ? authError.message
              : "Не удалось проверить сессию",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initializeAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setError(null);
      setNotice(null);
      const route = appRouteFromPath(window.location.pathname);
      setActiveView(route.view);
      if (route.projectCode) {
        const nextProject = projects.find(
          (item) =>
            normalizeProjectRouteCode(item.code) ===
            normalizeProjectRouteCode(route.projectCode ?? ""),
        );
        if (nextProject) {
          setSelectedProjectId(nextProject.id);
        } else {
          initialProjectCodeRef.current = route.projectCode;
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [projects]);

  useEffect(() => {
    const onAuthRequired = () => {
      setCurrentUser(null);
      setAuthMode("login");
      setNotice(null);
      setError("Для редактирования нужно войти в систему");
    };
    window.addEventListener("pms-auth-required", onAuthRequired);
    return () => {
      window.removeEventListener("pms-auth-required", onAuthRequired);
    };
  }, []);

  useEffect(() => {
    if (authMode !== "ready") return;
    const shouldRedirect =
      (!isAuthenticated && writeProtectedViews.has(activeView)) ||
      (isAuthenticated && isAdminSectionViewName(activeView) && !isAdminUser);
    if (!shouldRedirect) return;

    const fallbackProjectModule = normalizeProjectModulesForUi(projectModules).find(
      (module) => module.enabled,
    );
    const fallbackProjectView = fallbackProjectModule
      ? projectModuleViewByKey[fallbackProjectModule.key]
      : "project-overview";
    const fallbackView = selectedProjectId ? fallbackProjectView : "portfolio";
    const redirectId = window.setTimeout(() => {
      setError(null);
      setNotice(null);
      setActiveView(fallbackView);
      const nextPath = appPathForView(fallbackView, project?.code ?? null);
      if (window.location.pathname !== nextPath) {
        window.history.replaceState(
          null,
          "",
          `${nextPath}${window.location.search}${window.location.hash}`,
        );
      }
    }, 0);
    return () => window.clearTimeout(redirectId);
  }, [
    activeView,
    authMode,
    isAdminUser,
    isAuthenticated,
    project?.code,
    projectModules,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (authMode !== "ready") return;
    let cancelled = false;

    async function loadProjects() {
      setLoading(true);
      try {
        const data = await apiClient.get<ProjectListItem[]>(
          "/api/projects",
          "Не удалось загрузить список проектов",
        );
        if (cancelled) return;
        const firstProject =
          data.find((item) => item.status !== "CLOSED") ?? data[0];
        const routeProjectCode = initialProjectCodeRef.current;
        const routeProject = routeProjectCode
          ? data.find(
              (item) =>
                normalizeProjectRouteCode(item.code) ===
                normalizeProjectRouteCode(routeProjectCode),
            )
          : null;
        setProjects(data);
        setProjectRegistryDrafts(projectsToRegistryDrafts(data));
        setSelectedProjectId(
          (current) => current ?? routeProject?.id ?? firstProject?.id ?? null,
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить список проектов",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [authMode]);

  useEffect(() => {
    const query = globalSearch.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      apiClient
        .get<SearchResult[]>(
          `/api/search?q=${encodeURIComponent(query)}&limit=12`,
          "Не удалось выполнить поиск",
        )
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
            setSearchOpen(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchLoading(false);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [globalSearch]);

  useEffect(() => {
    if (authMode !== "ready") return;
    let cancelled = false;
    apiClient
      .get<ProjectModule[]>("/api/project-modules", "Не удалось загрузить настройки модулей")
      .then((modules) => {
        if (cancelled) return;
        const normalized = normalizeProjectModulesForUi(modules);
        setProjectModules(normalized);
        setProjectModuleDrafts(projectModulesToDraft(normalized));
      })
      .catch(() => {
        if (!cancelled) {
          setProjectModules(defaultProjectModules);
          setProjectModuleDrafts(projectModulesToDraft(defaultProjectModules));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authMode]);

  useEffect(() => {
    if (
      authMode !== "ready" ||
      !isAdminSectionViewName(activeView) ||
      currentUser?.role !== "ADMIN"
    ) {
      return;
    }
    let cancelled = false;
    Promise.all([
      apiClient.get<SystemUser[]>("/api/users", "Не удалось загрузить пользователей"),
      apiClient.get<AuditEvent[]>(
        "/api/audit-events?limit=100",
        "Не удалось загрузить журнал аудита",
      ),
      apiClient.get<AdminConfig>(
        "/api/admin/config",
        "Не удалось загрузить настройки администрирования",
      ),
      apiClient.get<AdminIntegrations>(
        "/api/admin/integrations",
        "Не удалось загрузить интеграции",
      ),
    ])
      .then(([data, events, config, integrations]) => {
        if (cancelled) return;
        setUsers(data);
        setUserDrafts(usersToDrafts(data));
        setAuditEvents(events);
        setRolePermissions(config.rolePermissions);
        setDictionaryItems(config.dictionaryItems);
        setDictionaryDrafts(dictionaryItemsToDrafts(config.dictionaryItems));
        setSystemSettings(config.systemSettings);
        setSystemSettingsDraft(systemSettingsToDraft(config.systemSettings));
        const normalizedModules = normalizeProjectModulesForUi(config.projectModules);
        setProjectModules(normalizedModules);
        setProjectModuleDrafts(projectModulesToDraft(normalizedModules));
        setAdminHealth(config.health);
        setBackupStatus(config.backupStatus);
        setAdminIntegrations(integrations);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить пользователей",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, authMode, currentUser]);

  useEffect(() => {
    const viewType = savedViewTypeForActiveView();
    if (authMode !== "ready" || !viewType || !selectedProjectId) {
      setSavedViews([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      viewType,
      projectId: selectedProjectId,
    });
    apiClient
      .get<SavedView[]>(
        `/api/saved-views?${params.toString()}`,
        "Не удалось загрузить сохраненные представления",
      )
      .then((views) => {
        if (!cancelled) setSavedViews(views);
      })
      .catch(() => {
        if (!cancelled) setSavedViews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, authMode, selectedProjectId]);

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

  const activeProjects = useMemo(
    () => projects.filter((item) => item.status !== "CLOSED"),
    [projects],
  );
  const closedProjects = useMemo(
    () => projects.filter((item) => item.status === "CLOSED"),
    [projects],
  );
  const activeProjectTree = useMemo(
    () => buildProjectTree(activeProjects),
    [activeProjects],
  );
  const closedProjectTree = useMemo(
    () => buildProjectTree(closedProjects),
    [closedProjects],
  );
  const selectedProjectListItem = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const filteredDictionaryItems = useMemo(
    () =>
      dictionaryItems.filter((item) => item.dictionary === selectedDictionary),
    [dictionaryItems, selectedDictionary],
  );
  const normalizedProjectModules = useMemo(
    () => normalizeProjectModulesForUi(projectModules),
    [projectModules],
  );
  const projectModuleEnabledByKey = useMemo(
    () =>
      new Map(normalizedProjectModules.map((module) => [module.key, module.enabled])),
    [normalizedProjectModules],
  );
  const isProjectModuleEnabled = useCallback(
    (key: ProjectModuleKey) => projectModuleEnabledByKey.get(key) !== false,
    [projectModuleEnabledByKey],
  );
  const firstEnabledProjectView = useMemo<ProjectSectionView>(() => {
    const enabledModule = normalizedProjectModules.find((module) => module.enabled);
    return enabledModule ? projectModuleViewByKey[enabledModule.key] : "project-overview";
  }, [normalizedProjectModules]);
  const resourceSummaryRows = useMemo(() => {
    const byOwner = new Map<
      string,
      { owner: string; total: number; done: number; inProgress: number; overdue: number }
    >();
    for (const item of project?.wbsItems ?? []) {
      if (item.type !== "TASK" && item.type !== "DELIVERABLE") continue;
      const owner = item.owner?.trim() || "Не назначен";
      const row =
        byOwner.get(owner) ??
        { owner, total: 0, done: 0, inProgress: 0, overdue: 0 };
      row.total += 1;
      if (item.status === "DONE") row.done += 1;
      if (item.status === "IN_PROGRESS") row.inProgress += 1;
      if (item.dueDate && new Date(item.dueDate) < new Date() && item.status !== "DONE") {
        row.overdue += 1;
      }
      byOwner.set(owner, row);
    }
    return [...byOwner.values()].sort((left, right) => right.total - left.total);
  }, [project?.wbsItems]);
  useEffect(() => {
    const routeProjectCode = initialProjectCodeRef.current;
    if (!routeProjectCode || projects.length === 0) return;

    const routeProject = projects.find(
      (item) =>
        normalizeProjectRouteCode(item.code) ===
        normalizeProjectRouteCode(routeProjectCode),
    );
    if (!routeProject) {
      setError(`Проект ${routeProjectCode} не найден`);
      initialProjectCodeRef.current = null;
      return;
    }

    setSelectedProjectId(routeProject.id);
    initialProjectCodeRef.current = null;
  }, [projects]);
  useEffect(() => {
    if (!selectedProjectListItem || !isProjectSectionViewName(activeView)) {
      return;
    }
    const expectedPath = appPathForView(activeView, selectedProjectListItem.code);
    if (normalizeAppPath(window.location.pathname) !== normalizeAppPath(expectedPath)) {
      window.history.replaceState(
        null,
        "",
        `${expectedPath}${window.location.search}${window.location.hash}`,
      );
    }
  }, [activeView, selectedProjectListItem]);
  useEffect(() => {
    if (!isProjectSectionViewName(activeView)) return;
    if (isProjectModuleEnabled(projectModuleKeyByView[activeView])) return;
    openView(firstEnabledProjectView, { replace: true });
  }, [activeView, firstEnabledProjectView, isProjectModuleEnabled]);
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
    if (!query) return activeProjects;
    return activeProjects.filter((item) =>
      [item.code, item.name, item.projectManager, item.portfolio, item.summary]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [activeProjects, projectSearch]);
  const portfolioStats = useMemo(() => {
    const activeProjectsCount = projects.filter(
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
      activeProjects: activeProjectsCount,
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
  const sortedStructureWbsTree = useMemo(
    () => sortWbsTreeForDisplay(wbsTree, wbsDrafts, wbsSort),
    [wbsDrafts, wbsSort, wbsTree],
  );
  const visibleStructureBaseWbsTree = useMemo(() => {
    const hiddenLevels: number[] = [];
    return sortedStructureWbsTree.filter((item) => {
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
  }, [collapsedWbsIds, sortedStructureWbsTree]);
  const structureCriticalPathIds = useMemo(
    () => new Set(project?.criticalPath?.criticalItemIds ?? []),
    [project?.criticalPath?.criticalItemIds],
  );
  const visibleStructureWbsTree = useMemo(() => {
    if (!showStructureCriticalPath) return visibleStructureBaseWbsTree;
    return visibleStructureBaseWbsTree.filter((item) =>
      structureCriticalPathIds.has(item.id),
    );
  }, [
    showStructureCriticalPath,
    structureCriticalPathIds,
    visibleStructureBaseWbsTree,
  ]);
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
    const items = project?.wbsItems ?? [];
    const itemById = new Map(items.map((item) => [item.id, item]));
    const phases = items
      .filter((item) => item.type === "PHASE")
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const today = startOfDay(new Date());
    const timelineStart = startOfDay(addCalendarMonths(today, -2));
    const timelineEnd = startOfDay(addCalendarMonths(today, 4));
    const allMilestoneDates = structureMilestones
      .map((entry) =>
        entry.milestone.dueDate
          ? startOfDay(new Date(entry.milestone.dueDate))
          : null,
      )
      .filter(
        (value): value is Date =>
          value !== null && !Number.isNaN(value.getTime()),
      );
    const allTimelineStart =
      allMilestoneDates.length > 0
        ? new Date(Math.min(...allMilestoneDates.map((value) => value.getTime())))
        : timelineStart;
    const allTimelineEnd =
      allMilestoneDates.length > 0
        ? new Date(Math.max(...allMilestoneDates.map((value) => value.getTime())))
        : timelineEnd;
    const phaseIdForMilestone = (milestone: WbsItem) => {
      let currentId = milestone.parentId;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const current = itemById.get(currentId);
        if (!current) break;
        if (current.type === "PHASE") return current.id;
        currentId = current.parentId;
      }
      return null;
    };

    const laneIdByMilestoneId = new Map(
      structureMilestones.map((entry) => [
        entry.milestone.id,
        phaseIdForMilestone(entry.milestone) ?? "unassigned",
      ]),
    );
    const phaseLanes =
      phases.length > 0
        ? [
            ...phases.map((phase) => ({
              id: phase.id,
              code: phase.code,
              title: phase.title,
              items: [] as MilestoneTimelineItem[],
            })),
            {
              id: "unassigned",
              code: "",
              title: "Без фазы",
              items: [] as MilestoneTimelineItem[],
            },
          ]
        : [
            {
              id: "unassigned",
              code: "",
              title: "Все вехи",
              items: [] as MilestoneTimelineItem[],
            },
          ];
    const byPhase = createMilestoneTimelineModel({
      milestones: structureMilestones,
      lanes: phaseLanes,
      today,
      timelineStart,
      timelineEnd,
      laneIdByMilestoneId,
    });
    const all = createMilestoneTimelineModel({
      milestones: structureMilestones,
      lanes: [
        {
          id: "all",
          code: "",
          title: "Все вехи",
          items: [] as MilestoneTimelineItem[],
        },
      ],
      today,
      timelineStart: allTimelineStart,
      timelineEnd: allTimelineEnd,
      laneIdByMilestoneId: new Map(
        structureMilestones.map((entry) => [entry.milestone.id, "all"]),
      ),
      minTrackWidth: byPhase.trackWidth,
    });

    return { byPhase, all };
  }, [project?.wbsItems, structureMilestones]);
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
    const riskItems =
      project?.raidItems.filter(
        (item) =>
          item.status !== "CLOSED" &&
          item.status !== "VALIDATED" &&
          (item.type === "RISK" ||
            item.type === "DEPENDENCY" ||
            item.type === "ASSUMPTION"),
      ) ?? [];
    const decisionItems = openIssues.filter(
      (issue) => issue.decisionRequired,
    );
    const nextMilestone = structureMilestones.find(
      (entry) =>
        entry.milestone.dueDate &&
        startOfDay(new Date(entry.milestone.dueDate)) >= today,
    );
    const redZoneRisks = riskItems
      .filter((item) => item.type === "RISK" && item.riskScore >= 15)
      .sort((left, right) => right.riskScore - left.riskScore)
      .slice(0, 5);
    const blockerIssues = openIssues
      .filter(
        (issue) =>
          issue.severity === "CRITICAL" ||
          issue.status === "Blocked",
      )
      .sort((left, right) =>
        String(left.dueDate ?? "9999").localeCompare(
          String(right.dueDate ?? "9999"),
        ),
      );
    const blockedWbsItems = wbsItems
      .filter((item) => item.status === "BLOCKED")
      .map((item) => ({
        id: item.id,
        title: item.title,
        code: item.code,
        dueDate: item.dueDate,
        jiraTicketKey: item.jiraTicketKey,
        jiraTicketUrl: item.jiraTicketUrl,
        source: "structure" as const,
      }));
    const blockingTickets = [
      ...blockerIssues.map((issue) => {
        const jiraLink = issuePrimaryJiraLink(issue);
        return {
          id: issue.id,
          title: issue.title,
          code: jiraLink.key || issue.severity,
          dueDate: issue.dueDate,
          jiraTicketKey: jiraLink.key,
          jiraTicketUrl: jiraLink.url,
          source: "issue" as const,
        };
      }),
      ...blockedWbsItems,
    ]
      .sort((left, right) =>
        String(left.dueDate ?? "9999").localeCompare(
          String(right.dueDate ?? "9999"),
        ),
      )
      .slice(0, 6);
    const openDecisionItems = decisionItems
      .sort((left, right) =>
        String(left.dueDate ?? "9999").localeCompare(
          String(right.dueDate ?? "9999"),
        ),
      )
      .slice(0, 5);
    const criticalPathIds = new Set(project?.criticalPath?.criticalItemIds ?? []);
    const scheduleVarianceItems =
      criticalPathIds.size > 0
        ? wbsItems.filter((item) => criticalPathIds.has(item.id))
        : wbsItems;
    const wbsByCode = new Map(wbsItems.map((item) => [item.code, item]));
    const wbsById = new Map(wbsItems.map((item) => [item.id, item]));
    const childrenByParentId = new Map<string, WbsItem[]>();
    for (const item of wbsItems) {
      if (!item.parentId) continue;
      childrenByParentId.set(item.parentId, [
        ...(childrenByParentId.get(item.parentId) ?? []),
        item,
      ]);
    }
    const predecessorIdsByItemId = new Map<string, Set<string>>();
    const addPredecessor = (itemId: string, predecessorId: string) => {
      if (itemId === predecessorId) return;
      const current = predecessorIdsByItemId.get(itemId) ?? new Set<string>();
      current.add(predecessorId);
      predecessorIdsByItemId.set(itemId, current);
    };
    for (const dependency of project?.wbsDependencies ?? []) {
      addPredecessor(dependency.successorId, dependency.predecessorId);
    }
    for (const item of wbsItems) {
      for (const key of WBS_PREDECESSOR_KEYS) {
        const predecessorCode = item[key]?.trim();
        const predecessor = predecessorCode ? wbsByCode.get(predecessorCode) : null;
        if (predecessor) {
          addPredecessor(item.id, predecessor.id);
        }
      }
    }
    const hasScheduleVarianceDates = (item: WbsItem) =>
      item.baselineDueDate &&
      item.dueDate &&
      item.status !== "CANCELLED";
    const closedScheduleCauseCutoff = startOfDay(new Date(today));
    closedScheduleCauseCutoff.setDate(closedScheduleCauseCutoff.getDate() - 30);
    const isVisibleScheduleVarianceCause = (item: WbsItem) => {
      if (item.status !== "DONE") return true;
      if (!item.closedAt) return true;
      const closedAt = startOfDay(new Date(item.closedAt));
      if (Number.isNaN(closedAt.getTime())) return true;
      return closedAt >= closedScheduleCauseCutoff;
    };
    const allScheduleDelays = wbsItems
      .filter(hasScheduleVarianceDates)
      .map((item) => ({
        item,
        delay: signedDaysBetween(
          startOfDay(new Date(item.baselineDueDate as string)),
          startOfDay(new Date(item.dueDate as string)),
        ),
      }))
      .filter(({ delay }) => delay > 0);
    const delayByItemId = new Map(
      allScheduleDelays.map(({ item, delay }) => [item.id, delay]),
    );
    const delayedLeafTaskIds = new Set(
      allScheduleDelays
        .filter(
          ({ item, delay }) =>
            delay > 0 &&
            item.type !== "MILESTONE" &&
            !childrenByParentId.has(item.id),
        )
        .map(({ item }) => item.id),
    );
    const upstreamCauseCache = new Map<string, Set<string>>();
    const upstreamDelayedCauseIds = (
      itemId: string,
      visiting = new Set<string>(),
    ): Set<string> => {
      const cached = upstreamCauseCache.get(itemId);
      if (cached) return cached;
      if (visiting.has(itemId)) return new Set<string>();
      visiting.add(itemId);
      const causeIds = new Set<string>();
      for (const predecessorId of predecessorIdsByItemId.get(itemId) ?? []) {
        if (delayedLeafTaskIds.has(predecessorId)) {
          causeIds.add(predecessorId);
        }
        for (const upstreamId of upstreamDelayedCauseIds(predecessorId, visiting)) {
          causeIds.add(upstreamId);
        }
      }
      visiting.delete(itemId);
      upstreamCauseCache.set(itemId, causeIds);
      return causeIds;
    };
    const openStatuses: WbsItemStatus[] = ["IN_PROGRESS", "AT_RISK", "BLOCKED"];
    const isScheduleVarianceOpenCandidate = (item: WbsItem) =>
      hasScheduleVarianceDates(item) &&
      item.type !== "MILESTONE" &&
      item.status !== "DONE";
    const scheduleDeltaItems = allScheduleDelays
      .filter(
        ({ item, delay }) => {
          if (
            delay <= 0 ||
            item.type === "MILESTONE" ||
            childrenByParentId.has(item.id) ||
            !isVisibleScheduleVarianceCause(item)
          ) {
            return false;
          }
          const upstreamCauseIds = [...upstreamDelayedCauseIds(item.id)];

          if (upstreamCauseIds.length === 0) return true;

          const allUpstreamCausesClosed = upstreamCauseIds.every(
            (predecessorId) => wbsById.get(predecessorId)?.status === "DONE",
          );

          return (
            criticalPathIds.has(item.id) &&
            openStatuses.includes(item.status) &&
            allUpstreamCausesClosed
          );
        },
      )
      .map(({ item, delay: rawDelay }) => {
        const upstreamCauseIds = [...upstreamDelayedCauseIds(item.id)];
        const inheritedFrom = upstreamCauseIds
          .map((itemId) => wbsById.get(itemId))
          .filter((entry): entry is WbsItem => Boolean(entry))
          .sort(
            (left, right) =>
              (delayByItemId.get(right.id) ?? 0) -
              (delayByItemId.get(left.id) ?? 0),
          )[0];
        const inheritedDelay = inheritedFrom
          ? delayByItemId.get(inheritedFrom.id) ?? 0
          : 0;
        return {
          item,
          delay: Math.max(0, rawDelay - inheritedDelay),
          rawDelay,
          inheritedFrom,
          inheritedDelay,
        };
      })
      .filter(({ delay }) => delay > 0)
      .sort(
        (left, right) =>
          right.rawDelay - left.rawDelay ||
          left.item.code.localeCompare(right.item.code, undefined, {
            numeric: true,
          }),
      )
      .slice(0, 5);
    const scheduleVarianceFromStructure = scheduleVarianceItems
      .filter(isScheduleVarianceOpenCandidate)
      .reduce((maxDelay, item) => {
        const delay = signedDaysBetween(
          startOfDay(new Date(item.baselineDueDate as string)),
          startOfDay(new Date(item.dueDate as string)),
        );
        return Math.max(maxDelay, delay);
      }, 0);

    return {
      openIssues,
      overdueItems,
      riskItems,
      decisionItems: decisionItems.length,
      nextMilestone,
      redZoneRisks,
      blockingTickets,
      openDecisionItems,
      scheduleDeltaItems,
      scheduleVarianceFromStructure,
    };
  }, [
    project?.criticalPath,
    project?.issues,
    project?.raidItems,
    project?.wbsDependencies,
    project?.wbsItems,
    structureMilestones,
  ]);
  const topbarScheduleHealth = project
    ? projectScheduleHealth(project.rag, overviewDashboard.scheduleVarianceFromStructure)
    : null;
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
        months: [] as Array<{ label: string; offset: number; showLabel: boolean; width: number }>,
        quarters: [] as Array<{ label: string; offset: number; showLabel: boolean; width: number }>,
        weeks: [] as Array<{ label: string; offset: number }>,
        todayOffset: null as number | null,
        dependencyLines: [] as Array<{
          id: string;
          predecessorId: string;
          successorId: string;
          type: WbsDependencyType;
          critical: boolean;
          fromSide: "start" | "end";
          fromMilestone: boolean;
          fromX: number;
          fromY: number;
          fromSlotOffset: number;
          fromDirection: number;
          toSide: "start" | "end";
          toMilestone: boolean;
          toX: number;
          toY: number;
          toSlotOffset: number;
          toDirection: number;
          styleSlot: number;
        }>,
        height: 0,
        criticalIds: new Set<string>(),
        criticalDependencyIds: new Set<string>(),
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
        showLabel: position.width >= 5,
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
        showLabel: position.width >= 12,
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
    const criticalIds = new Set(project?.criticalPath?.criticalItemIds ?? []);
    const criticalDependencyIds = new Set(
      project?.criticalPath?.criticalDependencyIds ?? [],
    );
    const criticalItemsById = new Map(
      (project?.criticalPath?.items ?? []).map((item) => [item.itemId, item]),
    );

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
      const bracket = item.type === "PHASE" || item.type === "WORK_PACKAGE";
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
        critical: criticalIds.has(item.id),
        nearCritical: criticalItemsById.get(item.id)?.isNearCritical ?? false,
        totalFloatWorkDays:
          criticalItemsById.get(item.id)?.totalFloatWorkDays ?? null,
        summary,
        bracket,
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
      total <= 1 ? 0 : (index - (total - 1) / 2) * 4;
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
        return {
          id: dependency.id,
          predecessorId: dependency.predecessorId,
          successorId: dependency.successorId,
          type: dependency.type,
          critical: criticalDependencyIds.has(dependency.id),
          fromSide,
          fromMilestone: predecessor.milestone,
          fromX: Math.max(0, Math.min(100, from)),
          fromY:
            predecessorRow * GANTT_ROW_HEIGHT +
            GANTT_ROW_HEIGHT / 2 +
            fromSlotOffset,
          fromSlotOffset,
          fromDirection: ganttPathDirection(fromSide),
          toSide,
          toMilestone: successor.milestone,
          toX: Math.max(0, Math.min(100, to)),
          toY: successorRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2 + toSlotOffset,
          toSlotOffset,
          toDirection: ganttTargetDirection(toSide),
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
          critical: boolean;
          fromSide: "start" | "end";
          fromMilestone: boolean;
          fromX: number;
          fromY: number;
          fromSlotOffset: number;
          fromDirection: number;
          toSide: "start" | "end";
          toMilestone: boolean;
          toX: number;
          toY: number;
          toSlotOffset: number;
          toDirection: number;
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
      criticalDependencyIds,
      items,
    };
  }, [project?.criticalPath, project?.wbsDependencies, visibleWbsTree]);
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
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/jira/sync`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось синхронизировать Jira");
      }
      const refreshed = await authenticatedFetch(
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
      projectRef.current = nextProject;
      const nextWbsDrafts = Object.fromEntries(
        nextProject.wbsItems.map((item) => [item.id, wbsToForm(item)]),
      );
      wbsDraftsRef.current = nextWbsDrafts;
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
      setWbsSort(normalizeWbsSort(nextProject.uiState?.wbsSort));
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
        nextProject.uiState?.ganttPanelWidth ?? GANTT_PANEL_WIDTH_DEFAULT,
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
      const allProjectIssues = [
        ...nextProject.issues,
        ...(nextProject.closedIssues ?? []),
      ];
      setIssueLinkDrafts(
        Object.fromEntries(
          allProjectIssues.map((issue) => [
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
        allProjectIssues.some((issue) => issue.id === currentIssueId)
          ? currentIssueId
          : null,
      );
      setWbsDrafts(nextWbsDrafts);
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
      setRaidStatusDrafts((current) =>
        Object.fromEntries(
          nextProject.raidItems.map((item) => [
            item.id,
            current[item.id] ?? { statusAt: isoDate(new Date()), text: "" },
          ]),
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
    if (authMode !== "ready" || !selectedProjectId) return;
    let cancelled = false;
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
    const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${selectedProjectId}/overview`,
        "Не удалось загрузить проект",
      )
      .then((data: ProjectDetails) => {
        if (
          !cancelled &&
          shouldApplyProjectSnapshotAfterWbsSave({
            loadSequenceAtStart: loadSequence,
            currentLoadSequence: projectLoadSequenceRef.current,
            wbsSaveSequenceAtStart,
            currentWbsSaveSequence: wbsSaveSequenceRef.current,
            pendingWbsSavesAtStart,
            currentPendingWbsSaves: pendingWbsSaveCountRef.current,
          })
        ) {
          applyProject(data);
        }
      })
      .catch(() => setError("Не удалось загрузить проект"));
    return () => {
      cancelled = true;
    };
  }, [applyProject, authMode, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || activeView !== "project-overview") {
      return;
    }
    let cancelled = false;
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
    const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${selectedProjectId}/overview`,
        "Не удалось обновить обзор проекта",
      )
      .then((data) => {
        if (
          !cancelled &&
          shouldApplyProjectSnapshotAfterWbsSave({
            loadSequenceAtStart: loadSequence,
            currentLoadSequence: projectLoadSequenceRef.current,
            wbsSaveSequenceAtStart,
            currentWbsSaveSequence: wbsSaveSequenceRef.current,
            pendingWbsSavesAtStart,
            currentPendingWbsSaves: pendingWbsSaveCountRef.current,
          })
        ) {
          applyProject(data);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось обновить обзор проекта",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, applyProject, selectedProjectId]);

  useEffect(() => {
    if (!fullscreenWorkspaceView) return;

    const expectedView =
      fullscreenWorkspaceView === "overview-milestones-by-phase" ||
      fullscreenWorkspaceView === "overview-milestones-all"
        ? "project-overview"
        : fullscreenWorkspaceView;

    if (activeView === expectedView) return;

    const timeoutId = window.setTimeout(() => {
      setFullscreenWorkspaceView(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeView, fullscreenWorkspaceView]);

  useEffect(() => {
    if (!fullscreenWorkspaceView) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenWorkspaceView(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenWorkspaceView]);

  function applyWbsSnapshotResult(
    nextItems: WbsItem[],
    nextDependencies?: WbsDependency[],
    nextCriticalPath?: WbsCriticalPath | null,
  ) {
    const currentProject = projectRef.current;
    const nextProject = currentProject
      ? {
          ...currentProject,
          wbsItems: nextItems,
          wbsDependencies: nextDependencies ?? currentProject.wbsDependencies,
          criticalPath:
            nextCriticalPath === undefined
              ? currentProject.criticalPath
              : nextCriticalPath,
        }
      : currentProject;
    projectRef.current = nextProject;
    setProject(nextProject);
    const nextWbsDrafts = Object.fromEntries(
      nextItems.map((item) => [item.id, wbsToForm(item)]),
    );
    wbsDraftsRef.current = nextWbsDrafts;
    setWbsDrafts(nextWbsDrafts);
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
      const response = await authenticatedFetch(
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
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
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
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-baseline`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось сохранить базовый план");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
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
      const response = await authenticatedFetch(
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
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
    const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
    const refreshed = await apiClient.get<ProjectDetails>(
      `/api/projects/${projectId}/overview`,
      "Не удалось загрузить проект",
    );
    if (
      !shouldApplyProjectSnapshotAfterWbsSave({
        loadSequenceAtStart: loadSequence,
        currentLoadSequence: projectLoadSequenceRef.current,
        wbsSaveSequenceAtStart,
        currentWbsSaveSequence: wbsSaveSequenceRef.current,
        pendingWbsSavesAtStart,
        currentPendingWbsSaves: pendingWbsSaveCountRef.current,
      })
    ) {
      return;
    }
    applyProject(refreshed);
  }

  async function saveJiraIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSavingJira(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
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
    } else {
      setSelectedProjectId((currentId) => {
        if (currentId && data.some((item) => item.id === currentId)) {
          return currentId;
        }
        return data.find((item) => item.status !== "CLOSED")?.id ?? data[0]?.id ?? null;
      });
    }
  }

  async function reloadUsers() {
    if (currentUser?.role !== "ADMIN") return;
    const data = await apiClient.get<SystemUser[]>(
      "/api/users",
      "Не удалось загрузить пользователей",
    );
    setUsers(data);
    setUserDrafts(usersToDrafts(data));
  }

  async function reloadAuditEvents() {
    if (currentUser?.role !== "ADMIN") return;
    const data = await apiClient.get<AuditEvent[]>(
      "/api/audit-events?limit=100",
      "Не удалось загрузить журнал аудита",
    );
    setAuditEvents(data);
  }

  async function reloadAdminConfig() {
    if (currentUser?.role !== "ADMIN") return;
    const config = await apiClient.get<AdminConfig>(
      "/api/admin/config",
      "Не удалось загрузить настройки администрирования",
    );
    setRolePermissions(config.rolePermissions);
    setDictionaryItems(config.dictionaryItems);
    setDictionaryDrafts(dictionaryItemsToDrafts(config.dictionaryItems));
    setSystemSettings(config.systemSettings);
    setSystemSettingsDraft(systemSettingsToDraft(config.systemSettings));
    const normalizedModules = normalizeProjectModulesForUi(config.projectModules);
    setProjectModules(normalizedModules);
    setProjectModuleDrafts(projectModulesToDraft(normalizedModules));
    setAdminHealth(config.health);
    setBackupStatus(config.backupStatus);
  }

  async function reloadAdminIntegrations() {
    if (currentUser?.role !== "ADMIN") return;
    const integrations = await apiClient.get<AdminIntegrations>(
      "/api/admin/integrations",
      "Не удалось загрузить интеграции",
    );
    setAdminIntegrations(integrations);
  }

  function openSearchResult(result: SearchResult) {
    setGlobalSearch("");
    setSearchOpen(false);
    if (result.projectId) {
      setSelectedProjectId(result.projectId);
      const section =
        result.url.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "overview";
      const nextView = projectPathViews[section] ?? "project-overview";
      openView(nextView, { projectCode: result.projectCode });
      return;
    }
    openView("portfolio");
  }

  function savedViewTypeForActiveView() {
    if (activeView === "project-structure") return "structure";
    if (activeView === "project-gantt") return "gantt";
    if (activeView === "project-raid") return "risks";
    return null;
  }

  function currentSavedViewConfig(): Record<string, unknown> {
    if (activeView === "project-structure") {
      return {
        wbsColumnOrder,
        wbsHiddenColumns,
        wbsColumnWidths,
        wbsSort,
        activeWbsHierarchyLevel,
        showStructureCriticalPath,
      };
    }
    if (activeView === "project-gantt") {
      return {
        ganttScale,
        activeWbsHierarchyLevel,
        showGanttDependencies,
        showGanttCriticalPath,
        showGanttBaseline,
        showGanttForecast,
        ganttWbsWidth,
        ganttPanelHeight,
        ganttPanelWidth,
      };
    }
    if (activeView === "project-raid") {
      return {
        raidTypeFilter,
        raidDecisionOnly,
        raidOverdueOnly,
        raidHighOnly,
      };
    }
    return {};
  }

  function applySavedView(view: SavedView) {
    const config = view.config ?? {};
    if (Array.isArray(config.wbsColumnOrder)) {
      setWbsColumnOrder(normalizeWbsColumnOrder(config.wbsColumnOrder as WbsTableColumnKey[]));
    }
    if (Array.isArray(config.wbsHiddenColumns)) {
      setWbsHiddenColumns(normalizeWbsHiddenColumns(config.wbsHiddenColumns as WbsTableColumnKey[]));
    }
    if (config.wbsColumnWidths && typeof config.wbsColumnWidths === "object") {
      setWbsColumnWidths((current) =>
        normalizeWbsColumnWidths({
          ...current,
          ...(config.wbsColumnWidths as Partial<Record<WbsTableColumnKey, number>>),
        }),
      );
    }
    if (Object.prototype.hasOwnProperty.call(config, "wbsSort")) {
      setWbsSort(normalizeWbsSort(config.wbsSort));
    }
    if (
      typeof config.activeWbsHierarchyLevel === "number" &&
      GANTT_HIERARCHY_LEVELS.includes(config.activeWbsHierarchyLevel as 1 | 2 | 3 | 4 | 5)
    ) {
      setWbsHierarchyLevel(config.activeWbsHierarchyLevel);
    }
    if (typeof config.showStructureCriticalPath === "boolean") {
      setShowStructureCriticalPath(config.showStructureCriticalPath);
    }
    if (config.ganttScale === "month" || config.ganttScale === "quarter") {
      setGanttScale(config.ganttScale);
    }
    if (typeof config.showGanttDependencies === "boolean") {
      setShowGanttDependencies(config.showGanttDependencies);
    }
    if (typeof config.showGanttCriticalPath === "boolean") {
      setShowGanttCriticalPath(config.showGanttCriticalPath);
    }
    if (typeof config.showGanttBaseline === "boolean") {
      setShowGanttBaseline(config.showGanttBaseline);
    }
    if (typeof config.showGanttForecast === "boolean") {
      setShowGanttForecast(config.showGanttForecast);
    }
    if (typeof config.ganttWbsWidth === "number") {
      setGanttWbsWidth(clampNumber(config.ganttWbsWidth, 260, 640));
    }
    if (typeof config.ganttPanelHeight === "number") {
      setGanttPanelHeight(clampNumber(config.ganttPanelHeight, 320, 900));
    }
    if (typeof config.ganttPanelWidth === "number") {
      setGanttPanelWidth(config.ganttPanelWidth);
    }
    if (config.raidTypeFilter === "ALL" || config.raidTypeFilter === "RISK" || config.raidTypeFilter === "DEPENDENCY" || config.raidTypeFilter === "ASSUMPTION") {
      setRaidTypeFilter(config.raidTypeFilter);
    }
    if (typeof config.raidDecisionOnly === "boolean") setRaidDecisionOnly(config.raidDecisionOnly);
    if (typeof config.raidOverdueOnly === "boolean") setRaidOverdueOnly(config.raidOverdueOnly);
    if (typeof config.raidHighOnly === "boolean") setRaidHighOnly(config.raidHighOnly);
    void apiClient.post(`/api/saved-views/${view.id}/use`, undefined).catch(() => null);
    setNotice(`Представление "${view.name}" применено`);
  }

  async function saveCurrentSavedView() {
    const viewType = savedViewTypeForActiveView();
    if (!viewType || !selectedProjectId) return;
    setSavingSavedView(true);
    setError(null);
    setNotice(null);
    try {
      const view = await apiClient.post<SavedView>(
        "/api/saved-views",
        {
          projectId: selectedProjectId,
          viewType,
          name: savedViewName.trim() || `Вид ${new Date().toLocaleString("ru-RU")}`,
          config: currentSavedViewConfig(),
          isShared: currentUser?.role === "ADMIN",
          sortOrder: 0,
        },
        "Не удалось сохранить представление",
      );
      setSavedViews((current) => [view, ...current.filter((item) => item.id !== view.id)]);
      setSavedViewName("");
      setNotice("Представление сохранено");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить представление",
      );
    } finally {
      setSavingSavedView(false);
    }
  }

  async function createApiToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingIntegration(true);
    setCreatedApiToken(null);
    setError(null);
    setNotice(null);
    try {
      const token = await apiClient.post<ApiTokenInfo>(
        "/api/admin/api-tokens",
        {
          name: apiTokenDraft.name.trim(),
          scopes: apiTokenDraft.scopes
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
          rateLimitPerMinute: Number(apiTokenDraft.rateLimitPerMinute) || 120,
          expiresAt: apiTokenDraft.expiresAt || null,
        },
        "Не удалось создать API-токен",
      );
      setCreatedApiToken(token.token ?? null);
      await reloadAdminIntegrations();
      setNotice("API-токен создан. Скопируйте значение сейчас: оно больше не будет показано.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось создать API-токен");
    } finally {
      setSavingIntegration(false);
    }
  }

  async function toggleApiToken(token: ApiTokenInfo) {
    setSavingIntegration(true);
    setError(null);
    try {
      await apiClient.patch<ApiTokenInfo>(
        `/api/admin/api-tokens/${token.id}`,
        { isActive: !token.isActive },
        "Не удалось обновить API-токен",
      );
      await reloadAdminIntegrations();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить API-токен");
    } finally {
      setSavingIntegration(false);
    }
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingIntegration(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.post<WebhookEndpointInfo>(
        "/api/admin/webhooks",
        {
          name: webhookDraft.name.trim(),
          url: webhookDraft.url.trim(),
          events: webhookDraft.events
            .split(",")
            .map((eventName) => eventName.trim())
            .filter(Boolean),
          secret: webhookDraft.secret.trim() || null,
          isActive: webhookDraft.isActive,
        },
        "Не удалось создать webhook",
      );
      setWebhookDraft({ name: "Webhook", url: "", events: "*", secret: "", isActive: true });
      await reloadAdminIntegrations();
      setNotice("Webhook сохранен");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось создать webhook");
    } finally {
      setSavingIntegration(false);
    }
  }

  async function toggleWebhook(endpoint: WebhookEndpointInfo) {
    setSavingIntegration(true);
    setError(null);
    try {
      await apiClient.patch<WebhookEndpointInfo>(
        `/api/admin/webhooks/${endpoint.id}`,
        { isActive: !endpoint.isActive },
        "Не удалось обновить webhook",
      );
      await reloadAdminIntegrations();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить webhook");
    } finally {
      setSavingIntegration(false);
    }
  }

  async function testWebhook(endpointId: string) {
    setSavingIntegration(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.post(`/api/admin/webhooks/${endpointId}/test`, undefined, "Не удалось отправить тест");
      await reloadAdminIntegrations();
      setNotice("Тестовое событие отправлено");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось отправить тест");
    } finally {
      setSavingIntegration(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const path =
        authMode === "setup" ? "/api/auth/bootstrap" : "/api/auth/login";
      const payload =
        authMode === "setup"
          ? authForm
          : { email: authForm.email, password: authForm.password };
      const result = await apiClient.post<{ user: CurrentUser }>(
        path,
        payload,
        authMode === "setup"
          ? "Не удалось создать администратора"
          : "Не удалось войти",
      );
      setCurrentUser(result.user);
      setAuthMode("ready");
      setAuthForm(emptyAuthForm);
      setNotice(authMode === "setup" ? "Администратор создан" : "Вход выполнен");
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Не удалось выполнить вход",
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function logout() {
    setError(null);
    setNotice(null);
    await apiClient.post<null>("/api/auth/logout", undefined, "Не удалось выйти").catch(
      () => null,
    );
    setCurrentUser(null);
    setAuthMode("ready");
    if (writeProtectedViews.has(activeView)) {
      openView(selectedProjectId ? firstEnabledProjectView : "portfolio", {
        replace: true,
      });
    }
    setUsers([]);
    setAuditEvents([]);
    setRolePermissions([]);
    setDictionaryItems([]);
    setDictionaryDrafts({});
    setSystemSettings([]);
    setSystemSettingsDraft(emptySystemSettingsDraft);
    setAdminHealth(null);
    setBackupStatus(null);
    setAdminIntegrations(null);
    setCreatedApiToken(null);
    setConfigTransferText("");
    setNotice("Включен режим только для просмотра");
  }

  async function saveProjectUiState(
    patch: ProjectUiState,
    options?: {
      sidebarCollapsed?: boolean;
      wbsColumnOrder?: WbsTableColumnKey[];
      wbsHiddenColumns?: WbsTableColumnKey[];
      wbsColumnWidths?: Record<WbsTableColumnKey, number>;
      wbsSort?: WbsSortState | null;
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
      wbsSort: options?.wbsSort ?? wbsSort,
      ganttPanelHeight: options?.ganttPanelHeight ?? ganttPanelHeight,
      ganttPanelWidth: options?.ganttPanelWidth ?? ganttPanelWidth,
      ganttWbsWidth: options?.ganttWbsWidth ?? ganttWbsWidth,
      ...patch,
    };
    setProject((current) =>
      current ? { ...current, uiState: nextUiState } : current,
    );
    const response = await authenticatedFetch(`${apiBase}/api/projects/${project.id}`, {
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
      copyBaselineFromProjectId: form.copyBaselineFromProjectId || null,
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
      const response = await authenticatedFetch(`${apiBase}/api/projects`, {
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
      openView("project-structure", { replace: true });
      setSelectedProjectId(result.id);
      setProject(null);
      await reloadProjects(result.id);
      await refreshProject(result.id);
      await reloadAuditEvents();
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

  function updateUserDraft(userId: string, patch: Partial<UserDraftState>) {
    setUserDrafts((current) => {
      const sourceUser = users.find((item) => item.id === userId);
      const currentDraft =
        current[userId] ?? (sourceUser ? userToDraft(sourceUser) : null);
      if (!currentDraft) return current;
      return {
        ...current,
        [userId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  }

  function updateDictionaryDraft(
    itemId: string,
    patch: Partial<DictionaryItemDraft>,
  ) {
    setDictionaryDrafts((current) => {
      const sourceItem = dictionaryItems.find((item) => item.id === itemId);
      const currentDraft =
        current[itemId] ??
        (sourceItem ? dictionaryItemToDraft(sourceItem) : null);
      if (!currentDraft) return current;
      return {
        ...current,
        [itemId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  }

  function updateProjectModuleDraft(key: ProjectModuleKey, enabled: boolean) {
    setProjectModuleDrafts((current) => ({
      ...current,
      [key]: enabled,
    }));
  }

  async function saveProjectModules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProjectModules(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        modules: normalizedProjectModules.map((module) => ({
          key: module.key,
          enabled: projectModuleDrafts[module.key] ?? module.enabled,
        })),
      };
      const updated = await apiClient.put<ProjectModule[]>(
        "/api/admin/project-modules",
        payload,
        "Не удалось сохранить управление модулями",
      );
      const normalized = normalizeProjectModulesForUi(updated);
      setProjectModules(normalized);
      setProjectModuleDrafts(projectModulesToDraft(normalized));
      await reloadAuditEvents();
      setNotice("Настройки модулей сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить управление модулями",
      );
    } finally {
      setSavingProjectModules(false);
    }
  }

  async function toggleRolePermission(permission: RolePermission) {
    setSavingRolePermissionId(permission.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiClient.patch<RolePermission>(
        `/api/admin/role-permissions/${permission.id}`,
        { enabled: !permission.enabled },
        "Не удалось сохранить право роли",
      );
      setRolePermissions((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await reloadAuditEvents();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить право роли",
      );
    } finally {
      setSavingRolePermissionId(null);
    }
  }

  function dictionaryPayload(draft: DictionaryItemDraft) {
    return {
      dictionary: draft.dictionary.trim(),
      code: draft.code.trim(),
      label: draft.label.trim(),
      description: draft.description.trim() || null,
      sortOrder: Number(draft.sortOrder) || 0,
      isActive: draft.isActive,
    };
  }

  async function createDictionaryItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingDictionaryItem(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.post<DictionaryItem>(
        "/api/admin/dictionary-items",
        dictionaryPayload(newDictionaryDraft),
        "Не удалось создать элемент справочника",
      );
      setNewDictionaryDraft({
        ...emptyDictionaryDraft,
        dictionary: newDictionaryDraft.dictionary,
      });
      await reloadAdminConfig();
      await reloadAuditEvents();
      setNotice("Элемент справочника сохранен");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать элемент справочника",
      );
    } finally {
      setCreatingDictionaryItem(false);
    }
  }

  async function saveDictionaryItem(itemId: string) {
    const draft = dictionaryDrafts[itemId];
    if (!draft) return;
    setSavingDictionaryItemId(itemId);
    setError(null);
    setNotice(null);
    try {
      await apiClient.patch<DictionaryItem>(
        `/api/admin/dictionary-items/${itemId}`,
        dictionaryPayload(draft),
        "Не удалось сохранить элемент справочника",
      );
      await reloadAdminConfig();
      await reloadAuditEvents();
      setNotice("Справочник обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить элемент справочника",
      );
    } finally {
      setSavingDictionaryItemId(null);
    }
  }

  async function deactivateDictionaryItem(itemId: string) {
    setSavingDictionaryItemId(itemId);
    setError(null);
    setNotice(null);
    try {
      await apiClient.delete(
        `/api/admin/dictionary-items/${itemId}`,
        "Не удалось отключить элемент справочника",
      );
      await reloadAdminConfig();
      await reloadAuditEvents();
      setNotice("Элемент справочника отключен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось отключить элемент справочника",
      );
    } finally {
      setSavingDictionaryItemId(null);
    }
  }

  async function saveSystemSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSystemSettings(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiClient.put<SystemSetting[]>(
        "/api/admin/system-settings",
        {
          settings: {
            "jira.enabled": {
              value: systemSettingsDraft.jiraEnabled ? "true" : "false",
            },
            "jira.baseUrl": {
              value: systemSettingsDraft.jiraBaseUrl.trim(),
            },
            "jira.email": {
              value: systemSettingsDraft.jiraEmail.trim(),
            },
            "jira.apiToken": {
              value: systemSettingsDraft.jiraApiToken.trim(),
              isSecret: true,
            },
            "jira.maxResults": {
              value: String(Number(systemSettingsDraft.jiraMaxResults) || 100),
            },
            "gitlab.enabled": {
              value: systemSettingsDraft.gitlabEnabled ? "true" : "false",
            },
            "gitlab.baseUrl": {
              value: systemSettingsDraft.gitlabBaseUrl.trim(),
            },
            "gitlab.token": {
              value: systemSettingsDraft.gitlabToken.trim(),
              isSecret: true,
            },
            "github.enabled": {
              value: systemSettingsDraft.githubEnabled ? "true" : "false",
            },
            "github.baseUrl": {
              value: systemSettingsDraft.githubBaseUrl.trim(),
            },
            "github.token": {
              value: systemSettingsDraft.githubToken.trim(),
              isSecret: true,
            },
            "azureDevOps.enabled": {
              value: systemSettingsDraft.azureDevOpsEnabled ? "true" : "false",
            },
            "azureDevOps.organizationUrl": {
              value: systemSettingsDraft.azureDevOpsOrganizationUrl.trim(),
            },
            "azureDevOps.token": {
              value: systemSettingsDraft.azureDevOpsToken.trim(),
              isSecret: true,
            },
            "bi.enabled": {
              value: systemSettingsDraft.biEnabled ? "true" : "false",
            },
            "bi.exportUrl": {
              value: systemSettingsDraft.biExportUrl.trim(),
            },
            "rag.formula.green": {
              value: systemSettingsDraft.ragGreenFormula.trim(),
            },
            "rag.formula.amber": {
              value: systemSettingsDraft.ragAmberFormula.trim(),
            },
            "rag.formula.red": {
              value: systemSettingsDraft.ragRedFormula.trim(),
            },
            "workflow.overview": {
              value: systemSettingsDraft.overviewWorkflow.trim(),
            },
            "workflow.baseline": {
              value: systemSettingsDraft.baselineWorkflow.trim(),
            },
            "workflow.projectClose": {
              value: systemSettingsDraft.projectCloseWorkflow.trim(),
            },
            "wbs.templates": {
              value: systemSettingsDraft.wbsTemplates.trim(),
            },
          },
        },
        "Не удалось сохранить системные настройки",
      );
      setSystemSettings(updated);
      setSystemSettingsDraft(systemSettingsToDraft(updated));
      await reloadAdminIntegrations();
      await reloadAuditEvents();
      setNotice("Системные настройки сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить системные настройки",
      );
    } finally {
      setSavingSystemSettings(false);
    }
  }

  async function reloadAdminHealth() {
    if (currentUser?.role !== "ADMIN") return;
    const [health, backup] = await Promise.all([
      apiClient.get<AdminHealth>(
        "/api/admin/system-health",
        "Не удалось загрузить состояние системы",
      ),
      apiClient.get<BackupStatus>(
        "/api/admin/backup-status",
        "Не удалось загрузить состояние backup",
      ),
    ]);
    setAdminHealth(health);
    setBackupStatus(backup);
  }

  async function exportAdminConfig() {
    setError(null);
    setNotice(null);
    try {
      const data = await apiClient.get<unknown>(
        "/api/admin/config/export",
        "Не удалось экспортировать конфигурацию",
      );
      setConfigTransferText(JSON.stringify(data, null, 2));
      setNotice("Конфигурация экспортирована в поле ниже");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Не удалось экспортировать конфигурацию",
      );
    }
  }

  async function importAdminConfig() {
    setImportingConfig(true);
    setError(null);
    setNotice(null);
    try {
      const payload = JSON.parse(configTransferText);
      await apiClient.post<{ ok: boolean }>(
        "/api/admin/config/import",
        payload,
        "Не удалось импортировать конфигурацию",
      );
      await reloadAdminConfig();
      await reloadAuditEvents();
      setNotice("Конфигурация импортирована");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Не удалось импортировать конфигурацию",
      );
    } finally {
      setImportingConfig(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.post<SystemUser>(
        "/api/users",
        {
          ...newUserForm,
          email: newUserForm.email.trim(),
          name: newUserForm.name.trim(),
        },
        "Не удалось создать пользователя",
      );
      setNewUserForm(emptyUserForm);
      await reloadUsers();
      await reloadAuditEvents();
      setNotice("Пользователь создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать пользователя",
      );
    } finally {
      setCreatingUser(false);
    }
  }

  async function saveUser(userId: string) {
    const draft = userDrafts[userId];
    if (!draft) return;
    setSavingUserId(userId);
    setError(null);
    setNotice(null);
    try {
      await apiClient.patch<SystemUser>(
        `/api/users/${userId}`,
        {
          email: draft.email.trim(),
          name: draft.name.trim(),
          role: draft.role,
          isActive: draft.isActive,
        },
        "Не удалось сохранить пользователя",
      );
      if (draft.password.trim()) {
        await apiClient.post<SystemUser>(
          `/api/users/${userId}/password`,
          { password: draft.password },
          "Не удалось сменить пароль",
        );
      }
      await reloadUsers();
      await reloadAuditEvents();
      setNotice("Пользователь обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить пользователя",
      );
    } finally {
      setSavingUserId(null);
    }
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
      const response = await authenticatedFetch(`${apiBase}/api/projects/${projectId}`, {
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
      await reloadAuditEvents();
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
      const response = await authenticatedFetch(`${apiBase}/api/projects/${projectId}`, {
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
      await reloadAuditEvents();
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

  async function closeProject(projectId: string) {
    const sourceProject = projects.find((item) => item.id === projectId);
    if (!sourceProject) return;
    if (
      !window.confirm(
        `Закрыть проект ${sourceProject.code}? После закрытия проект будет доступен только для чтения даже администратору.`,
      )
    ) {
      return;
    }
    setSavingProjectRegistryId(projectId);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${projectId}/close`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось закрыть проект");
      }
      await reloadProjects(
        selectedProjectId === projectId
          ? projects.find((item) => item.id !== projectId && item.status !== "CLOSED")?.id
          : selectedProjectId ?? undefined,
      );
      if (selectedProjectId === projectId) {
        setProject(null);
        openView("closed-projects");
      }
      await reloadAuditEvents();
      setNotice(`Проект ${sourceProject.code} закрыт`);
    } catch (closeError) {
      setError(
        closeError instanceof Error
          ? closeError.message
          : "Не удалось закрыть проект",
      );
    } finally {
      setSavingProjectRegistryId(null);
    }
  }

  async function deleteProject(projectId: string) {
    const sourceProject = projects.find((item) => item.id === projectId);
    if (!sourceProject) return;
    if (
      !window.confirm(
        `Удалить проект ${sourceProject.code} и все его данные? Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    setSavingProjectRegistryId(projectId);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${projectId}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить проект");
      }
      const nextSelectedProjectId =
        selectedProjectId === projectId
          ? projects.find((item) => item.id !== projectId && item.status !== "CLOSED")?.id
          : selectedProjectId ?? undefined;
      await reloadProjects(nextSelectedProjectId);
      if (selectedProjectId === projectId) {
        setProject(null);
        openView(nextSelectedProjectId ? firstEnabledProjectView : "portfolio");
      }
      await reloadAuditEvents();
      setNotice(`Проект ${sourceProject.code} удален`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить проект",
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
      const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(
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
      await authenticatedFetch(`${apiBase}/api/projects/${project.id}/artifacts/reorder`, {
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
      const response = await authenticatedFetch(
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

  function updateRaidStatusDraft(
    itemId: string,
    patch: Partial<{ statusAt: string; text: string }>,
  ) {
    const current =
      raidStatusDrafts[itemId] ?? { statusAt: isoDate(new Date()), text: "" };
    setRaidStatusDrafts({
      ...raidStatusDrafts,
      [itemId]: { ...current, ...patch },
    });
  }

  async function createRaidItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(`${apiBase}/api/raid-items/${itemId}`, {
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

  async function addRaidStatusUpdate(itemId: string) {
    const draft =
      raidStatusDrafts[itemId] ?? { statusAt: isoDate(new Date()), text: "" };
    if (!draft.text.trim()) {
      setError("Заполните текст статуса");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/raid-items/${itemId}/status-updates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statusAt: draft.statusAt || isoDate(new Date()),
            text: draft.text.trim(),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось добавить статус",
        );
      }
      setRaidStatusDrafts({
        ...raidStatusDrafts,
        [itemId]: { statusAt: isoDate(new Date()), text: "" },
      });
      await refreshProject();
      setNotice("Статус добавлен");
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Не удалось добавить статус",
      );
    }
  }

  async function deleteRaidItem(itemId: string) {
    if (!window.confirm("Удалить запись о риске?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(`${apiBase}/api/raid-items/${itemId}`, {
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

  function wbsPayload(
    itemId: string,
    form: WbsFormState,
    options: { scheduleDriver?: WbsScheduleDriver } = {},
  ) {
    const nextLevel = form.wbsLevel ? Number(form.wbsLevel) : null;
    const workDays = form.workDays.trim();
    const calendarDays = form.calendarDays.trim();
    const leadLagDays = form.leadLagDays.trim();
    const planWorkDays = form.planWorkDays.trim();
    const planCalendarDays = form.planCalendarDays.trim();
    const payload = {
      ...form,
      parentId: parentIdFromWbsLevel(
        itemId,
        nextLevel,
        wbsTree,
        wbsDraftsRef.current,
      ),
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
      leadLagDays: leadLagDays ? Number(leadLagDays) : 0,
      workDays: workDays ? Number(workDays) : null,
      calendarDays: calendarDays ? Number(calendarDays) : null,
      excelStartDate: form.excelStartDate || null,
      excelEndDate: form.excelEndDate || null,
      planWorkDays: planWorkDays ? Number(planWorkDays) : null,
      planCalendarDays: planCalendarDays
        ? Number(planCalendarDays)
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
    return options.scheduleDriver
      ? { ...payload, scheduleDriver: options.scheduleDriver }
      : payload;
  }

  function isLatestWbsSave(itemId: string, saveSequence: number) {
    return (
      wbsSaveSequenceRef.current === saveSequence &&
      latestWbsSaveSequenceByItemRef.current[itemId] === saveSequence
    );
  }

  function updateWbsDraft(itemId: string, patch: Partial<WbsFormState>) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const nextDrafts = {
      ...wbsDraftsRef.current,
      [itemId]: { ...current, ...patch },
    };
    wbsDraftsRef.current = nextDrafts;
    setWbsDrafts(nextDrafts);
  }

  function resetWbsDraft(itemId: string) {
    const currentItem = projectRef.current?.wbsItems.find(
      (item) => item.id === itemId,
    );
    if (!currentItem) return;
    setWbsDrafts(() => {
      const source = wbsToForm(currentItem);
      const nextDrafts = {
        ...wbsDraftsRef.current,
        [itemId]: {
          ...source,
          code: draftWbsCodes.get(itemId) ?? source.code,
        },
      };
      wbsDraftsRef.current = nextDrafts;
      return nextDrafts;
    });
  }

  function wbsEditKeyHandler(
    itemId: string,
    scheduleDriver?: WbsScheduleDriver,
  ) {
    return editableKeyHandler({
      onEnter: () => {
        void saveWbsItem(itemId, { silent: true, scheduleDriver });
      },
      onEscape: () => resetWbsDraft(itemId),
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
      wbsDraftsRef.current = next;
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
    const tableRows = visibleStructureWbsTree;
    const startIndex = tableRows.findIndex(
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
        const item = tableRows[startIndex + rowIndex];
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
      wbsDraftsRef.current = next;
      return next;
    });
    setNotice(`Вставлено строк из Excel: ${pastedRows.length}`);
  }

  function saveWbsDraftPatch(
    itemId: string,
    patch: Partial<WbsFormState>,
    options: { silent?: boolean; scheduleDriver?: WbsScheduleDriver } = {},
  ) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const nextDraft = { ...current, ...patch };
    const nextDrafts = {
      ...wbsDraftsRef.current,
      [itemId]: nextDraft,
    };
    wbsDraftsRef.current = nextDrafts;
    setWbsDrafts(nextDrafts);
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
    const panel = event.currentTarget.closest(".gantt-panel");
    const bounds = ganttPanelWidthBounds(panel);
    const currentPanelWidth =
      panel?.getBoundingClientRect().width ?? ganttPanelWidth;
    const startWidth = clampNumber(
      currentPanelWidth,
      bounds.min,
      bounds.max,
    );
    const startHeight = ganttPanelHeight;
    let latestWidth =
      axis === "height" ? ganttPanelWidth : startWidth;
    let latestHeight = startHeight;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (axis === "width" || axis === "both") {
        latestWidth = clampNumber(
          startWidth + moveEvent.clientX - startX,
          bounds.min,
          bounds.max,
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
      const patch: ProjectUiState = {
        ganttPanelHeight: latestHeight,
      };
      const options: {
        ganttPanelHeight?: number;
        ganttPanelWidth?: number;
      } = {
        ganttPanelHeight: latestHeight,
      };
      if (axis === "width" || axis === "both") {
        patch.ganttPanelWidth = latestWidth;
        options.ganttPanelWidth = latestWidth;
      }
      await saveProjectUiState(
        patch,
        options,
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function resetGanttPanelSize() {
    setGanttPanelHeight(GANTT_PANEL_HEIGHT_DEFAULT);
    setGanttPanelWidth(GANTT_PANEL_WIDTH_DEFAULT);
    await saveProjectUiState(
      {
        ganttPanelHeight: GANTT_PANEL_HEIGHT_DEFAULT,
        ganttPanelWidth: GANTT_PANEL_WIDTH_DEFAULT,
      },
      {
        ganttPanelHeight: GANTT_PANEL_HEIGHT_DEFAULT,
        ganttPanelWidth: GANTT_PANEL_WIDTH_DEFAULT,
      },
    );
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

  function toggleWbsSort(columnKey: WbsTableColumnKey) {
    setWbsSort((current) => {
      const next =
        current?.columnKey !== columnKey
          ? { columnKey, direction: "asc" as const }
          : current.direction === "asc"
          ? { columnKey, direction: "desc" as const }
          : null;
      if (project && isAuthenticated && !isClosedProject) {
        void saveProjectUiState({ wbsSort: next }, { wbsSort: next });
      }
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
              onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
              onKeyDown={wbsEditKeyHandler(item.id)}
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
              onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
              onKeyDown={wbsEditKeyHandler(item.id)}
              onBlur={() => void saveWbsItem(item.id, { silent: true })}
            />
            <div className="wbs-row-controls">
              <button
                type="button"
                className="wbs-row-drag-handle"
                draggable={!wbsSort}
                onDragStart={(event) => {
                  if (wbsSort) {
                    event.preventDefault();
                    return;
                  }
                  setDraggedWbsItemId(item.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-wbs-item", item.id);
                }}
                onDragEnd={() => {
                  setDraggedWbsItemId(null);
                  setWbsDropTargetId(null);
                }}
                aria-label={
                  wbsSort
                    ? "Перемещение строк доступно после отключения сортировки"
                    : "Перетащить строку Структуры"
                }
                title={
                  wbsSort
                    ? "Перемещение строк доступно после отключения сортировки"
                    : "Перетащить строку Структуры"
                }
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
                const afterIndex = visibleStructureWbsTree.findIndex(
                  (visibleItem) => visibleItem.id === item.id,
                );
                if (afterIndex >= 0) {
                  void insertWbsRow(afterIndex, visibleStructureWbsTree);
                }
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "start":
        return (
          <input
            type="date"
            value={draft.startDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              updateWbsDraft(item.id, {
                startDate: nextDate,
                forecastStartDate: nextDate,
                excelStartDate: nextDate,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "dates")}
            onBlur={() =>
              void saveWbsItem(item.id, {
                silent: true,
                scheduleDriver: "dates",
              })
            }
          />
        );
      case "due":
        return (
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              updateWbsDraft(item.id, {
                dueDate: nextDate,
                forecastDueDate: nextDate,
                excelEndDate: nextDate,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "dates")}
            onBlur={() =>
              void saveWbsItem(item.id, {
                silent: true,
                scheduleDriver: "dates",
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "workDays")}
            onBlur={() =>
              void saveWbsItem(item.id, {
                silent: true,
                scheduleDriver: "workDays",
              })
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "jiraTicketUrl":
        return (
          <input
            className={
              draft.jiraTicketUrl && !isHttpsUrl(draft.jiraTicketUrl)
                ? "input-error"
                : ""
            }
            value={draft.jiraTicketUrl}
            onChange={(event) =>
              updateWbsDraft(item.id, { jiraTicketUrl: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
            placeholder="https://..."
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
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
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      default:
        return null;
    }
  }

  async function saveWbsItem(
    itemId: string,
    options: {
      silent?: boolean;
      draftOverride?: WbsFormState;
      scheduleDriver?: WbsScheduleDriver;
    } = {},
  ) {
    const activeProject = projectRef.current ?? project;
    if (!activeProject) return;
    const draft =
      options.draftOverride ??
      wbsDraftsRef.current[itemId] ??
      wbsDrafts[itemId];
    if (!draft) return;
    const currentItem = activeProject.wbsItems.find(
      (item) => item.id === itemId,
    );
    const comparablePayload = wbsPayload(itemId, draft);
    if (!isHttpsUrl(draft.jiraTicketUrl)) {
      setError("Ссылка Jira должна начинаться с https://");
      return;
    }
    const currentPayload = currentItem
      ? wbsPayload(itemId, wbsToForm(currentItem))
      : null;
    const scheduleDriver =
      options.scheduleDriver ??
      inferWbsScheduleDriver(currentPayload, comparablePayload);
    const nextPayload = wbsPayload(itemId, draft, { scheduleDriver });
    const rowChanged =
      currentPayload !== null &&
      JSON.stringify(comparablePayload) !== JSON.stringify(currentPayload);
    const predecessorsChanged =
      currentItem !== undefined &&
      (WBS_PREDECESSOR_KEYS.some(
        (key) => comparablePayload[key] !== currentItem[key],
      ) ||
        comparablePayload.leadLagDays !== currentItem.leadLagDays);
    const requiresRenumber =
      currentItem !== undefined &&
      (comparablePayload.wbsLevel !== currentItem.wbsLevel ||
        comparablePayload.parentId !== currentItem.parentId ||
        draftWbsCodes.get(itemId) !== currentItem.code);
    if (
      currentItem &&
      !rowChanged
    ) {
      return;
    }
    if (rowChanged) rememberWbsSnapshot();
    setError(null);
    if (!options.silent) setNotice(null);
    const saveSequence = wbsSaveSequenceRef.current + 1;
    wbsSaveSequenceRef.current = saveSequence;
    latestWbsSaveSequenceByItemRef.current[itemId] = saveSequence;
    pendingWbsSaveCountRef.current += 1;
    try {
      const patchResult = await apiClient.patch<WbsSnapshotResponse>(
        `/api/wbs-items/${itemId}`,
        nextPayload,
        "Не удалось сохранить элемент Структуры",
      );
      const predecessorResult = predecessorsChanged
        ? await saveWbsPredecessors(itemId, { remember: false })
        : null;

      if (!isLatestWbsSave(itemId, saveSequence)) {
        return;
      }

      if (requiresRenumber) {
        const renumberResult = await apiClient.post<WbsSnapshotResponse>(
          `/api/projects/${activeProject.id}/wbs-items/renumber`,
          undefined,
          "Не удалось перенумеровать Структуру",
        );
        if (!isLatestWbsSave(itemId, saveSequence)) {
          return;
        }
        if (renumberResult.wbsItems) {
          applyWbsSnapshotResult(
            renumberResult.wbsItems,
            renumberResult.wbsDependencies,
            renumberResult.criticalPath,
          );
        } else {
          await refreshProject();
        }
      } else {
        const snapshotResult = predecessorResult?.wbsItems
          ? predecessorResult
          : patchResult;
        applyWbsSnapshotResult(
          snapshotResult.wbsItems,
          snapshotResult.wbsDependencies,
          snapshotResult.criticalPath,
        );
      }
      if (!options.silent) setNotice("Элемент Структуры обновлен");
    } catch (saveError) {
      if (!isLatestWbsSave(itemId, saveSequence)) {
        return;
      }
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить элемент Структуры",
      );
    } finally {
      pendingWbsSaveCountRef.current = Math.max(
        0,
        pendingWbsSaveCountRef.current - 1,
      );
    }
  }

  async function insertWbsRow(
    afterIndex: number,
    sourceRows: WbsTreeItem[] = visibleWbsTree,
  ) {
    if (!project) return;
    setError(null);
    setNotice(null);
    const previousItem = sourceRows[afterIndex];
    if (!previousItem) return;
    const nextItem = sourceRows[afterIndex + 1] ?? null;

    rememberWbsSnapshot();
    try {
      const response = await authenticatedFetch(
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
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
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
      const response = await authenticatedFetch(
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
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
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
    let latestSnapshot: {
      wbsItems?: WbsItem[];
      wbsDependencies?: WbsDependency[];
      criticalPath?: WbsCriticalPath | null;
    } | null = null;
    for (const dependency of existingDependencies) {
      const shouldKeep = desiredPredecessors.some(
        (draft) =>
          draft.predecessorId === dependency.predecessorId &&
          draft.type === dependency.type,
      );
      if (!shouldKeep) {
        const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(
        `${apiBase}/api/wbs-dependencies/${dependencyId}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить связь на Гантте");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
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
      const response = await authenticatedFetch(
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
          responseErrorMessage(result, "Не удалось создать связь на Гантте"),
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
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
      const response = await authenticatedFetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить элемент Структуры");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
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
      const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(`${apiBase}/api/tasks/${taskId}/jira-link`, {
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
      const response = await authenticatedFetch(
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
      const response = await authenticatedFetch(
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

  function updateIssueStatusDraft(
    issueId: string,
    patch: Partial<{ statusAt: string; text: string }>,
  ) {
    const current =
      issueStatusDrafts[issueId] ?? { statusAt: isoDate(new Date()), text: "" };
    setIssueStatusDrafts({
      ...issueStatusDrafts,
      [issueId]: { ...current, ...patch },
    });
  }

  async function saveOpenIssue(issueId: string) {
    const draft = issueEditDrafts[issueId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(`${apiBase}/api/open-issues/${issueId}`, {
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

  async function addIssueStatusUpdate(issueId: string) {
    const draft =
      issueStatusDrafts[issueId] ?? { statusAt: isoDate(new Date()), text: "" };
    if (!draft.text.trim()) {
      setError("Заполните текст статуса");
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/open-issues/${issueId}/status-updates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statusAt: draft.statusAt || isoDate(new Date()),
            text: draft.text.trim(),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось добавить статус",
        );
      }
      setIssueStatusDrafts({
        ...issueStatusDrafts,
        [issueId]: { statusAt: isoDate(new Date()), text: "" },
      });
      await refreshProject();
      setNotice("Статус открытого вопроса добавлен");
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Не удалось добавить статус",
      );
    }
  }

  async function saveOpenIssueWithPayload(
    issueId: string,
    payload: Partial<IssueEditDraft>,
  ) {
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(`${apiBase}/api/open-issues/${issueId}`, {
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

  function openView(
    nextView: AppView,
    options?: { replace?: boolean; projectCode?: string | null },
  ) {
    setError(null);
    setNotice(null);
    if (!isAuthenticated && writeProtectedViews.has(nextView)) {
      setAuthMode("login");
      setError("Для редактирования нужно войти в систему");
      return;
    }
    if (isAdminSectionViewName(nextView) && !isAdminUser) {
      setError("Раздел администрирования доступен только администратору");
      return;
    }
    if (
      isProjectSectionViewName(nextView) &&
      !isProjectModuleEnabled(projectModuleKeyByView[nextView])
    ) {
      setError("Страница проекта отключена администратором");
      return;
    }
    setActiveView(nextView);
    const routeProjectCode =
      options?.projectCode ??
      selectedProjectListItem?.code ??
      project?.code ??
      null;
    const nextPath = appPathForView(nextView, routeProjectCode);
    if (window.location.pathname !== nextPath) {
      const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
      if (options?.replace) {
        window.history.replaceState(null, "", nextUrl);
      } else {
        window.history.pushState(null, "", nextUrl);
      }
    }
  }

  function openRaidItemFromOverview(itemId: string) {
    setRaidTypeFilter("RISK");
    setRaidDecisionOnly(false);
    setRaidOverdueOnly(false);
    setRaidHighOnly(true);
    setExpandedRaidId(itemId);
    openView("project-raid");
    window.setTimeout(() => {
      document
        .getElementById(`raid-item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function selectProject(projectId: string, nextView: AppView = activeView) {
    setError(null);
    setNotice(null);
    const nextProject = projects.find((item) => item.id === projectId);
    setSelectedProjectId(projectId);
    setProjectSearch("");
    setShowProjectPicker(false);
    setRecentProjectIds((current) => [
      projectId,
      ...current.filter((item) => item !== projectId),
    ].slice(0, 6));
    const requestedView =
      nextView === "portfolio" || nextView === "project-create"
        ? firstEnabledProjectView
        : nextView;
    const safeView =
      isProjectSectionViewName(requestedView) &&
      !isProjectModuleEnabled(projectModuleKeyByView[requestedView])
        ? firstEnabledProjectView
        : requestedView;
    openView(safeView, { projectCode: nextProject?.code ?? null });
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
    "project-changes": project
      ? `${project.code} - Управление изменениями`
      : "Управление изменениями",
    "project-resources": project
      ? `${project.code} - Управление ресурсами`
      : "Управление ресурсами",
    "project-budget": project
      ? `${project.code} - Управление бюджетом`
      : "Управление бюджетом",
    "project-calendars": project
      ? `${project.code} - Календари`
      : "Календари",
    "project-artifacts": project
      ? `${project.code} - Артефакты проекта`
      : "Артефакты проекта",
    "closed-projects": "Закрытые проекты",
    admin: "Администрирование",
    "admin-users": "Администрирование: пользователи",
    "admin-roles": "Администрирование: роли и права",
    "admin-dictionaries": "Администрирование: справочники",
    "admin-templates": "Администрирование: шаблоны Структуры",
    "admin-rag": "Администрирование: формулы RAG",
    "admin-workflows": "Администрирование: workflow",
    "admin-jira": "Администрирование: Jira",
    "admin-integrations": "Администрирование: интеграции и API",
    "admin-health": "Администрирование: system health",
    "admin-backups": "Администрирование: backup/restore",
    "admin-config": "Администрирование: import/export",
    "admin-projects": "Администрирование: реестр проектов",
    "admin-modules": "Администрирование: управление модулями",
    "admin-audit": "Администрирование: журнал аудита",
  };
  const projectViews: AppView[] = [
    "project-create",
    "project-overview",
    "project-passport",
    "project-structure",
    "project-gantt",
    "project-issues",
    "project-raid",
    "project-changes",
    "project-resources",
    "project-budget",
    "project-calendars",
    "project-artifacts",
  ];
  const isProjectView = projectViews.includes(activeView);
  const isProjectSectionView = isProjectView && activeView !== "project-create";
  const isAdminSectionView = isAdminSectionViewName(activeView);
  const shouldShowProjectMenu = Boolean(selectedProjectListItem && isProjectSectionView);
  const shouldShowAdminMenu = Boolean(isAdminUser && isAdminSectionView);
  const projectNavItems: Array<{
    key: ProjectModuleKey;
    view: ProjectSectionView;
    label: string;
    icon: ReactNode;
  }> = [
    {
      key: "overview",
      view: "project-overview",
      label: "Обзор и вехи",
      icon: <LayoutDashboard size={17} />,
    },
    {
      key: "passport",
      view: "project-passport",
      label: "Паспорт проекта",
      icon: <FileText size={17} />,
    },
    {
      key: "structure",
      view: "project-structure",
      label: "Структура",
      icon: <ListChecks size={17} />,
    },
    {
      key: "gantt",
      view: "project-gantt",
      label: "Гантт",
      icon: <GanttChartSquare size={17} />,
    },
    {
      key: "issues",
      view: "project-issues",
      label: "Открытые вопросы",
      icon: <ShieldAlert size={17} />,
    },
    {
      key: "raid",
      view: "project-raid",
      label: "Риски и проблемы",
      icon: <BarChart3 size={17} />,
    },
    {
      key: "changes",
      view: "project-changes",
      label: "Управление изменениями",
      icon: <GitBranch size={17} />,
    },
    {
      key: "resources",
      view: "project-resources",
      label: "Управление ресурсами",
      icon: <Users size={17} />,
    },
    {
      key: "budget",
      view: "project-budget",
      label: "Управление бюджетом",
      icon: <BriefcaseBusiness size={17} />,
    },
    {
      key: "calendars",
      view: "project-calendars",
      label: "Календари",
      icon: <CalendarDays size={17} />,
    },
    {
      key: "artifacts",
      view: "project-artifacts",
      label: "Артефакты проекта",
      icon: <FileArchive size={17} />,
    },
  ];
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
    if (project && isAuthenticated && !isClosedProject) {
      void saveProjectUiState(
        { sidebarCollapsed: nextCollapsed },
        { sidebarCollapsed: nextCollapsed },
      );
    }
  };
  const toggleGanttDependencies = () => {
    setShowGanttDependencies((current) => {
      const next = !current;
      if (next) {
        setShowGanttCriticalPath(false);
      }
      return next;
    });
  };
  const toggleGanttCriticalPath = () => {
    setShowGanttCriticalPath((current) => {
      const next = !current;
      if (next) {
        setShowGanttDependencies(false);
      }
      return next;
    });
  };
  const toggleWorkspaceFullscreen = (view: FullscreenWorkspaceView) => {
    setFullscreenWorkspaceView((current) => (current === view ? null : view));
  };
  const renderGlobalSearch = (className = "") => (
    <div className={`global-search ${className}`.trim()}>
      <label>
        <Search size={16} />
        <input
          value={globalSearch}
          onChange={(event) => setGlobalSearch(event.target.value)}
          onFocus={() => setSearchOpen(globalSearch.trim().length >= 2)}
          placeholder="Поиск по проектам, задачам, рискам, вопросам"
        />
      </label>
      {searchOpen && globalSearch.trim().length >= 2 && (
        <div className="global-search-popover">
          {searchLoading && <span className="search-muted">Ищу...</span>}
          {!searchLoading &&
            searchResults.map((result) => (
              <button
                type="button"
                key={`${result.type}:${result.id}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openSearchResult(result)}
              >
                <span className="search-result-project">
                  {result.projectCode
                    ? `${result.projectCode}${result.projectName ? ` - ${result.projectName}` : ""}`
                    : "Без проекта"}
                </span>
                <b>{result.title}</b>
                <small>{result.subtitle}</small>
              </button>
            ))}
          {!searchLoading && searchResults.length === 0 && (
            <span className="search-muted">Ничего не найдено</span>
          )}
        </div>
      )}
    </div>
  );
  const renderSavedViewControls = () => {
    const viewType = savedViewTypeForActiveView();
    if (!viewType) return null;
    return (
      <div className="saved-view-controls" aria-label="Сохраненные представления">
        <label>
          Представление
          <select
            value=""
            onChange={(event) => {
              const view = savedViews.find((item) => item.id === event.target.value);
              if (view) applySavedView(view);
              event.currentTarget.value = "";
            }}
          >
            <option value="">
              {savedViews.length > 0 ? "Выбрать сохраненное" : "Нет сохраненных"}
            </option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
                {view.isShared ? " / общее" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Новое представление
          <input
            value={savedViewName}
            onChange={(event) => setSavedViewName(event.target.value)}
            placeholder="Название вида"
            disabled={!isAuthenticated}
          />
        </label>
        <button
          type="button"
          onClick={() => void saveCurrentSavedView()}
          disabled={savingSavedView || !isAuthenticated || !selectedProjectId}
          title={
            isAuthenticated
              ? "Сохранить текущие фильтры и настройки колонок"
              : "Для сохранения нужно войти"
          }
        >
          {savingSavedView ? "Сохраняю..." : "Сохранить вид"}
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <main className="loading">Загрузка системы управления проектами...</main>
    );
  }

  if (authMode === "setup" || authMode === "login") {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand auth-brand">
            <div className="logo">УП</div>
            <div>
              <strong>Система УП</strong>
              <span>Контур управления</span>
            </div>
          </div>
          <div className="auth-title">
            <KeyRound size={22} />
            <div>
              <h1>
                {authMode === "setup"
                  ? "Первичная настройка"
                  : "Вход в систему"}
              </h1>
              <p>
                {authMode === "setup"
                  ? "Создайте первого администратора системы"
                  : "Введите email и пароль пользователя"}
              </p>
            </div>
          </div>
          {error && (
            <div className="auth-error">
              <strong>Ошибка</strong>
              <span>{error}</span>
            </div>
          )}
          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === "setup" && (
              <label>
                Имя администратора
                <input
                  value={authForm.name}
                  onChange={(event) =>
                    setAuthForm({ ...authForm, name: event.target.value })
                  }
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm({ ...authForm, email: event.target.value })
                }
                autoComplete="email"
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({ ...authForm, password: event.target.value })
                }
                autoComplete={
                  authMode === "setup" ? "new-password" : "current-password"
                }
              />
            </label>
            <button type="submit" disabled={authSubmitting}>
              {authSubmitting
                ? "Проверяю..."
                : authMode === "setup"
                  ? "Создать администратора"
                  : "Войти"}
            </button>
            {authMode === "login" && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setAuthMode("ready");
                  setError(null);
                  setNotice(null);
                }}
              >
                Продолжить только просмотр
              </button>
            )}
          </form>
        </section>
      </main>
    );
  }

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isReadOnly ? "read-only-mode" : ""}`}
      onFocusCapture={handleEditableFocus}
      onKeyDownCapture={handleEditableKeyDown}
    >
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
        <div className="sidebar-user">
          <span className="sidebar-user-icon" aria-hidden="true">
            <Users size={16} />
          </span>
          <span className="sidebar-user-text">
            <b>{currentUser?.name ?? "Только просмотр"}</b>
            <small>
              {currentUser
                ? userRoleLabel(currentUser.role)
                : "Вход нужен для редактирования"}
            </small>
          </span>
          <button
            type="button"
            onClick={
              currentUser
                ? logout
                : () => {
                    setAuthMode("login");
                    setError(null);
                    setNotice(null);
                  }
            }
            aria-label={currentUser ? "Выйти" : "Войти"}
            title={currentUser ? "Выйти" : "Войти для редактирования"}
          >
            {currentUser ? <LogOut size={15} /> : <KeyRound size={15} />}
          </button>
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
          {isAuthenticated && (
            <button
              type="button"
              className={activeView === "project-create" ? "active" : ""}
              onClick={() => openView("project-create")}
              aria-label="Создать новый проект"
            >
              {navLabel(<Plus size={17} />, "Создать новый проект")}
            </button>
          )}
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
                        onClick={() => selectProject(item.id, firstEnabledProjectView)}
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
                      onClick={() => selectProject(item.id, firstEnabledProjectView)}
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
                selectedProjectId ? firstEnabledProjectView : "project-create",
              )
            }
            aria-label="Проекты"
          >
            {navLabel(<FolderTree size={17} />, "Проекты")}
          </button>
          {shouldShowProjectMenu && (
            <div className="sidebar-group">
              <div className="project-menu">
                {projectNavItems
                  .filter((item) => isProjectModuleEnabled(item.key))
                  .map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={
                        activeView === item.view
                          ? "active nested child"
                          : "nested child"
                      }
                      onClick={() => openView(item.view)}
                      aria-label={item.label}
                    >
                      {navLabel(item.icon, item.label)}
                    </button>
                  ))}
              </div>
            </div>
          )}
          <button
            type="button"
            className={activeView === "closed-projects" ? "active" : ""}
            onClick={() => openView("closed-projects")}
            aria-label="Закрытые проекты"
          >
            {navLabel(<Archive size={17} />, "Закрытые проекты")}
          </button>
          {isAdminUser && (
            <>
              <button
                type="button"
                className={isAdminSectionView ? "active" : ""}
                onClick={() => openView("admin-projects")}
                aria-label="Администрирование"
              >
                {navLabel(<Settings size={17} />, "Администрирование")}
              </button>
              {shouldShowAdminMenu && (
                <div className="sidebar-group">
                <div className="project-menu">
                  <button
                    type="button"
                    className={
                      activeView === "admin-projects"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-projects")}
                    aria-label="Реестр проектов"
                  >
                    {navLabel(<FolderTree size={17} />, "Реестр проектов")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-modules"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-modules")}
                    aria-label="Управление модулями"
                  >
                    {navLabel(<SlidersHorizontal size={17} />, "Управление модулями")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-users"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-users")}
                    aria-label="Пользователи"
                  >
                    {navLabel(<Users size={17} />, "Пользователи")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-roles"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-roles")}
                    aria-label="Роли и права"
                  >
                    {navLabel(<KeyRound size={17} />, "Роли и права")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-dictionaries"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-dictionaries")}
                    aria-label="Справочники"
                  >
                    {navLabel(<ListChecks size={17} />, "Справочники")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-templates"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-templates")}
                    aria-label="Шаблоны Структуры"
                  >
                    {navLabel(<GanttChartSquare size={17} />, "Шаблоны Структуры")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-rag"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-rag")}
                    aria-label="Формулы RAG"
                  >
                    {navLabel(<SlidersHorizontal size={17} />, "Формулы RAG")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-workflows"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-workflows")}
                    aria-label="Workflow согласований"
                  >
                    {navLabel(<GitBranch size={17} />, "Workflow согласований")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-jira"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-jira")}
                    aria-label="Jira"
                  >
                    {navLabel(<BriefcaseBusiness size={17} />, "Jira")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-integrations"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-integrations")}
                    aria-label="Интеграции и API"
                  >
                    {navLabel(<GitBranch size={17} />, "Интеграции и API")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-health"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-health")}
                    aria-label="System health"
                  >
                    {navLabel(<HeartPulse size={17} />, "System health")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-backups"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-backups")}
                    aria-label="Backup/restore"
                  >
                    {navLabel(<HardDriveDownload size={17} />, "Backup/restore")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-config"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-config")}
                    aria-label="Import/export"
                  >
                    {navLabel(<Import size={17} />, "Import/export")}
                  </button>
                  <button
                    type="button"
                    className={
                      activeView === "admin-audit"
                        ? "active nested child"
                        : "nested child"
                    }
                    onClick={() => openView("admin-audit")}
                    aria-label="Журнал аудита"
                  >
                    {navLabel(<FileText size={17} />, "Журнал аудита")}
                  </button>
                </div>
              </div>
              )}
            </>
          )}
        </nav>
      </aside>

      <main
        className="workspace"
      >
        <header
          className={`topbar ${project && isProjectView && activeView !== "project-create" ? "project-topbar" : ""}`}
        >
          <div className="topbar-main">
              {project && isProjectView && activeView !== "project-create" ? (
                <>
                  <h1>
                    <span>{project.code}</span>
                    {project.name}
                </h1>
              </>
            ) : (
              <h1>{viewTitle[activeView]}</h1>
            )}
          </div>
          <div className="topbar-search">
            {renderGlobalSearch("global-search-topbar")}
          </div>
          {project && activeView !== "portfolio" && (
            <div className="topbar-project">
              <span>Статус: {projectStatusLabel(project.status)}</span>
              <span>РП: {project.projectManager}</span>
              <span>Срок: {date(project.targetDate)}</span>
              <b className={`rag ${topbarScheduleHealth?.tone ?? project.rag.toLowerCase()}`}>
                {topbarScheduleHealth?.label ?? projectHealthLabel(project.rag)}
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
        {!isAuthenticated && (
          <div className="readonly-banner">
            <KeyRound size={16} />
            <span>
              Режим только для просмотра. Для создания и изменения данных нужно
              войти в систему.
            </span>
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError(null);
                setNotice(null);
              }}
            >
              Войти
            </button>
          </div>
        )}
        {isClosedProject && (
          <div className="readonly-banner closed-project-banner">
            <Archive size={16} />
            <span>
              Проект закрыт. Данные доступны только для чтения, редактирование
              заблокировано для всех ролей.
            </span>
          </div>
        )}

        <PageBoundary
          view={activeView}
          isAdminSectionViewName={isAdminSectionViewName}
        >
          {(project ||
            activeView === "portfolio" ||
            activeView === "project-create" ||
            activeView === "closed-projects" ||
            isAdminSectionView) && (
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
              <>
                <section className="executive-overview-grid">
                  <article className="executive-overview-card danger">
                    <div className="executive-overview-card-title">
                      <span>Ключевые риски в красной зоне</span>
                      <strong>{overviewDashboard.redZoneRisks.length}</strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.redZoneRisks.map((item) => (
                        <div
                          className="executive-overview-row"
                          key={item.id}
                        >
                          <button
                            className="executive-overview-risk-link"
                            type="button"
                            onClick={() => openRaidItemFromOverview(item.id)}
                          >
                            {item.title}
                          </button>
                          {latestRaidStatusUpdate(item) && (
                            <p className="executive-status-text">
                              {latestRaidStatusUpdate(item)?.text}
                            </p>
                          )}
                        </div>
                      ))}
                      {overviewDashboard.redZoneRisks.length === 0 && (
                        <p>Рисков с оценкой 15+ нет.</p>
                      )}
                    </div>
                  </article>

                  <article className="executive-overview-card">
                    <div className="executive-overview-card-title">
                      <span>Тикеты под риском</span>
                      <strong>{JIRA_BLOCKING_TICKET_PLACEHOLDER.length}</strong>
                    </div>
                    <div
                      className="jira-placeholder-table"
                      aria-label="Временный снимок блокирующих тикетов Jira"
                    >
                      <div className="jira-placeholder-head">
                        <span>T</span>
                        <span>Key</span>
                        <span>Summary</span>
                        <span>Assignee</span>
                      </div>
                      {JIRA_BLOCKING_TICKET_PLACEHOLDER.map((ticket) => (
                        <div className="jira-placeholder-row" key={ticket.key}>
                          <span
                            className={`jira-placeholder-type ${
                              ticket.checked ? "checked" : "open"
                            }`}
                            aria-hidden="true"
                          >
                            {ticket.checked ? "✓" : ""}
                          </span>
                          <span className="jira-placeholder-key">
                            {ticket.key}
                          </span>
                          <b>{ticket.summary}</b>
                          <span>{ticket.assignee}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="executive-overview-card">
                    <div className="executive-overview-card-title">
                      <span>Решения по ключевым открытым вопросам</span>
                      <strong>{overviewDashboard.decisionItems}</strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.openDecisionItems.map((issue) => (
                        <div
                          className="executive-overview-row"
                          key={issue.id}
                        >
                          <b>{issue.title}</b>
                          <span>
                            {issue.owner || "не назначен"} / срок{" "}
                            {date(issue.dueDate)}
                          </span>
                        </div>
                      ))}
                      {overviewDashboard.openDecisionItems.length === 0 && (
                        <p>Открытых вопросов, требующих решения, нет.</p>
                      )}
                    </div>
                  </article>

                  <article className="executive-overview-card">
                    <div className="executive-overview-card-title">
                      <span>Отклонение сроков</span>
                      <strong>
                        {overviewDashboard.scheduleVarianceFromStructure > 0 ? "+" : ""}
                        {overviewDashboard.scheduleVarianceFromStructure} дн.
                      </strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.scheduleDeltaItems.map(({ item, delay }) => (
                        <div
                          className="executive-overview-row"
                          key={item.id}
                        >
                          <b>
                            {item.jiraTicketKey ? `${item.jiraTicketKey} / ` : ""}
                            {item.code} {item.title}
                          </b>
                          <span>
                            Отклонение +{delay} календарных дней / исполнитель:{" "}
                            {item.owner || "не назначен"}
                          </span>
                        </div>
                      ))}
                      {overviewDashboard.scheduleDeltaItems.length === 0 && (
                        <p>Отклонений от базового плана нет.</p>
                      )}
                    </div>
                  </article>
                </section>
              </>
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
                    {activeProjectTree.map((item) => {
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
                              selectProject(item.id, firstEnabledProjectView)
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
                    {activeProjectTree.length === 0 && (
                      <div className="empty-state">Активные проекты не найдены.</div>
                    )}
                  </div>
                </article>
              </section>
            )}

            {activeView === "closed-projects" && (
              <section className="projects-tree-section">
                <article className="panel project-tree-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Закрытые проекты</h2>
                      <p>
                        Архив завершенных проектов. Проекты в этом разделе
                        доступны только для просмотра.
                      </p>
                    </div>
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
                    {closedProjectTree.map((item) => (
                      <div className="project-tree-row closed" key={item.id}>
                        <span
                          className="project-tree-code-static"
                          style={
                            {
                              marginLeft: `${item.level * 18}px`,
                              "--project-indent": `${item.level * 18}px`,
                            } as CSSProperties
                          }
                        >
                          {item.code}
                        </span>
                        <span className="project-tree-name-static">
                          {item.name}
                        </span>
                        <button
                          type="button"
                          className="project-tree-open"
                          onClick={() => selectProject(item.id, firstEnabledProjectView)}
                        >
                          Посмотреть
                        </button>
                        <span>{item.projectManager}</span>
                        <span>{item.progress}%</span>
                        <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                      </div>
                    ))}
                    {closedProjectTree.length === 0 && (
                      <div className="empty-state">Закрытых проектов пока нет.</div>
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
                    <div className="form-section-title span-2">Базовый план</div>
                    <label className="span-2">
                      Скопировать из проекта
                      <select
                        value={newProjectForm.copyBaselineFromProjectId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            copyBaselineFromProjectId: event.target.value,
                          })
                        }
                      >
                        <option value="">Не копировать, создать тестовую структуру</option>
                        {activeProjectTree.map((item) => (
                          <option key={item.id} value={item.id}>
                            {"- ".repeat(item.level)}
                            {item.code} - {item.name}
                          </option>
                        ))}
                      </select>
                      <span className="form-note">
                        Новый проект получит структуру, связи, даты и календари
                        из последнего активного базового плана выбранного проекта.
                      </span>
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
                        {activeProjectTree.map((item) => (
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

              {activeView === "admin-users" && (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <h2>Администрирование: пользователи</h2>
                        <p>Базовые учетные записи, роли и доступ в систему</p>
                      </div>
                    </div>
                    {currentUser?.role === "ADMIN" ? (
                      <>
                        <form className="user-create-form" onSubmit={createUser}>
                          <label>
                            Имя
                            <input
                              value={newUserForm.name}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  name: event.target.value,
                                })
                              }
                              placeholder="Иван Иванов"
                            />
                          </label>
                          <label>
                            Email
                            <input
                              type="email"
                              value={newUserForm.email}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  email: event.target.value,
                                })
                              }
                              placeholder="user@company.ru"
                            />
                          </label>
                          <label>
                            Роль
                            <select
                              value={newUserForm.role}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  role: event.target.value as UserRole,
                                })
                              }
                            >
                              <option value="ADMIN">{userRoleLabel("ADMIN")}</option>
                              <option value="PROJECT_MANAGER">
                                {userRoleLabel("PROJECT_MANAGER")}
                              </option>
                              <option value="TEAM_MEMBER">
                                {userRoleLabel("TEAM_MEMBER")}
                              </option>
                              <option value="EXECUTIVE_VIEWER">
                                {userRoleLabel("EXECUTIVE_VIEWER")}
                              </option>
                            </select>
                          </label>
                          <label>
                            Пароль
                            <input
                              type="password"
                              value={newUserForm.password}
                              onChange={(event) =>
                                setNewUserForm({
                                  ...newUserForm,
                                  password: event.target.value,
                                })
                              }
                              placeholder="Минимум 8 символов"
                            />
                          </label>
                          <button type="submit" disabled={creatingUser}>
                            {creatingUser ? "Создаю..." : "Создать пользователя"}
                          </button>
                        </form>
                        <div className="project-admin-table user-admin-table">
                          <div className="project-admin-head user-admin-head">
                            <span>Имя</span>
                            <span>Email</span>
                            <span>Роль</span>
                            <span>Активен</span>
                            <span>Последний вход</span>
                            <span>Новый пароль</span>
                            <span />
                          </div>
                          {users.map((user) => {
                            const draft = userDrafts[user.id] ?? userToDraft(user);
                            return (
                              <div className="project-admin-row user-admin-row" key={user.id}>
                                <label>
                                  <span>Имя</span>
                                  <input
                                    value={draft.name}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        name: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Email</span>
                                  <input
                                    type="email"
                                    value={draft.email}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        email: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  <span>Роль</span>
                                  <select
                                    value={draft.role}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        role: event.target.value as UserRole,
                                      })
                                    }
                                  >
                                    <option value="ADMIN">{userRoleLabel("ADMIN")}</option>
                                    <option value="PROJECT_MANAGER">
                                      {userRoleLabel("PROJECT_MANAGER")}
                                    </option>
                                    <option value="TEAM_MEMBER">
                                      {userRoleLabel("TEAM_MEMBER")}
                                    </option>
                                    <option value="EXECUTIVE_VIEWER">
                                      {userRoleLabel("EXECUTIVE_VIEWER")}
                                    </option>
                                  </select>
                                </label>
                                <label className="checkbox-field">
                                  <span>Активен</span>
                                  <input
                                    type="checkbox"
                                    checked={draft.isActive}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        isActive: event.target.checked,
                                      })
                                    }
                                  />
                                </label>
                                <div className="project-admin-readonly">
                                  <span>Последний вход</span>
                                  <b>{date(user.lastLoginAt)}</b>
                                </div>
                                <label>
                                  <span>Новый пароль</span>
                                  <input
                                    type="password"
                                    value={draft.password}
                                    onChange={(event) =>
                                      updateUserDraft(user.id, {
                                        password: event.target.value,
                                      })
                                    }
                                    placeholder={
                                      user.hasPassword ? "Не менять" : "Задать пароль"
                                    }
                                  />
                                </label>
                                <div className="project-admin-actions">
                                  <button
                                    type="button"
                                    onClick={() => void saveUser(user.id)}
                                    disabled={savingUserId === user.id}
                                  >
                                    {savingUserId === user.id
                                      ? "Сохраняю..."
                                      : "Сохранить"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {users.length === 0 && (
                            <div className="empty-state">
                              Пользователи еще не созданы.
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">
                        Управление пользователями доступно только администратору.
                      </div>
                    )}
                  </article>
              )}

              {activeView === "admin-modules" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: управление модулями</h2>
                      <p>
                        Включение и скрытие страниц раздела Проекты для всех
                        пользователей.
                      </p>
                    </div>
                  </div>
                  <form
                    className="project-module-admin"
                    onSubmit={saveProjectModules}
                  >
                    <div className="project-module-table">
                      <div className="project-module-head">
                        <span>Страница</span>
                        <span>Адрес</span>
                        <span>Назначение</span>
                        <span>Показывать</span>
                      </div>
                      {normalizedProjectModules.map((module) => {
                        const enabled =
                          projectModuleDrafts[module.key] ?? module.enabled;
                        return (
                          <div className="project-module-row" key={module.key}>
                            <div>
                              <b>{module.label}</b>
                              <small>{module.key}</small>
                            </div>
                            <code>/{module.route}</code>
                            <span>{module.description}</span>
                            <label className="module-switch">
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(event) =>
                                  updateProjectModuleDraft(
                                    module.key,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>{enabled ? "Включена" : "Скрыта"}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <div className="form-actions">
                      <button type="submit" disabled={savingProjectModules}>
                        {savingProjectModules
                          ? "Сохраняю..."
                          : "Сохранить настройки"}
                      </button>
                    </div>
                  </form>
                </article>
              )}

              {activeView === "admin-roles" && (
                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                          <h2>Администрирование: роли и права</h2>
                          <p>Матрица доступов по системным ролям</p>
                        </div>
                        <button type="button" onClick={() => void reloadAdminConfig()}>
                          Обновить
                        </button>
                      </div>
                      <div className="permission-table">
                        <div className="permission-head">
                          <span>Право</span>
                          <span>{userRoleLabel("ADMIN")}</span>
                          <span>{userRoleLabel("PROJECT_MANAGER")}</span>
                          <span>{userRoleLabel("TEAM_MEMBER")}</span>
                          <span>{userRoleLabel("EXECUTIVE_VIEWER")}</span>
                        </div>
                        {adminPermissionOrder.map((permissionName) => {
                          const permissionsByRole = new Map(
                            rolePermissions
                              .filter((item) => item.permission === permissionName)
                              .map((item) => [item.role, item]),
                          );
                          return (
                            <div className="permission-row" key={permissionName}>
                              <strong>{adminPermissionLabel(permissionName)}</strong>
                              {(
                                [
                                  "ADMIN",
                                  "PROJECT_MANAGER",
                                  "TEAM_MEMBER",
                                  "EXECUTIVE_VIEWER",
                                ] as UserRole[]
                              ).map((role) => {
                                const permission = permissionsByRole.get(role);
                                return (
                                  <label className="permission-toggle" key={role}>
                                    <input
                                      type="checkbox"
                                      checked={permission?.enabled ?? false}
                                      disabled={
                                        role === "ADMIN" ||
                                        !permission ||
                                        savingRolePermissionId === permission.id
                                      }
                                      onChange={() =>
                                        permission && void toggleRolePermission(permission)
                                      }
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </article>
              )}

              {activeView === "admin-dictionaries" && (
                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                          <h2>Администрирование: справочники</h2>
                          <p>Единые значения для типов, статусов и критичности</p>
                        </div>
                      </div>
                      <div className="dictionary-filter">
                        <label>
                          Справочник
                          <select
                            value={selectedDictionary}
                            onChange={(event) => {
                              setSelectedDictionary(event.target.value);
                              setNewDictionaryDraft((current) => ({
                                ...current,
                                dictionary: event.target.value,
                              }));
                            }}
                          >
                            {Object.keys(adminDictionaryLabels).map((dictionary) => (
                              <option key={dictionary} value={dictionary}>
                                {dictionaryLabel(dictionary)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <form className="dictionary-create-form" onSubmit={createDictionaryItem}>
                        <label>
                          Справочник
                          <select
                            value={newDictionaryDraft.dictionary}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                dictionary: event.target.value,
                              })
                            }
                          >
                            {Object.keys(adminDictionaryLabels).map((dictionary) => (
                              <option key={dictionary} value={dictionary}>
                                {dictionaryLabel(dictionary)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Код
                          <input
                            value={newDictionaryDraft.code}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                code: event.target.value,
                              })
                            }
                            placeholder="CODE"
                          />
                        </label>
                        <label>
                          Название
                          <input
                            value={newDictionaryDraft.label}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                label: event.target.value,
                              })
                            }
                            placeholder="Название"
                          />
                        </label>
                        <label>
                          Порядок
                          <input
                            type="number"
                            value={newDictionaryDraft.sortOrder}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                sortOrder: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button type="submit" disabled={creatingDictionaryItem}>
                          {creatingDictionaryItem ? "Сохраняю..." : "Добавить"}
                        </button>
                      </form>
                      <div className="dictionary-table">
                        <div className="dictionary-head">
                          <span>Справочник</span>
                          <span>Код</span>
                          <span>Название</span>
                          <span>Описание</span>
                          <span>Порядок</span>
                          <span>Активен</span>
                          <span />
                        </div>
                        {filteredDictionaryItems.map((item) => {
                          const draft =
                            dictionaryDrafts[item.id] ?? dictionaryItemToDraft(item);
                          return (
                            <div className="dictionary-row" key={item.id}>
                              <label>
                                <span>Справочник</span>
                                <select
                                  value={draft.dictionary}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      dictionary: event.target.value,
                                    })
                                  }
                                >
                                  {Object.keys(adminDictionaryLabels).map((dictionary) => (
                                    <option key={dictionary} value={dictionary}>
                                      {dictionaryLabel(dictionary)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Код</span>
                                <input
                                  value={draft.code}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      code: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>Название</span>
                                <input
                                  value={draft.label}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      label: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>Описание</span>
                                <input
                                  value={draft.description}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      description: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>Порядок</span>
                                <input
                                  type="number"
                                  value={draft.sortOrder}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      sortOrder: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="checkbox-field">
                                <span>Активен</span>
                                <input
                                  type="checkbox"
                                  checked={draft.isActive}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      isActive: event.target.checked,
                                    })
                                  }
                                />
                              </label>
                              <div className="dictionary-actions">
                                <button
                                  type="button"
                                  onClick={() => void saveDictionaryItem(item.id)}
                                  disabled={savingDictionaryItemId === item.id}
                                >
                                  {savingDictionaryItemId === item.id
                                    ? "Сохраняю..."
                                    : "Сохранить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deactivateDictionaryItem(item.id)}
                                  disabled={
                                    savingDictionaryItemId === item.id || !item.isActive
                                  }
                                >
                                  Отключить
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {filteredDictionaryItems.length === 0 && (
                          <div className="empty-state">В выбранном справочнике пока нет записей.</div>
                        )}
                      </div>
	                    </article>
	              )}

              {activeView === "admin-templates" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: шаблоны Структуры</h2>
                      <p>Базовые наборы работ для создания новых проектов</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      JSON шаблонов
                      <textarea
                        className="admin-config-textarea"
                        value={systemSettingsDraft.wbsTemplates}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            wbsTemplates: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingSystemSettings}>
                        {savingSystemSettings ? "Сохраняю..." : "Сохранить шаблоны"}
                      </button>
                    </div>
                  </form>
                </article>
              )}

              {activeView === "admin-rag" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: формулы RAG</h2>
                      <p>Правила расчета зеленого, желтого и красного статуса проекта</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      Зеленый
                      <textarea
                        value={systemSettingsDraft.ragGreenFormula}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            ragGreenFormula: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Желтый
                      <textarea
                        value={systemSettingsDraft.ragAmberFormula}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            ragAmberFormula: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Красный
                      <textarea
                        value={systemSettingsDraft.ragRedFormula}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            ragRedFormula: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingSystemSettings}>
                        {savingSystemSettings ? "Сохраняю..." : "Сохранить формулы"}
                      </button>
                    </div>
                  </form>
                </article>
              )}

              {activeView === "admin-workflows" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: workflow согласований</h2>
                      <p>Маршруты согласования обзора, базового плана и закрытия проекта</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      Обзор для руководства
                      <textarea
                        value={systemSettingsDraft.overviewWorkflow}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            overviewWorkflow: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Базовый план
                      <textarea
                        value={systemSettingsDraft.baselineWorkflow}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            baselineWorkflow: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Закрытие проекта
                      <textarea
                        value={systemSettingsDraft.projectCloseWorkflow}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            projectCloseWorkflow: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingSystemSettings}>
                        {savingSystemSettings ? "Сохраняю..." : "Сохранить workflow"}
                      </button>
                    </div>
                  </form>
                </article>
              )}

	              {activeView === "admin-jira" && (
	                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                          <h2>Администрирование: системные настройки Jira</h2>
                          <p>Общие параметры подключения для синхронизации Jira</p>
                        </div>
                      </div>
                      <form className="form-grid" onSubmit={saveSystemSettings}>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.jiraEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                jiraEnabled: event.target.checked,
                              })
                            }
                          />
                          Синхронизация Jira включена
                        </label>
                        <label>
                          Базовый URL Jira
                          <input
                            value={systemSettingsDraft.jiraBaseUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                jiraBaseUrl: event.target.value,
                              })
                            }
                            placeholder="https://company.atlassian.net"
                          />
                        </label>
                        <label>
                          Email пользователя Jira
                          <input
                            type="email"
                            value={systemSettingsDraft.jiraEmail}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                jiraEmail: event.target.value,
                              })
                            }
                            placeholder="user@company.ru"
                          />
                        </label>
                        <label>
                          API token
                          <input
                            type="password"
                            value={systemSettingsDraft.jiraApiToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                jiraApiToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "jira.apiToken")
                                ? "Задан, оставьте пустым чтобы не менять"
                                : "Jira API token"
                            }
                          />
                        </label>
                        <label>
                          Максимум задач за синхронизацию
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={systemSettingsDraft.jiraMaxResults}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                jiraMaxResults: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="form-actions span-2">
                          <button type="submit" disabled={savingSystemSettings}>
                            {savingSystemSettings ? "Сохраняю..." : "Сохранить Jira"}
                          </button>
                        </div>
                      </form>
	                    </article>
	              )}

              {activeView === "admin-integrations" && (
                <article className="panel project-card admin-integrations-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: интеграции и API</h2>
                      <p>
                        API-токены, webhook API и настройки внешних контуров:
                        GitLab, GitHub, Azure DevOps и BI.
                      </p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminIntegrations()}>
                      Обновить
                    </button>
                  </div>

                  <div className="admin-integrations-grid">
                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>API-токены</h3>
                        <span>{adminIntegrations?.apiTokens.length ?? 0}</span>
                      </div>
                      {createdApiToken && (
                        <div className="token-once">
                          <b>Токен показан один раз</b>
                          <code>{createdApiToken}</code>
                        </div>
                      )}
                      <form className="integration-form" onSubmit={createApiToken}>
                        <label>
                          Название
                          <input
                            value={apiTokenDraft.name}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Права через запятую
                          <input
                            value={apiTokenDraft.scopes}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                scopes: event.target.value,
                              })
                            }
                            placeholder="project.read,wbs.read"
                          />
                        </label>
                        <label>
                          Лимит/мин.
                          <input
                            type="number"
                            min="10"
                            max="10000"
                            value={apiTokenDraft.rateLimitPerMinute}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                rateLimitPerMinute: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Истекает
                          <input
                            type="date"
                            value={apiTokenDraft.expiresAt}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                expiresAt: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button type="submit" disabled={savingIntegration}>
                          Создать токен
                        </button>
                      </form>
                      <div className="integration-table">
                        {(adminIntegrations?.apiTokens ?? []).map((token) => (
                          <div className="integration-row" key={token.id}>
                            <div>
                              <b>{token.name}</b>
                              <small>
                                {token.tokenPrefix}... / лимит {token.rateLimitPerMinute}
                                /мин.
                              </small>
                              <small>{token.scopes.join(", ") || "без прав"}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                token.isActive ? "active" : "inactive"
                              }`}
                            >
                              {token.isActive ? "Активен" : "Отключен"}
                            </span>
                            <button
                              type="button"
                              onClick={() => void toggleApiToken(token)}
                              disabled={savingIntegration}
                            >
                              {token.isActive ? "Отключить" : "Включить"}
                            </button>
                          </div>
                        ))}
                        {(adminIntegrations?.apiTokens.length ?? 0) === 0 && (
                          <div className="empty-state">API-токены еще не созданы.</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>Webhook API</h3>
                        <span>{adminIntegrations?.webhookEndpoints.length ?? 0}</span>
                      </div>
                      <form className="integration-form" onSubmit={createWebhook}>
                        <label>
                          Название
                          <input
                            value={webhookDraft.name}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="span-2">
                          URL
                          <input
                            value={webhookDraft.url}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                url: event.target.value,
                              })
                            }
                            placeholder="https://..."
                          />
                        </label>
                        <label>
                          События
                          <input
                            value={webhookDraft.events}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                events: event.target.value,
                              })
                            }
                            placeholder="* или project.updated"
                          />
                        </label>
                        <label>
                          Secret
                          <input
                            type="password"
                            value={webhookDraft.secret}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                secret: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="checkbox-line">
                          <input
                            type="checkbox"
                            checked={webhookDraft.isActive}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                isActive: event.target.checked,
                              })
                            }
                          />
                          Активен
                        </label>
                        <button type="submit" disabled={savingIntegration}>
                          Добавить webhook
                        </button>
                      </form>
                      <div className="integration-table">
                        {(adminIntegrations?.webhookEndpoints ?? []).map((endpoint) => (
                          <div className="integration-row" key={endpoint.id}>
                            <div>
                              <b>{endpoint.name}</b>
                              <small>{endpoint.url}</small>
                              <small>{endpoint.events.join(", ") || "*"}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                endpoint.isActive ? "active" : "inactive"
                              }`}
                            >
                              {endpoint.isActive ? "Активен" : "Отключен"}
                            </span>
                            <button
                              type="button"
                              onClick={() => void testWebhook(endpoint.id)}
                              disabled={savingIntegration || !endpoint.isActive}
                            >
                              Тест
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleWebhook(endpoint)}
                              disabled={savingIntegration}
                            >
                              {endpoint.isActive ? "Отключить" : "Включить"}
                            </button>
                          </div>
                        ))}
                        {(adminIntegrations?.webhookEndpoints.length ?? 0) === 0 && (
                          <div className="empty-state">Webhook endpoints еще не созданы.</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>Последние доставки</h3>
                        <span>{adminIntegrations?.webhookDeliveries.length ?? 0}</span>
                      </div>
                      <div className="integration-table compact">
                        {(adminIntegrations?.webhookDeliveries ?? []).map((delivery) => (
                          <div className="integration-row" key={delivery.id}>
                            <div>
                              <b>{delivery.eventType}</b>
                              <small>{delivery.endpoint?.name ?? delivery.endpointId}</small>
                              <small>{dateTime(delivery.attemptedAt ?? delivery.createdAt)}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                delivery.status === "DELIVERED" ? "active" : "inactive"
                              }`}
                            >
                              {delivery.status}
                            </span>
                            <small>{delivery.statusCode ?? delivery.error ?? ""}</small>
                          </div>
                        ))}
                        {(adminIntegrations?.webhookDeliveries.length ?? 0) === 0 && (
                          <div className="empty-state">Доставок пока нет.</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>Enterprise-интеграции</h3>
                      </div>
                      <form className="integration-form" onSubmit={saveSystemSettings}>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.gitlabEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                gitlabEnabled: event.target.checked,
                              })
                            }
                          />
                          GitLab включен
                        </label>
                        <label className="span-2">
                          GitLab URL
                          <input
                            value={systemSettingsDraft.gitlabBaseUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                gitlabBaseUrl: event.target.value,
                              })
                            }
                            placeholder="https://gitlab.company.ru"
                          />
                        </label>
                        <label className="span-2">
                          GitLab token
                          <input
                            type="password"
                            value={systemSettingsDraft.gitlabToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                gitlabToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "gitlab.token")
                                ? "задан, введите новый для замены"
                                : "не задан"
                            }
                          />
                        </label>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.githubEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                githubEnabled: event.target.checked,
                              })
                            }
                          />
                          GitHub включен
                        </label>
                        <label className="span-2">
                          GitHub API URL
                          <input
                            value={systemSettingsDraft.githubBaseUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                githubBaseUrl: event.target.value,
                              })
                            }
                            placeholder="https://api.github.com"
                          />
                        </label>
                        <label className="span-2">
                          GitHub token
                          <input
                            type="password"
                            value={systemSettingsDraft.githubToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                githubToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "github.token")
                                ? "задан, введите новый для замены"
                                : "не задан"
                            }
                          />
                        </label>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.azureDevOpsEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                azureDevOpsEnabled: event.target.checked,
                              })
                            }
                          />
                          Azure DevOps включен
                        </label>
                        <label className="span-2">
                          Azure DevOps organization URL
                          <input
                            value={systemSettingsDraft.azureDevOpsOrganizationUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                azureDevOpsOrganizationUrl: event.target.value,
                              })
                            }
                            placeholder="https://dev.azure.com/company"
                          />
                        </label>
                        <label className="span-2">
                          Azure DevOps token
                          <input
                            type="password"
                            value={systemSettingsDraft.azureDevOpsToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                azureDevOpsToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "azureDevOps.token")
                                ? "задан, введите новый для замены"
                                : "не задан"
                            }
                          />
                        </label>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.biEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                biEnabled: event.target.checked,
                              })
                            }
                          />
                          BI включен
                        </label>
                        <label className="span-2">
                          BI export URL
                          <input
                            value={systemSettingsDraft.biExportUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                biExportUrl: event.target.value,
                              })
                            }
                            placeholder="https://bi.company.ru/api/pms"
                          />
                        </label>
                        <button type="submit" disabled={savingSystemSettings}>
                          {savingSystemSettings ? "Сохраняю..." : "Сохранить интеграции"}
                        </button>
                      </form>
                      <div className="integration-settings-list">
                        {(adminIntegrations?.integrationSettings ?? []).map((setting) => (
                          <div key={setting.key}>
                            <b>{setting.key}</b>
                            <small>
                              {setting.isSecret
                                ? setting.hasValue
                                  ? "задано"
                                  : "не задано"
                                : setting.value || "не задано"}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </article>
              )}

              {activeView === "admin-health" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: system health</h2>
                      <p>Техническое состояние приложения и подключений</p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminHealth()}>
                      Обновить
                    </button>
                  </div>
                  <div className="admin-status-grid">
                    <div className="metric-card">
                      <span>API</span>
                      <b>{adminHealth?.ok ? "В норме" : "Ошибка"}</b>
                      <small>Запущен: {dateTime(adminHealth?.startedAt ?? null)}</small>
                    </div>
                    <div className="metric-card">
                      <span>База данных</span>
                      <b>{adminHealth?.database ?? "неизвестно"}</b>
                      <small>Latency: {adminHealth?.databaseLatencyMs ?? 0} мс</small>
                    </div>
                    <div className="metric-card">
                      <span>Jira</span>
                      <b>{adminHealth?.jiraConfigured ? "Настроена" : "Не настроена"}</b>
                      <small>Интеграция зависит от системных настроек</small>
                    </div>
                    <div className="metric-card">
                      <span>Окружение</span>
                      <b>{adminHealth?.nodeEnv ?? "development"}</b>
                      <small>Uptime: {adminHealth?.uptimeSeconds ?? 0} сек.</small>
                    </div>
                  </div>
                </article>
              )}

              {activeView === "admin-backups" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: backup/restore status</h2>
                      <p>Состояние каталога backup и последнего архивного файла</p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminHealth()}>
                      Обновить
                    </button>
                  </div>
                  <div className="admin-status-grid">
                    <div className="metric-card span-2">
                      <span>Каталог backup</span>
                      <b>{backupStatus?.backupDir ?? "не задан"}</b>
                      <small>{backupStatus?.message ?? "Нет данных"}</small>
                    </div>
                    <div className="metric-card">
                      <span>Файлы</span>
                      <b>{backupStatus?.totalBackups ?? 0}</b>
                      <small>Retention: {backupStatus?.retentionDays ?? 0} дн.</small>
                    </div>
                    <div className="metric-card">
                      <span>Последний backup</span>
                      <b>{backupStatus?.latestBackup?.file ?? "не найден"}</b>
                      <small>
                        {backupStatus?.latestBackup
                          ? `${dateTime(backupStatus.latestBackup.updatedAt)} / ${fileSize(
                              backupStatus.latestBackup.sizeBytes,
                            )}`
                          : "Файл отсутствует"}
                      </small>
                    </div>
                    <div className="metric-card span-2">
                      <span>Checksum</span>
                      <b>{backupStatus?.latestChecksum ?? "не найден"}</b>
                      <small>Restore выполняется ops-скриптом с RESTORE_CONFIRM=yes</small>
                    </div>
                  </div>
                </article>
              )}

              {activeView === "admin-config" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: import/export конфигурации</h2>
                      <p>Перенос ролей, справочников и системных настроек между средами</p>
                    </div>
                    <div className="panel-title-actions">
                      <button type="button" onClick={() => void exportAdminConfig()}>
                        Экспортировать
                      </button>
                      <button
                        type="button"
                        onClick={() => void importAdminConfig()}
                        disabled={importingConfig || !configTransferText.trim()}
                      >
                        {importingConfig ? "Импортирую..." : "Импортировать"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="admin-config-textarea"
                    value={configTransferText}
                    onChange={(event) => setConfigTransferText(event.target.value)}
                    placeholder="JSON конфигурации"
                  />
                </article>
              )}

	              {activeView === "admin-projects" && (
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
                      {activeProjectTree.map((item) => {
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
                                {activeProjectTree
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
                                  selectProject(item.id, firstEnabledProjectView)
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
                              {currentUser?.role === "ADMIN" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void closeProject(item.id)}
                                    disabled={savingProjectRegistryId === item.id}
                                    title="Перенести проект в закрытые и заблокировать редактирование"
                                  >
                                    Закрыть
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-button"
                                    onClick={() => void deleteProject(item.id)}
                                    disabled={savingProjectRegistryId === item.id}
                                    title="Удалить проект и все связанные данные"
                                  >
                                    <Trash2 size={14} />
                                    Удалить
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {activeProjectTree.length === 0 && (
                        <div className="empty-state">Активные проекты не найдены.</div>
                      )}
                    </div>
                  </article>
              )}

              {activeView === "admin-audit" && (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <h2>Администрирование: журнал аудита</h2>
                        <p>Последние системные события и изменения данных</p>
                      </div>
                      <button type="button" onClick={() => void reloadAuditEvents()}>
                        Обновить
                      </button>
                    </div>
                    <div className="audit-table">
                      <div className="audit-head">
                        <span>Время</span>
                        <span>Действие</span>
                        <span>Пользователь</span>
                        <span>Объект</span>
                        <span>IP</span>
                      </div>
                      {auditEvents.map((event) => (
                        <div className="audit-row" key={event.id}>
                          <span>{dateTime(event.createdAt)}</span>
                          <strong>{auditActionLabel(event.action)}</strong>
                          <span>
                            {event.actorName || event.actorEmail || "Система"}
                          </span>
                          <span>
                            {auditObjectLabel(event)}
                            {event.objectId ? `: ${event.objectId}` : ""}
                          </span>
                          <span>{event.ipAddress || "не задано"}</span>
                        </div>
                      ))}
                      {auditEvents.length === 0 && (
                        <div className="empty-state">
                          События аудита пока не записаны.
                        </div>
                      )}
                    </div>
                  </article>
              )}

              {project && activeView === "project-overview" && (
                <article
                  className={`panel project-card workspace-focus-panel workspace-focus-milestones ${
                    fullscreenWorkspaceView === "overview-milestones-by-phase" ||
                    fullscreenWorkspaceView === "overview-milestones-all"
                      ? "workspace-focus-panel-fullscreen"
                      : ""
                  }`}
                >
                  <div className="panel-title">
                    <div>
                      <h2>Вехи</h2>
                    </div>
                    <div className="panel-title-actions">
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
                  </div>
                  <div className="milestone-sections">
                    {fullscreenWorkspaceView !== "overview-milestones-all" && (
                      <MilestoneTimelineSection
                        sectionId="milestones-by-phase"
                        title="Вехи по фазам"
                        timeline={milestoneTimeline.byPhase}
                        isFullscreen={
                          fullscreenWorkspaceView ===
                          "overview-milestones-by-phase"
                        }
                        onToggleFullscreen={() =>
                          toggleWorkspaceFullscreen(
                            "overview-milestones-by-phase",
                          )
                        }
                        onOpenStructure={() => openView("project-structure")}
                        onPrint={() =>
                          printSectionAsPdf(
                            "milestones-by-phase",
                            `${project.code} - вехи по фазам`,
                          )
                        }
                      />
                    )}
                    {fullscreenWorkspaceView !==
                      "overview-milestones-by-phase" && (
                      <MilestoneSnakeTimelineSection
                        sectionId="milestones-all"
                        title="Все вехи"
                        timeline={milestoneTimeline.all}
                        isFullscreen={
                          fullscreenWorkspaceView === "overview-milestones-all"
                        }
                        onToggleFullscreen={() =>
                          toggleWorkspaceFullscreen("overview-milestones-all")
                        }
                        onOpenStructure={() => openView("project-structure")}
                        onPrint={() =>
                          printSectionAsPdf(
                            "milestones-all",
                            `${project.code} - все вехи`,
                          )
                        }
                      />
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

              {project && activeView === "project-changes" && (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>Управление изменениями</h2>
                      <p>
                        Запросы на изменение состава работ, сроков и
                        управленческих решений проекта.
                      </p>
                    </div>
                  </div>
                  <div className="module-summary-grid">
                    <div className="metric-card">
                      <span>Запросы на изменение</span>
                      <b>{project.changeRequests.length}</b>
                      <small>Подготовлено для будущего workflow согласований</small>
                    </div>
                    <div className="metric-card">
                      <span>Открытые решения</span>
                      <b>
                        {
                          project.issues.filter(
                            (issue) =>
                              issue.decisionRequired && issue.status !== "Closed",
                          ).length
                        }
                      </b>
                      <small>Открытые вопросы, влияющие на изменения</small>
                    </div>
                    <div className="metric-card">
                      <span>Отклонения от базового плана</span>
                      <b>{overviewDashboard.scheduleDeltaItems.length}</b>
                      <small>Первичные источники сдвига сроков</small>
                    </div>
                  </div>
                  <div className="module-table">
                    <div className="module-table-head">
                      <span>Объект</span>
                      <span>Тип изменения</span>
                      <span>Влияние</span>
                      <span>Ответственный</span>
                    </div>
                    {overviewDashboard.scheduleDeltaItems.map(({ item, delay }) => (
                      <div className="module-table-row" key={item.id}>
                        <b>
                          {item.code} {item.title}
                        </b>
                        <span>Сдвиг срока</span>
                        <span>+{delay} кал. дн.</span>
                        <span>{item.owner || "не назначен"}</span>
                      </div>
                    ))}
                    {overviewDashboard.scheduleDeltaItems.length === 0 && (
                      <div className="empty-state">
                        Изменения сроков относительно базового плана не найдены.
                      </div>
                    )}
                  </div>
                </article>
              )}

              {project && activeView === "project-resources" && (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>Управление ресурсами</h2>
                      <p>
                        Сводка по исполнителям, назначенным работам и просроченным
                        задачам.
                      </p>
                    </div>
                  </div>
                  <div className="module-summary-grid">
                    <div className="metric-card">
                      <span>Исполнители</span>
                      <b>{resourceSummaryRows.length}</b>
                      <small>По полю Исполнитель в Структуре</small>
                    </div>
                    <div className="metric-card">
                      <span>Работы в процессе</span>
                      <b>
                        {resourceSummaryRows.reduce(
                          (sum, row) => sum + row.inProgress,
                          0,
                        )}
                      </b>
                      <small>Задачи и результаты со статусом В работе</small>
                    </div>
                    <div className="metric-card">
                      <span>Просроченные</span>
                      <b>
                        {resourceSummaryRows.reduce(
                          (sum, row) => sum + row.overdue,
                          0,
                        )}
                      </b>
                      <small>Не завершены и срок уже прошел</small>
                    </div>
                  </div>
                  <div className="module-table resources-table">
                    <div className="module-table-head">
                      <span>Исполнитель</span>
                      <span>Всего</span>
                      <span>В работе</span>
                      <span>Сделано</span>
                      <span>Просрочено</span>
                    </div>
                    {resourceSummaryRows.map((row) => (
                      <div className="module-table-row" key={row.owner}>
                        <b>{row.owner}</b>
                        <span>{row.total}</span>
                        <span>{row.inProgress}</span>
                        <span>{row.done}</span>
                        <span>{row.overdue}</span>
                      </div>
                    ))}
                    {resourceSummaryRows.length === 0 && (
                      <div className="empty-state">
                        В Структуре пока нет задач с назначенными исполнителями.
                      </div>
                    )}
                  </div>
                </article>
              )}

              {project && activeView === "project-budget" && (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>Управление бюджетом</h2>
                      <p>
                        Контур бюджетного планирования выделен в отдельную
                        страницу и будет наполнен после согласования модели
                        финансовых данных.
                      </p>
                    </div>
                  </div>
                  <div className="budget-placeholder">
                    <BriefcaseBusiness size={34} />
                    <div>
                      <b>Бюджетный модуль подготовлен</b>
                      <span>
                        Сейчас страница не считает финансы и не влияет на
                        проектные показатели. После согласования состава полей
                        сюда можно вынести план, факт, прогноз, лимиты и
                        отклонения.
                      </span>
                    </div>
                  </div>
                </article>
              )}

              {project &&
                (activeView === "project-structure" ||
                  activeView === "project-gantt") && (
                    <article
                      className={`panel project-card workspace-focus-panel ${
                        fullscreenWorkspaceView === activeView
                          ? "workspace-focus-panel-fullscreen"
                          : ""
                      } ${
                        activeView === "project-structure"
                          ? "workspace-focus-structure"
                          : "workspace-focus-gantt"
                      }`}
                    >
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
                          <div className="gantt-controls wbs-structure-controls" aria-label="Панель управления Структурой">
                          <div className="gantt-controls-row">
                            <button
                              type="button"
                              className="workspace-fullscreen-button"
                              onClick={() =>
                                toggleWorkspaceFullscreen("project-structure")
                              }
                              aria-label={
                                fullscreenWorkspaceView === "project-structure"
                                  ? "Вернуть обычный режим Структуры"
                                  : "Развернуть Структуру на весь экран"
                              }
                              title={
                                fullscreenWorkspaceView === "project-structure"
                                  ? "Вернуть обычный режим"
                                  : "На весь экран"
                              }
                            >
                              {fullscreenWorkspaceView === "project-structure" ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                              {fullscreenWorkspaceView === "project-structure"
                                ? "Обычный режим"
                                : "На весь экран"}
                            </button>
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
                            <button
                              type="button"
                              className={showStructureCriticalPath ? "active" : ""}
                              onClick={() =>
                                setShowStructureCriticalPath((current) => !current)
                              }
                              disabled={
                                (project.criticalPath?.criticalItemIds.length ?? 0) === 0
                              }
                              title="Показать только задачи критического пути"
                            >
                              Критический путь
                            </button>
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
                            <div
                              className="segmented-control hierarchy-control"
                              aria-label="Глубина иерархии Структуры"
                            >
                              {GANTT_HIERARCHY_LEVELS.map((level) => (
                                <button
                                  type="button"
                                  key={level}
                                  className={
                                    activeWbsHierarchyLevel === level ? "active" : ""
                                  }
                                  onClick={() => setWbsHierarchyLevel(level)}
                                  title={`Показать структуру до ${level} уровня`}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                            <span
                              className={`wbs-save-state ${dirtyWbsItemIds.size > 0 ? "dirty" : "saved"}`}
                            >
                              {dirtyWbsItemIds.size > 0
                                ? `Не сохранено: ${dirtyWbsItemIds.size}`
                                : "Сохранено"}
                            </span>
                          </div>
                          {renderSavedViewControls()}
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
                          <div className="status-legend gantt-status-legend" aria-label="Легенда статусов Структуры">
                            <span><i className="tone-b" />В работе</span>
                            <span><i className="tone-g" />Сделано</span>
                            <span><i className="tone-r" />Провалено</span>
                            <span><i className="tone-p" />Просрочено</span>
                            <span><i className="tone-x" />Не начато</span>
                            <span><i className="tone-o" />Веха</span>
                          </div>
                        </div>
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
                              role="columnheader"
                              aria-sort={
                                wbsSort?.columnKey === column.key
                                  ? wbsSort.direction === "asc"
                                    ? "ascending"
                                    : "descending"
                                  : "none"
                              }
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
                              <button
                                type="button"
                                className={`wbs-column-sort ${wbsSort?.columnKey === column.key ? "active" : ""}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleWbsSort(column.key);
                                }}
                                title={`Сортировать по полю «${column.label}»`}
                              >
                                <span className="wbs-column-title">{column.label}</span>
                                <span className="wbs-sort-indicator" aria-hidden="true">
                                  {wbsSort?.columnKey === column.key
                                    ? wbsSort.direction === "asc"
                                      ? "↑"
                                      : "↓"
                                    : "↕"}
                                </span>
                              </button>
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
                        {/* eslint-disable-next-line react-hooks/refs -- renderWbsCell only wires event handlers; refs are read after render in those handlers. */}
                        {visibleStructureWbsTree.map((item) => {
                          const draft = wbsDrafts[item.id];
                          if (!draft) return null;
                          return (
                            <div
                              key={item.id}
                              className={`wbs-row-stack ${draggedWbsItemId === item.id ? "dragging" : ""} ${wbsDropTargetId === item.id ? "drop-target" : ""}`}
                              onDragOver={(event) => {
                                if (
                                  wbsSort ||
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
                                if (wbsSort) return;
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
                          {project.wbsItems.length > 0 &&
                            visibleStructureWbsTree.length === 0 && (
                            <div className="empty-state">
                              Нет задач критического пути для текущего фильтра.
                            </div>
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
                              className="workspace-fullscreen-button"
                              onClick={() => toggleWorkspaceFullscreen("project-gantt")}
                              aria-label={
                                fullscreenWorkspaceView === "project-gantt"
                                  ? "Вернуть обычный режим Гантта"
                                  : "Развернуть Гантт на весь экран"
                              }
                              title={
                                fullscreenWorkspaceView === "project-gantt"
                                  ? "Вернуть обычный режим"
                                  : "На весь экран"
                              }
                            >
                              {fullscreenWorkspaceView === "project-gantt" ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                              {fullscreenWorkspaceView === "project-gantt"
                                ? "Обычный режим"
                                : "На весь экран"}
                            </button>
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
                                onClick={toggleGanttDependencies}
                              >
                                Связи
                              </button>
                              <button
                                type="button"
                                className={showGanttCriticalPath ? "active" : ""}
                                onClick={toggleGanttCriticalPath}
                                title="Показать задачи и связи с нулевым резервом"
                              >
                                Критический путь
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
                                onClick={() => void resetGanttPanelSize()}
                              >
                                Сбросить размер
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
                              <span><i className="tone-critical" />Критический путь</span>
                              <span><i className="tone-near-critical" />Резерв до 5 дн.</span>
                            </div>
                            {project.criticalPath?.warnings?.map((warning) => (
                              <p className="gantt-warning" key={warning}>{warning}</p>
                            ))}
                          </div>
                          <div
                            className="gantt-panel"
                            style={
                              {
                                "--gantt-panel-height": `${ganttPanelHeight}px`,
                                "--gantt-panel-width":
                                  ganttPanelWidth > 0
                                    ? `min(${ganttPanelWidth}px, 100%)`
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
                          <div className="gantt-panel-scroll">
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
                              title={period.label}
                            >
                              {period.showLabel ? period.label : ""}
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
                            {ganttScale === "quarter" && (
                              <div className="gantt-sub-grid" aria-hidden="true">
                                {wbsGantt.months.map((period) => (
                                  <span
                                    key={`${ganttScale}-${period.label}`}
                                    style={{ left: `${period.offset}%` }}
                                  />
                                ))}
                              </div>
                            )}
                            {wbsGantt.todayOffset !== null && (
                              <span
                                className="gantt-today"
                                style={{ left: `${wbsGantt.todayOffset}%` }}
                                title={`Сегодня: ${date(new Date().toISOString())}`}
                              />
                            )}
                            {(showGanttDependencies || showGanttCriticalPath) && (
                              <svg
                                className={`gantt-links ${ganttLinkDraft ? "drawing" : ""}`}
                                viewBox={`0 0 100 ${wbsGantt.height}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                              >
                                <defs>
                                  <marker
                                    id="ganttDependencyArrow"
                                    markerHeight="7"
                                    markerWidth="8"
                                    orient="auto"
                                    refX="7"
                                    refY="3.5"
                                    viewBox="0 0 8 7"
                                  >
                                    <path d="M 0 0 L 8 3.5 L 0 7 z" />
                                  </marker>
                                </defs>
                                {wbsGantt.dependencyLines
                                  .filter(
                                    (line) =>
                                      !showGanttCriticalPath || line.critical,
                                  )
                                  .map((line) => {
                                    const endpointGap = line.fromMilestone
                                      ? 0
                                      : GANTT_LINK_ENDPOINT_GAP_PERCENT;
                                    const targetGap = line.toMilestone
                                      ? 0
                                      : GANTT_LINK_ENDPOINT_GAP_PERCENT;
                                    const startX = clampNumber(
                                      line.fromX + line.fromDirection * endpointGap,
                                      0,
                                      100,
                                    );
                                    const endX = clampNumber(
                                      line.toX - line.toDirection * targetGap,
                                      0,
                                      100,
                                    );
                                    return (
                                      <path
                                        className={`slot-${line.styleSlot}${
                                          showGanttCriticalPath
                                            ? " critical-path"
                                            : ""
                                        }${
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
                                        }`}
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
                                        d={ganttDependencyPath({
                                          fromSide: line.fromSide,
                                          fromX: startX,
                                          fromY: line.fromY,
                                          toSide: line.toSide,
                                          toX: endX,
                                          toY: line.toY,
                                        })}
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
                                        d={ganttRoundedDependencyPath([
                                          { x: sourceX, y: sourceY },
                                          {
                                            x:
                                              sourceX +
                                              ganttPathDirection(ganttLinkDraft.side) *
                                                GANTT_LINK_STUB_PERCENT,
                                            y: sourceY,
                                          },
                                          {
                                            x: ganttLinkDraft.pointerX,
                                            y: ganttLinkDraft.pointerY,
                                          },
                                        ])}
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
                                bracket,
                                baselineRange,
                                  forecastRange,
                                  scheduleVarianceDays,
                                  toneClass,
                                  nearCritical,
                                  totalFloatWorkDays,
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
                                      className={`gantt-bar ${item.status.toLowerCase().replaceAll("_", "-")} ${toneClass} ${milestone ? "milestone" : ""} ${summary ? "summary" : ""} ${bracket ? "summary-bracket" : ""} ${showGanttCriticalPath && critical ? "critical-path" : ""} ${showGanttCriticalPath && nearCritical ? "near-critical-path" : ""}`}
                                      style={{
                                        left: `${offset}%`,
                                        width: milestone ? undefined : `${width}%`,
                                      }}
                                      title={`${item.code} ${item.title}: ${date(item.startDate)} - ${date(item.dueDate)}${
                                        totalFloatWorkDays === null
                                          ? ""
                                          : `. Резерв: ${totalFloatWorkDays} раб. дн.`
                                      }`}
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
                                  {item.jiraTicketUrl && (
                                    <a
                                      className="gantt-jira-badge"
                                      href={item.jiraTicketUrl}
                                      rel="noreferrer"
                                      style={{
                                        left: `calc(${offset + (milestone ? 0 : width)}% + 8px)`,
                                      }}
                                      target="_blank"
                                      title={`Открыть Jira: ${item.jiraTicketKey || item.jiraTicketUrl}`}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      Jira
                                    </a>
                                  )}
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

              {project && activeView === "admin-jira" && (
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
                        setIssueDrawerMode("create");
                      }}
                    >
                      Создать вопрос
                    </button>
                  </div>
                  <div className="issue-list">
                    <div className="issue-list-head" aria-hidden="true">
                      <span>Запись</span>
                      <span>Ключ Jira</span>
                      <span>Критичность</span>
                      <span>Срок</span>
                      <span>Ответственный</span>
                      <span />
                    </div>
                      {project.issues.map((issue) => {
                        const delayDays = calendarDelayDays(
                          issue.initialDueDate,
                          issue.dueDate,
                        );
                        const jiraLink = issuePrimaryJiraLink(issue);
                        return (
                        <div className="issue-row" key={issue.id}>
                          <div
                            className="issue-summary-row"
                            role="button"
                            tabIndex={0}
                            aria-expanded={expandedIssueId === issue.id}
                            aria-controls={`issue-details-${issue.id}`}
                            onClick={() =>
                              setExpandedIssueId(
                                expandedIssueId === issue.id ? null : issue.id,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              setExpandedIssueId(
                                expandedIssueId === issue.id ? null : issue.id,
                              );
                            }}
                          >
                            <span className="issue-summary-title">
                              {issue.title}
                              </span>
                              <span className="issue-summary-cell">
                                {jiraLink.key && jiraLink.url ? (
                                  <a
                                    className="issue-jira-key"
                                    href={jiraLink.url}
                                    rel="noreferrer"
                                    target="_blank"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {jiraLink.key}
                                  </a>
                                ) : (
                                  jiraLink.key || "не задан"
                                )}
                              </span>
                            <span className="issue-summary-cell">
                              <span
                                className={`issue-severity-pill ${issue.severity.toLowerCase()}`}
                              >
                                {issueSeverityLabel(issue.severity)}
                              </span>
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
                            </div>
                        {expandedIssueId === issue.id && (
                          <div
                            className="issue-details-panel"
                            id={`issue-details-${issue.id}`}
                          >
                            {(() => {
                              const draft = issueEditDrafts[issue.id];
                              const latestStatus = latestIssueStatusUpdate(issue);
                              return (
                                <>
                                  <section className="raid-status-panel issue-status-panel">
                                    <div className="subhead">Статус</div>
                                    {latestStatus ? (
                                      <div className="raid-status-latest">
                                        <strong>{date(latestStatus.statusAt)}</strong>
                                        <p>{latestStatus.text}</p>
                                      </div>
                                    ) : (
                                      <p className="muted-text">
                                        Статус пока не добавлен.
                                      </p>
                                    )}
                                    <div className="raid-status-history">
                                      {issue.statusUpdates.map((statusUpdate) => (
                                        <div
                                          className="raid-status-history-row"
                                          key={statusUpdate.id}
                                        >
                                          <span>{date(statusUpdate.statusAt)}</span>
                                          <p>{statusUpdate.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="raid-status-add">
                                      <input
                                        type="date"
                                        value={
                                          issueStatusDrafts[issue.id]?.statusAt ??
                                          isoDate(new Date())
                                        }
                                        onChange={(event) =>
                                          updateIssueStatusDraft(issue.id, {
                                            statusAt: event.target.value,
                                          })
                                        }
                                      />
                                      <textarea
                                        rows={2}
                                        value={issueStatusDrafts[issue.id]?.text ?? ""}
                                        onChange={(event) =>
                                          updateIssueStatusDraft(issue.id, {
                                            text: event.target.value,
                                          })
                                        }
                                        placeholder="Новый статус: что изменилось, следующий шаг, блокеры"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => addIssueStatusUpdate(issue.id)}
                                        disabled={isReadOnly}
                                      >
                                        Добавить статус
                                      </button>
                                    </div>
                                  </section>
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
                                  {draft && (
                                    <div className="issue-edit-grid">
                                      <select
                                        value={draft.severity}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            severity: event.target.value as Issue["severity"],
                                          })
                                        }
                                        disabled={isReadOnly}
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
                                      <select
                                        value={draft.status}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            status: event.target.value,
                                          })
                                        }
                                        disabled={isReadOnly}
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
                                      <input
                                        value={draft.title}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            title: event.target.value,
                                          })
                                        }
                                        placeholder="Заголовок"
                                        disabled={isReadOnly}
                                      />
                                      <input
                                        value={draft.owner}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            owner: event.target.value,
                                          })
                                        }
                                        placeholder="Ответственный"
                                        disabled={isReadOnly}
                                      />
                                      <input
                                        type="date"
                                        value={draft.dueDate}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            dueDate: event.target.value,
                                          })
                                        }
                                        disabled={isReadOnly}
                                      />
                                      <input
                                        value={draft.jiraTicketKey}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            jiraTicketKey: event.target.value,
                                          })
                                        }
                                        placeholder="Ключ Jira"
                                        disabled={isReadOnly}
                                      />
                                      <input
                                        value={draft.jiraTicketUrl}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            jiraTicketUrl: event.target.value,
                                          })
                                        }
                                        placeholder="Jira URL"
                                        disabled={isReadOnly}
                                      />
                                      <label className="checkbox-line compact-checkbox">
                                        <input
                                          type="checkbox"
                                          checked={draft.decisionRequired}
                                          onChange={(event) =>
                                            updateIssueDraft(issue.id, {
                                              decisionRequired: event.target.checked,
                                            })
                                          }
                                          disabled={isReadOnly}
                                        />
                                        Требует решения
                                      </label>
                                      <textarea
                                        className="span-2"
                                        value={draft.impact}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            impact: event.target.value,
                                          })
                                        }
                                        rows={2}
                                        placeholder="Влияние"
                                        disabled={isReadOnly}
                                      />
                                      <div className="issue-actions span-2">
                                        <button
                                          type="button"
                                          onClick={() => saveOpenIssue(issue.id)}
                                          disabled={isReadOnly}
                                        >
                                          Сохранить вопрос
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => closeOpenIssue(issue.id)}
                                          disabled={isReadOnly}
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
                                          disabled={isReadOnly}
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
                                </>
                              );
                            })()}
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
                    <section className="closed-issues-section">
                      <div className="section-heading compact">
                        <div>
                          <h3>Закрытые ранее вопросы</h3>
                          <p>Вопросы со статусом Решено или Закрыто</p>
                        </div>
                        <span>{project.closedIssues?.length ?? 0}</span>
                      </div>
                      <div className="issue-list closed-issue-list">
                        <div className="issue-list-head" aria-hidden="true">
                          <span>Наименование</span>
                          <span>Ключ Jira</span>
                          <span>Срок</span>
                          <span>Отставание</span>
                          <span>Ответственный</span>
                          <span />
                        </div>
                        {(project.closedIssues ?? []).map((issue) => {
                          const jiraLink = issuePrimaryJiraLink(issue);
                          const delayDays =
                            issue.closedDelayDays ??
                            calendarDelayDays(issue.initialDueDate, issue.dueDate);
                          return (
                            <div className="issue-row closed" key={issue.id}>
                              <div
                                className="issue-summary-row"
                                role="button"
                                tabIndex={0}
                                aria-expanded={expandedIssueId === issue.id}
                                aria-controls={`issue-details-${issue.id}`}
                                onClick={() =>
                                  setExpandedIssueId(
                                    expandedIssueId === issue.id ? null : issue.id,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") {
                                    return;
                                  }
                                  event.preventDefault();
                                  setExpandedIssueId(
                                    expandedIssueId === issue.id ? null : issue.id,
                                  );
                                }}
                              >
                                <span className="issue-summary-title">
                                  {issue.title}
                                </span>
                                <span className="issue-summary-cell">
                                  {jiraLink.key && jiraLink.url ? (
                                    <a
                                      className="issue-jira-key"
                                      href={jiraLink.url}
                                      rel="noreferrer"
                                      target="_blank"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {jiraLink.key}
                                    </a>
                                  ) : (
                                    jiraLink.key || "не задан"
                                  )}
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
                              </div>
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
                                    <span>
                                      Статус: {issueStatusLabel(issue.status)}
                                    </span>
                                    <span>
                                      Отставание на момент закрытия:{" "}
                                      {delayDays > 0 ? `+${delayDays} кал. дн.` : "нет"}
                                    </span>
                                    <span>
                                      Источник:{" "}
                                      {issue.source === "JIRA" ? "Jira" : "Внутренний"}
                                    </span>
                                  </div>
                                  <div className="issue-impact">
                                    <span>Влияние</span>
                                    <p>{issue.impact || "не заполнено"}</p>
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
                                      </span>
                                    ))}
                                    {issue.jiraLinks.length === 0 && !jiraLink.url && (
                                      <span className="muted-inline">
                                        Задачи Jira не связаны
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(project.closedIssues?.length ?? 0) === 0 && (
                          <div className="empty-state">
                            Закрытых вопросов пока нет.
                          </div>
                        )}
                      </div>
                    </section>
                  </article>
                )}

              {project && activeView === "admin-jira" && (
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

              {project && activeView === "admin-jira" && (
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
                          <div
                            className="raid-item"
                            id={`raid-item-${item.id}`}
                            key={item.id}
                          >
                            <div
                              className="raid-row"
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setExpandedRaidId(
                                  expandedRaidId === item.id ? null : item.id,
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setExpandedRaidId(
                                    expandedRaidId === item.id ? null : item.id,
                                  );
                                }
                              }}
                            >
                              <span className="raid-title">{item.title}</span>
                              <span>
                                {item.jiraTicketUrl ? (
                                  <a
                                    className="raid-jira-link"
                                    href={item.jiraTicketUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    {item.jiraTicketKey || "Jira"}
                                  </a>
                                ) : (
                                  <span className="raid-jira-empty">
                                    {item.jiraTicketKey || "не задан"}
                                  </span>
                                )}
                              </span>
                              <span className={`risk-score ${riskTone(item.riskScore)}`}>
                                {item.riskScore}
                              </span>
                              <span>{date(item.dueDate)}</span>
                              <span>{item.owner}</span>
                              <span className="issue-chevron">
                                {expandedRaidId === item.id ? "-" : "+"}
                              </span>
                            </div>
                            {expandedRaidId === item.id && raidDrafts[item.id] && (
                              <div className="raid-details">
                                {(() => {
                                  const latestStatus = latestRaidStatusUpdate(item);
                                  return (
                                    <section className="raid-status-panel">
                                      <div className="subhead">Статус</div>
                                      {latestStatus ? (
                                        <div className="raid-status-latest">
                                          <strong>{date(latestStatus.statusAt)}</strong>
                                          <p>{latestStatus.text}</p>
                                        </div>
                                      ) : (
                                        <p className="muted-text">
                                          Статус пока не добавлен.
                                        </p>
                                      )}
                                      <div className="raid-status-history">
                                        {item.statusUpdates.map((statusUpdate) => (
                                          <div
                                            className="raid-status-history-row"
                                            key={statusUpdate.id}
                                          >
                                            <span>{date(statusUpdate.statusAt)}</span>
                                            <p>{statusUpdate.text}</p>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="raid-status-add">
                                        <input
                                          type="date"
                                          value={
                                            raidStatusDrafts[item.id]?.statusAt ??
                                            isoDate(new Date())
                                          }
                                          onChange={(event) =>
                                            updateRaidStatusDraft(item.id, {
                                              statusAt: event.target.value,
                                            })
                                          }
                                        />
                                        <textarea
                                          rows={2}
                                          value={raidStatusDrafts[item.id]?.text ?? ""}
                                          onChange={(event) =>
                                            updateRaidStatusDraft(item.id, {
                                              text: event.target.value,
                                            })
                                          }
                                          placeholder="Новый статус: что изменилось, что требуется, следующий шаг"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => addRaidStatusUpdate(item.id)}
                                        >
                                          Добавить статус
                                        </button>
                                      </div>
                                    </section>
                                  );
                                })()}
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

            </section>
            </>
          )}
        </PageBoundary>
        {project && activeView === "project-issues" && issueDrawerMode && (
          <div
            className="drawer-backdrop"
            onClick={() => {
              setIssueDrawerMode(null);
            }}
          >
            <aside
              className="side-drawer"
              aria-label="Создать открытый вопрос"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="drawer-title">
                <div>
                  <h2>Создать открытый вопрос</h2>
                  <p>Срок, ответственный, влияние и связь с Jira</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIssueDrawerMode(null);
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
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
