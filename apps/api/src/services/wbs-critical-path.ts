import type {
  ProjectCalendarCode,
  WbsDependencyType,
  WbsItemType,
} from "@prisma/client";
import { prisma } from "../db.js";

export type WbsCriticalPathItemInput = {
  id: string;
  code: string;
  title: string;
  type: WbsItemType;
  startDate: Date | null;
  dueDate: Date | null;
  workDays: number | null;
  calendarCode: ProjectCalendarCode;
  sortOrder: number;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
  leadLagDays?: number | null;
};

export type WbsCriticalPathDependencyInput = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
  lagDays: number;
};

export type WbsCriticalPathCalendarOverride = {
  calendarCode: ProjectCalendarCode;
  date: Date;
  isWorkingDay: boolean;
};

export type WbsCriticalPathItem = {
  itemId: string;
  code: string;
  title: string;
  earlyStartDate: Date;
  earlyFinishDate: Date;
  lateStartDate: Date;
  lateFinishDate: Date;
  totalFloatWorkDays: number;
  isCritical: boolean;
  isNearCritical: boolean;
};

export type WbsCriticalPathResult = {
  projectStartDate: Date | null;
  projectFinishDate: Date | null;
  criticalItemIds: string[];
  criticalDependencyIds: string[];
  criticalItemCount: number;
  nearCriticalItemCount: number;
  warnings: string[];
  items: WbsCriticalPathItem[];
};

type ComputedNode = {
  item: WbsCriticalPathItemInput;
  durationWorkDays: number;
  earlyStartDate: Date;
  earlyFinishDate: Date;
  lateStartDate: Date;
  lateFinishDate: Date;
};

const MILLISECONDS_IN_DAY = 86_400_000;
const NEAR_CRITICAL_FLOAT_DAYS = 5;
const PREDECESSOR_FIELDS = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

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
  overrides: WbsCriticalPathCalendarOverride[],
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
      throw new Error("Не удалось рассчитать рабочие дни критического пути");
    }
  }

  return result;
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
      throw new Error("Не удалось посчитать длительность критического пути");
    }
  }

  return days;
}

function workingDayDistance(
  startDate: Date,
  endDate: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  if (start.getTime() === end.getTime()) return 0;

  const direction = start.getTime() < end.getTime() ? 1 : -1;
  const cursor = new Date(start);
  let days = 0;
  let guard = 0;

  while (cursor.getTime() !== end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    if (isWorkingDay(cursor, calendarCode, overridesByKey)) {
      days += direction;
    }
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось посчитать резерв критического пути");
    }
  }

  return days;
}

