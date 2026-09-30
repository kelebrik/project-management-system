import { buildCalendarOverrides, addWorkingDays, isWorkingDay, normalizedDate, sameDate, startOfUtcDay } from './calendar.js';
import { predecessorConstraints, type PredecessorConstraint } from './constraints.js';
import { buildChildrenByParent, isWbsCheckpointType, maxDate, resolveDurationWorkDays, startFromFinish } from './hierarchy.js';
import { buildWbsPredecessorRefs } from './predecessors.js';
import type { WbsScheduleCalendarOverride, WbsScheduleDependency, WbsScheduleItem } from './types.js';

type Item = WbsScheduleItem & { title: string };
type Override = WbsScheduleCalendarOverride & { description?: string | null };

const day = (value: Date | null | undefined) => (value ? startOfUtcDay(value).toISOString().slice(0, 10) : null);
/** At most this many days off are listed; the count covers them all. */
const LISTED_DAYS_OFF = 40;

export type DateDriverLink = {
  predecessorId: string;
  code: string;
  title: string;
  type: PredecessorConstraint['type'];
  lagDays: number;
  /** The date this link alone would set for the start or the finish. */
  date: string;
  /** Whether this link is the one that sets the date now. */
  binding: boolean;
};

export type DateDrivers = {
  itemId: string;
  code: string;
  title: string;
  kind: 'SUMMARY' | 'CHECKPOINT' | 'TASK';
  startDate: string | null;
  dueDate: string | null;
  start: { links: DateDriverLink[]; setBy: 'LINK' | 'CHILDREN' | 'MANUAL' | 'NONE' };
  finish: {
    links: DateDriverLink[];
    setBy: 'DURATION' | 'LINK' | 'CHILDREN' | 'MANUAL' | 'NONE';
    durationWorkDays: number | null;
    daysOff: { count: number; weekends: number; other: number; listed: Array<{ date: string; weekend: boolean; description: string | null }> };
  };
  children: { earliest: { id: string; code: string; title: string; date: string } | null; latest: { id: string; code: string; title: string; date: string } | null } | null;
  /** False when the saved dates differ from what the links and calendar give: the plan waits for a recalculation. */
  consistent: boolean;
};

/**
 * Why a row has the dates it has, by the rules the schedule calculation uses:
 * which predecessor sets the start or the finish and with which link and lag,
 * the duration in working days and the days off it spans, the children that
 * set a summary row, or a checkpoint set by hand. The predecessors' saved
 * dates are used, as after a recalculation.
 */
