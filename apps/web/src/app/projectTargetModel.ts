import type { ProjectDetails, WbsItem } from "./domainTypes";
import { signedDaysBetween, startOfDay } from "./dateUtils";

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = startOfDay(new Date(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function maxDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

function compareWbsPlanOrder(left: WbsItem, right: WbsItem) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, "ru");
}

export function findActiveProjectGoal(wbsItems: WbsItem[]) {
  const goals = wbsItems
    .filter((item) => item.type === "GOAL" && item.status !== "CANCELLED")
    .sort(compareWbsPlanOrder);
  return goals.find((item) => item.status !== "DONE") ?? goals.at(-1) ?? null;
}

export function createProjectTargetSummary(project: ProjectDetails | null) {
  if (!project) return null;
  const activeGoal = findActiveProjectGoal(project.wbsItems);
  const initialTargetDate = validDate(
    activeGoal?.baselineDueDate ?? project.initialTargetDate ?? project.targetDate,
  );
  const currentTargetDate = validDate(activeGoal?.dueDate ?? project.targetDate);
  const forecastFinishDate = activeGoal
    ? validDate(activeGoal.forecastDueDate ?? activeGoal.dueDate)
    : maxDate(
        project.wbsItems
          .map((item) => validDate(item.forecastDueDate ?? item.dueDate))
          .filter((item): item is Date => item !== null),
      );

  return {
    activeGoal: activeGoal
      ? {
          id: activeGoal.id,
          code: activeGoal.code,
          title: activeGoal.title,
          status: activeGoal.status,
        }
      : null,
    initialTargetDate,
    currentTargetDate,
    forecastFinishDate,
    targetChangeDays:
      initialTargetDate && currentTargetDate
        ? signedDaysBetween(initialTargetDate, currentTargetDate)
        : null,
    effectiveDelayDays:
      currentTargetDate && forecastFinishDate
        ? signedDaysBetween(currentTargetDate, forecastFinishDate)
        : null,
    totalVarianceDays:
      initialTargetDate && forecastFinishDate
        ? signedDaysBetween(initialTargetDate, forecastFinishDate)
        : null,
  };
}

export function signedDaysLabel(value: number | null) {
  if (value === null) return "не рассчитано";
  if (value > 0) return `+${value} дн.`;
  if (value < 0) return `${value} дн.`;
  return "0 дн.";
}

export function signedDateDeltaDays(from: string | null, to: string | null) {
  const fromDate = validDate(from);
  const toDate = validDate(to);
  if (!fromDate || !toDate) return null;
  return signedDaysBetween(fromDate, toDate);
}
