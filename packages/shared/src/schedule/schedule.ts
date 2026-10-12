import { buildWbsPredecessorRefs } from "../wbs-predecessors.js";
import {
  addWorkingDays,
  buildCalendarOverrides,
  calendarDaysInclusive,
  workingDaysInclusive,
  type ScheduleCalendarOverride,
} from "./calendar.js";
import { predecessorConstraints } from "./constraints.js";
import {
  buildChildrenByParent,
  isWbsCheckpointType,
  isWbsZeroDurationItem,
  maxDay,
  minDay,
  resolveDurationWorkDays,
  sortByPlanOrder,
  startFromFinish,
  wbsLevelFromItem,
} from "./hierarchy.js";
import { dayNumber, plainDate, type PlainDate } from "./plain-date.js";
import type { DayItem, DayUpdate, ScheduleDependency, ScheduleItem, ScheduleOptions, ScheduleUpdate } from "./types.js";

type DayOptions = Omit<ScheduleOptions, "startNotBeforeById"> & { startNotBeforeById?: ReadonlyMap<string, number> };

const toDay = (value: PlainDate | null | undefined) => (value === null || value === undefined ? null : dayNumber(value));
const toPlain = (value: number | null | undefined) => (value === null || value === undefined ? null : plainDate(value));
const changed = (left: number | null | undefined, right: number | null) => (left ?? null) !== right;
const sameNumber = (left: number | null, right: number | null) => (left ?? null) === (right ?? null);

