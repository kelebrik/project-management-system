import { familyRelation, type WbsLinkType } from "@pms/shared";

/** A fixed-seed generator, so a failing plan can be made again from its number. */
export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const TYPES = ["PHASE", "WORK_PACKAGE", "DELIVERABLE", "MILESTONE", "GOAL", "TASK"] as const;
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED", "DONE", "CANCELLED"] as const;
const CALENDARS = ["RU", "CN", "RU_CN"] as const;
const LINKS: WbsLinkType[] = ["FS", "SS", "FF", "SF"];
const DAY = 86_400_000;

export type RandomPlan = ReturnType<typeof randomPlan>;

/**
 * A Structure of 1..60 rows around 2026: nested codes (sometimes with gaps,
 * stale parents or odd codes), every type, status and calendar, dates that
 * may be missing, reversed or off midnight, predecessor columns and linked
 * rows of every kind with lags, holidays and working weekends.
 */
export function randomPlan(seed: number) {
  const next = random(seed);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const chance = (probability: number) => next() < probability;
  const base = Date.UTC(2026, 0, 1) + Math.floor(next() * 400) * DAY;
  const date = () => (chance(0.15) ? null : new Date(base + Math.floor(next() * 200) * DAY + (chance(0.1) ? Math.floor(next() * DAY) : 0)));
  const size = 1 + Math.floor(next() * 60);
  const counters: number[] = [];
  const items = [];
  for (let index = 0; index < size; index += 1) {
    const level = Math.min(counters.length + 1, 1 + Math.floor(next() * 4));
    counters.length = level;
    counters[level - 1] = (counters[level - 1] ?? 0) + (chance(0.05) ? 2 : 1);
    for (let at = 0; at < level - 1; at += 1) counters[at] ??= 1;
    const code = chance(0.03) ? `X${index}` : counters.join(".");
    const startDate = date();
    const dueDate = chance(0.2) ? date() : startDate && new Date(startDate.getTime() + Math.floor(next() * 30) * DAY);
    items.push({
      id: `i${index}`,
      parentId: null as string | null,
      code,
      title: `Row ${index}`,
      type: pick(TYPES),
      status: pick(STATUSES),
      startDate,
      dueDate,
      forecastStartDate: chance(0.3) ? undefined : chance(0.5) ? startDate : date(),
      forecastDueDate: chance(0.3) ? undefined : chance(0.5) ? dueDate : date(),
      predecessor1: null as string | null,
      predecessor2: null as string | null,
      predecessor3: null as string | null,
      predecessor4: null as string | null,
      predecessor5: null as string | null,
      predecessor6: null as string | null,
      leadLagDays: chance(0.2) ? Math.floor(next() * 7) - 2 : 0,
      workDays: chance(0.2) ? null : Math.floor(next() * 25),
      calendarDays: chance(0.5) ? null : Math.floor(next() * 40),
      calendarCode: pick(CALENDARS),
      wbsLevel: chance(0.1) ? null : level,
      sortOrder: chance(0.05) ? index * 10 - 5 : index * 10,
    });
  }
  const byCode = new Map(items.map((item) => [item.code, item]));
  for (const item of items) {
    const parentCode = item.code.split(".").slice(0, -1).join(".");
    item.parentId = chance(0.1) ? pick(items).id : byCode.get(parentCode)?.id ?? null;
    // Mostly earlier rows, sometimes later ones, which can make cycles.
    const count = chance(0.6) ? Math.floor(next() * 3) : 0;
    const fields = ["predecessor1", "predecessor2", "predecessor3", "predecessor4", "predecessor5", "predecessor6"] as const;
    for (let at = 0; at < count; at += 1) item[fields[at]!] = chance(0.05) ? "9.9.9" : pick(items).code;
  }
  const dependencies = [];
  const linkCount = Math.floor(next() * size * 0.8);
  for (let index = 0; index < linkCount; index += 1) {
    const successorIndex = Math.floor(next() * size);
    const predecessorIndex = chance(0.9) ? Math.floor(next() * Math.max(1, successorIndex)) : Math.floor(next() * size);
    dependencies.push({
      id: `d${index}`,
      predecessorId: items[predecessorIndex]!.id,
      successorId: items[successorIndex]!.id,
      type: chance(0.6) ? "FS" : pick(LINKS),
      lagDays: chance(0.6) ? 0 : Math.floor(next() * 9) - 3,
    });
  }
  // A link between a row and its own ancestor or descendant is refused and ignored now; the old engine counted it.
  const related = familyRelation(items);
  const familyFree = dependencies.filter((dependency) => !related(dependency.predecessorId, dependency.successorId));
  dependencies.length = 0;
  dependencies.push(...familyFree);
  for (const item of items) {
    for (const field of ["predecessor1", "predecessor2", "predecessor3", "predecessor4", "predecessor5", "predecessor6"] as const) {
      const predecessor = byCode.get(item[field] ?? "");
      if (predecessor && related(predecessor.id, item.id)) item[field] = null;
    }
  }
  const calendarOverrides = [];
  for (let index = Math.floor(next() * 12); index > 0; index -= 1) {
    calendarOverrides.push({ calendarCode: pick(["RU", "CN"] as const), date: new Date(base + Math.floor(next() * 240) * DAY), isWorkingDay: chance(0.4) });
  }
  const changed = chance(0.7) ? pick(items) : null;
  const options = changed
    ? chance(0.3)
      ? { changedItems: [{ itemId: changed.id, changedFields: [pick(["workDays", "startDate", "dueDate", "forecastDueDate", "predecessors", "status"])] }] }
      : { changedItemId: changed.id, changedFields: [pick(["workDays", "startDate", "dueDate", "forecastStartDate", "predecessors", "status"])] }
    : {};
  return { items, dependencies, calendarOverrides, options };
}
