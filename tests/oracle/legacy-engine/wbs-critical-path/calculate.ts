import { buildCalendarOverrides, startOfUtcDay, workingDayDistance } from "./calendar.js";
import {
  finishFromStart,
  maxDate,
  minDate,
  resolveDurationWorkDays,
  sortByPlanOrder,
  startFromFinish,
} from "./dates.js";
import {
  dependencyAllowedLateStart,
  dependencyFinishConstraint,
  dependencyIsTight,
  dependencyStartConstraint,
  mergeDependenciesFromPredecessorFields,
} from "./dependencies.js";
import type {
  WbsCriticalPathCalendarOverride,
  WbsCriticalPathComputedNode,
  WbsCriticalPathDependencyInput,
  WbsCriticalPathItemInput,
  WbsCriticalPathResult,
} from "./types.js";

const NEAR_CRITICAL_FLOAT_DAYS = 5;

function emptyCriticalPathResult(warnings: string[]): WbsCriticalPathResult {
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

function orderItemsTopologically(
  items: WbsCriticalPathItemInput[],
  dependencies: WbsCriticalPathDependencyInput[],
  warnings: string[],
) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const incomingCount = new Map(items.map((item) => [item.id, 0]));
  const outgoingByPredecessor = new Map<string, WbsCriticalPathDependencyInput[]>();

  for (const dependency of dependencies) {
    incomingCount.set(
      dependency.successorId,
      (incomingCount.get(dependency.successorId) ?? 0) + 1,
    );
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

  return { ordered, outgoingByPredecessor };
}

function buildIncomingDependencies(
  dependencies: WbsCriticalPathDependencyInput[],
) {
  const incomingBySuccessor = new Map<string, WbsCriticalPathDependencyInput[]>();
  for (const dependency of dependencies) {
    incomingBySuccessor.set(dependency.successorId, [
      ...(incomingBySuccessor.get(dependency.successorId) ?? []),
      dependency,
    ]);
  }
  return incomingBySuccessor;
}

function resolveProjectStartDate(items: WbsCriticalPathItemInput[]) {
  const existingDates = items
    .flatMap((item) => [item.startDate, item.dueDate])
    .filter((value): value is Date => value !== null)
    .map(startOfUtcDay);
  return existingDates.length > 0
    ? existingDates.reduce((earliest, current) => minDate(earliest, current))
    : startOfUtcDay(new Date());
}

function calculateForwardPass(
  ordered: WbsCriticalPathItemInput[],
  projectStartDate: Date,
  incomingBySuccessor: Map<string, WbsCriticalPathDependencyInput[]>,
  overridesByKey: Map<string, boolean>,
) {
  const computedById = new Map<string, WbsCriticalPathComputedNode>();

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

  return computedById;
}

function calculateBackwardPass(
  ordered: WbsCriticalPathItemInput[],
  projectFinishDate: Date,
  computedById: Map<string, WbsCriticalPathComputedNode>,
  outgoingByPredecessor: Map<string, WbsCriticalPathDependencyInput[]>,
  overridesByKey: Map<string, boolean>,
) {
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
}

function buildCriticalSets(
  dependencies: WbsCriticalPathDependencyInput[],
  incomingBySuccessor: Map<string, WbsCriticalPathDependencyInput[]>,
  computedById: Map<string, WbsCriticalPathComputedNode>,
  resultItemsById: Map<string, { isCritical: boolean }>,
  overridesByKey: Map<string, boolean>,
) {
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
    [...resultItemsById.entries()]
      .filter(([, item]) => item.isCritical)
      .map(([itemId]) => itemId),
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

  return { criticalItemIdSet, criticalDependencyIdSet };
}

export function calculateWbsCriticalPath(
  inputItems: WbsCriticalPathItemInput[],
  inputDependencies: WbsCriticalPathDependencyInput[],
  calendarOverrides: WbsCriticalPathCalendarOverride[],
): WbsCriticalPathResult {
  const warnings: string[] = [];
  const overridesByKey = buildCalendarOverrides(calendarOverrides);
  const items = [...inputItems].sort(sortByPlanOrder);
  const dependencies = mergeDependenciesFromPredecessorFields(
    items,
    inputDependencies,
    warnings,
  );

  if (items.length === 0) {
    return emptyCriticalPathResult(warnings);
  }

  const projectStartDate = resolveProjectStartDate(items);
  const incomingBySuccessor = buildIncomingDependencies(dependencies);
  const { ordered, outgoingByPredecessor } = orderItemsTopologically(
    items,
    dependencies,
    warnings,
  );
  const computedById = calculateForwardPass(
    ordered,
    projectStartDate,
    incomingBySuccessor,
    overridesByKey,
  );
  const computedNodes = [...computedById.values()];
  const projectFinishDate = computedNodes.reduce(
    (latest, node) => maxDate(latest, node.earlyFinishDate),
    computedNodes[0]?.earlyFinishDate ?? projectStartDate,
  );

  calculateBackwardPass(
    ordered,
    projectFinishDate,
    computedById,
    outgoingByPredecessor,
    overridesByKey,
  );

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
  const { criticalItemIdSet, criticalDependencyIdSet } = buildCriticalSets(
    dependencies,
    incomingBySuccessor,
    computedById,
    resultItemsById,
    overridesByKey,
  );

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
