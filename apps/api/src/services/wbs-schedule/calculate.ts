import {
  addWorkingDays,
  buildCalendarOverrides,
  calendarDaysInclusive,
  normalizedDate,
  sameDate,
  sameNumber,
  workingDaysInclusive,
} from "./calendar.js";
import {
  buildChildrenByParent,
  maxDate,
  minDate,
  resolveDurationWorkDays,
  isWbsCheckpointType,
  sortByPlanOrder,
  startFromFinish,
  wbsLevelFromItem,
} from "./hierarchy.js";
import type {
  WbsPredecessorRef,
  WbsScheduleCalculationOptions,
  WbsScheduleCalendarOverride,
  WbsScheduleDependency,
  WbsScheduleItem,
  WbsScheduleUpdate,
} from "./types.js";

function calculateWbsSchedulePass(
  items: WbsScheduleItem[],
  dependencies: WbsScheduleDependency[],
  calendarOverrides: WbsScheduleCalendarOverride[],
  options: WbsScheduleCalculationOptions = {},
) {
  const overridesByKey = buildCalendarOverrides(calendarOverrides);
  const changedFields = new Set(options.changedFields ?? []);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  const childrenByParent = buildChildrenByParent(items, itemsById, itemsByCode);
  const dependenciesBySuccessor = new Map<string, WbsScheduleDependency[]>();
  const dependencyBySuccessorAndPredecessor =
    new Map<string, WbsScheduleDependency>();

  for (const dependency of dependencies) {
    dependenciesBySuccessor.set(dependency.successorId, [
      ...(dependenciesBySuccessor.get(dependency.successorId) ?? []),
      dependency,
    ]);
    dependencyBySuccessorAndPredecessor.set(
      `${dependency.successorId}:${dependency.predecessorId}`,
      dependency,
    );
  }

  const predecessorRefsByItem = new Map<string, WbsPredecessorRef[]>();
  for (const item of items) {
    const fieldPredecessorIds: string[] = [];
    for (const predecessorCode of [
      item.predecessor1,
      item.predecessor2,
      item.predecessor3,
      item.predecessor4,
      item.predecessor5,
      item.predecessor6,
    ]) {
      if (!predecessorCode) continue;
      const predecessor = itemsByCode.get(predecessorCode);
      if (
        predecessor &&
        predecessor.id !== item.id &&
        !fieldPredecessorIds.includes(predecessor.id)
      ) {
        fieldPredecessorIds.push(predecessor.id);
      }
    }
    const refs: WbsPredecessorRef[] = fieldPredecessorIds.map(
      (predecessorId) => {
        const dependency = dependencyBySuccessorAndPredecessor.get(
          `${item.id}:${predecessorId}`,
        );
        return {
          predecessorId,
          type: dependency?.type ?? "FS",
          lagDays:
            dependency?.lagDays ??
            (fieldPredecessorIds.length === 1 ? item.leadLagDays ?? 0 : 0),
        };
      },
    );
    const dependencyRefs = dependenciesBySuccessor.get(item.id) ?? [];
    if (refs.length === 0 && dependencyRefs.length > 0) {
      for (const dependency of dependencyRefs) {
        if (
          itemsById.has(dependency.predecessorId) &&
          !refs.some((ref) => ref.predecessorId === dependency.predecessorId)
        ) {
          refs.push({
            predecessorId: dependency.predecessorId,
            type: dependency.type ?? "FS",
            lagDays: dependency.lagDays ?? 0,
          });
        }
      }
    }
    predecessorRefsByItem.set(item.id, refs);
  }

  const successorsByPredecessor = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const item of items) incomingCount.set(item.id, 0);
  for (const [successorId, predecessorRefs] of predecessorRefsByItem.entries()) {
    incomingCount.set(successorId, predecessorRefs.length);
    for (const predecessorRef of predecessorRefs) {
      successorsByPredecessor.set(predecessorRef.predecessorId, [
        ...(successorsByPredecessor.get(predecessorRef.predecessorId) ?? []),
        successorId,
      ]);
    }
  }

  const byOrder = [...items].sort(sortByPlanOrder);
  const queue = byOrder.filter((item) => (incomingCount.get(item.id) ?? 0) === 0);
  const scheduledOrder: WbsScheduleItem[] = [];
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

  const computedById = new Map<string, WbsScheduleUpdate>();
  const updatesById = new Map<string, WbsScheduleUpdate>();

  for (const item of scheduledOrder) {
    const predecessorRefs = predecessorRefsByItem.get(item.id) ?? [];
    let nextStartDate = normalizedDate(item.startDate);
    let nextDueDate = normalizedDate(item.dueDate);
    let durationWorkDays = resolveDurationWorkDays(item);
    const isChangedItem = item.id === options.changedItemId;
    const isWorkDaysDrivenChange =
      isChangedItem && changedFields.has("workDays");
    const isDateDrivenChange =
      isChangedItem &&
      !isWorkDaysDrivenChange &&
      [
        "startDate",
        "dueDate",
        "forecastStartDate",
        "forecastDueDate",
      ].some((field) => changedFields.has(field));

    const startConstraints: Date[] = [];
    const finishConstraints: Date[] = [];
    for (const predecessorRef of predecessorRefs) {
      const predecessor = itemsById.get(predecessorRef.predecessorId);
      const predecessorSchedule = computedById.get(predecessorRef.predecessorId);
      const predecessorStartDate =
        predecessorSchedule?.forecastStartDate ??
        predecessorSchedule?.startDate ??
        normalizedDate(predecessor?.forecastStartDate ?? predecessor?.startDate ?? null);
      const predecessorDueDate =
        predecessorSchedule?.forecastDueDate ??
        predecessorSchedule?.dueDate ??
        normalizedDate(predecessor?.forecastDueDate ?? predecessor?.dueDate ?? null);

      if (predecessorRef.type === "FS" && predecessorDueDate) {
        startConstraints.push(
          addWorkingDays(
            predecessorDueDate,
            1 + predecessorRef.lagDays,
            item.calendarCode,
            overridesByKey,
          ),
        );
      } else if (predecessorRef.type === "SS" && predecessorStartDate) {
        startConstraints.push(
          addWorkingDays(
            predecessorStartDate,
            predecessorRef.lagDays,
            item.calendarCode,
            overridesByKey,
          ),
        );
      } else if (predecessorRef.type === "FF" && predecessorDueDate) {
        finishConstraints.push(
          addWorkingDays(
            predecessorDueDate,
            predecessorRef.lagDays,
            item.calendarCode,
            overridesByKey,
          ),
        );
      } else if (predecessorRef.type === "SF" && predecessorStartDate) {
        finishConstraints.push(
          addWorkingDays(
            predecessorStartDate,
            predecessorRef.lagDays,
            item.calendarCode,
            overridesByKey,
          ),
        );
      }
    }

    if (durationWorkDays !== null && !isDateDrivenChange) {
      const constrainedDurationWorkDays = durationWorkDays;
      const requiredStartDates = [
        ...startConstraints,
        ...finishConstraints.map((finishConstraint) =>
          startFromFinish(
            finishConstraint,
            constrainedDurationWorkDays,
            item.calendarCode,
            overridesByKey,
          ),
        ),
      ];
      const constrainedStartDate = maxDate(requiredStartDates);
      if (constrainedStartDate) {
        nextStartDate = constrainedStartDate;
      }
    } else {
      const constrainedStartDate = maxDate(startConstraints);
      const constrainedFinishDate = maxDate(finishConstraints);
      if (constrainedStartDate) nextStartDate = constrainedStartDate;
      if (constrainedFinishDate) nextDueDate = constrainedFinishDate;
    }

    if (isDateDrivenChange) {
      durationWorkDays =
        isWbsCheckpointType(item)
          ? 0
          : nextStartDate && nextDueDate
            ? workingDaysInclusive(
                nextStartDate,
                nextDueDate,
                item.calendarCode,
                overridesByKey,
              )
            : null;
    } else if (nextStartDate && durationWorkDays !== null) {
      nextDueDate =
        durationWorkDays <= 1
          ? nextStartDate
          : addWorkingDays(
              nextStartDate,
              durationWorkDays - 1,
              item.calendarCode,
              overridesByKey,
            );
    } else if (nextStartDate && nextDueDate) {
      durationWorkDays =
        isWbsCheckpointType(item)
          ? 0
          : workingDaysInclusive(
              nextStartDate,
              nextDueDate,
              item.calendarCode,
              overridesByKey,
            );
    }

    if (isWbsCheckpointType(item)) {
      const computedCheckpointDate = maxDate(
        [...startConstraints, ...finishConstraints, nextDueDate, nextStartDate].filter(
          (date): date is Date => date !== null,
        ),
      );
      if (item.type === "GOAL") {
        const approvedGoalDate =
          normalizedDate(item.dueDate ?? item.startDate) ?? nextDueDate ?? nextStartDate;
        nextStartDate = approvedGoalDate;
        nextDueDate = approvedGoalDate;
        durationWorkDays = 0;
        const forecastDate = computedCheckpointDate ?? approvedGoalDate;
        const update: WbsScheduleUpdate = {
          id: item.id,
          startDate: nextStartDate,
          dueDate: nextDueDate,
          forecastStartDate: forecastDate,
          forecastDueDate: forecastDate,
          workDays: durationWorkDays,
          calendarDays:
            nextStartDate && nextDueDate
              ? calendarDaysInclusive(nextStartDate, nextDueDate)
              : null,
        };
        computedById.set(item.id, update);

        if (
          !sameDate(item.startDate, update.startDate) ||
          !sameDate(item.dueDate, update.dueDate) ||
          !sameDate(item.forecastStartDate ?? null, update.forecastStartDate) ||
          !sameDate(item.forecastDueDate ?? null, update.forecastDueDate) ||
          !sameNumber(item.workDays, update.workDays) ||
          !sameNumber(item.calendarDays, update.calendarDays)
        ) {
          updatesById.set(item.id, update);
        }
        continue;
      }
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
    }

    const nextCalendarDays =
      nextStartDate && nextDueDate
        ? calendarDaysInclusive(nextStartDate, nextDueDate)
        : null;

    const update: WbsScheduleUpdate = {
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
      !sameDate(item.startDate, update.startDate) ||
      !sameDate(item.dueDate, update.dueDate) ||
      !sameDate(item.forecastStartDate ?? null, update.forecastStartDate) ||
      !sameDate(item.forecastDueDate ?? null, update.forecastDueDate) ||
      !sameNumber(item.workDays, update.workDays) ||
      !sameNumber(item.calendarDays, update.calendarDays)
    ) {
      updatesById.set(item.id, update);
    }
  }

  const hierarchyOrder = [...items].sort(
    (left, right) =>
      wbsLevelFromItem(right) - wbsLevelFromItem(left) ||
      right.sortOrder - left.sortOrder,
  );

  for (const item of hierarchyOrder) {
    const children = childrenByParent.get(item.id) ?? [];
    if (children.length === 0) continue;

    const childSchedules = children
      .map((child) => computedById.get(child.id))
      .filter((schedule): schedule is WbsScheduleUpdate => Boolean(schedule));
    const childStartDates = childSchedules
      .map((schedule) => schedule.startDate)
      .filter((date): date is Date => date !== null);
    const childDueDates = childSchedules
      .map((schedule) => schedule.dueDate)
      .filter((date): date is Date => date !== null);
    const childForecastStartDates = childSchedules
      .map((schedule) => schedule.forecastStartDate ?? schedule.startDate)
      .filter((date): date is Date => date !== null);
    const childForecastDueDates = childSchedules
      .map((schedule) => schedule.forecastDueDate ?? schedule.dueDate)
      .filter((date): date is Date => date !== null);
    if (childStartDates.length === 0 && childDueDates.length === 0) {
      continue;
    }

    const nextStartDate = minDate(childStartDates);
    const nextDueDate = maxDate(childDueDates);
    const nextForecastStartDate = minDate(childForecastStartDates) ?? nextStartDate;
    const nextForecastDueDate = maxDate(childForecastDueDates) ?? nextDueDate;
    const nextCalendarDays =
      nextStartDate && nextDueDate
        ? calendarDaysInclusive(nextStartDate, nextDueDate)
        : null;
    const nextWorkDays =
      nextStartDate && nextDueDate
        ? isWbsCheckpointType(item)
          ? 0
          : workingDaysInclusive(
              nextStartDate,
              nextDueDate,
              item.calendarCode,
              overridesByKey,
            )
        : null;
    const update: WbsScheduleUpdate = {
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
      !sameDate(item.startDate, update.startDate) ||
      !sameDate(item.dueDate, update.dueDate) ||
      !sameDate(item.forecastStartDate ?? null, update.forecastStartDate) ||
      !sameDate(item.forecastDueDate ?? null, update.forecastDueDate) ||
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

function applyScheduleUpdates(
  items: WbsScheduleItem[],
  updates: WbsScheduleUpdate[],
): WbsScheduleItem[] {
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

export function calculateWbsScheduleUpdates(
  items: WbsScheduleItem[],
  dependencies: WbsScheduleDependency[],
  calendarOverrides: WbsScheduleCalendarOverride[],
  options: WbsScheduleCalculationOptions = {},
) {
  let currentItems = items;
  let previousUpdates: WbsScheduleUpdate[] = [];
  const initialChangedFields = [...(options.changedFields ?? [])];

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const updates = calculateWbsSchedulePass(
      currentItems,
      dependencies,
      calendarOverrides,
      {
        ...options,
        changedFields: iteration === 0 ? initialChangedFields : [],
      },
    );
    if (updates.length === 0) break;
    previousUpdates = updates;
    currentItems = applyScheduleUpdates(currentItems, updates);
  }

  if (previousUpdates.length === 0) return [];

  const finalUpdates: WbsScheduleUpdate[] = [];
  const finalItemsById = new Map(currentItems.map((item) => [item.id, item]));

  for (const originalItem of items) {
    const finalItem = finalItemsById.get(originalItem.id);
    if (!finalItem) continue;

    const update: WbsScheduleUpdate = {
      id: originalItem.id,
      startDate: normalizedDate(finalItem.startDate),
      dueDate: normalizedDate(finalItem.dueDate),
      forecastStartDate: normalizedDate(finalItem.forecastStartDate ?? null),
      forecastDueDate: normalizedDate(finalItem.forecastDueDate ?? null),
      workDays: finalItem.workDays ?? null,
      calendarDays: finalItem.calendarDays ?? null,
    };

    if (
      !sameDate(originalItem.startDate, update.startDate) ||
      !sameDate(originalItem.dueDate, update.dueDate) ||
      !sameDate(
        originalItem.forecastStartDate ?? null,
        update.forecastStartDate,
      ) ||
      !sameDate(originalItem.forecastDueDate ?? null, update.forecastDueDate) ||
      !sameNumber(originalItem.workDays, update.workDays) ||
      !sameNumber(originalItem.calendarDays, update.calendarDays)
    ) {
      finalUpdates.push(update);
    }
  }

  return finalUpdates;
}