function finishFromStart(
  startDate: Date,
  durationWorkDays: number,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  if (durationWorkDays <= 1) return startOfUtcDay(startDate);
  return addWorkingDays(
    startDate,
    durationWorkDays - 1,
    calendarCode,
    overridesByKey,
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

function maxDate(left: Date, right: Date) {
  return right.getTime() > left.getTime() ? right : left;
}

function minDate(left: Date, right: Date) {
  return right.getTime() < left.getTime() ? right : left;
}

function sameDate(left: Date, right: Date) {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

function sortByPlanOrder(
  left: WbsCriticalPathItemInput,
  right: WbsCriticalPathItemInput,
) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, "ru");
}

function resolveDurationWorkDays(
  item: WbsCriticalPathItemInput,
  overridesByKey: Map<string, boolean>,
) {
  if (item.type === "MILESTONE") return 0;
  if (item.workDays !== null && item.workDays !== undefined && item.workDays > 0) {
    return item.workDays;
  }
  if (item.startDate && item.dueDate) {
    return Math.max(
      1,
      Math.abs(
        workingDaysInclusive(
          item.startDate,
          item.dueDate,
          item.calendarCode,
          overridesByKey,
        ),
      ),
    );
  }
  return 1;
}

function dependencyStartConstraint(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: ComputedNode,
  successor: WbsCriticalPathItemInput,
  overridesByKey: Map<string, boolean>,
) {
  if (dependency.type === "FS") {
    return addWorkingDays(
      predecessor.earlyFinishDate,
      1 + dependency.lagDays,
      successor.calendarCode,
      overridesByKey,
    );
  }
  if (dependency.type === "SS") {
    return addWorkingDays(
      predecessor.earlyStartDate,
      dependency.lagDays,
      successor.calendarCode,
      overridesByKey,
    );
  }
  return null;
}

function dependencyFinishConstraint(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: ComputedNode,
  successor: WbsCriticalPathItemInput,
  overridesByKey: Map<string, boolean>,
) {
  if (dependency.type === "FF") {
    return addWorkingDays(
      predecessor.earlyFinishDate,
      dependency.lagDays,
      successor.calendarCode,
      overridesByKey,
    );
  }
  if (dependency.type === "SF") {
    return addWorkingDays(
      predecessor.earlyStartDate,
      dependency.lagDays,
      successor.calendarCode,
      overridesByKey,
    );
  }
  return null;
}

function dependencyAllowedLateStart(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: ComputedNode,
  successor: ComputedNode,
  overridesByKey: Map<string, boolean>,
) {
  if (dependency.type === "FS") {
    const allowedFinish = addWorkingDays(
      successor.lateStartDate,
      -1 - dependency.lagDays,
      predecessor.item.calendarCode,
      overridesByKey,
    );
    return startFromFinish(
      allowedFinish,
      predecessor.durationWorkDays,
      predecessor.item.calendarCode,
      overridesByKey,
    );
  }
  if (dependency.type === "FF") {
    const allowedFinish = addWorkingDays(
      successor.lateFinishDate,
      -dependency.lagDays,
      predecessor.item.calendarCode,
      overridesByKey,
    );
    return startFromFinish(
      allowedFinish,
      predecessor.durationWorkDays,
      predecessor.item.calendarCode,
      overridesByKey,
    );
  }
  if (dependency.type === "SS") {
    return addWorkingDays(
      successor.lateStartDate,
      -dependency.lagDays,
      predecessor.item.calendarCode,
      overridesByKey,
    );
  }
  return addWorkingDays(
    successor.lateFinishDate,
    -dependency.lagDays,
    predecessor.item.calendarCode,
    overridesByKey,
  );
}

function dependencyIsTight(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: ComputedNode,
  successor: ComputedNode,
  overridesByKey: Map<string, boolean>,
) {
  const startConstraint = dependencyStartConstraint(
    dependency,
    predecessor,
    successor.item,
    overridesByKey,
  );
  if (startConstraint) {
    return sameDate(startConstraint, successor.earlyStartDate);
  }
  const finishConstraint = dependencyFinishConstraint(
    dependency,
    predecessor,
    successor.item,
    overridesByKey,
  );
  return finishConstraint ? sameDate(finishConstraint, successor.earlyFinishDate) : false;
}

function dependencyKey(dependency: {
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
}) {
  return `${dependency.predecessorId}:${dependency.successorId}:${dependency.type}`;
}

function mergeDependenciesFromPredecessorFields(
  items: WbsCriticalPathItemInput[],
  inputDependencies: WbsCriticalPathDependencyInput[],
  warnings: string[],
) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code.trim(), item]));
  const dependenciesByKey = new Map<string, WbsCriticalPathDependencyInput>();
  const dependenciesByPair = new Map<string, WbsCriticalPathDependencyInput>();

  for (const dependency of inputDependencies) {
    if (
      !itemsById.has(dependency.predecessorId) ||
      !itemsById.has(dependency.successorId) ||
      dependency.predecessorId === dependency.successorId
    ) {
      continue;
    }
    dependenciesByKey.set(dependencyKey(dependency), dependency);
    dependenciesByPair.set(
      `${dependency.predecessorId}:${dependency.successorId}`,
      dependency,
    );
  }

  for (const successor of items) {
    const predecessorCodes = PREDECESSOR_FIELDS.map((field) => successor[field])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    const predecessorIds = predecessorCodes
      .map((code) => {
        const predecessor = itemsByCode.get(code);
        if (!predecessor) {
          warnings.push(
            `Предшественник ${code} для ${successor.code} не найден в Структуре`,
          );
          return null;
        }
        return predecessor.id;
      })
      .filter((value): value is string => value !== null)
      .filter((predecessorId, index, ids) => {
        if (predecessorId === successor.id) return false;
        return ids.indexOf(predecessorId) === index;
      });

    for (const predecessorId of predecessorIds) {
      if (dependenciesByPair.has(`${predecessorId}:${successor.id}`)) {
        continue;
      }
      const dependency: WbsCriticalPathDependencyInput = {
        id: `field:${predecessorId}:${successor.id}`,
        predecessorId,
        successorId: successor.id,
        type: "FS",
        lagDays:
          predecessorIds.length === 1 ? successor.leadLagDays ?? 0 : 0,
      };
      dependenciesByKey.set(dependencyKey(dependency), dependency);
      dependenciesByPair.set(`${predecessorId}:${successor.id}`, dependency);
    }
  }

  return [...dependenciesByKey.values()];
}

