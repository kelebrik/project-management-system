import { prisma } from "../db.js";
import { calculateWbsCriticalPath } from "./wbs-critical-path/calculate.js";
import type {
  WbsCriticalPathCalendarOverride,
  WbsCriticalPathDependencyInput,
  WbsCriticalPathItemInput,
  WbsCriticalPathResult,
} from "./wbs-critical-path/types.js";

export { calculateWbsCriticalPath } from "./wbs-critical-path/calculate.js";
export type {
  WbsCriticalPathCalendarOverride,
  WbsCriticalPathDependencyInput,
  WbsCriticalPathItem,
  WbsCriticalPathItemInput,
  WbsCriticalPathResult,
} from "./wbs-critical-path/types.js";

function criticalPathFallback(error: unknown): WbsCriticalPathResult {
  const message =
    error instanceof Error
      ? error.message
      : "Не удалось рассчитать критический путь";

  return {
    projectStartDate: null,
    projectFinishDate: null,
    criticalItemIds: [],
    criticalDependencyIds: [],
    criticalItemCount: 0,
    nearCriticalItemCount: 0,
    warnings: [`Расчет критического пути временно недоступен: ${message}`],
    items: [],
  };
}

export function safeCalculateWbsCriticalPath(
  items: WbsCriticalPathItemInput[],
  dependencies: WbsCriticalPathDependencyInput[],
  calendarOverrides: WbsCriticalPathCalendarOverride[],
  today?: Date,
) {
  try {
    return calculateWbsCriticalPath(items, dependencies, calendarOverrides, today);
  } catch (error) {
    console.error("Failed to calculate WBS critical path", error);
    return criticalPathFallback(error);
  }
}

/** The project's critical path; a plan without dates starts on today, the server's day unless the caller names it. */
export async function calculateProjectCriticalPath(projectId: string, db: Pick<typeof prisma, 'wbsItem' | 'wbsDependency' | 'projectCalendarOverride'> = prisma, today?: Date) {
  const [items, dependencies, calendarOverrides] = await Promise.all([
    db.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        id: true,
        parentId: true,
        code: true,
        title: true,
        type: true,
        status: true,
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
    db.wbsDependency.findMany({
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
    db.projectCalendarOverride.findMany({
      where: { projectId },
      select: {
        calendarCode: true,
        date: true,
        isWorkingDay: true,
      },
    }),
  ]);

  return safeCalculateWbsCriticalPath(items, dependencies, calendarOverrides, today);
}
