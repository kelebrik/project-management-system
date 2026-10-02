import type { LeaveHorizon } from "./leaveScheduleModel";

export type WorkloadSort = { key: "name" | "tasks" | "overlap"; direction: "asc" | "desc" };

/** What the Workload page shows: who, from which projects, and how. A planner saves exactly this. */
export type WorkloadFilters = {
  search: string;
  projectIds: string[];
  /** Row keys (normalized names) of the people to show; empty shows everyone. */
  people: string[];
  overlapsOnly: boolean;
  grouped: boolean;
  showIdle: boolean;
  sort: WorkloadSort;
};

export type WorkloadPlannerConfig = WorkloadFilters & { version: 1; horizon?: LeaveHorizon };

export const DEFAULT_WORKLOAD_FILTERS: WorkloadFilters = {
  search: "",
  projectIds: [],
  people: [],
  overlapsOnly: false,
  grouped: false,
  showIdle: false,
  sort: { key: "name", direction: "asc" },
};

export const PLANNER_LIMITS = { name: 80, list: 300, search: 200 } as const;
const HORIZONS: readonly LeaveHorizon[] = [1, 3, 6, 12];

const strings = (value: unknown, limit: number) =>
  Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 200))].slice(0, limit) : [];

/**
 * Filters read from storage or a saved planner, whatever shape they arrived
 * in: unknown fields are dropped and missing ones take their defaults. Known
 * projects and people, when given, keep only those that still exist.
 */
export function readWorkloadFilters(raw: unknown, known?: { projectIds?: ReadonlySet<string>; people?: ReadonlySet<string> }): WorkloadFilters {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sort = (value.sort && typeof value.sort === "object" ? value.sort : {}) as Record<string, unknown>;
  const projectIds = strings(value.projectIds, PLANNER_LIMITS.list);
  const people = strings(value.people, PLANNER_LIMITS.list);
  return {
    search: typeof value.search === "string" ? value.search.slice(0, PLANNER_LIMITS.search) : "",
    projectIds: known?.projectIds ? projectIds.filter((id) => known.projectIds!.has(id)) : projectIds,
    people: known?.people ? people.filter((key) => known.people!.has(key)) : people,
    overlapsOnly: value.overlapsOnly === true,
    grouped: value.grouped === true,
    showIdle: value.showIdle === true,
    sort: {
      key: sort.key === "tasks" || sort.key === "overlap" ? sort.key : "name",
      direction: sort.direction === "desc" ? "desc" : "asc",
    },
  };
}

export function plannerConfig(filters: WorkloadFilters, horizon: LeaveHorizon): WorkloadPlannerConfig {
  return { version: 1, ...filters, horizon };
}

export function plannerHorizon(raw: unknown): LeaveHorizon | null {
  const horizon = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).horizon : null) as LeaveHorizon | null;
  return HORIZONS.includes(horizon as LeaveHorizon) ? (horizon as LeaveHorizon) : null;
}

export function sameFilters(left: WorkloadFilters, right: WorkloadFilters) {
  return JSON.stringify(left) === JSON.stringify(right);
}
