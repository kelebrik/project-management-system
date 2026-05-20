import type { ProjectCalendarCode, WbsItemType } from "@prisma/client";
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

type WbsPredecessorRef = {
  predecessorId: string;
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

function sortByPlanOrder(left: WbsScheduleItem, right: WbsScheduleItem) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, "ru");
}

export function calculateWbsScheduleUpdates(
  items: WbsScheduleItem[],
  dependencies: WbsScheduleDependency[],
  calendarOverrides: WbsScheduleCalendarOverride[],
) {
  const overridesByKey = buildCalendarOverrides(calendarOverrides);
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
    const durationWorkDays = resolveDurationWorkDays(item);

    const predecessorStartDates = predecessorRefs
      .map((predecessorRef) => {
        const predecessorDueDate =
          computedById.get(predecessorRef.predecessorId)?.dueDate ??
          normalizedDate(itemsById.get(predecessorRef.predecessorId)?.dueDate ?? null);
        if (!predecessorDueDate) return null;
        return addWorkingDays(
          predecessorDueDate,
          1 + predecessorRef.lagDays,
          item.calendarCode,
          overridesByKey,
        );
      })
      .filter((value): value is Date => value !== null);
    const hasScheduledPredecessors = predecessorStartDates.length > 0;

    if (hasScheduledPredecessors) {
      nextStartDate = predecessorStartDates.reduce((latest, current) =>
        current.getTime() > latest.getTime() ? current : latest,
      );
    }

    if (nextStartDate && durationWorkDays !== null) {
      nextDueDate =
        durationWorkDays <= 1
          ? nextStartDate
          : addWorkingDays(
              nextStartDate,
              durationWorkDays - 1,
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
      wbsLevelFromCode(right.code) - wbsLevelFromCode(left.code) ||
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
    if (childStartDates.length === 0 && childDueDates.length === 0) continue;

    const nextStartDate = minDate(childStartDates);
    const nextDueDate = maxDate(childDueDates);
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
      workDays: item.workDays,
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

export async function recalculateProjectWbsSchedule(projectId: string) {
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

  const updates = calculateWbsScheduleUpdates(items, dependencies, calendarOverrides);
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
