import type {
  ProjectCalendarCode,
  WbsDependencyType,
  WbsItemType,
} from "@prisma/client";
import { prisma } from "../db.js";

export type WbsScheduleItem = {
  id: string;
  parentId?: string | null;
  code: string;
  type: WbsItemType;
  startDate: Date | null;
  dueDate: Date | null;
  forecastStartDate?: Date | null;
  forecastDueDate?: Date | null;
  predecessor1: string | null;
  predecessor2: string | null;
  predecessor3: string | null;
  predecessor4: string | null;
  predecessor5: string | null;
  predecessor6: string | null;
  leadLagDays: number;
  workDays: number | null;
  calendarDays: number | null;
  calendarCode: ProjectCalendarCode;
  wbsLevel?: number | null;
  sortOrder: number;
};

export type WbsScheduleDependency = {
  predecessorId: string;
  successorId: string;
  type?: WbsDependencyType;
  lagDays?: number;
};

export type WbsScheduleCalendarOverride = {
  calendarCode: ProjectCalendarCode;
  date: Date;
  isWorkingDay: boolean;
};

export type WbsScheduleUpdate = {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  forecastStartDate: Date | null;
  forecastDueDate: Date | null;
  workDays: number | null;
  calendarDays: number | null;
};

export type WbsScheduleCalculationOptions = {
  changedItemId?: string;
  changedFields?: Iterable<string>;
};

export type WbsBaselineVarianceItem = {
  id: string;
  parentId?: string | null;
  code: string;
  title?: string;
  type: WbsItemType;
  baselineDueDate?: Date | null;
  dueDate: Date | null;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
  sortOrder: number;
};

export type WbsBaselineVarianceDependency = {
  predecessorId: string;
  successorId: string;
};

export type WbsBaselineVarianceRootCause = {
  item: WbsBaselineVarianceItem;
  delayDays: number;
  rawDelayDays: number;
  inheritedDelayDays: number;
  inheritedFrom: WbsBaselineVarianceItem | null;
};

export type WbsBaselineVarianceResult = {
  scheduleVarianceDays: number;
  rootCauses: WbsBaselineVarianceRootCause[];
};

type WbsPredecessorRef = {
  predecessorId: string;
  type: WbsDependencyType;
  lagDays: number;
};

function startOfUtcDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function dateKey(value: Date) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function calendarOverrideKey(calendarCode: ProjectCalendarCode, value: Date) {
  return `${calendarCode}:${dateKey(value)}`;
}

function buildCalendarOverrides(
  overrides: WbsScheduleCalendarOverride[],
) {
  const map = new Map<string, boolean>();
  for (const override of overrides) {
    map.set(
      calendarOverrideKey(override.calendarCode, override.date),
      override.isWorkingDay,
    );
  }
  return map;
}

function isDefaultWorkingDay(value: Date) {
  const day = startOfUtcDay(value).getUTCDay();
  return day !== 0 && day !== 6;
}

function isWorkingDay(
  value: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const override = overridesByKey.get(calendarOverrideKey(calendarCode, value));
  return override ?? isDefaultWorkingDay(value);
}

function addWorkingDays(
  value: Date,
  days: number,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const result = startOfUtcDay(value);
  if (days === 0) return result;

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let guard = 0;

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + step);
    if (isWorkingDay(result, calendarCode, overridesByKey)) {
      remaining -= 1;
    }
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось рассчитать рабочие дни Структуры");
    }
  }

  return result;
}

function calendarDaysInclusive(startDate: Date, dueDate: Date) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  const diff = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  return Math.max(0, diff + 1);
}

function workingDaysInclusive(
  startDate: Date,
  dueDate: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  if (due.getTime() < start.getTime()) return 0;

  let current = new Date(start);
  let workingDays = 0;
  let guard = 0;
  while (current.getTime() <= due.getTime()) {
    if (isWorkingDay(current, calendarCode, overridesByKey)) {
      workingDays += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось рассчитать рабочие дни Структуры");
    }
  }
  return workingDays;
}

function signedCalendarDays(startDate: Date, dueDate: Date) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

function sameDate(left: Date | null, right: Date | null) {
  return (left ? startOfUtcDay(left).getTime() : null) === (right ? startOfUtcDay(right).getTime() : null);
}

function sameNumber(left: number | null, right: number | null) {
  return (left ?? null) === (right ?? null);
}

function normalizedDate(value: Date | null) {
  return value ? startOfUtcDay(value) : null;
}

