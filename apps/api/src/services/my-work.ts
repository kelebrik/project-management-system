import { normalizePersonName } from '@pms/shared';
import { automationTimeZone, localMoment, localWeekStart } from './automation/time.js';

export const MY_WORK_WEEKS_AHEAD = 4;
export const CHECK_IN_CONFIDENCE = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] as const;
export type CheckInConfidence = (typeof CHECK_IN_CONFIDENCE)[number];

const DAY_MS = 86_400_000;
const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/**
 * Monday of the week containing the moment in the teams' time zone (the
 * same zone the rules run in), stored as that calendar day: a check-in made on
 * Monday morning belongs to the new week, and the Friday reminder looks at it.
 * Check-ins saved before October 2, 2026 used the UTC Monday; they are left as
 * they are: only those made on a Monday before 03:00 Moscow time differ.
 */
export function weekStartOf(now: Date, timeZone = automationTimeZone()) {
  return new Date(`${localWeekStart(localMoment(now, timeZone).date)}T00:00:00.000Z`);
}

type Item = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  owner: string;
  status: string;
  startDate: Date | null;
  dueDate: Date | null;
  project: { code: string; name: string };
};

/**
 * A person's work: unfinished leaf rows whose owner is this person however the
 * name is written, overdue or running or starting within the coming weeks,
 * soonest due first.
 */
export function selectMyWork(items: Item[], personName: string, now: Date) {
  const key = normalizePersonName(personName);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = new Date(today.getTime() + MY_WORK_WEEKS_AHEAD * 7 * DAY_MS);
  return items
    .filter((item) => normalizePersonName(item.owner) === key && item.status !== 'DONE' && item.status !== 'CANCELLED')
    .filter((item) => {
      const overdue = item.dueDate !== null && item.dueDate < today;
      const soon = [item.startDate, item.dueDate].some((date) => date !== null && date <= horizon);
      return overdue || soon;
    })
    .sort((left, right) => (left.dueDate?.getTime() ?? Infinity) - (right.dueDate?.getTime() ?? Infinity) || left.code.localeCompare(right.code, 'ru', { numeric: true }))
    .map((item) => ({
      id: item.id,
      projectId: item.projectId,
      projectCode: item.project.code,
      projectName: item.project.name,
      code: item.code,
      title: item.title,
      status: item.status,
      startDate: day(item.startDate),
      dueDate: day(item.dueDate),
      overdue: item.dueDate !== null && item.dueDate < today,
    }));
}

/** Owners with open work in the week who have not checked in on any of it. */
export function missingCheckIns(owners: string[], checkedInNames: string[]) {
  const done = new Set(checkedInNames.map(normalizePersonName));
  const seen = new Set<string>();
  return owners.filter((owner) => {
    const key = normalizePersonName(owner);
    if (!key || done.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
