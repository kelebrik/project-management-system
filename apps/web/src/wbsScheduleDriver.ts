export type WbsScheduleDriver = "dates" | "workDays";

export type WbsScheduleComparablePayload = {
  startDate?: string | null;
  dueDate?: string | null;
  forecastStartDate?: string | null;
  forecastDueDate?: string | null;
  workDays?: number | null;
};

export function inferWbsScheduleDriver(
  currentPayload: WbsScheduleComparablePayload | null,
  nextPayload: WbsScheduleComparablePayload,
): WbsScheduleDriver | undefined {
  if (!currentPayload) return undefined;

  const datesChanged =
    nextPayload.startDate !== currentPayload.startDate ||
    nextPayload.dueDate !== currentPayload.dueDate ||
    nextPayload.forecastStartDate !== currentPayload.forecastStartDate ||
    nextPayload.forecastDueDate !== currentPayload.forecastDueDate;

  if (datesChanged) return "dates";
  if (nextPayload.workDays !== currentPayload.workDays) return "workDays";
  return undefined;
}