export function explainWbsItemDates(items: Item[], dependencies: WbsScheduleDependency[], overrides: Override[], itemId: string): DateDrivers | null {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const overridesByKey = buildCalendarOverrides(overrides);
  const itemsById = new Map(items.map((candidate) => [candidate.id, candidate]));
  const itemsByCode = new Map(items.map((candidate) => [candidate.code, candidate]));
  const refs = buildWbsPredecessorRefs(items, dependencies).get(item.id) ?? [];
  const constraints = predecessorConstraints(item, refs, { item: (id) => itemsById.get(id), computed: () => undefined }, overridesByKey);
  const start = normalizedDate(item.startDate);
  const due = normalizedDate(item.dueDate);
  const duration = resolveDurationWorkDays(item);
  const children = buildChildrenByParent(items, itemsById, itemsByCode).get(item.id) ?? [];

  // The start each link would require: a finish link through the duration.
  const requiredStart = (constraint: PredecessorConstraint) =>
    constraint.kind === 'start' ? constraint.date : duration !== null ? startFromFinish(constraint.date, duration, item.calendarCode, overridesByKey) : null;
  const describe = (constraint: PredecessorConstraint, binding: boolean): DateDriverLink => {
    const predecessor = itemsById.get(constraint.predecessorId) as Item | undefined;
    return {
      predecessorId: constraint.predecessorId,
      code: predecessor?.code ?? '',
      title: predecessor?.title ?? '',
      type: constraint.type,
      lagDays: constraint.lagDays,
      date: day(constraint.date)!,
      binding,
    };
  };

  const daysOff: DateDrivers['finish']['daysOff'] = { count: 0, weekends: 0, other: 0, listed: [] };
  if (start && due && due >= start) {
    // Descriptions of the item's own calendars only: a combined calendar reads both.
    const codes = item.calendarCode === 'RU_CN' ? ['RU', 'CN'] : [item.calendarCode];
    const descriptions = new Map(
      overrides.filter((override) => !override.isWorkingDay).map((override) => [`${override.calendarCode}:${day(override.date)}`, override.description ?? null]),
    );
    for (const cursor = new Date(start); cursor <= due; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (isWorkingDay(cursor, item.calendarCode, overridesByKey)) continue;
      const weekday = cursor.getUTCDay();
      const weekend = weekday === 0 || weekday === 6;
      daysOff.count += 1;
      if (weekend) daysOff.weekends += 1;
      else daysOff.other += 1;
      if (daysOff.listed.length < LISTED_DAYS_OFF) {
        const description = codes.map((code) => descriptions.get(`${code}:${day(cursor)}`)).find(Boolean) ?? null;
        daysOff.listed.push({ date: day(cursor)!, weekend, description });
      }
    }
  }

  const base = { itemId: item.id, code: item.code, title: item.title, startDate: day(start), dueDate: day(due) };
  if (children.length > 0) {
    const pick = (field: 'startDate' | 'dueDate', latest: boolean) => {
      const dated = children.filter((child) => child[field]);
      const chosen = dated.sort((left, right) => (left[field]!.getTime() - right[field]!.getTime()) * (latest ? -1 : 1))[0] as Item | undefined;
      return chosen ? { id: chosen.id, code: chosen.code, title: chosen.title, date: day(chosen[field])! } : null;
    };
    const earliest = pick('startDate', false);
    const latest = pick('dueDate', true);
    return {
      ...base,
      kind: 'SUMMARY',
      start: { links: [], setBy: earliest ? 'CHILDREN' : 'NONE' },
      finish: { links: [], setBy: latest ? 'CHILDREN' : 'NONE', durationWorkDays: item.workDays, daysOff },
      children: { earliest, latest },
      consistent: (!earliest || earliest.date === day(start)) && (!latest || latest.date === day(due)),
    };
  }

  if (isWbsCheckpointType(item)) {
    const date = due ?? start;
    const links = constraints.map((constraint) => describe(constraint, Boolean(date && sameDate(constraint.date, date))));
    const linked = maxDate(constraints.map((constraint) => constraint.date));
    const setBy = links.some((link) => link.binding) ? 'LINK' : date ? 'MANUAL' : 'NONE';
    return {
      ...base,
      kind: 'CHECKPOINT',
      start: { links, setBy },
      finish: { links: [], setBy, durationWorkDays: 0, daysOff: { count: 0, weekends: 0, other: 0, listed: [] } },
      children: null,
      // A checkpoint is never earlier than its links; a later date is one set by hand.
      consistent: !linked || Boolean(date && date >= linked),
    };
  }

  const required = constraints.map((constraint) => ({ constraint, start: requiredStart(constraint) }));
  const expectedStart = maxDate(required.map((entry) => entry.start).filter((value): value is Date => value !== null));
  const bindsStart = (entry: (typeof required)[number]) => Boolean(expectedStart && entry.start && sameDate(entry.start, expectedStart) && start && sameDate(start, expectedStart));
  const startLinks = required.filter((entry) => entry.constraint.kind === 'start').map((entry) => describe(entry.constraint, bindsStart(entry)));
  const finishLinks = required.filter((entry) => entry.constraint.kind === 'finish').map((entry) => describe(entry.constraint, bindsStart(entry)));
  const expectedDue = start && duration !== null ? (duration <= 1 ? start : addWorkingDays(start, duration - 1, item.calendarCode, overridesByKey)) : null;
  return {
    ...base,
    kind: 'TASK',
    start: { links: startLinks, setBy: startLinks.some((link) => link.binding) ? 'LINK' : finishLinks.some((link) => link.binding) ? 'LINK' : start ? 'MANUAL' : 'NONE' },
    finish: {
      links: finishLinks,
      setBy: finishLinks.some((link) => link.binding) ? 'LINK' : duration !== null && due ? 'DURATION' : due ? 'MANUAL' : 'NONE',
      durationWorkDays: duration,
      daysOff,
    },
    children: null,
    // A date the links or the duration give but that is not saved is not consistent either.
    consistent: (!expectedStart || sameDate(start, expectedStart)) && (!expectedDue || sameDate(due, expectedDue)),
  };
}
