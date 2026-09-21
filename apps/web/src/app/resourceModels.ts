import { isoDate, isDefaultWorkingDay, startOfDay } from "./dateUtils";
import type { ProjectListItem, WbsItem } from "./domainTypes";
import type { Translator } from "../i18n/types";
import type {
  ResourceActiveItem,
  ResourceAllocationProfile,
  ResourceBucket,
  ResourceConflict,
  ResourceDashboard,
  ResourceDashboardRow,
  ResourceLoadTone,
  ResourceRecommendation,
  ResourceRequestPreview,
  ResourceSummaryRow,
  ResourceWeekBucket,
  ResourceWeekDemand,
  ResourceWorkSourceItem,
  SchedulableItem,
} from "./resourceModels.types";

export type {
  ResourceActiveItem,
  ResourceAllocationProfile,
  ResourceCalculationSource,
  ResourceConflict,
  ResourceDashboard,
  ResourceDashboardRow,
  ResourceLoadCell,
  ResourceLoadTone,
  ResourceProfileKind,
  ResourceRecommendation,
  ResourceRequestPreview,
  ResourceSummaryRow,
  ResourceWeekBucket,
} from "./resourceModels.types";


/** Owner sentinel for work with no assignee; it is displayed, so it follows the interface locale. */
const unassignedOwner = (text: Translator) => text("ui.resources.resourceOwnerUnassigned");
const WORK_HOURS_PER_DAY = 8;
const DASHBOARD_WEEK_COUNT = 8;

export function createDefaultResourceProfile(
  owner: string,
  item: Pick<WbsItem, "title"> | undefined,
  text: Translator,
): ResourceAllocationProfile {
  const normalized = owner.trim() || unassignedOwner(text);
  if (normalized === unassignedOwner(text)) {
    return {
      owner: normalized,
      kind: "person",
      role: text("ui.resources.resourceRoleUnassigned"),
      baseHoursPerWeek: 40,
      fte: 0,
      projectAllocationPercent: 0,
      currentProjectAllocationPercent: 0,
      operationalAllocationPercent: 0,
      executionFactorPercent: 10,
      note: text("ui.resources.resourceProfileNoteUnassigned"),
    };
  }
  if (normalized.toLowerCase() === "cvte") {
    return {
      owner: normalized,
      kind: "contractor-team",
      role: text("ui.resources.resourceRoleContractorTeam"),
      baseHoursPerWeek: 40,
      fte: 5,
      projectAllocationPercent: 100,
      currentProjectAllocationPercent: 100,
      operationalAllocationPercent: 0,
      executionFactorPercent: 2,
      note: text("ui.resources.resourceProfileNoteContractorTeam"),
    };
  }
  if (normalized.toLowerCase().includes("гладков")) {
    return {
      owner: normalized,
      kind: "coordinator",
      role: text("ui.resources.resourceRoleCoordinator"),
      baseHoursPerWeek: 40,
      fte: 1,
      projectAllocationPercent: 40,
      currentProjectAllocationPercent: 100,
      operationalAllocationPercent: 60,
      executionFactorPercent: 1,
      note: text("ui.resources.resourceProfileNoteCoordinator"),
    };
  }
  const role = inferResourceRole(item ?? { title: "" }, normalized, text);
  const isSharedRole = role === "PMO" || role === text("ui.resources.resourceRoleBusinessAnalyst");
  return {
    owner: normalized,
    kind: "person",
    role,
    baseHoursPerWeek: WORK_HOURS_PER_DAY * 5,
    fte: 1,
    projectAllocationPercent: isSharedRole ? 80 : 100,
    currentProjectAllocationPercent: 100,
    operationalAllocationPercent: isSharedRole ? 20 : 0,
    executionFactorPercent: isSharedRole ? 1 : 2,
    note: text("ui.resources.resourceProfileNoteGenerated"),
  };
}

