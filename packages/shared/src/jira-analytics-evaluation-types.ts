import type {
  JiraAnalyticsFilterField,
  JiraAnalyticsPeriodDays,
  JiraAnalyticsPeriodMode,
  JiraAnalyticsSortDirection,
  JiraAnalyticsSortField,
  JiraAnalyticsSource,
  JiraAnalyticsTimeZone,
} from "./jira-analytics-core.js";
import type {
  JiraAnalyticsAggregateDraft,
  JiraAnalyticsFilter,
  JiraAnalyticsRowConfig,
} from "./jira-analytics-datasets.js";

export type JiraAnalyticsTransitionData = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  transitionedAt: string;
};

export type JiraAnalyticsDevelopmentData = {
  id: string;
  activityAt: string;
  commitCount: number;
  mergeRequestCount: number;
  sprintAtObservation: string | null;
  isBaseline: boolean;
};

/** Extra fields kept with an issue (see the API's jira-attributes.ts); absent in data read before them. */
export type JiraAnalyticsIssueAttributes = {
  statusCategoryKey: 'new' | 'indeterminate' | 'done' | null;
  parentKey: string | null;
  epicKey: string | null;
  components: string[];
  fixVersions: string[];
  storyPoints: number | null;
  dueDate: string | null;
  assigneeLogin: string | null;
  custom: Record<string, string | number | string[]>;
};

const textOrNull = (value: unknown) => (typeof value === 'string' && value ? value : null);
const textList = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);

/** The stored JSON read back defensively: anything unexpected becomes empty, never an error. */
export function readJiraIssueAttributes(value: unknown): JiraAnalyticsIssueAttributes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const category = raw.statusCategoryKey;
  const custom: Record<string, string | number | string[]> = {};
  if (raw.custom && typeof raw.custom === 'object' && !Array.isArray(raw.custom)) {
    for (const [id, entry] of Object.entries(raw.custom as Record<string, unknown>)) {
      if (typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry))) custom[id] = entry;
      else if (Array.isArray(entry)) custom[id] = textList(entry);
    }
  }
  return {
    statusCategoryKey: category === 'new' || category === 'indeterminate' || category === 'done' ? category : null,
    parentKey: textOrNull(raw.parentKey),
    epicKey: textOrNull(raw.epicKey),
    components: textList(raw.components),
    fixVersions: textList(raw.fixVersions),
    storyPoints: typeof raw.storyPoints === 'number' && Number.isFinite(raw.storyPoints) ? raw.storyPoints : null,
    dueDate: typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : null,
    assigneeLogin: textOrNull(raw.assigneeLogin),
    custom,
  };
}

export type JiraAnalyticsIssueData = {
  id: string;
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
  sprintCount: number;
  labels: string[];
  issueCreatedAt: string | null;
  criticalPriorityAt: string | null;
  criticalEndPriority?: string | null;
  resolutionAt: string | null;
  criticalSlaTracked: boolean;
  commitCount: number;
  mergeRequestCount: number;
  developmentDataAvailable: boolean;
  transitionHistoryComplete: boolean;
  dataObservedAt?: string | null;
  updatedAt: string;
  statusTransitions: JiraAnalyticsTransitionData[];
  developmentActivities: JiraAnalyticsDevelopmentData[];
  attributes?: JiraAnalyticsIssueAttributes | null;
};

export type JiraAnalyticsGoalMapping = {
  id: string;
  name: string;
  status: string;
  date: string | null;
  labels: string[];
};

export type JiraAnalyticsGoalRecord = JiraAnalyticsGoalMapping & {
  matchedLabels: string[];
};

export type JiraAnalyticsResultRecord = {
  id: string;
  source: JiraAnalyticsSource;
  issue: Omit<
    JiraAnalyticsIssueData,
    "statusTransitions" | "developmentActivities" | "criticalEndPriority" | "dataObservedAt"
  >;
  eventAt: string | null;
  intervalStartAt: string | null;
  intervalEndAt: string | null;
  intervalStartFromStatus: string | null;
  intervalStartToStatus: string | null;
  intervalEndFromStatus: string | null;
  intervalEndToStatus: string | null;
  durationHours: number | null;
  commitCount: number;
  mergeRequestCount: number;
  fromStatus: string | null;
  toStatus: string | null;
  sprint: string | null;
  occurrenceIndex?: number;
  occurrenceCount?: number;
  goal?: JiraAnalyticsGoalRecord;
  semanticValues?: Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>>;
};

export type JiraAnalyticsDataQualityStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "NO_DATA"
  | "UNAVAILABLE";

export type JiraAnalyticsDataQualityWarning = {
  code:
    | "NO_SOURCE_POPULATION"
    | "INCOMPLETE_TRANSITION_HISTORY"
    | "MISSING_ISSUE_CREATED_AT"
    | "INCOMPLETE_DEVELOPMENT_DATA"
    | "INCOMPLETE_CRITICAL_SLA"
    | "UNDETERMINED_JIRA_LINK"
    | "MISSING_HISTORICAL_OBSERVATION"
    | "BEFORE_HISTORY_START"
    | "HISTORY_WRITE_GAP";
  count: number;
};

export type JiraAnalyticsDataQuality = {
  status: JiraAnalyticsDataQualityStatus;
  basis: "CURRENT_PROJECTION" | "OBSERVED_VERSIONS";
  source: JiraAnalyticsSource;
  population: number;
  complete: number;
  incomplete: number;
  coveragePercent: number | null;
  oldestObservedAt: string | null;
  latestObservedAt: string | null;
  warnings: JiraAnalyticsDataQualityWarning[];
};

export type JiraAnalyticsEvaluationOptions = {
  now: string;
  periodDays?: JiraAnalyticsPeriodDays;
  assignee: string;
  page: number;
  pageSize: number;
  groupKey?: string;
};

export type JiraAnalyticsExecutableDefinition = JiraAnalyticsAggregateDraft & {
  baseFilterLogic?: "and" | "or";
  baseFilters?: JiraAnalyticsFilter[];
  rowConfig?: JiraAnalyticsRowConfig | null;
  sortBy?: JiraAnalyticsSortField;
  sortDirection?: JiraAnalyticsSortDirection;
  dateField?: JiraAnalyticsFilterField | null;
  criticalSlaConfig?: {
    issueTypes: string[];
    priorities: string[];
    requirePriorityAtResolution: boolean;
    openIntervals: "exclude" | "include";
  };
  criticalRiskConfig?: {
    priorities: string[];
    bugIssueTypes: string[];
    bugSlaHours: number;
    bugWarningHours: number;
    taskIssueTypes: string[];
    taskRiskHours: number;
  };
  rowIdentity?: Array<JiraAnalyticsFilterField | "rowId">;
  maximumRows?: number;
  maximumRowsPerIssue?: number;
  goalMappings?: JiraAnalyticsGoalMapping[];
};

export type JiraAnalyticsEvaluationResult = {
  evaluatedAt: string;
  effective: {
    periodDays: JiraAnalyticsPeriodDays | null;
    periodSource: JiraAnalyticsPeriodMode;
    timeZone: JiraAnalyticsTimeZone;
    assignee: string;
  };
  value: number;
  groups: Array<{ key: string; label: string; value: number; recordCount: number }>;
  records: JiraAnalyticsResultRecord[];
  totalRecords: number;
  page: number;
  pageSize: number;
  quality: JiraAnalyticsDataQuality;
};

export type JiraAnalyticsEvaluationLimits = {
  maxGroups?: number;
  maxPageWindow?: number;
  maxPageSize?: number;
};

export class JiraAnalyticsEvaluationLimitError extends Error {
  constructor(
    public readonly kind: "groups" | "pageWindow" | "rows" | "rowsPerIssue",
    public readonly limit: number,
  ) {
    super(`JIRA_ANALYTICS_${kind.replaceAll(/([A-Z])/g, "_$1").toUpperCase()}_LIMIT`);
  }
}

export type JiraAnalyticsEvaluationAccumulator = {
  addIssues: (issues: readonly JiraAnalyticsIssueData[]) => void;
  finish: () => JiraAnalyticsEvaluationResult;
};
