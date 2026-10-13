import type { WbsLinkType } from "../wbs-predecessors.js";
import {
  addWorkingDays,
  buildCalendarOverrides,
  signedWorkingDaysInclusive,
  workingDayDistance,
  type CalendarOverrides,
  type ScheduleCalendarCode,
  type ScheduleCalendarOverride,
} from "./calendar.js";
import { isWbsZeroDurationItem, sortByPlanOrder } from "./hierarchy.js";
import { PlanQueue } from "./plan-queue.js";
import { dayNumber, plainDate, type PlainDate } from "./plain-date.js";
import type { ScheduleItemStatus, ScheduleItemType } from "./types.js";

const NEAR_CRITICAL_FLOAT_DAYS = 5;
const FAILURE = "Не удалось рассчитать рабочие дни критического пути";

export type CriticalPathItemInput = {
  id: string;
  code: string;
  title: string;
  type: ScheduleItemType;
  status?: ScheduleItemStatus;
  startDate: PlainDate | null;
  dueDate: PlainDate | null;
  workDays: number | null;
  calendarCode: ScheduleCalendarCode;
  sortOrder: number;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
  leadLagDays?: number | null;
};

export type CriticalPathDependencyInput = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: WbsLinkType;
  lagDays: number;
};

export type CriticalPathItem = {
  itemId: string;
  code: string;
  title: string;
  earlyStartDate: PlainDate;
  earlyFinishDate: PlainDate;
  lateStartDate: PlainDate;
  lateFinishDate: PlainDate;
  totalFloatWorkDays: number;
  isCritical: boolean;
  isNearCritical: boolean;
};

export type CriticalPathResult = {
  projectStartDate: PlainDate | null;
  projectFinishDate: PlainDate | null;
  criticalItemIds: string[];
  criticalDependencyIds: string[];
  criticalItemCount: number;
  nearCriticalItemCount: number;
  warnings: string[];
  items: CriticalPathItem[];
};

type Item = Omit<CriticalPathItemInput, "startDate" | "dueDate"> & { startDate: number | null; dueDate: number | null };
type Node = { item: Item; durationWorkDays: number; earlyStart: number; earlyFinish: number; lateStart: number; lateFinish: number };

const PREDECESSOR_FIELDS = ["predecessor1", "predecessor2", "predecessor3", "predecessor4", "predecessor5", "predecessor6"] as const;

function finishFromStart(start: number, durationWorkDays: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  if (durationWorkDays <= 1) return start;
  return addWorkingDays(start, durationWorkDays - 1, calendarCode, overrides, FAILURE);
}

function startFromFinish(finish: number, durationWorkDays: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  if (durationWorkDays <= 1) return finish;
  return addWorkingDays(finish, -(durationWorkDays - 1), calendarCode, overrides, FAILURE);
}

function resolveDurationWorkDays(item: Item, overrides: CalendarOverrides) {
  if (isWbsZeroDurationItem(item)) return 0;
  if (item.workDays !== null && item.workDays !== undefined) return Math.max(0, item.workDays);
  if (item.startDate !== null && item.dueDate !== null) {
    return Math.max(1, Math.abs(signedWorkingDaysInclusive(item.startDate, item.dueDate, item.calendarCode, overrides)));
  }
  return 1;
}

function dependencyKey(dependency: { predecessorId: string; successorId: string; type: WbsLinkType }) {
  return `${dependency.predecessorId}:${dependency.successorId}:${dependency.type}`;
}

function startConstraint(dependency: CriticalPathDependencyInput, predecessor: Node, successor: Item, overrides: CalendarOverrides) {
  if (dependency.type === "FS") return addWorkingDays(predecessor.earlyFinish, 1 + dependency.lagDays, successor.calendarCode, overrides, FAILURE);
  if (dependency.type === "SS") return addWorkingDays(predecessor.earlyStart, dependency.lagDays, successor.calendarCode, overrides, FAILURE);
  return null;
}

