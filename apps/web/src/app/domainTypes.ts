import type {
  IssueSeverity,
  RagStatus,
  RaidItemStatus,
  RaidItemType,
  WbsItemStatus,
  WbsItemType,
} from "@pms/shared";
import type {
  ProjectCalendarCode,
  WbsSortState,
  WbsTableColumnKey,
} from "./wbsTable";
import type { CurrentWorkColumnKey } from "./currentWorkTable";

export type {
  IssueSeverity,
  RagStatus,
  RaidItemStatus,
  RaidItemType,
  WbsItemStatus,
  WbsItemType,
} from "@pms/shared";

export type SearchResult = {
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

export type SavedView = {
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

export type ProjectAccessLevel = "VIEW" | "EDIT" | "ADMIN";

export type ProjectListItem = {
  id: string;
  businessUnitId: string;
  businessUnit: { id: string; code: string; name: string };
  parentId: string | null;
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED";
  rag: RagStatus;
  startDate: string;
  initialTargetDate: string | null;
  targetDate: string;
  progress: number;
  scheduleVariance: number;
  budgetPlanned: string;
  budgetForecast: string;
  summary: string;
  sortOrder: number;
  uiState: ProjectUiState | null;
  jiraIntegration: JiraIntegration | null;
  jiraAnalyticsSettings?: JiraAnalyticsSettings | null;
  targetDateChanges: ProjectTargetDateChange[];
  wbsItems: WbsItem[];
  raidItems: RaidItem[];
  currentUserAccessLevel: ProjectAccessLevel | null;
  _count: {
    tasks: number;
    issues: number;
    jiraSnapshots: number;
  };
};

export type ProjectTargetDateChange = {
  id: string;
  projectId: string;
  previousDate: string;
  newDate: string;
  reason: string;
  approvedBy: string | null;
  createdById: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type ProjectTreeItem = ProjectListItem & {
  children: ProjectTreeItem[];
  level: number;
};

export type JiraIntegration = {
  baseUrl: string;
  boardUrl: string;
  projectKey: string;
  issuesJql: string;
  openIssuesJql: string;
  syncStatus: string;
  lastSyncedAt: string | null;
};

export type JiraAnalyticsSettings = {
  jiraScopeType: "LABEL" | "EPIC";
  jiraScopeValue: string;
  dashboardConfig: Record<string, unknown> | null;
  syncStatus: string;
  lastSyncedAt: string | null;
};

export type JiraAnalyticsFacets = {
  issueCount: number;
  activeIssueCount: number;
  transitionHistoryCompleteCount: number;
  developmentDataAvailableCount: number;
  criticalSlaTrackedCount: number;
  criticalSlaReadyCount: number;
  latestSyncedAt: string | null;
  assignees: string[];
  assigneesTruncated: boolean;
};

export type ProjectDetails = ProjectListItem & {
  tasks: Task[];
  issues: Issue[];
  closedIssues?: Issue[];
  jiraWorkSections: JiraWorkSection[];
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

export type PassportRow = {
  id: string;
  field: string;
  description: string;
};

export type ProjectUiState = {
  sidebarCollapsed?: boolean;
  wbsColumnOrder?: WbsTableColumnKey[];
  wbsHiddenColumns?: WbsTableColumnKey[];
  wbsColumnWidths?: Partial<Record<WbsTableColumnKey, number>>;
  wbsSort?: WbsSortState | null;
  currentWorkColumnWidths?: Partial<Record<CurrentWorkColumnKey, number>>;
  ganttPanelHeight?: number;
  ganttPanelWidth?: number;
  ganttWbsWidth?: number;
  passportRows?: PassportRow[];
  milestoneLabelLayout?: {
    fingerprint: string;
    offsets: Record<string, { x: number; y: number }>;
    updatedAt?: string;
  } | null;
};

export type Task = {
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

export type WbsItem = {
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
  effortPercent: number;
  plannedCost: string;
  forecastCost: string;
  progress: number;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  mattermostUrl: string | null;
  description: string | null;
  comment: string | null;
  closedAt: string | null;
  sortOrder: number;
};

export type WbsTreeItem = WbsItem & {
  children: WbsTreeItem[];
  level: number;
};

export type WbsDependencyType = "FS" | "SS" | "FF" | "SF";

export type WbsDependency = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
  lagDays: number;
  predecessor: Pick<WbsItem, "id" | "code" | "title">;
  successor: Pick<WbsItem, "id" | "code" | "title">;
};

export type WbsDependencySnapshot = Pick<
  WbsDependency,
  "predecessorId" | "successorId" | "type" | "lagDays"
>;

export type WbsCriticalPathItem = {
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

export type WbsCriticalPath = {
  projectStartDate: string | null;
  projectFinishDate: string | null;
  criticalItemIds: string[];
  criticalDependencyIds: string[];
  criticalItemCount: number;
  nearCriticalItemCount: number;
  warnings: string[];
  items: WbsCriticalPathItem[];
};

export type GanttLinkEndpoint = {
  itemId: string;
  side: "start" | "end";
};

export type GanttLinkDraft = GanttLinkEndpoint & {
  pointerX: number;
  pointerY: number;
  replaceDependencyId?: string;
};

export type WbsSnapshot = {
  wbsItems: WbsItem[];
  wbsDependencies: WbsDependencySnapshot[];
};

export type WbsSnapshotResponse = {
  item?: WbsItem;
  updatedCount?: number;
  wbsItems?: WbsItem[];
  wbsDependencies?: WbsDependency[];
  criticalPath?: WbsCriticalPath | null;
};

export type ProjectCalendarOverride = {
  id: string;
  projectId: string;
  calendarCode: ProjectCalendarCode;
  date: string;
  isWorkingDay: boolean;
  description: string | null;
};

export type Milestone = {
  id: string;
  code: string | null;
  title: string;
  dueDate: string;
  status: string;
  owner: string;
  description: string | null;
};

export type ArtifactStatus =
  | "Draft"
  | "In Review"
  | "Approved"
  | "Baseline"
  | "Archived";

export type ProjectArtifact = {
  id: string;
  title: string;
  type: string;
  owner: string;
  status: ArtifactStatus;
  url: string | null;
  description: string | null;
  sortOrder: number;
};

export type RaidItemStatusUpdate = {
  id: string;
  raidItemId: string;
  statusAt: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type RaidItem = {
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
  createdAt?: string;
  updatedAt?: string;
};

export type IssueJiraLink = {
  id: string;
  jiraKey: string;
  jiraUrl: string;
};

export type IssueStatusUpdate = {
  id: string;
  issueId: string;
  statusAt: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type Issue = {
  id: string;
  source: "INTERNAL" | "JIRA";
  category: string;
  title: string;
  referenceLabel: string;
  referenceUrl: string | null;
  severity: IssueSeverity;
  readiness: RagStatus;
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
  createdAt?: string;
  updatedAt?: string;
};

export type JiraIssueSnapshot = {
  id: string;
  projectId: string;
  jiraId: string | null;
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  issueType: string;
  resolution: string | null;
  sprint: string | null;
  issueCreatedAt: string | null;
  criticalPriorityAt: string | null;
  criticalEndPriority: string | null;
  resolutionAt: string | null;
  criticalSlaTracked: boolean;
  commitCount: number;
  mergeRequestCount: number;
  developmentUpdatedAt: string | null;
  developmentDataAvailable: boolean;
  developmentBaselineCaptured: boolean;
  transitionHistoryComplete: boolean;
  updatedAt: string;
  syncedAt: string;
  statusTransitions: JiraIssueStatusTransition[];
  developmentActivities: JiraDevelopmentActivity[];
};

export type JiraIssueStatusTransition = {
  id: string;
  snapshotId: string;
  transitionKey: string;
  fromStatus: string | null;
  toStatus: string;
  transitionedAt: string;
  actor: string | null;
  createdAt: string;
};

export type JiraDevelopmentActivity = {
  id: string;
  snapshotId: string;
  activityKey: string;
  activityAt: string;
  commitCount: number;
  mergeRequestCount: number;
  sprintAtObservation: string | null;
  isBaseline: boolean;
  observedAt: string;
};

export type JiraWorkSectionIssue = {
  sectionId: string;
  snapshotId: string;
  syncedAt: string;
  snapshot: JiraIssueSnapshot;
};

export type JiraWorkSection = {
  id: string;
  projectId: string;
  sortOrder: number;
  title: string;
  jql: string;
  filterUrl: string;
  createdAt: string;
  updatedAt: string;
  issues: JiraWorkSectionIssue[];
};

export type ExecutiveOverview = {
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
