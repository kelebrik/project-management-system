import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
import type { WbsScheduleCalculationOptions } from "./wbs-schedule/types.js";
import { bulkUpdateWbsItems } from "./wbs-bulk-write.js";
import { STRUCTURE_WRITE_TIMEOUT_MS, type StructureDb } from "./wbs-structure-write.js";

export { calculateWbsBaselineVariance } from "./wbs-schedule/baseline-variance.js";
export { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
export type {
  WbsBaselineVarianceDependency,
  WbsBaselineVarianceItem,
  WbsBaselineVarianceResult,
  WbsBaselineVarianceRootCause,
  WbsScheduleCalculationOptions,
  WbsScheduleCalendarOverride,
  WbsScheduleDependency,
  WbsScheduleItem,
  WbsScheduleUpdate,
} from "./wbs-schedule/types.js";

const SCHEDULE_COLUMNS = {
  id: true, parentId: true, code: true, title: true, type: true, status: true, owner: true, progress: true,
  startDate: true, dueDate: true, forecastStartDate: true, forecastDueDate: true, baselineDueDate: true,
  predecessor1: true, predecessor2: true, predecessor3: true, predecessor4: true, predecessor5: true, predecessor6: true,
  leadLagDays: true, workDays: true, calendarDays: true, calendarCode: true, wbsLevel: true, sortOrder: true,
} satisfies Prisma.WbsItemSelect;

export async function recalculateProjectWbsSchedule(
  projectId: string,
  options: WbsScheduleCalculationOptions = {},
  db?: StructureDb,
): Promise<number> {
  if (!db) return prisma.$transaction((tx) => recalculateProjectWbsSchedule(projectId, options, tx), { timeout: STRUCTURE_WRITE_TIMEOUT_MS });
  const [items, dependencies, calendarOverrides] = await Promise.all([
    // Only what the schedule and the history row read: a 5000-row project loads a fraction of its data.
    db.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: SCHEDULE_COLUMNS,
    }),
    db.wbsDependency.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
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

  const updates = calculateWbsScheduleUpdates(
    items,
    dependencies,
    calendarOverrides,
    options,
  );
  if (updates.length === 0) return 0;

  const beforeById = new Map(items.map((item) => [item.id, item]));
  const historyRow = (item: typeof items[number]) => ({
    id: item.id, code: item.code, title: item.title, status: item.status, owner: item.owner,
    startDate: item.startDate, dueDate: item.dueDate, forecastDueDate: item.forecastDueDate,
    baselineDueDate: item.baselineDueDate, progress: item.progress,
  });
  await bulkUpdateWbsItems(
    db,
    projectId,
    updates.map((update) => ({ ...update })),
    ["startDate", "dueDate", "forecastStartDate", "forecastDueDate", "workDays", "calendarDays"],
  );
  await db.wbsCommand.create({ data: {
    projectId, type: "BULK_UPDATE", payload: { automaticSchedule: true },
    beforeSnapshot: JSON.parse(JSON.stringify(updates.map((update) => historyRow(beforeById.get(update.id)!)))) as Prisma.InputJsonValue,
    afterSnapshot: JSON.parse(JSON.stringify(updates.map((update) => historyRow({ ...beforeById.get(update.id)!, ...update })))) as Prisma.InputJsonValue,
  } });

  return updates.length;
}