function finishConstraint(dependency: CriticalPathDependencyInput, predecessor: Node, successor: Item, overrides: CalendarOverrides) {
  if (dependency.type === "FF") return addWorkingDays(predecessor.earlyFinish, dependency.lagDays, successor.calendarCode, overrides, FAILURE);
  if (dependency.type === "SF") return addWorkingDays(predecessor.earlyStart, dependency.lagDays, successor.calendarCode, overrides, FAILURE);
  return null;
}

function allowedLateStart(dependency: CriticalPathDependencyInput, predecessor: Node, successor: Node, overrides: CalendarOverrides) {
  const code = predecessor.item.calendarCode;
  if (dependency.type === "FS") {
    const allowedFinish = addWorkingDays(successor.lateStart, -1 - dependency.lagDays, code, overrides, FAILURE);
    return startFromFinish(allowedFinish, predecessor.durationWorkDays, code, overrides);
  }
  if (dependency.type === "FF") {
    const allowedFinish = addWorkingDays(successor.lateFinish, -dependency.lagDays, code, overrides, FAILURE);
    return startFromFinish(allowedFinish, predecessor.durationWorkDays, code, overrides);
  }
  if (dependency.type === "SS") return addWorkingDays(successor.lateStart, -dependency.lagDays, code, overrides, FAILURE);
  return addWorkingDays(successor.lateFinish, -dependency.lagDays, code, overrides, FAILURE);
}

function dependencyIsTight(dependency: CriticalPathDependencyInput, predecessor: Node, successor: Node, overrides: CalendarOverrides) {
  const start = startConstraint(dependency, predecessor, successor.item, overrides);
  if (start !== null) return start === successor.earlyStart;
  const finish = finishConstraint(dependency, predecessor, successor.item, overrides);
  return finish !== null ? finish === successor.earlyFinish : false;
}

/** Links from the link table, plus finish-to-start links the predecessor columns name that the table lacks. */
function mergeDependenciesFromPredecessorFields(items: Item[], inputDependencies: CriticalPathDependencyInput[], warnings: string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code.trim(), item]));
  const dependenciesByKey = new Map<string, CriticalPathDependencyInput>();
  const dependenciesByPair = new Map<string, CriticalPathDependencyInput>();
  for (const dependency of inputDependencies) {
    if (!itemsById.has(dependency.predecessorId) || !itemsById.has(dependency.successorId) || dependency.predecessorId === dependency.successorId) continue;
    dependenciesByKey.set(dependencyKey(dependency), dependency);
    dependenciesByPair.set(`${dependency.predecessorId}:${dependency.successorId}`, dependency);
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
          warnings.push(`Предшественник ${code} для ${successor.code} не найден в Структуре`);
          return null;
        }
        return predecessor.id;
      })
      .filter((value): value is string => value !== null)
      .filter((predecessorId, index, ids) => predecessorId !== successor.id && ids.indexOf(predecessorId) === index);
    for (const predecessorId of predecessorIds) {
      if (dependenciesByPair.has(`${predecessorId}:${successor.id}`)) continue;
      const dependency: CriticalPathDependencyInput = {
        id: `field:${predecessorId}:${successor.id}`,
        predecessorId,
        successorId: successor.id,
        type: "FS",
        lagDays: predecessorIds.length === 1 ? successor.leadLagDays ?? 0 : 0,
      };
      dependenciesByKey.set(dependencyKey(dependency), dependency);
      dependenciesByPair.set(`${predecessorId}:${successor.id}`, dependency);
    }
  }
  return [...dependenciesByKey.values()];
}

