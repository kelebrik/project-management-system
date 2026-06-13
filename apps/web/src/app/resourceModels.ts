import { isoDate, isDefaultWorkingDay, startOfDay } from "./dateUtils";
import type { WbsItem } from "./domainTypes";

const UNASSIGNED_OWNER = "Не назначен";
const WORK_HOURS_PER_DAY = 8;
const DASHBOARD_WEEK_COUNT = 8;

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

type ResourceWeekDemand = {
  hours: number;
};

export type ResourceDashboardRow = ResourceSummaryRow & {
  role: string;
  calendarCode: WbsItem["calendarCode"] | null;
  capacityHoursPerWeek: number;
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

export type ResourceDashboard = {
  weeks: ResourceWeekBucket[];
  rows: ResourceDashboardRow[];
  unassignedRow: ResourceDashboardRow | null;
  conflicts: ResourceConflict[];
  requests: ResourceRequestPreview[];
  recommendations: ResourceRecommendation[];
  summary: {
    resourceCount: number;
    activeWorkCount: number;
    overloadedCount: number;
    roleGapHours: number;
    openRequests: number;
    criticalDelayRiskDays: number;
  };
};

type ResourceBucket = {
  owner: string;
  role: string;
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

type SchedulableItem = WbsItem & {
  plannedHours: number;
  remainingHours: number;
  effectiveStart: Date;
  effectiveEnd: Date;
};

export function createResourceSummaryRows(wbsItems: WbsItem[], now: Date) {
  const byOwner = new Map<string, ResourceSummaryRow>();
  for (const item of wbsItems) {
    if (!isResourceWorkItem(item)) continue;
    const owner = normalizedOwner(item);
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
  wbsItems: WbsItem[],
  now: Date,
  criticalItemIds: string[] = [],
): ResourceDashboard {
  const today = startOfDay(now);
  const weeks = createWeekBuckets(today, DASHBOARD_WEEK_COUNT);
  const criticalIds = new Set(criticalItemIds);
  const byOwner = new Map<string, ResourceBucket>();
  let activeWorkCount = 0;

  for (const item of wbsItems) {
    if (!isResourceWorkItem(item)) continue;
    const plannedHours = estimatePlannedHours(item);
    const remainingHours = estimateRemainingHours(item, plannedHours);
    const owner = normalizedOwner(item);
    const role = inferResourceRole(item, owner);
    const bucket = ensureResourceBucket(byOwner, owner, role);

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

      const schedulable = createSchedulableItem(item, today, plannedHours);
      spreadRemainingHours(bucket.weeklyDemand, weeks, schedulable);
    }
  }

  const allRows = [...byOwner.values()].map((bucket) =>
    createDashboardRow(bucket, weeks),
  );
  const unassignedRow =
    allRows.find((row) => row.owner === UNASSIGNED_OWNER) ?? null;
  const rows = allRows
    .filter((row) => row.owner !== UNASSIGNED_OWNER)
    .sort(sortResourceRows);

  const conflicts = createResourceConflicts(rows, unassignedRow);
  const roleGapHours = Math.round(
    createRoleGapHours(rows) + (unassignedRow?.remainingHours ?? 0),
  );
  const requests = createResourceRequests(rows, unassignedRow, weeks);
  const recommendations = createResourceRecommendations(
    conflicts,
    requests,
    roleGapHours,
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

function normalizedOwner(item: Pick<WbsItem, "owner">) {
  return item.owner?.trim() || UNASSIGNED_OWNER;
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

function estimatePlannedHours(item: WbsItem) {
  const workDays =
    positiveNumber(item.workDays) ??
    positiveNumber(item.planWorkDays) ??
    estimateWorkDaysFromDates(item);
  return Math.max(WORK_HOURS_PER_DAY, Math.round(workDays * WORK_HOURS_PER_DAY));
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
  const forwardStart =
    orderedEnd < today ? today : orderedStart < today ? today : orderedStart;
  const forwardEnd = orderedEnd < today ? today : orderedEnd;

  return {
    ...item,
    plannedHours,
    remainingHours: estimateRemainingHours(item, plannedHours),
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

function inferResourceRole(item: Pick<WbsItem, "title">, owner: string) {
  if (owner === UNASSIGNED_OWNER) return "Роль не назначена";
  const text = `${owner} ${item.title}`.toLowerCase();
  if (text.includes("devops") || text.includes("infra")) return "DevOps";
  if (text.includes("qa") || text.includes("test") || text.includes("тест")) {
    return "QA";
  }
  if (text.includes("аналит") || text.includes("ba")) return "Бизнес-аналитик";
  if (text.includes("дизайн") || text.includes("ux")) return "Дизайн";
  if (text.includes("pmo") || text.includes("pm") || text.includes("пм")) {
    return "PMO";
  }
  if (
    text.includes("dev") ||
    text.includes("front") ||
    text.includes("back") ||
    text.includes("api") ||
    text.includes("разраб")
  ) {
    return "Разработка";
  }
  return "Специалист";
}

function capacityForRole(role: string, owner: string) {
  if (owner === UNASSIGNED_OWNER) return 0;
  if (role === "PMO") return 24;
  if (role === "DevOps") return 32;
  if (role === "Бизнес-аналитик") return 32;
  return 40;
}

function ensureResourceBucket(
  byOwner: Map<string, ResourceBucket>,
  owner: string,
  role: string,
) {
  const current = byOwner.get(owner);
  if (current) {
    if (current.role === "Специалист" && role !== "Специалист") {
      current.role = role;
    }
    return current;
  }
  const created: ResourceBucket = {
    owner,
    role,
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
): ResourceDashboardRow {
  const capacityHoursPerWeek = capacityForRole(bucket.role, bucket.owner);
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
            ? "нет роли"
            : "0%",
    };
  });
  const sortedActiveItems = bucket.activeItems.sort((left, right) =>
    String(left.dueDate ?? "9999").localeCompare(String(right.dueDate ?? "9999")),
  );

  return {
    owner: bucket.owner,
    role: bucket.role,
    calendarCode: mostCommonCalendar(bucket.calendarCodes),
    capacityHoursPerWeek,
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
) {
  const conflicts: ResourceConflict[] = [];

  for (const row of rows) {
    const overloadedCell = row.cells.find((cell) => cell.tone === "bad");
    if (overloadedCell) {
      conflicts.push({
        id: `overload-${row.owner}-${overloadedCell.weekKey}`,
        severity: "critical",
        title: `${row.owner}: перегруз ${overloadedCell.label}`,
        detail: `${overloadedCell.demandHours} ч спроса при доступности ${overloadedCell.capacityHours} ч в неделю.`,
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
        title: "Критический путь зависит от перегруженного ресурса",
        detail: `${criticalItem.code} ${criticalItem.title} находится на критическом пути и конкурирует за время ${row.owner}.`,
        owner: row.owner,
        weekLabel: overloadedCell.weekLabel,
        tone: "bad",
      });
    }

    if (row.overdue > 0) {
      conflicts.push({
        id: `overdue-${row.owner}`,
        severity: "warning",
        title: `${row.owner}: есть просроченные работы`,
        detail: `${row.overdue} работ не закрыты после плановой даты.`,
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
      title: "Есть работы без исполнителя",
      detail: `${unassignedRow.remainingHours} ч остаточного спроса не закреплены за ресурсами.`,
      owner: UNASSIGNED_OWNER,
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
      role: "Исполнитель для неназначенных работ",
      hours: unassignedRow.remainingHours,
      dueLabel: firstDemandWeek ? `с недели ${firstDemandWeek.label}` : "сейчас",
      reason: "Закрыть работы без владельца до входа в активный план.",
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
        ? `с недели ${firstOverloadWeek.label}`
        : "в ближайшем спринте",
      reason: `Снять перегрузку с ${row.owner} без сдвига критичных работ.`,
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
) {
  const recommendations: ResourceRecommendation[] = [];
  const criticalConflict = conflicts.find(
    (conflict) => conflict.severity === "critical",
  );

  if (criticalConflict) {
    recommendations.push({
      id: "fix-critical-conflict",
      title: "Разобрать критичный конфликт",
      detail: `${criticalConflict.title}. Сначала переназначить или зафиксировать приоритет этой работы.`,
      tone: "bad",
    });
  }

  if (requests.length > 0) {
    recommendations.push({
      id: "approve-resource-requests",
      title: "Оформить ресурсные заявки",
      detail: `${requests.length} заявок на ${requests.reduce(
        (sum, request) => sum + request.hours,
        0,
      )} ч покрывают текущий дефицит.`,
      tone: "warn",
    });
  }

  if (roleGapHours === 0 && conflicts.length === 0) {
    recommendations.push({
      id: "keep-plan",
      title: "Поддерживать текущий план",
      detail: "Перегрузок и незакрепленных работ на горизонте восьми недель нет.",
      tone: "ok",
    });
  }

  return recommendations.slice(0, 3);
}
