import {
  addMonths,
  daysBetween,
  signedDaysBetween,
  startOfDay,
  startOfMonth,
} from "./dateUtils";
import type {
  WbsCriticalPath,
  WbsDependency,
  WbsDependencyType,
  WbsTreeItem,
} from "./domainTypes";
import { createFormatters } from "../i18n/formatters";
import type { Locale } from "../i18n/types";
import { summaryToneClass, wbsToneClass } from "./wbsTree";
import {
  GANTT_ROW_HEIGHT,
  ganttPathDirection,
  ganttTargetDirection,
} from "../ganttDependencyPath";

type TimelinePeriod = {
  label: string;
  offset: number;
  showLabel: boolean;
  width: number;
};

type TimelineWeek = {
  label: string;
  offset: number;
  showLabel: boolean;
  width: number;
};

export type WbsGanttDependencyLine = {
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
  /** Where a link leaves its predecessor: the middle of the bar (the centre of a milestone), in %. */
  fromCenterX: number;
  /** The centre of the predecessor's row, in px. */
  fromRowY: number;
  /** The top and bottom of the predecessor's painted shape, in px from its row's centre: a link leaves from one of them. */
  fromTop: number;
  fromBottom: number;
  toSide: "start" | "end";
  toMilestone: boolean;
  /** How far left (or right) of a milestone's centre its side tip is, in px: a link ends at the tip. */
  toTipPx: number;
  toX: number;
  toY: number;
  toSlotOffset: number;
  toDirection: number;
  styleSlot: number;
};

type DatedWbsItem = {
  item: WbsTreeItem;
  start: Date;
  end: Date;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  forecastStart: Date | null;
  forecastEnd: Date | null;
};

type WbsGanttOptions = {
  visibleWbsTree: WbsTreeItem[];
  criticalPath: (Partial<Omit<WbsCriticalPath, "items">> & Pick<WbsCriticalPath, "criticalItemIds" | "criticalDependencyIds"> & {
    items: Array<Partial<WbsCriticalPath["items"][number]> & Pick<WbsCriticalPath["items"][number], "itemId" | "totalFloatWorkDays" | "isNearCritical">>;
  }) | null | undefined;
  wbsDependencies: WbsDependency[];
  rangeDays?: 30 | 90 | 180 | null;
  locale?: Locale;
};

function validDate(value: string | null) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function createEmptyWbsGantt() {
  return {
    start: null as Date | null,
    end: null as Date | null,
    months: [] as TimelinePeriod[],
    quarters: [] as TimelinePeriod[],
    weeks: [] as TimelineWeek[],
    todayOffset: null as number | null,
    dependencyLines: [] as WbsGanttDependencyLine[],
    height: 0,
    criticalIds: new Set<string>(),
    criticalDependencyIds: new Set<string>(),
    items: [],
  };
}

export function createWbsGantt({
  visibleWbsTree,
  criticalPath,
  wbsDependencies,
  rangeDays = null,
  locale = "ru",
}: WbsGanttOptions) {
  const { monthLabel, shortDate } = createFormatters(locale);
  const datedItems = visibleWbsTree
    .filter((item) => item.status !== "CANCELLED")
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
    .filter((item): item is DatedWbsItem => item !== null);

  if (datedItems.length === 0) {
    return createEmptyWbsGantt();
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
  const earliestItemDate = new Date(
    Math.min(...timelineDates.map((item) => item.getTime())),
  );
  const latestItemDate = new Date(
    Math.max(...timelineDates.map((item) => item.getTime())),
  );
  const todayAnchor = startOfDay(new Date());
  const minimumWindowStart = new Date(todayAnchor);
  minimumWindowStart.setDate(minimumWindowStart.getDate() - 14);
  const minimumWindowEnd = new Date(todayAnchor);
  if (rangeDays) minimumWindowEnd.setDate(minimumWindowEnd.getDate() + rangeDays);
  const rawStart = rangeDays && minimumWindowStart < earliestItemDate
    ? minimumWindowStart
    : earliestItemDate;
  const rawEnd = rangeDays && minimumWindowEnd > latestItemDate
    ? minimumWindowEnd
    : latestItemDate;
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
      label: locale === "en"
        ? `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`
        : `${Math.floor(cursor.getMonth() / 3) + 1} кв. ${cursor.getFullYear()}`,
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
    const weekEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    const position = periodPosition(cursor, weekEnd);
    weeks.push({
      label: shortDate(cursor.toISOString()),
      offset: position.offset,
      showLabel: position.width >= 2,
      width: position.width,
    });
  }
  const criticalIds = new Set(criticalPath?.criticalItemIds ?? []);
  const criticalDependencyIds = new Set(criticalPath?.criticalDependencyIds ?? []);
  const criticalItemsById = new Map(
    (criticalPath?.items ?? []).map((item) => [item.itemId, item]),
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
      const rangeLine = item.type === "PHASE" || item.type === "WORK_PACKAGE";
      const bracket = false;
      const milestone = item.type === "MILESTONE" || item.type === "GOAL";
      return {
        item,
        start: itemStart,
        end: itemEnd,
        offset: (daysBetween(start, itemStart) / totalDays) * 100,
        width: Math.max(
          milestone ? 0.8 : 0.15,
          ((daysBetween(itemStart, itemEnd) + 1) / totalDays) * 100,
        ),
        milestone,
        critical: criticalIds.has(item.id),
        nearCritical: criticalItemsById.get(item.id)?.isNearCritical ?? false,
        totalFloatWorkDays:
          criticalItemsById.get(item.id)?.totalFloatWorkDays ?? null,
        summary,
        rangeLine,
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
  const visibleDependencies = wbsDependencies.filter(
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
        fromCenterX: Math.max(0, Math.min(100, predecessor.milestone ? predecessor.offset : predecessor.offset + predecessor.width / 2)),
        fromRowY: predecessorRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2,
        // Bars are 16 px tall, a diamond 18; a star reaches 11 px up but only 4.4 down in its middle;
        // the line of a phase lies a quarter of a row below the centre and is 4 px thick.
        ...(predecessor.item.type === "GOAL"
          ? { fromTop: -11, fromBottom: 4.4 }
          : predecessor.milestone
            ? { fromTop: -9, fromBottom: 9 }
            : predecessor.rangeLine
              ? { fromTop: 4.5, fromBottom: 8.5 }
              : { fromTop: -8, fromBottom: 8 }),
        toSide,
        toMilestone: successor.milestone,
        toTipPx: successor.item.type === "GOAL" ? 10.5 : successor.milestone ? 9 : 0,
        toX: Math.max(0, Math.min(100, to)),
        // Links into a milestone meet at its side tip (a star's side rays are 3.4 px above its centre),
        // into a phase at its line, a quarter of a row below the centre.
        toY:
          successorRow * GANTT_ROW_HEIGHT +
          GANTT_ROW_HEIGHT / 2 +
          (successor.item.type === "GOAL" ? -3.4 : successor.milestone ? 0 : successor.rangeLine ? 6.5 : toSlotOffset),
        toSlotOffset,
        toDirection: ganttTargetDirection(toSide),
        styleSlot: Math.max(fromSlot, toSlot) % 6,
      };
    })
    .filter((item): item is WbsGanttDependencyLine => item !== null);

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
}