function orderItemsTopologically(items: Item[], dependencies: CriticalPathDependencyInput[], warnings: string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const incomingCount = new Map(items.map((item) => [item.id, 0]));
  const outgoingByPredecessor = new Map<string, CriticalPathDependencyInput[]>();
  for (const dependency of dependencies) {
    incomingCount.set(dependency.successorId, (incomingCount.get(dependency.successorId) ?? 0) + 1);
    const outgoing = outgoingByPredecessor.get(dependency.predecessorId);
    if (outgoing) outgoing.push(dependency);
    else outgoingByPredecessor.set(dependency.predecessorId, [dependency]);
  }
  const queued = new Set<string>();
  const queue = new PlanQueue<Item>(sortByPlanOrder);
  for (const item of items) {
    if ((incomingCount.get(item.id) ?? 0) !== 0) continue;
    queue.push(item);
    queued.add(item.id);
  }
  const ordered: Item[] = [];
  for (let current = queue.take(); current; current = queue.take()) {
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

function forwardPass(ordered: Item[], projectStart: number, incomingBySuccessor: Map<string, CriticalPathDependencyInput[]>, overrides: CalendarOverrides) {
  const computedById = new Map<string, Node>();
  for (const item of ordered) {
    const durationWorkDays = resolveDurationWorkDays(item, overrides);
    let earlyStart = item.startDate ?? projectStart;
    let requiredFinish: number | null = null;
    for (const dependency of incomingBySuccessor.get(item.id) ?? []) {
      const predecessor = computedById.get(dependency.predecessorId);
      if (!predecessor) continue;
      const start = startConstraint(dependency, predecessor, item, overrides);
      if (start !== null) earlyStart = Math.max(earlyStart, start);
      const finish = finishConstraint(dependency, predecessor, item, overrides);
      if (finish !== null) requiredFinish = requiredFinish === null ? finish : Math.max(requiredFinish, finish);
    }
    let earlyFinish = finishFromStart(earlyStart, durationWorkDays, item.calendarCode, overrides);
    if (requiredFinish !== null && requiredFinish > earlyFinish) {
      earlyStart = Math.max(earlyStart, startFromFinish(requiredFinish, durationWorkDays, item.calendarCode, overrides));
      earlyFinish = finishFromStart(earlyStart, durationWorkDays, item.calendarCode, overrides);
    }
    computedById.set(item.id, { item, durationWorkDays, earlyStart, earlyFinish, lateStart: earlyStart, lateFinish: earlyFinish });
  }
  return computedById;
}

function backwardPass(
  ordered: Item[],
  projectFinish: number,
  computedById: Map<string, Node>,
  outgoingByPredecessor: Map<string, CriticalPathDependencyInput[]>,
  overrides: CalendarOverrides,
) {
  for (const item of [...ordered].reverse()) {
    const node = computedById.get(item.id);
    if (!node) continue;
    let lateStart = startFromFinish(projectFinish, node.durationWorkDays, item.calendarCode, overrides);
    let constrainedLateStart: number | null = null;
    for (const dependency of outgoingByPredecessor.get(item.id) ?? []) {
      const successor = computedById.get(dependency.successorId);
      if (!successor) continue;
      const allowed = allowedLateStart(dependency, node, successor, overrides);
      constrainedLateStart = constrainedLateStart === null ? allowed : Math.min(constrainedLateStart, allowed);
    }
    if (constrainedLateStart !== null) lateStart = constrainedLateStart;
    node.lateStart = lateStart;
    node.lateFinish = finishFromStart(lateStart, node.durationWorkDays, item.calendarCode, overrides);
  }
}

function emptyResult(warnings: string[]): CriticalPathResult {
  return { projectStartDate: null, projectFinishDate: null, criticalItemIds: [], criticalDependencyIds: [], criticalItemCount: 0, nearCriticalItemCount: 0, warnings, items: [] };
}

/**
 * The critical path of a Structure: early and late dates of every row, its
 * float in working days, and the rows and links that hold the finish. A plan
 * without any date starts today, which the caller passes so the server and
 * the browser agree on it.
 */
export function calculateCriticalPath(
  inputItems: CriticalPathItemInput[],
  inputDependencies: CriticalPathDependencyInput[],
  calendarOverrides: ScheduleCalendarOverride[],
  today: PlainDate,
): CriticalPathResult {
  const warnings: string[] = [];
  const overrides = buildCalendarOverrides(calendarOverrides);
  const items: Item[] = inputItems
    .map((item) => ({ ...item, startDate: item.startDate === null ? null : dayNumber(item.startDate), dueDate: item.dueDate === null ? null : dayNumber(item.dueDate) }))
    .sort(sortByPlanOrder);
  const dependencies = mergeDependenciesFromPredecessorFields(items, inputDependencies, warnings);
  if (items.length === 0) return emptyResult(warnings);

  const existingDays = items.flatMap((item) => [item.startDate, item.dueDate]).filter((day): day is number => day !== null);
  const projectStart = existingDays.length > 0 ? existingDays.reduce((earliest, day) => Math.min(earliest, day)) : dayNumber(today);
  const incomingBySuccessor = new Map<string, CriticalPathDependencyInput[]>();
  for (const dependency of dependencies) {
    const incoming = incomingBySuccessor.get(dependency.successorId);
    if (incoming) incoming.push(dependency);
    else incomingBySuccessor.set(dependency.successorId, [dependency]);
  }
  const { ordered, outgoingByPredecessor } = orderItemsTopologically(items, dependencies, warnings);
  const computedById = forwardPass(ordered, projectStart, incomingBySuccessor, overrides);
  const computedNodes = [...computedById.values()];
  const projectFinish = computedNodes.reduce((latest, node) => Math.max(latest, node.earlyFinish), computedNodes[0]?.earlyFinish ?? projectStart);
  backwardPass(ordered, projectFinish, computedById, outgoingByPredecessor, overrides);

  const resultItems = [...computedById.values()]
    .sort((left, right) => sortByPlanOrder(left.item, right.item))
    .map((node) => {
      const totalFloatWorkDays = workingDayDistance(node.earlyStart, node.lateStart, node.item.calendarCode, overrides);
      const isCritical = totalFloatWorkDays <= 0;
      return {
        itemId: node.item.id,
        code: node.item.code,
        title: node.item.title,
        earlyStartDate: plainDate(node.earlyStart),
        earlyFinishDate: plainDate(node.earlyFinish),
        lateStartDate: plainDate(node.lateStart),
        lateFinishDate: plainDate(node.lateFinish),
        totalFloatWorkDays,
        isCritical,
        isNearCritical: !isCritical && totalFloatWorkDays <= NEAR_CRITICAL_FLOAT_DAYS,
      };
    });

  const criticalItemIdSet = new Set(resultItems.filter((item) => item.isCritical).map((item) => item.itemId));
  const criticalDependencyIdSet = new Set(
    dependencies
      .filter((dependency) => {
        const predecessor = computedById.get(dependency.predecessorId);
        const successor = computedById.get(dependency.successorId);
        return (
          predecessor !== undefined &&
          successor !== undefined &&
          criticalItemIdSet.has(dependency.predecessorId) &&
          criticalItemIdSet.has(dependency.successorId) &&
          dependencyIsTight(dependency, predecessor, successor, overrides)
        );
      })
      .map((dependency) => dependency.id),
  );
  // Everything upstream of a critical row holds the finish too.
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

  const criticalItemIds = resultItems.filter((item) => criticalItemIdSet.has(item.itemId)).map((item) => item.itemId);
  const criticalDependencyIds = dependencies.filter((dependency) => criticalDependencyIdSet.has(dependency.id)).map((dependency) => dependency.id);
  return {
    projectStartDate: plainDate(projectStart),
    projectFinishDate: plainDate(projectFinish),
    criticalItemIds,
    criticalDependencyIds,
    criticalItemCount: criticalItemIds.length,
    nearCriticalItemCount: resultItems.filter((item) => item.isNearCritical).length,
    warnings,
    items: resultItems,
  };
}
