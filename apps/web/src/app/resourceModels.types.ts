import type { ProjectListItem, WbsItem } from "./domainTypes";

export type ResourceProfileKind = "person" | "contractor-team" | "coordinator";

export type ResourceAllocationProfile = {
  owner: string;
  kind: ResourceProfileKind;
  role: string;
  baseHoursPerWeek: number;
  fte: number;
  projectAllocationPercent: number;
  currentProjectAllocationPercent: number;
  operationalAllocationPercent: number;
  executionFactorPercent: number;
  note: string;
};

export type ResourceSummaryRow = {
  owner: string;
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
};

export type ResourceLoadTone = "low" | "ok" | "warn" | "bad";

export type ResourceWeekBucket = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
};

export type ResourceLoadCell = {
  weekKey: string;
  weekLabel: string;
  demandHours: number;
  capacityHours: number;
  utilization: number;
  tone: ResourceLoadTone;
  label: string;
};

export type ResourceActiveItem = {
  id: string;
  projectCode: string | null;
  projectName: string | null;
  code: string;
  title: string;
  status: WbsItem["status"];
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  plannedHours: number;
  remainingHours: number;
  isCritical: boolean;
};

export type ResourceWeekDemand = {
  hours: number;
};

export type ResourceDashboardRow = ResourceSummaryRow & {
  profile: ResourceAllocationProfile;
  role: string;
  calendarCode: WbsItem["calendarCode"] | null;
  availableHoursPerWeek: number;
  capacityHoursPerWeek: number;
  blockedHoursPerWeek: number;
  plannedHours: number;
  remainingHours: number;
  peakUtilization: number;
  cells: ResourceLoadCell[];
  activeItems: ResourceActiveItem[];
};

export type ResourceConflict = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  owner: string;
  weekLabel: string | null;
  tone: ResourceLoadTone;
};

export type ResourceRequestPreview = {
  id: string;
  role: string;
  hours: number;
  dueLabel: string;
  reason: string;
  status: "draft" | "ready";
};

export type ResourceRecommendation = {
  id: string;
  title: string;
  detail: string;
  tone: ResourceLoadTone;
};

export type ResourceCalculationSource = {
  projectsCount: number;
  activeProjectsCount: number;
  projectNames: string[];
};

export type ResourceDashboard = {
  weeks: ResourceWeekBucket[];
  rows: ResourceDashboardRow[];
  unassignedRow: ResourceDashboardRow | null;
  conflicts: ResourceConflict[];
  requests: ResourceRequestPreview[];
  recommendations: ResourceRecommendation[];
  profiles: ResourceAllocationProfile[];
  source: ResourceCalculationSource;
  summary: {
    resourceCount: number;
    activeWorkCount: number;
    overloadedCount: number;
    roleGapHours: number;
    openRequests: number;
    criticalDelayRiskDays: number;
  };
};

export type ResourceBucket = {
  owner: string;
  role: string;
  profile: ResourceAllocationProfile;
  calendarCodes: Set<WbsItem["calendarCode"]>;
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
  plannedHours: number;
  remainingHours: number;
  activeItems: ResourceActiveItem[];
  weeklyDemand: Map<string, ResourceWeekDemand>;
};

export type SchedulableItem = WbsItem & {
  plannedHours: number;
  remainingHours: number;
  effectiveStart: Date;
  effectiveEnd: Date;
};

export type ResourceWorkSourceItem = {
  item: WbsItem;
  project: Pick<ProjectListItem, "code" | "name" | "status"> | null;
};
