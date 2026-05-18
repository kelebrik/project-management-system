import type { ProjectCalendarCode, WbsItemType } from "@prisma/client";
import { prisma } from "../db.js";

export type WbsScheduleItem = {
  id: string;
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
  const direction = start.getTime() <= due.getTime() ? 1 : -1;
  const cursor = new Date(start);
  let days = 0;
  let guard = 0;

  while (true) {
    if (isWorkingDay(cursor, calendarCode, overridesByKey)) {
      days += direction;
    }
    if (cursor.getTime() === due.getTime()) break;
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось посчитать длительность Структуры");
    }
  }

  return days;
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

function resolveDurationWorkDays(
  item: WbsScheduleItem,
  startDate: Date | null,
  dueDate: Date | null,
  overridesByKey: Map<string, boolean>,
) {
  if (item.workDays !== null && item.workDays !== undefined) {
    return Math.max(0, item.workDays);
  }
  if (startDate && dueDate) {
    return Math.max(
      0,
      workingDaysInclusive(startDate, dueDate, item.calendarCode, overridesByKey),
    );
  }
  if (item.type === "MILESTONE") return 0;
  return null;
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
  const dependenciesBySuccessor = new Map<string, WbsScheduleDependency[]>();

  for (const dependency of dependencies) {
    dependenciesBySuccessor.set(dependency.successorId, [
      ...(dependenciesBySuccessor.get(dependency.successorId) ?? []),
      dependency,
    ]);
  }

  const predecessorRefsByItem = new Map<string, string[]>();
  for (const item of items) {
    const refs: string[] = [];
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
      if (predecessor && predecessor.id !== item.id && !refs.includes(predecessor.id)) {
        refs.push(predecessor.id);
      }
    }
    const dependencyRefs = dependenciesBySuccessor.get(item.id) ?? [];
    if (refs.length === 0 && dependencyRefs.length > 0) {
      for (const dependency of dependencyRefs) {
        if (itemsById.has(dependency.predecessorId) && !refs.includes(dependency.predecessorId)) {
          refs.push(dependency.predecessorId);
        }
      }
    }
    predecessorRefsByItem.set(item.id, refs);
  }

  const successorsByPredecessor = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const item of items) incomingCount.set(item.id, 0);
  for (const [successorId, predecessorIds] of predecessorRefsByItem.entries()) {
    incomingCount.set(successorId, predecessorIds.length);
    for (const predecessorId of predecessorIds) {
      successorsByPredecessor.set(predecessorId, [
        ...(successorsByPredecessor.get(predecessorId) ?? []),
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
  const updates: WbsScheduleUpdate[] = [];

  for (const item of scheduledOrder) {
    const predecessorIds = predecessorRefsByItem.get(item.id) ?? [];
    let nextStartDate = normalizedDate(item.startDate);
    let nextDueDate = normalizedDate(item.dueDate);
    const durationWorkDays = resolveDurationWorkDays(
      item,
      nextStartDate,
      nextDueDate,
      overridesByKey,
    );

    const predecessorDueDates = predecessorIds
      .map((predecessorId) => computedById.get(predecessorId)?.dueDate ?? normalizedDate(itemsById.get(predecessorId)?.dueDate ?? null))
      .filter((value): value is Date => value !== null);
    const hasScheduledPredecessors = predecessorDueDates.length > 0;

    if (hasScheduledPredecessors) {
      const latestPredecessorDueDate = predecessorDueDates.reduce((latest, current) =>
        current.getTime() > latest.getTime() ? current : latest,
      );
      nextStartDate = addWorkingDays(
        latestPredecessorDueDate,
        1 + (item.leadLagDays ?? 0),
        item.calendarCode,
        overridesByKey,
      );
    }

    if (nextStartDate && durationWorkDays !== null && (hasScheduledPredecessors || !nextDueDate)) {
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
    const nextWorkDays =
      item.workDays ??
      (nextStartDate && nextDueDate
        ? Math.max(
            0,
            workingDaysInclusive(
              nextStartDate,
              nextDueDate,
              item.calendarCode,
              overridesByKey,
            ),
          )
        : null);

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
      updates.push(update);
    }
  }

  return updates;
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
