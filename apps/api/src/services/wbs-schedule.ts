import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
import type { WbsScheduleCalculationOptions } from "./wbs-schedule/types.js";

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

  const beforeById = new Map(items.map((item) => [item.id, item]));
  const historyRow = (item: typeof items[number]) => ({
    id: item.id, code: item.code, title: item.title, status: item.status, owner: item.owner,
    startDate: item.startDate, dueDate: item.dueDate, forecastDueDate: item.forecastDueDate,
    baselineDueDate: item.baselineDueDate, progress: item.progress,
  });
  await prisma.$transaction([
    ...updates.map((update) => prisma.wbsItem.update({
      where: { id: update.id },
      data: { startDate: update.startDate, dueDate: update.dueDate,
        forecastStartDate: update.forecastStartDate, forecastDueDate: update.forecastDueDate,
        workDays: update.workDays, calendarDays: update.calendarDays },
    })),
    prisma.wbsCommand.create({ data: {
      projectId, type: "BULK_UPDATE", payload: { automaticSchedule: true },
      beforeSnapshot: JSON.parse(JSON.stringify(updates.map((update) => historyRow(beforeById.get(update.id)!)))) as Prisma.InputJsonValue,
      afterSnapshot: JSON.parse(JSON.stringify(updates.map((update) => historyRow({ ...beforeById.get(update.id)!, ...update })))) as Prisma.InputJsonValue,
    } }),
  ]);

  return updates.length;
}