export function createResourceSummaryRows(wbsItems: WbsItem[], now: Date, text: Translator) {
  const byOwner = new Map<string, ResourceSummaryRow>();
  for (const item of wbsItems) {
    if (!isResourceWorkItem(item)) continue;
    const owner = normalizedOwner(item, text);
    const row =
      byOwner.get(owner) ??
      { owner, total: 0, done: 0, inProgress: 0, overdue: 0 };
    row.total += 1;
    if (item.status === "DONE") row.done += 1;
    if (item.status === "IN_PROGRESS" || item.status === "IN_REVIEW") {
      row.inProgress += 1;
    }
    if (isOverdue(item, now)) row.overdue += 1;
    byOwner.set(owner, row);
  }
  return [...byOwner.values()].sort((left, right) => right.total - left.total);
}

export function createResourceDashboard(
  source: WbsItem[] | ProjectListItem[],
  now: Date,
  criticalItemIds: string[],
  profileOverrides: ResourceAllocationProfile[],
  text: Translator,
): ResourceDashboard {
  const today = startOfDay(now);
  const weeks = createWeekBuckets(today, DASHBOARD_WEEK_COUNT);
  const criticalIds = new Set(criticalItemIds);
  const workItems = normalizeResourceWorkSource(source);
  const profileOverrideMap = createProfileOverrideMap(profileOverrides, text);
  const byOwner = new Map<string, ResourceBucket>();
  let activeWorkCount = 0;

  for (const { item, project } of workItems) {
    if (!isResourceWorkItem(item)) continue;
    const owner = normalizedOwner(item, text);
    const profile = resolveResourceProfile(owner, item, profileOverrideMap, text);
    const plannedHours = estimatePlannedHours(item, profile, text);
    const remainingHours = isOverdue(item, now)
      ? 0
      : estimateRemainingHours(item, plannedHours);
    const bucket = ensureResourceBucket(byOwner, owner, profile, text);

    bucket.total += 1;
    bucket.plannedHours += plannedHours;
    bucket.remainingHours += remainingHours;
    bucket.calendarCodes.add(item.calendarCode);
    if (item.status === "DONE") bucket.done += 1;
    if (item.status === "IN_PROGRESS" || item.status === "IN_REVIEW") {
      bucket.inProgress += 1;
    }
    if (isOverdue(item, now)) bucket.overdue += 1;

    if (item.status !== "DONE") {
      activeWorkCount += 1;
      const activeItem: ResourceActiveItem = {
        id: item.id,
        projectCode: project?.code ?? null,
        projectName: project?.name ?? null,
        code: item.code,
        title: item.title,
        status: item.status,
        priority: item.priority,
        startDate: item.startDate,
        dueDate: item.dueDate,
        progress: normalizeProgress(item.progress),
        plannedHours,
        remainingHours,
        isCritical: criticalIds.has(item.id),
      };
      bucket.activeItems.push(activeItem);

      const schedulable = createSchedulableItem(
        item,
        today,
        plannedHours,
        remainingHours,
      );
      spreadRemainingHours(
        bucket.weeklyDemand,
        weeks,
        schedulable,
      );
    }
  }

  const allRows = [...byOwner.values()].map((bucket) =>
    createDashboardRow(bucket, weeks, text),
  );
  const unassignedRow =
    allRows.find((row) => row.owner === unassignedOwner(text)) ?? null;
  const rows = allRows
    .filter((row) => row.owner !== unassignedOwner(text))
    .sort(sortResourceRows);

  const conflicts = createResourceConflicts(rows, unassignedRow, text);
  const roleGapHours = Math.round(
    createRoleGapHours(rows) + (unassignedRow?.remainingHours ?? 0),
  );
  const requests = createResourceRequests(rows, unassignedRow, weeks, text);
  const recommendations = createResourceRecommendations(
    conflicts,
    requests,
    roleGapHours,
    text,
  );
  const overloadedCount = rows.filter((row) =>
    row.cells.some((cell) => cell.tone === "bad"),
  ).length;
  const criticalDelayRiskDays = Math.min(
    20,
    conflicts.filter((conflict) => conflict.severity === "critical").length * 2,
  );

  return {
    weeks,
    rows,
    unassignedRow,
    conflicts,
    requests,
    recommendations,
    profiles: rows.map((row) => row.profile),
    source: createResourceCalculationSource(source),
    summary: {
      resourceCount: rows.length,
      activeWorkCount,
      overloadedCount,
      roleGapHours,
      openRequests: requests.length,
      criticalDelayRiskDays,
    },
  };
}

