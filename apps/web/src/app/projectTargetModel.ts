import type { ProjectDetails } from "./domainTypes";
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

export function createProjectTargetSummary(project: ProjectDetails | null) {
  if (!project) return null;
  const initialTargetDate = validDate(project.initialTargetDate ?? project.targetDate);
  const currentTargetDate = validDate(project.targetDate);
  const forecastFinishDate = maxDate(
    project.wbsItems
      .map((item) => validDate(item.forecastDueDate ?? item.dueDate))
      .filter((item): item is Date => item !== null),
  );

  return {
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
