import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";

export const emptyPredecessors = {
  predecessor1: null,
  predecessor2: null,
  predecessor3: null,
  predecessor4: null,
  predecessor5: null,
  predecessor6: null,
};

export function applyTestScheduleUpdates<T extends { id: string }>(
  items: T[],
  updates: ReturnType<typeof calculateWbsScheduleUpdates>,
) {
  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return items.map((item) => {
    const update = updatesById.get(item.id);
    if (!update) return item;
    return {
      ...item,
      startDate: update.startDate,
      dueDate: update.dueDate,
      forecastStartDate: update.forecastStartDate,
      forecastDueDate: update.forecastDueDate,
      workDays: update.workDays,
      calendarDays: update.calendarDays,
    };
  });
}
