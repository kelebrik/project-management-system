import type { WbsItem } from "./domainTypes";
import { signedDaysBetween, startOfDay } from "./dateUtils";

export type GoalScheduleHealth = "done" | "late" | "risk" | "neutral";

export function goalScheduleHealth(item: Pick<WbsItem, "status" | "baselineDueDate"> & { dueDate: string | null; forecastDueDate?: string | null; delayDays?: number | null }): GoalScheduleHealth {
  if (item.status === "DONE") return "done";
  if (item.delayDays !== undefined) return item.delayDays !== null && item.delayDays > 0 ? "late" : item.status === "AT_RISK" || item.status === "BLOCKED" ? "risk" : "neutral";
  const baseline = item.baselineDueDate ? startOfDay(new Date(item.baselineDueDate)) : null;
  const actual = item.dueDate ?? item.forecastDueDate;
  const forecast = actual ? startOfDay(new Date(actual)) : null;
  if (baseline && forecast && !Number.isNaN(baseline.getTime()) && !Number.isNaN(forecast.getTime()) && signedDaysBetween(baseline, forecast) > 0) return "late";
  if (item.status === "AT_RISK" || item.status === "BLOCKED") return "risk";
  return "neutral";
}