function resolveDurationWorkDays(item: WbsScheduleItem) {
  if (item.workDays !== null && item.workDays !== undefined) {
    return Math.max(0, item.workDays);
  }
  if (item.type === "MILESTONE") return 0;
  return null;
}

function wbsLevelFromCode(code: string) {
  return Math.max(1, code.split(".").filter(Boolean).length);
}

function wbsLevelFromItem(item: WbsScheduleItem) {
  return Math.max(1, item.wbsLevel ?? wbsLevelFromCode(item.code));
}

function parentCodeFromCode(code: string) {
  const parts = code.split(".").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

function buildChildrenByParent(
  items: WbsScheduleItem[],
  itemsById: Map<string, WbsScheduleItem>,
  itemsByCode: Map<string, WbsScheduleItem>,
) {
  const childrenByParent = new Map<string, WbsScheduleItem[]>();
  for (const item of items) {
    const explicitParentId =
      item.parentId && itemsById.has(item.parentId) ? item.parentId : null;
    const inferredParentCode = parentCodeFromCode(item.code);
    const inferredParentId = inferredParentCode
      ? itemsByCode.get(inferredParentCode)?.id ?? null
      : null;
    const parentId = inferredParentId ?? explicitParentId;
    if (!parentId || parentId === item.id) continue;
    childrenByParent.set(parentId, [
      ...(childrenByParent.get(parentId) ?? []),
      item,
    ]);
  }
  return childrenByParent;
}

function minDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest,
  );
}

function maxDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

function startFromFinish(
  finishDate: Date,
  durationWorkDays: number,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  if (durationWorkDays <= 1) return startOfUtcDay(finishDate);
  return addWorkingDays(
    finishDate,
    -(durationWorkDays - 1),
    calendarCode,
    overridesByKey,
  );
}

function sortByPlanOrder(left: WbsScheduleItem, right: WbsScheduleItem) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, "ru");
}