function calculateSchedulePass(items: DayItem[], dependencies: ScheduleDependency[], overrides: ReturnType<typeof buildCalendarOverrides>, options: DayOptions) {
  const changedFieldsByItem = new Map<string, Set<string>>();
  if (options.changedItemId) changedFieldsByItem.set(options.changedItemId, new Set(options.changedFields ?? []));
  for (const changedItem of options.changedItems ?? []) changedFieldsByItem.set(changedItem.itemId, new Set(changedItem.changedFields));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  const childrenByParent = buildChildrenByParent(items, itemsById, itemsByCode);
  const predecessorRefsByItem = buildWbsPredecessorRefs(items, dependencies);

  const successorsByPredecessor = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const item of items) incomingCount.set(item.id, 0);
  for (const [successorId, predecessorRefs] of predecessorRefsByItem.entries()) {
    incomingCount.set(successorId, predecessorRefs.length);
    for (const predecessorRef of predecessorRefs) {
      successorsByPredecessor.set(predecessorRef.predecessorId, [...(successorsByPredecessor.get(predecessorRef.predecessorId) ?? []), successorId]);
    }
  }

  const byOrder = [...items].sort(sortByPlanOrder);
  const queue = byOrder.filter((item) => (incomingCount.get(item.id) ?? 0) === 0);
  const scheduledOrder: DayItem[] = [];
  const queued = new Set(queue.map((item) => item.id));
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    scheduledOrder.push(current);
    for (const successorId of successorsByPredecessor.get(current.id) ?? []) {
      const nextCount = (incomingCount.get(successorId) ?? 0) - 1;
      incomingCount.set(successorId, nextCount);
      if (nextCount === 0 && !queued.has(successorId)) {
        const successor = itemsById.get(successorId);
        if (successor) {
          queue.push(successor);
          queued.add(successorId);
          queue.sort(sortByPlanOrder);
        }
      }
    }
  }
  for (const item of byOrder) {
    if (!queued.has(item.id)) scheduledOrder.push(item);
  }

  const computedById = new Map<string, DayUpdate>();
  const updatesById = new Map<string, DayUpdate>();

  for (const item of scheduledOrder) {
    const changedFields = changedFieldsByItem.get(item.id) ?? new Set<string>();
    const predecessorRefs = predecessorRefsByItem.get(item.id) ?? [];
    let nextStartDate = item.startDate;
    let nextDueDate = item.dueDate;
    let durationWorkDays = resolveDurationWorkDays(item);
    const isChangedItem = changedFieldsByItem.has(item.id);
    const isWorkDaysDrivenChange = isChangedItem && changedFields.has("workDays");
    const isDateDrivenChange =
      isChangedItem && !isWorkDaysDrivenChange && ["startDate", "dueDate", "forecastStartDate", "forecastDueDate"].some((field) => changedFields.has(field));

    const earliestStart = options.startNotBeforeById?.get(item.id);
    const linked = predecessorConstraints(
      item,
      predecessorRefs,
      { item: (id) => itemsById.get(id), computed: (id) => computedById.get(id) },
      overrides,
    );
    const startConstraints: number[] = [
      ...(earliestStart !== undefined ? [earliestStart] : []),
      ...linked.filter((constraint) => constraint.kind === "start").map((constraint) => constraint.day),
    ];
    const finishConstraints: number[] = linked.filter((constraint) => constraint.kind === "finish").map((constraint) => constraint.day);

    if (durationWorkDays !== null && !isDateDrivenChange) {
      const constrainedDurationWorkDays = durationWorkDays;
      const requiredStartDates = [
        ...startConstraints,
        ...finishConstraints.map((finishConstraint) => startFromFinish(finishConstraint, constrainedDurationWorkDays, item.calendarCode, overrides)),
      ];
      const constrainedStartDate = maxDay(requiredStartDates);
      if (constrainedStartDate !== null) nextStartDate = constrainedStartDate;
    } else {
      const constrainedStartDate = maxDay(startConstraints);
      const constrainedFinishDate = maxDay(finishConstraints);
      if (constrainedStartDate !== null) nextStartDate = constrainedStartDate;
      if (constrainedFinishDate !== null) nextDueDate = constrainedFinishDate;
    }

    if (isDateDrivenChange) {
      durationWorkDays = isWbsZeroDurationItem(item)
        ? 0
        : nextStartDate !== null && nextDueDate !== null
          ? workingDaysInclusive(nextStartDate, nextDueDate, item.calendarCode, overrides)
          : null;
    } else if (nextStartDate !== null && durationWorkDays !== null) {
      nextDueDate = durationWorkDays <= 1 ? nextStartDate : addWorkingDays(nextStartDate, durationWorkDays - 1, item.calendarCode, overrides);
    } else if (nextStartDate !== null && nextDueDate !== null) {
      durationWorkDays = isWbsZeroDurationItem(item) ? 0 : workingDaysInclusive(nextStartDate, nextDueDate, item.calendarCode, overrides);
    }

    if (isWbsCheckpointType(item)) {
      const computedCheckpointDate = maxDay([...startConstraints, ...finishConstraints, nextDueDate, nextStartDate].filter((day): day is number => day !== null));
      const editedAnchor =
        isDateDrivenChange && changedFields.has("dueDate")
          ? nextDueDate
          : isDateDrivenChange && changedFields.has("startDate")
            ? nextStartDate
            : null;
      const checkpointDate = editedAnchor ?? computedCheckpointDate;
      nextStartDate = checkpointDate;
      nextDueDate = checkpointDate;
      durationWorkDays = 0;
    } else if (item.status === "CANCELLED") {
      const cancelledDate = nextStartDate ?? nextDueDate;
      nextStartDate = cancelledDate;
      nextDueDate = cancelledDate;
      durationWorkDays = 0;
    }

    const nextCalendarDays = nextStartDate !== null && nextDueDate !== null ? calendarDaysInclusive(nextStartDate, nextDueDate) : null;
    const update: DayUpdate = {
      id: item.id,
      startDate: nextStartDate,
      dueDate: nextDueDate,
      forecastStartDate: nextStartDate,
      forecastDueDate: nextDueDate,
      workDays: durationWorkDays,
      calendarDays: nextCalendarDays,
    };
    computedById.set(item.id, update);
    if (
      changed(item.startDate, update.startDate) ||
      changed(item.dueDate, update.dueDate) ||
      changed(item.forecastStartDate, update.forecastStartDate) ||
      changed(item.forecastDueDate, update.forecastDueDate) ||
      !sameNumber(item.workDays, update.workDays) ||
      !sameNumber(item.calendarDays, update.calendarDays)
    ) {
      updatesById.set(item.id, update);
    }
  }

  const hierarchyOrder = [...items].sort((left, right) => wbsLevelFromItem(right) - wbsLevelFromItem(left) || right.sortOrder - left.sortOrder);
  for (const item of hierarchyOrder) {
    const children = childrenByParent.get(item.id) ?? [];
    if (children.length === 0) continue;
    const childSchedules = children.map((child) => computedById.get(child.id)).filter((schedule): schedule is DayUpdate => Boolean(schedule));
    const childStartDates = childSchedules.map((schedule) => schedule.startDate).filter((day): day is number => day !== null);
    const childDueDates = childSchedules.map((schedule) => schedule.dueDate).filter((day): day is number => day !== null);
    const childForecastStartDates = childSchedules.map((schedule) => schedule.forecastStartDate ?? schedule.startDate).filter((day): day is number => day !== null);
    const childForecastDueDates = childSchedules.map((schedule) => schedule.forecastDueDate ?? schedule.dueDate).filter((day): day is number => day !== null);
    if (childStartDates.length === 0 && childDueDates.length === 0) continue;

    const nextStartDate = minDay(childStartDates);
    const nextDueDate = maxDay(childDueDates);
    const nextForecastStartDate = minDay(childForecastStartDates) ?? nextStartDate;
    const nextForecastDueDate = maxDay(childForecastDueDates) ?? nextDueDate;
    const nextCalendarDays = nextStartDate !== null && nextDueDate !== null ? calendarDaysInclusive(nextStartDate, nextDueDate) : null;
    const nextWorkDays =
      nextStartDate !== null && nextDueDate !== null
        ? isWbsZeroDurationItem(item)
          ? 0
          : workingDaysInclusive(nextStartDate, nextDueDate, item.calendarCode, overrides)
        : null;
    const update: DayUpdate = {
      id: item.id,
      startDate: nextStartDate,
      dueDate: nextDueDate,
      forecastStartDate: nextForecastStartDate,
      forecastDueDate: nextForecastDueDate,
      workDays: nextWorkDays,
      calendarDays: nextCalendarDays,
    };
    computedById.set(item.id, update);
    if (
      changed(item.startDate, update.startDate) ||
      changed(item.dueDate, update.dueDate) ||
      changed(item.forecastStartDate, update.forecastStartDate) ||
      changed(item.forecastDueDate, update.forecastDueDate) ||
      !sameNumber(item.workDays, update.workDays) ||
      !sameNumber(item.calendarDays, update.calendarDays)
    ) {
      updatesById.set(item.id, update);
    } else {
      updatesById.delete(item.id);
    }
  }

  return [...updatesById.values()];
}

