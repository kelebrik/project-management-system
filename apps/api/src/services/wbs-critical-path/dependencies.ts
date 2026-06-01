import type { WbsDependencyType } from "@prisma/client";
import { addWorkingDays } from "./calendar.js";
import { sameDate, startFromFinish } from "./dates.js";
import type {
  WbsCriticalPathComputedNode,
  WbsCriticalPathDependencyInput,
  WbsCriticalPathItemInput,
} from "./types.js";

const PREDECESSOR_FIELDS = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

function dependencyKey(dependency: {
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
}) {
  return `${dependency.predecessorId}:${dependency.successorId}:${dependency.type}`;
}

export function dependencyStartConstraint(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: WbsCriticalPathComputedNode,
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

export function dependencyFinishConstraint(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: WbsCriticalPathComputedNode,
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

export function dependencyAllowedLateStart(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: WbsCriticalPathComputedNode,
  successor: WbsCriticalPathComputedNode,
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

export function dependencyIsTight(
  dependency: WbsCriticalPathDependencyInput,
  predecessor: WbsCriticalPathComputedNode,
  successor: WbsCriticalPathComputedNode,
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

export function mergeDependenciesFromPredecessorFields(
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
        lagDays: predecessorIds.length === 1 ? successor.leadLagDays ?? 0 : 0,
      };
      dependenciesByKey.set(dependencyKey(dependency), dependency);
      dependenciesByPair.set(`${predecessorId}:${successor.id}`, dependency);
    }
  }

  return [...dependenciesByKey.values()];
}