export function calculateWbsScheduleUpdates(
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
  const dependencyBySuccessorAndPredecessor = new Map<string, WbsScheduleDependency>();

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
    const refs: WbsPredecessorRef[] = fieldPredecessorIds.map((predecessorId) => {
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
    });
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
        predecessorSchedule?.startDate ??
        normalizedDate(predecessor?.startDate ?? null);
      const predecessorDueDate =
        predecessorSchedule?.dueDate ??
        normalizedDate(predecessor?.dueDate ?? null);

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
        item.type === "MILESTONE"
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
        item.type === "MILESTONE"
          ? 0
          : workingDaysInclusive(
              nextStartDate,
              nextDueDate,
              item.calendarCode,
              overridesByKey,
            );
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
    if (childStartDates.length === 0 && childDueDates.length === 0) {
      continue;
    }

    const nextStartDate = minDate(childStartDates);
    const nextDueDate = maxDate(childDueDates);
    const nextCalendarDays =
      nextStartDate && nextDueDate
        ? calendarDaysInclusive(nextStartDate, nextDueDate)
        : null;
    const nextWorkDays =
      nextStartDate && nextDueDate
        ? item.type === "MILESTONE"
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
      forecastStartDate: nextStartDate,
      forecastDueDate: nextDueDate,
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

export function calculateWbsBaselineVariance(
  items: WbsBaselineVarianceItem[],
  dependencies: WbsBaselineVarianceDependency[],
): WbsBaselineVarianceResult {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  const childrenByParentId = new Map<string, WbsBaselineVarianceItem[]>();

  for (const item of items) {
    if (!item.parentId || !itemsById.has(item.parentId)) continue;
    childrenByParentId.set(item.parentId, [
      ...(childrenByParentId.get(item.parentId) ?? []),
      item,
    ]);
  }

  const predecessorIdsByItemId = new Map<string, Set<string>>();
  const addPredecessor = (itemId: string, predecessorId: string) => {
    if (itemId === predecessorId) return;
    const predecessorIds = predecessorIdsByItemId.get(itemId) ?? new Set<string>();
    predecessorIds.add(predecessorId);
    predecessorIdsByItemId.set(itemId, predecessorIds);
  };

  for (const dependency of dependencies) {
    if (
      itemsById.has(dependency.predecessorId) &&
      itemsById.has(dependency.successorId)
    ) {
      addPredecessor(dependency.successorId, dependency.predecessorId);
    }
  }

  for (const item of items) {
    for (const predecessorCode of [
      item.predecessor1,
      item.predecessor2,
      item.predecessor3,
      item.predecessor4,
      item.predecessor5,
      item.predecessor6,
    ]) {
      const predecessor = predecessorCode ? itemsByCode.get(predecessorCode) : null;
      if (predecessor) addPredecessor(item.id, predecessor.id);
    }
  }

  const delayedItems = items
    .filter(
      (
        item,
      ): item is WbsBaselineVarianceItem & {
        baselineDueDate: Date;
        dueDate: Date;
      } =>
        item.type !== "MILESTONE" &&
        item.baselineDueDate !== null &&
        item.baselineDueDate !== undefined &&
        item.dueDate !== null,
    )
    .map((item) => ({
      item,
      delayDays: signedCalendarDays(item.baselineDueDate, item.dueDate),
    }))
    .filter(({ delayDays }) => delayDays > 0);

  const delayByItemId = new Map(
    delayedItems.map(({ item, delayDays }) => [item.id, delayDays]),
  );
  const delayedLeafItemIds = new Set(
    delayedItems
      .filter(({ item }) => !childrenByParentId.has(item.id))
      .map(({ item }) => item.id),
  );
  const upstreamCauseCache = new Map<string, Set<string>>();

  const upstreamDelayedLeafCauseIds = (
    itemId: string,
    visiting = new Set<string>(),
  ): Set<string> => {
    const cached = upstreamCauseCache.get(itemId);
    if (cached) return cached;
    if (visiting.has(itemId)) return new Set<string>();
    visiting.add(itemId);

    const causeIds = new Set<string>();
    for (const predecessorId of predecessorIdsByItemId.get(itemId) ?? []) {
      if (delayedLeafItemIds.has(predecessorId)) {
        causeIds.add(predecessorId);
      }
      for (const upstreamId of upstreamDelayedLeafCauseIds(
        predecessorId,
        visiting,
      )) {
        causeIds.add(upstreamId);
      }
    }

    visiting.delete(itemId);
    upstreamCauseCache.set(itemId, causeIds);
    return causeIds;
  };

  const rootCauses = delayedItems
    .filter(({ item }) => !childrenByParentId.has(item.id))
    .map(({ item, delayDays: rawDelayDays }) => {
      const inheritedFrom =
        [...upstreamDelayedLeafCauseIds(item.id)]
          .map((predecessorId) => itemsById.get(predecessorId))
          .filter((entry): entry is WbsBaselineVarianceItem => Boolean(entry))
          .sort(
            (left, right) =>
              (delayByItemId.get(right.id) ?? 0) -
                (delayByItemId.get(left.id) ?? 0) ||
              left.code.localeCompare(right.code, "ru", { numeric: true }),
          )[0] ?? null;
      const inheritedDelayDays = inheritedFrom
        ? delayByItemId.get(inheritedFrom.id) ?? 0
        : 0;
      return {
        item,
        delayDays: Math.max(0, rawDelayDays - inheritedDelayDays),
        rawDelayDays,
        inheritedDelayDays,
        inheritedFrom,
      };
    })
    .filter(({ delayDays }) => delayDays > 0)
    .sort(
      (left, right) =>
        right.delayDays - left.delayDays ||
        right.rawDelayDays - left.rawDelayDays ||
        left.item.code.localeCompare(right.item.code, "ru", { numeric: true }),
    );

  return {
    scheduleVarianceDays: Math.max(0, ...delayedItems.map(({ delayDays }) => delayDays)),
    rootCauses,
  };
}

export async function recalculateProjectWbsSchedule(
  projectId: string,
  options: WbsScheduleCalculationOptions = {},
) {
  const [items, dependencies, calendarOverrides] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.wbsDependency.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        predecessorId: true,
        successorId: true,
        type: true,
        lagDays: true,
      },
    }),
    prisma.projectCalendarOverride.findMany({
      where: { projectId },
      select: {
        calendarCode: true,
        date: true,
        isWorkingDay: true,
      },
    }),
  ]);

  const updates = calculateWbsScheduleUpdates(
    items,
    dependencies,
    calendarOverrides,
    options,
  );
  if (updates.length === 0) return 0;

  await prisma.$transaction(
    updates.map((update) =>
      prisma.wbsItem.update({
        where: { id: update.id },
        data: {
          startDate: update.startDate,
          dueDate: update.dueDate,
          forecastStartDate: update.forecastStartDate,
          forecastDueDate: update.forecastDueDate,
          workDays: update.workDays,
          calendarDays: update.calendarDays,
        },
      }),
    ),
  );

  return updates.length;
}