function applyDayUpdates(items: DayItem[], updates: DayUpdate[]): DayItem[] {
  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return items.map((item) => {
    const update = updatesById.get(item.id);
    if (!update) return item;
    return {
      ...item,
      startDate: update.startDate,
      dueDate: update.dueDate,
      forecastStartDate: update.forecastStartDate,
      forecastDueDate: update.forecastDueDate,
      workDays: update.workDays,
      calendarDays: update.calendarDays,
    };
  });
}

function toDayItem(item: ScheduleItem): DayItem {
  return {
    ...item,
    startDate: toDay(item.startDate),
    dueDate: toDay(item.dueDate),
    forecastStartDate: item.forecastStartDate === undefined ? undefined : toDay(item.forecastStartDate),
    forecastDueDate: item.forecastDueDate === undefined ? undefined : toDay(item.forecastDueDate),
  };
}

/**
 * The schedule of a Structure: dates and durations of every row from the
 * links, the calendar and what the write changed, repeated until nothing
 * moves (at most 20 rounds). Answers only the rows that change.
 */
export function calculateScheduleUpdates(
  items: ScheduleItem[],
  dependencies: ScheduleDependency[],
  calendarOverrides: ScheduleCalendarOverride[],
  options: ScheduleOptions = {},
): ScheduleUpdate[] {
  const overrides = buildCalendarOverrides(calendarOverrides);
  const original = items.map(toDayItem);
  const startNotBeforeById = options.startNotBeforeById
    ? new Map([...options.startNotBeforeById.entries()].map(([id, value]) => [id, dayNumber(value)]))
    : undefined;
  let currentItems = original;
  let previousUpdates: DayUpdate[] = [];
  const initialChangedFields = [...(options.changedFields ?? [])];
  const initialChangedItems = [...(options.changedItems ?? [])].map((changedItem) => ({ itemId: changedItem.itemId, changedFields: [...changedItem.changedFields] }));

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const updates = calculateSchedulePass(currentItems, dependencies, overrides, {
      ...options,
      startNotBeforeById,
      changedFields: iteration === 0 ? initialChangedFields : [],
      changedItems: iteration === 0 ? initialChangedItems : [],
    });
    if (updates.length === 0) break;
    previousUpdates = updates;
    currentItems = applyDayUpdates(currentItems, updates);
  }
  if (previousUpdates.length === 0) return [];

  const finalItemsById = new Map(currentItems.map((item) => [item.id, item]));
  const finalUpdates: ScheduleUpdate[] = [];
  for (const originalItem of original) {
    const finalItem = finalItemsById.get(originalItem.id);
    if (!finalItem) continue;
    const update = {
      id: originalItem.id,
      startDate: finalItem.startDate,
      dueDate: finalItem.dueDate,
      forecastStartDate: finalItem.forecastStartDate ?? null,
      forecastDueDate: finalItem.forecastDueDate ?? null,
      workDays: finalItem.workDays ?? null,
      calendarDays: finalItem.calendarDays ?? null,
    };
    if (
      changed(originalItem.startDate, update.startDate) ||
      changed(originalItem.dueDate, update.dueDate) ||
      changed(originalItem.forecastStartDate, update.forecastStartDate) ||
      changed(originalItem.forecastDueDate, update.forecastDueDate) ||
      !sameNumber(originalItem.workDays, update.workDays) ||
      !sameNumber(originalItem.calendarDays, update.calendarDays)
    ) {
      finalUpdates.push({
        ...update,
        startDate: toPlain(update.startDate),
        dueDate: toPlain(update.dueDate),
        forecastStartDate: toPlain(update.forecastStartDate),
        forecastDueDate: toPlain(update.forecastDueDate),
      });
    }
  }
  return finalUpdates;
}
