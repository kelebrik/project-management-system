import { prisma } from "../db.js";
import { calculateWbsCriticalPath } from "./wbs-critical-path/calculate.js";

export { calculateWbsCriticalPath } from "./wbs-critical-path/calculate.js";
export type {
  WbsCriticalPathCalendarOverride,
  WbsCriticalPathDependencyInput,
  WbsCriticalPathItem,
  WbsCriticalPathItemInput,
  WbsCriticalPathResult,
} from "./wbs-critical-path/types.js";

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