export function calculateWbsCriticalPath(
  inputItems: WbsCriticalPathItemInput[],
  inputDependencies: WbsCriticalPathDependencyInput[],
  calendarOverrides: WbsCriticalPathCalendarOverride[],
): WbsCriticalPathResult {
  const warnings: string[] = [];
  const overridesByKey = buildCalendarOverrides(calendarOverrides);
  const items = [...inputItems].sort(sortByPlanOrder);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const dependencies = mergeDependenciesFromPredecessorFields(
    items,
    inputDependencies,
    warnings,
  );

  if (items.length === 0) {
    return {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [],
      criticalDependencyIds: [],
      criticalItemCount: 0,
      nearCriticalItemCount: 0,
      warnings,
      items: [],
    };
  }

  const existingDates = items
    .flatMap((item) => [item.startDate, item.dueDate])
    .filter((value): value is Date => value !== null)
    .map(startOfUtcDay);
  const projectStartDate =
    existingDates.length > 0
      ? existingDates.reduce((earliest, current) => minDate(earliest, current))
      : startOfUtcDay(new Date());

  const incomingCount = new Map(items.map((item) => [item.id, 0]));
  const incomingBySuccessor = new Map<string, WbsCriticalPathDependencyInput[]>();
  const outgoingByPredecessor = new Map<string, WbsCriticalPathDependencyInput[]>();

  for (const dependency of dependencies) {
    incomingCount.set(
      dependency.successorId,
      (incomingCount.get(dependency.successorId) ?? 0) + 1,
    );
    incomingBySuccessor.set(dependency.successorId, [
      ...(incomingBySuccessor.get(dependency.successorId) ?? []),
      dependency,
    ]);
    outgoingByPredecessor.set(dependency.predecessorId, [
      ...(outgoingByPredecessor.get(dependency.predecessorId) ?? []),
      dependency,
    ]);
  }

  const queued = new Set<string>();
  const queue = items.filter((item) => (incomingCount.get(item.id) ?? 0) === 0);
  for (const item of queue) queued.add(item.id);
  const ordered: WbsCriticalPathItemInput[] = [];

  while (queue.length > 0) {
    queue.sort(sortByPlanOrder);
    const current = queue.shift();
    if (!current) continue;
    ordered.push(current);
    for (const dependency of outgoingByPredecessor.get(current.id) ?? []) {
      const nextIncoming = (incomingCount.get(dependency.successorId) ?? 0) - 1;
      incomingCount.set(dependency.successorId, nextIncoming);
      if (nextIncoming === 0 && !queued.has(dependency.successorId)) {
        const successor = itemsById.get(dependency.successorId);
        if (successor) {
          queue.push(successor);
          queued.add(successor.id);
        }
      }
    }
  }

  if (ordered.length < items.length) {
    warnings.push("В связях Структуры есть цикл, расчет выполнен по доступной части графа");
    const orderedIds = new Set(ordered.map((item) => item.id));
    ordered.push(...items.filter((item) => !orderedIds.has(item.id)));
  }

  const computedById = new Map<string, ComputedNode>();

  for (const item of ordered) {
    const durationWorkDays = resolveDurationWorkDays(item, overridesByKey);
    let earlyStartDate = startOfUtcDay(item.startDate ?? projectStartDate);
    let requiredFinishDate: Date | null = null;

    for (const dependency of incomingBySuccessor.get(item.id) ?? []) {
      const predecessor = computedById.get(dependency.predecessorId);
      if (!predecessor) continue;
      const startConstraint = dependencyStartConstraint(
        dependency,
        predecessor,
        item,
        overridesByKey,
      );
      if (startConstraint) {
        earlyStartDate = maxDate(earlyStartDate, startConstraint);
      }
      const finishConstraint = dependencyFinishConstraint(
        dependency,
        predecessor,
        item,
        overridesByKey,
      );
      if (finishConstraint) {
        requiredFinishDate = requiredFinishDate
          ? maxDate(requiredFinishDate, finishConstraint)
          : finishConstraint;
      }
    }

    let earlyFinishDate = finishFromStart(
      earlyStartDate,
      durationWorkDays,
      item.calendarCode,
      overridesByKey,
    );

    if (requiredFinishDate && requiredFinishDate.getTime() > earlyFinishDate.getTime()) {
      const startForRequiredFinish = startFromFinish(
        requiredFinishDate,
        durationWorkDays,
        item.calendarCode,
        overridesByKey,
      );
      earlyStartDate = maxDate(earlyStartDate, startForRequiredFinish);
      earlyFinishDate = finishFromStart(
        earlyStartDate,
        durationWorkDays,
        item.calendarCode,
        overridesByKey,
      );
    }

    computedById.set(item.id, {
      item,
      durationWorkDays,
      earlyStartDate,
      earlyFinishDate,
      lateStartDate: earlyStartDate,
      lateFinishDate: earlyFinishDate,
    });
  }

  const computedNodes = [...computedById.values()];
  const projectFinishDate = computedNodes.reduce(
    (latest, node) => maxDate(latest, node.earlyFinishDate),
    computedNodes[0]?.earlyFinishDate ?? projectStartDate,
  );

  for (const item of [...ordered].reverse()) {
    const node = computedById.get(item.id);
    if (!node) continue;
    const successors = outgoingByPredecessor.get(item.id) ?? [];
    let lateStartDate = startFromFinish(
      projectFinishDate,
      node.durationWorkDays,
      item.calendarCode,
      overridesByKey,
    );

    if (successors.length > 0) {
      let constrainedLateStart: Date | null = null;
      for (const dependency of successors) {
        const successor = computedById.get(dependency.successorId);
        if (!successor) continue;
        const allowedLateStart = dependencyAllowedLateStart(
          dependency,
          node,
          successor,
          overridesByKey,
        );
        constrainedLateStart = constrainedLateStart
          ? minDate(constrainedLateStart, allowedLateStart)
          : allowedLateStart;
      }
      if (constrainedLateStart) {
        lateStartDate = constrainedLateStart;
      }
    }

    node.lateStartDate = lateStartDate;
    node.lateFinishDate = finishFromStart(
      lateStartDate,
      node.durationWorkDays,
      item.calendarCode,
      overridesByKey,
    );
  }

  const resultItems = [...computedById.values()]
    .sort((left, right) => sortByPlanOrder(left.item, right.item))
    .map((node) => {
      const totalFloatWorkDays = workingDayDistance(
        node.earlyStartDate,
        node.lateStartDate,
        node.item.calendarCode,
        overridesByKey,
      );
      const isCritical = totalFloatWorkDays <= 0;
      return {
        itemId: node.item.id,
        code: node.item.code,
        title: node.item.title,
        earlyStartDate: node.earlyStartDate,
        earlyFinishDate: node.earlyFinishDate,
        lateStartDate: node.lateStartDate,
        lateFinishDate: node.lateFinishDate,
        totalFloatWorkDays,
        isCritical,
        isNearCritical:
          !isCritical && totalFloatWorkDays <= NEAR_CRITICAL_FLOAT_DAYS,
      };
    });

  const resultItemsById = new Map(resultItems.map((item) => [item.itemId, item]));
  const tightCriticalDependencyIds = dependencies
    .filter((dependency) => {
      const predecessor = computedById.get(dependency.predecessorId);
      const successor = computedById.get(dependency.successorId);
      return (
        predecessor !== undefined &&
        successor !== undefined &&
        resultItemsById.get(dependency.predecessorId)?.isCritical &&
        resultItemsById.get(dependency.successorId)?.isCritical &&
        dependencyIsTight(dependency, predecessor, successor, overridesByKey)
      );
    })
    .map((dependency) => dependency.id);

  const criticalItemIdSet = new Set(
    resultItems
    .filter((item) => item.isCritical)
      .map((item) => item.itemId),
  );
  const criticalDependencyIdSet = new Set(tightCriticalDependencyIds);
  const upstreamQueue = [...criticalItemIdSet];
  const visitedSuccessors = new Set<string>();

  while (upstreamQueue.length > 0) {
    const successorId = upstreamQueue.shift();
    if (!successorId || visitedSuccessors.has(successorId)) continue;
    visitedSuccessors.add(successorId);
    for (const dependency of incomingBySuccessor.get(successorId) ?? []) {
      criticalDependencyIdSet.add(dependency.id);
      if (!criticalItemIdSet.has(dependency.predecessorId)) {
        criticalItemIdSet.add(dependency.predecessorId);
        upstreamQueue.push(dependency.predecessorId);
      }
    }
  }

  const criticalItemIds = resultItems
    .filter((item) => criticalItemIdSet.has(item.itemId))
    .map((item) => item.itemId);
  const criticalDependencyIds = dependencies
    .filter((dependency) => criticalDependencyIdSet.has(dependency.id))
    .map((dependency) => dependency.id);

  return {
    projectStartDate,
    projectFinishDate,
    criticalItemIds,
    criticalDependencyIds,
    criticalItemCount: criticalItemIds.length,
    nearCriticalItemCount: resultItems.filter((item) => item.isNearCritical).length,
    warnings,
    items: resultItems,
  };
}

export async function calculateProjectCriticalPath(projectId: string) {
  const [items, dependencies, calendarOverrides] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        title: true,
        type: true,
        startDate: true,
        dueDate: true,
        workDays: true,
        calendarCode: true,
        sortOrder: true,
        predecessor1: true,
        predecessor2: true,
        predecessor3: true,
        predecessor4: true,
        predecessor5: true,
        predecessor6: true,
        leadLagDays: true,
      },
    }),
    prisma.wbsDependency.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
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

  return calculateWbsCriticalPath(items, dependencies, calendarOverrides);
}