function isResourceWorkItem(item: WbsItem) {
  return (
    (item.type === "TASK" || item.type === "DELIVERABLE") &&
    item.status !== "CANCELLED"
  );
}

function normalizedOwner(item: Pick<WbsItem, "owner">, text: Translator) {
  return item.owner?.trim() || unassignedOwner(text);
}

function normalizeOwnerName(owner: string) {
  return owner.trim().toLowerCase();
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function positiveCapacityNumber(value: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function normalizeResourceProfile(profile: ResourceAllocationProfile, text: Translator) {
  const owner = profile.owner.trim() || unassignedOwner(text);
  const defaults = createDefaultResourceProfile(owner, undefined, text);
  const baseHoursPerWeek = positiveCapacityNumber(
    profile.baseHoursPerWeek,
    defaults.baseHoursPerWeek,
  );
  const fte = positiveCapacityNumber(profile.fte, defaults.fte);
  return {
    ...defaults,
    ...profile,
    owner,
    role: profile.role.trim() || defaults.role,
    baseHoursPerWeek,
    fte,
    projectAllocationPercent: clampPercent(profile.projectAllocationPercent),
    currentProjectAllocationPercent: clampPercent(
      profile.currentProjectAllocationPercent,
    ),
    operationalAllocationPercent: clampPercent(
      profile.operationalAllocationPercent,
    ),
    executionFactorPercent: clampPercent(profile.executionFactorPercent),
    note: profile.note.trim() || defaults.note,
  };
}

function createProfileOverrideMap(profiles: ResourceAllocationProfile[], text: Translator) {
  return new Map(
    profiles
      .map((profile) => normalizeResourceProfile(profile, text))
      .map((profile) => [normalizeOwnerName(profile.owner), profile]),
  );
}

function resolveResourceProfile(
  owner: string,
  item: Pick<WbsItem, "title">,
  profileOverrides: Map<string, ResourceAllocationProfile>,
  text: Translator,
) {
  return (
    profileOverrides.get(normalizeOwnerName(owner)) ??
    createDefaultResourceProfile(owner, item, text)
  );
}

function calculateResourceCapacity(profile: ResourceAllocationProfile) {
  const nominalHours = profile.baseHoursPerWeek * profile.fte;
  const projectHours = nominalHours * (profile.projectAllocationPercent / 100);
  const currentProjectHours =
    projectHours * (profile.currentProjectAllocationPercent / 100);
  const blockedHours =
    nominalHours * (profile.operationalAllocationPercent / 100) +
    projectHours * ((100 - profile.currentProjectAllocationPercent) / 100);
  return {
    availableHours: Math.round(currentProjectHours),
    blockedHours: Math.round(blockedHours),
  };
}

function normalizeResourceWorkSource(
  source: WbsItem[] | ProjectListItem[],
): ResourceWorkSourceItem[] {
  if (source.length === 0) return [];
  const first = source[0] as WbsItem | ProjectListItem;
  if ("wbsItems" in first) {
    return (source as ProjectListItem[]).flatMap((project) =>
      project.wbsItems.map((item) => ({
        item,
        project: {
          code: project.code,
          name: project.name,
          status: project.status,
        },
      })),
    );
  }
  return (source as WbsItem[]).map((item) => ({ item, project: null }));
}

function createResourceCalculationSource(source: WbsItem[] | ProjectListItem[]) {
  if (source.length === 0) {
    return { projectsCount: 0, activeProjectsCount: 0, projectNames: [] };
  }
  const first = source[0] as WbsItem | ProjectListItem;
  if (!("wbsItems" in first)) {
    return { projectsCount: 1, activeProjectsCount: 1, projectNames: [] };
  }
  const projects = source as ProjectListItem[];
  return {
    projectsCount: projects.length,
    activeProjectsCount: projects.filter((project) => project.status !== "CLOSED")
      .length,
    projectNames: projects.map((project) => project.name).slice(0, 5),
  };
}

function isOverdue(item: Pick<WbsItem, "dueDate" | "status">, now: Date) {
  if (!item.dueDate || item.status === "DONE") return false;
  const dueDate = startOfDay(new Date(item.dueDate));
  if (Number.isNaN(dueDate.getTime())) return false;
  return dueDate < startOfDay(now);
}

function normalizeProgress(progress: number | null | undefined) {
  if (typeof progress !== "number" || Number.isNaN(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

function estimatePlannedHours(
  item: WbsItem,
  profile: ResourceAllocationProfile,
  text: Translator,
) {
  const effortPercent = normalizeEffortPercent(item.effortPercent);
  if (effortPercent > 0) {
    const durationDays =
      positiveNumber(item.workDays) ??
      positiveNumber(item.planWorkDays) ??
      estimateWorkDaysFromDates(item);
    const weeks = Math.max(0.2, durationDays / 5);
    const demandBaseHours = calculateResourceDemandBaseHours(profile, text);
    return Math.max(
      1,
      Math.round(demandBaseHours * weeks * (effortPercent / 100)),
    );
  }
  return 0;
}

function calculateResourceDemandBaseHours(profile: ResourceAllocationProfile, text: Translator) {
  const defaults = createDefaultResourceProfile(profile.owner, undefined, text);
  const baseHours =
    profile.baseHoursPerWeek > 0
      ? profile.baseHoursPerWeek
      : defaults.baseHoursPerWeek;
  const fte = profile.fte > 0 ? profile.fte : 1;
  return baseHours * fte;
}

function normalizeEffortPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function positiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function estimateWorkDaysFromDates(item: WbsItem) {
  const start = parseDate(item.startDate);
  const due = parseDate(item.dueDate);
  if (!start || !due) return 1;
  return Math.max(1, countWorkingDays(start, due));
}

function estimateRemainingHours(item: WbsItem, plannedHours: number) {
  if (item.status === "DONE") return 0;
  return Math.max(
    0,
    Math.round(plannedHours * ((100 - normalizeProgress(item.progress)) / 100)),
  );
}

function createSchedulableItem(
  item: WbsItem,
  today: Date,
  plannedHours: number,
  remainingHours: number,
): SchedulableItem {
  const parsedStart = parseDate(item.startDate);
  const parsedDue = parseDate(item.dueDate);
  const durationDays = Math.max(
    1,
    positiveNumber(item.workDays) ?? positiveNumber(item.planWorkDays) ?? 1,
  );
  const fallbackEnd = addDays(today, Math.ceil(durationDays) - 1);
  const effectiveEnd =
    parsedDue ??
    (parsedStart
      ? addDays(parsedStart, Math.ceil(durationDays) - 1)
      : fallbackEnd);
  const effectiveStart =
    parsedStart ??
    addDays(effectiveEnd, -Math.max(0, Math.ceil(durationDays) - 1));
  const orderedStart =
    effectiveStart <= effectiveEnd ? effectiveStart : effectiveEnd;
  const orderedEnd = effectiveStart <= effectiveEnd ? effectiveEnd : effectiveStart;
  const forwardStart = orderedStart < today ? today : orderedStart;
  const forwardEnd = orderedEnd < today ? today : orderedEnd;

  return {
    ...item,
    plannedHours,
    remainingHours,
    effectiveStart: forwardStart,
    effectiveEnd: forwardEnd,
  };
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = startOfDay(new Date(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function countWorkingDays(start: Date, end: Date) {
  const [from, to] = start <= end ? [start, end] : [end, start];
  const cursor = new Date(from);
  let count = 0;
  while (cursor <= to) {
    if (isDefaultWorkingDay(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  const dayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - dayIndex);
  return startOfDay(date);
}

function createWeekBuckets(today: Date, weekCount: number): ResourceWeekBucket[] {
  const firstWeekStart = startOfWeek(today);
  return Array.from({ length: weekCount }, (_, index) => {
    const start = addDays(firstWeekStart, index * 7);
    const end = addDays(start, 6);
    return {
      key: isoDate(start),
      label: `${start.getDate().toString().padStart(2, "0")}.${(
        start.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}`,
      startDate: isoDate(start),
      endDate: isoDate(end),
    };
  });
}

function inferResourceRole(item: Pick<WbsItem, "title">, owner: string, text: Translator) {
  if (owner === unassignedOwner(text)) return text("ui.resources.resourceRoleUnassigned");
  const haystack = `${owner} ${item.title}`.toLowerCase();
  if (haystack.includes("devops") || haystack.includes("infra")) return "DevOps";
  if (haystack.includes("qa") || haystack.includes("test") || haystack.includes("тест")) {
    return "QA";
  }
  if (haystack.includes("аналит") || haystack.includes("ba")) {
    return text("ui.resources.resourceRoleBusinessAnalyst");
  }
  if (haystack.includes("дизайн") || haystack.includes("ux")) {
    return text("ui.resources.resourceRoleDesign");
  }
  if (haystack.includes("pmo") || haystack.includes("pm") || haystack.includes("пм")) {
    return "PMO";
  }
  if (
    haystack.includes("dev") ||
    haystack.includes("front") ||
    haystack.includes("back") ||
    haystack.includes("api") ||
    haystack.includes("разраб")
  ) {
    return text("ui.resources.resourceRoleDevelopment");
  }
  return text("ui.resources.resourceRoleSpecialist");
}

function ensureResourceBucket(
  byOwner: Map<string, ResourceBucket>,
  owner: string,
  profile: ResourceAllocationProfile,
  text: Translator,
) {
  const specialistRole = text("ui.resources.resourceRoleSpecialist");
  const current = byOwner.get(owner);
  if (current) {
    if (current.role === specialistRole && profile.role !== specialistRole) {
      current.role = profile.role;
      current.profile = profile;
    }
    return current;
  }
  const created: ResourceBucket = {
    owner,
    role: profile.role,
    profile,
    calendarCodes: new Set(),
    total: 0,
    done: 0,
    inProgress: 0,
    overdue: 0,
    plannedHours: 0,
    remainingHours: 0,
    activeItems: [],
    weeklyDemand: new Map(),
  };
  byOwner.set(owner, created);
  return created;
}

function spreadRemainingHours(
  weeklyDemand: Map<string, ResourceWeekDemand>,
  weeks: ResourceWeekBucket[],
  item: SchedulableItem,
) {
  if (item.remainingHours <= 0) return;

  const itemWorkingDays = Math.max(
    1,
    countWorkingDays(item.effectiveStart, item.effectiveEnd),
  );
  let allocatedHours = 0;

  for (const week of weeks) {
    const weekStart = startOfDay(new Date(week.startDate));
    const weekEnd = startOfDay(new Date(week.endDate));
    const overlapStart =
      item.effectiveStart > weekStart ? item.effectiveStart : weekStart;
    const overlapEnd = item.effectiveEnd < weekEnd ? item.effectiveEnd : weekEnd;
    if (overlapStart > overlapEnd) continue;
    const overlapWorkingDays = countWorkingDays(overlapStart, overlapEnd);
    if (overlapWorkingDays <= 0) continue;
    const hours = Math.round(
      item.remainingHours * (overlapWorkingDays / itemWorkingDays),
    );
    if (hours <= 0) continue;
    allocatedHours += hours;
    addWeekDemand(weeklyDemand, week, hours);
  }

  if (allocatedHours === 0) {
    const closestWeek = findClosestWeek(weeks, item.effectiveEnd);
    addWeekDemand(weeklyDemand, closestWeek, item.remainingHours);
  }
}

function addWeekDemand(
  weeklyDemand: Map<string, ResourceWeekDemand>,
  week: ResourceWeekBucket,
  hours: number,
) {
  const current = weeklyDemand.get(week.key);
  weeklyDemand.set(week.key, {
    hours: (current?.hours ?? 0) + hours,
  });
}

function findClosestWeek(weeks: ResourceWeekBucket[], target: Date) {
  return weeks.reduce((closest, week) => {
    const closestDistance = Math.abs(
      startOfDay(new Date(closest.startDate)).getTime() - target.getTime(),
    );
    const weekDistance = Math.abs(
      startOfDay(new Date(week.startDate)).getTime() - target.getTime(),
    );
    return weekDistance < closestDistance ? week : closest;
  }, weeks[0] as ResourceWeekBucket);
}

function createDashboardRow(
  bucket: ResourceBucket,
  weeks: ResourceWeekBucket[],
  text: Translator,
): ResourceDashboardRow {
  const { availableHours, blockedHours } = calculateResourceCapacity(bucket.profile);
  const capacityHoursPerWeek = availableHours;
  const cells = weeks.map((week) => {
    const demandHours = Math.round(bucket.weeklyDemand.get(week.key)?.hours ?? 0);
    const utilization =
      capacityHoursPerWeek > 0
        ? Math.round((demandHours / capacityHoursPerWeek) * 100)
        : demandHours > 0
          ? 999
          : 0;
    const tone = loadTone(utilization, demandHours, capacityHoursPerWeek);
    return {
      weekKey: week.key,
      weekLabel: week.label,
      demandHours,
      capacityHours: capacityHoursPerWeek,
      utilization,
      tone,
      label:
        capacityHoursPerWeek > 0
          ? `${Math.min(utilization, 999)}%`
          : demandHours > 0
            ? text("ui.resources.resourceLoadNoRole")
            : "0%",
    };
  });
  const sortedActiveItems = bucket.activeItems.sort((left, right) =>
    String(left.dueDate ?? "9999").localeCompare(String(right.dueDate ?? "9999")),
  );

  return {
    owner: bucket.owner,
    profile: bucket.profile,
    role: bucket.role,
    calendarCode: mostCommonCalendar(bucket.calendarCodes),
    availableHoursPerWeek: availableHours,
    capacityHoursPerWeek,
    blockedHoursPerWeek: blockedHours,
    total: bucket.total,
    done: bucket.done,
    inProgress: bucket.inProgress,
    overdue: bucket.overdue,
    plannedHours: Math.round(bucket.plannedHours),
    remainingHours: Math.round(bucket.remainingHours),
    peakUtilization: Math.max(...cells.map((cell) => cell.utilization), 0),
    cells,
    activeItems: sortedActiveItems,
  };
}

function loadTone(
  utilization: number,
  demandHours: number,
  capacityHours: number,
): ResourceLoadTone {
  if (capacityHours === 0 && demandHours > 0) return "bad";
  if (utilization > 100) return "bad";
  if (utilization >= 86) return "warn";
  if (utilization <= 50) return "low";
  return "ok";
}

function mostCommonCalendar(calendarCodes: Set<WbsItem["calendarCode"]>) {
  return [...calendarCodes][0] ?? null;
}

function sortResourceRows(left: ResourceDashboardRow, right: ResourceDashboardRow) {
  return (
    right.peakUtilization - left.peakUtilization ||
    right.remainingHours - left.remainingHours ||
    left.owner.localeCompare(right.owner, "ru")
  );
}

function createResourceConflicts(
  rows: ResourceDashboardRow[],
  unassignedRow: ResourceDashboardRow | null,
  text: Translator,
) {
  const conflicts: ResourceConflict[] = [];

  for (const row of rows) {
    const overloadedCell = row.cells.find((cell) => cell.tone === "bad");
    if (overloadedCell) {
      conflicts.push({
        id: `overload-${row.owner}-${overloadedCell.weekKey}`,
        severity: "critical",
        title: text("ui.resources.resourceConflictOverloadTitle", {
          owner: row.owner,
          load: overloadedCell.label,
        }),
        detail: text("ui.resources.resourceConflictOverloadDetail", {
          demandHours: overloadedCell.demandHours,
          capacityHours: overloadedCell.capacityHours,
        }),
        owner: row.owner,
        weekLabel: overloadedCell.weekLabel,
        tone: "bad",
      });
    }

    const criticalItem = row.activeItems.find((item) => item.isCritical);
    if (criticalItem && overloadedCell) {
      conflicts.push({
        id: `critical-${row.owner}-${criticalItem.id}`,
        severity: "critical",
        title: text("ui.resources.resourceConflictCriticalPathTitle"),
        detail: text("ui.resources.resourceConflictCriticalPathDetail", {
          code: criticalItem.code,
          title: criticalItem.title,
          owner: row.owner,
        }),
        owner: row.owner,
        weekLabel: overloadedCell.weekLabel,
        tone: "bad",
      });
    }

    if (row.overdue > 0) {
      conflicts.push({
        id: `overdue-${row.owner}`,
        severity: "warning",
        title: text("ui.resources.resourceConflictOverdueTitle", { owner: row.owner }),
        detail: text("ui.resources.resourceConflictOverdueDetail", { count: row.overdue }),
        owner: row.owner,
        weekLabel: null,
        tone: "warn",
      });
    }
  }

  if (unassignedRow && unassignedRow.remainingHours > 0) {
    conflicts.unshift({
      id: "unassigned-work",
      severity: "critical",
      title: text("ui.resources.resourceConflictUnassignedTitle"),
      detail: text("ui.resources.resourceConflictUnassignedDetail", {
        hours: unassignedRow.remainingHours,
      }),
      owner: unassignedOwner(text),
      weekLabel: null,
      tone: "bad",
    });
  }

  return conflicts.slice(0, 8);
}

function createRoleGapHours(rows: ResourceDashboardRow[]) {
  return rows.reduce((sum, row) => {
    const overload = row.cells.reduce((rowSum, cell) => {
      if (cell.capacityHours <= 0) return rowSum + cell.demandHours;
      return rowSum + Math.max(0, cell.demandHours - cell.capacityHours);
    }, 0);
    return sum + overload;
  }, 0);
}

function createResourceRequests(
  rows: ResourceDashboardRow[],
  unassignedRow: ResourceDashboardRow | null,
  weeks: ResourceWeekBucket[],
  text: Translator,
) {
  const requests: ResourceRequestPreview[] = [];

  if (unassignedRow && unassignedRow.remainingHours > 0) {
    const firstDemandWeek =
      weeks.find((week) =>
        unassignedRow.cells.some(
          (cell) => cell.weekKey === week.key && cell.demandHours > 0,
        ),
      ) ?? weeks[0];
    requests.push({
      id: "request-unassigned",
      role: text("ui.resources.resourceRequestUnassignedRole"),
      hours: unassignedRow.remainingHours,
      dueLabel: firstDemandWeek
        ? text("ui.resources.resourceRequestFromWeek", { week: firstDemandWeek.label })
        : text("ui.resources.resourceRequestNow"),
      reason: text("ui.resources.resourceRequestUnassignedReason"),
      status: "ready",
    });
  }

  for (const row of rows) {
    const overloadHours = row.cells.reduce(
      (sum, cell) => sum + Math.max(0, cell.demandHours - cell.capacityHours),
      0,
    );
    if (overloadHours <= 0) continue;
    const firstOverloadWeek = weeks.find((week) =>
      row.cells.some(
        (cell) => cell.weekKey === week.key && cell.demandHours > cell.capacityHours,
      ),
    );
    requests.push({
      id: `request-${row.owner}`,
      role: row.role,
      hours: Math.round(overloadHours),
      dueLabel: firstOverloadWeek
        ? text("ui.resources.resourceRequestFromWeek", { week: firstOverloadWeek.label })
        : text("ui.resources.resourceRequestNextSprint"),
      reason: text("ui.resources.resourceRequestOverloadReason", { owner: row.owner }),
      status: "draft",
    });
  }

  return requests
    .sort((left, right) => right.hours - left.hours)
    .slice(0, 5);
}

function createResourceRecommendations(
  conflicts: ResourceConflict[],
  requests: ResourceRequestPreview[],
  roleGapHours: number,
  text: Translator,
) {
  const recommendations: ResourceRecommendation[] = [];
  const criticalConflict = conflicts.find(
    (conflict) => conflict.severity === "critical",
  );

  if (criticalConflict) {
    recommendations.push({
      id: "fix-critical-conflict",
      title: text("ui.resources.resourceRecommendationCriticalConflictTitle"),
      detail: text("ui.resources.resourceRecommendationCriticalConflictDetail", {
        conflict: criticalConflict.title,
      }),
      tone: "bad",
    });
  }

  if (requests.length > 0) {
    recommendations.push({
      id: "approve-resource-requests",
      title: text("ui.resources.resourceRecommendationRequestsTitle"),
      detail: text("ui.resources.resourceRecommendationRequestsDetail", {
        count: requests.length,
        hours: requests.reduce((sum, request) => sum + request.hours, 0),
      }),
      tone: "warn",
    });
  }

  if (roleGapHours === 0 && conflicts.length === 0) {
    recommendations.push({
      id: "keep-plan",
      title: text("ui.resources.resourceRecommendationKeepPlanTitle"),
      detail: text("ui.resources.resourceRecommendationKeepPlanDetail"),
      tone: "ok",
    });
  }

  return recommendations.slice(0, 3);
}
