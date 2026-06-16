import type { WbsItem } from "./domainTypes";
import { wbsToForm, type WbsFormState } from "./formState";

const DAY_MS = 86_400_000;

export type WorkSummaryWeekRange = {
  start: Date;
  endExclusive: Date;
  endInclusive: Date;
};

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseLocalDate(value: string | null) {
  if (!value) return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function dateInRange(value: string | null, start: Date, endExclusive: Date) {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) return false;
  const date = startOfLocalDay(parsedDate);
  return date >= start && date < endExclusive;
}

function workTaskDateTime(value: string | null) {
  return parseLocalDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function taskDraft(item: WbsItem, wbsDrafts: Record<string, WbsFormState>) {
  return wbsDrafts[item.id] ?? wbsToForm(item);
}

export function weekRange(
  offsetWeeks: number,
  today = new Date(),
): WorkSummaryWeekRange {
  const currentDay = startOfLocalDay(today);
  const mondayBasedDay = (currentDay.getDay() + 6) % 7;
  const start = new Date(
    currentDay.getTime() + (offsetWeeks * 7 - mondayBasedDay) * DAY_MS,
  );
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  const endInclusive = new Date(endExclusive.getTime() - DAY_MS);
  return { start, endExclusive, endInclusive };
}

export function compareWorkTasks(
  left: WbsItem,
  right: WbsItem,
  wbsDrafts: Record<string, WbsFormState>,
) {
  const leftDraft = taskDraft(left, wbsDrafts);
  const rightDraft = taskDraft(right, wbsDrafts);
  return (
    workTaskDateTime(leftDraft.startDate) - workTaskDateTime(rightDraft.startDate) ||
    workTaskDateTime(leftDraft.dueDate) - workTaskDateTime(rightDraft.dueDate) ||
    left.sortOrder - right.sortOrder ||
    left.code.localeCompare(right.code, "ru")
  );
}

export function createWorkSummaryData(
  items: WbsItem[],
  wbsDrafts: Record<string, WbsFormState>,
  today = new Date(),
) {
  const currentWeek = weekRange(0, today);
  const nextWeek = weekRange(1, today);
  const allTasks = items
    .filter((item) => item.type === "TASK")
    .sort((left, right) => compareWorkTasks(left, right, wbsDrafts));
  const currentTasks = allTasks.filter((item) => {
    const draft = taskDraft(item, wbsDrafts);
    return (
      draft.status === "IN_PROGRESS" ||
      draft.status === "IN_REVIEW" ||
      (draft.status === "NOT_STARTED" &&
        dateInRange(
          draft.startDate,
          currentWeek.start,
          currentWeek.endExclusive,
        ))
    );
  });
  const tasksStartingNextWeek = allTasks.filter((item) => {
    const draft = taskDraft(item, wbsDrafts);
    return (
      draft.status !== "DONE" &&
      draft.status !== "CANCELLED" &&
      dateInRange(draft.startDate, nextWeek.start, nextWeek.endExclusive)
    );
  });
  return {
    currentWeek,
    nextWeek,
    currentTasks,
    tasksStartingNextWeek,
  };
}
