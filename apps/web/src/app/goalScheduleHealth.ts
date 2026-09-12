import type { WbsItem } from "./domainTypes";
import { signedDaysBetween, startOfDay } from "./dateUtils";

export type GoalScheduleHealth = "done" | "late-warning" | "late-danger" | "done-late-warning" | "done-late-danger" | "risk" | "neutral";

export function goalScheduleHealth(item: Pick<WbsItem, "status" | "baselineDueDate"> & { dueDate: string | null; forecastDueDate?: string | null; delayDays?: number | null }): GoalScheduleHealth {
  const resolve = (delayDays: number | null) => {
    if (delayDays !== null && delayDays >= 6) return item.status === "DONE" ? "done-late-danger" : "late-danger";
    if (delayDays !== null && delayDays > 0) return item.status === "DONE" ? "done-late-warning" : "late-warning";
    return item.status === "DONE" ? "done" : item.status === "AT_RISK" || item.status === "BLOCKED" ? "risk" : "neutral";
  };
  if (item.delayDays !== undefined) return resolve(item.delayDays ?? null);
  const baseline = item.baselineDueDate ? startOfDay(new Date(item.baselineDueDate)) : null;
  const actual = item.dueDate ?? item.forecastDueDate;
  const forecast = actual ? startOfDay(new Date(actual)) : null;
  return resolve(baseline && forecast && !Number.isNaN(baseline.getTime()) && !Number.isNaN(forecast.getTime()) ? signedDaysBetween(baseline, forecast) : null);
}
