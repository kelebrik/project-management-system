import {
  addDays,
  daysBetween,
  isWorkingDay,
  type LeaveCalendarDay,
  type LeaveRange,
} from "./leaveScheduleModel";

export type WorkloadProject = { id: string; code: string; name: string };

export type WorkloadItem = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  owner: string;
  type: string;
  status: string;
  startDate: string;
  dueDate: string;
};

export type WorkloadEmployee = { id: string; name: string; department: string };
export type WorkloadLeave = { id: string; employeeId: string; typeId: string; startDate: string; endDate: string };

export type WorkloadData = {
  projects: WorkloadProject[];
  items: WorkloadItem[];
  employees: WorkloadEmployee[];
  leaves: WorkloadLeave[];
  calendarDays: LeaveCalendarDay[];
};

/** Names as people type them: case, spacing, "ё" and Unicode forms do not matter. */
export function normalizePersonName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().replaceAll("ё", "е");
}

const PROJECT_COLORS = [
  "#2f80ed",
  "#27ae60",
  "#eb5757",
  "#9b51e0",
  "#f2994a",
  "#00a3a3",
  "#d35fa4",
  "#8d6e2f",
  "#56ccf2",
  "#6fcf97",
  "#bb6bd9",
  "#e0b000",
];

/** Colours by the full project list sorted by code, so filtering never repaints projects. */
export function projectColors(projects: WorkloadProject[]) {
  const sorted = [...projects].sort((left, right) => left.code.localeCompare(right.code, "ru"));
  return new Map(sorted.map((project, index) => [project.id, PROJECT_COLORS[index % PROJECT_COLORS.length]]));
}

export type PlacedItem = { item: WorkloadItem; lane: number };

/** Puts overlapping work on separate lanes, first fit by start date, so no bar hides another. */
export function packLanes(items: WorkloadItem[]) {
  const sorted = [...items].sort(
    (left, right) => left.startDate.localeCompare(right.startDate) || left.dueDate.localeCompare(right.dueDate),
  );
  const laneEnds: string[] = [];
  const placed: PlacedItem[] = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end < item.startDate);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.dueDate);
    } else {
      laneEnds[lane] = item.dueDate;
    }
    return { item, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}

/** Stretches of days on which two or more unfinished pieces of work run at once. */
export function overlapRanges(items: WorkloadItem[]): LeaveRange[] {
  const active = items.filter((item) => item.status !== "DONE");
  const events = new Map<string, number>();
  for (const item of active) {
    events.set(item.startDate, (events.get(item.startDate) ?? 0) + 1);
    const after = addDays(item.dueDate, 1);
    events.set(after, (events.get(after) ?? 0) - 1);
  }
  const ranges: LeaveRange[] = [];
  let running = 0;
  let openedAt: string | null = null;
  for (const day of [...events.keys()].sort()) {
    running += events.get(day)!;
    if (running >= 2 && openedAt === null) openedAt = day;
    if (running < 2 && openedAt !== null) {
      ranges.push({ from: openedAt, to: addDays(day, -1) });
      openedAt = null;
    }
  }
  return ranges;
}

/** Working days inside the window covered by the overlap ranges, each day once. */
export function overlapWorkingDays(ranges: LeaveRange[], window: LeaveRange, overrides: Map<string, LeaveCalendarDay>) {
  let count = 0;
  for (const range of ranges) {
    const from = range.from > window.from ? range.from : window.from;
    const to = range.to < window.to ? range.to : window.to;
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (isWorkingDay(day, overrides)) count += 1;
    }
  }
  return count;
}

export type WorkloadRow = {
  key: string;
  name: string;
  department: string;
  /** The directory person, when exactly one active person has this name. */
  employeeId: string | null;
  ambiguous: boolean;
  items: WorkloadItem[];
  placed: PlacedItem[];
  laneCount: number;
  overlaps: LeaveRange[];
};

/** One row per owner named on work, matched to the directory by normalized name. */
export function buildWorkloadRows(items: WorkloadItem[], employees: WorkloadEmployee[]) {
  const directory = new Map<string, WorkloadEmployee[]>();
  for (const employee of employees) {
    const key = normalizePersonName(employee.name);
    directory.set(key, [...(directory.get(key) ?? []), employee]);
  }
  const byOwner = new Map<string, WorkloadItem[]>();
  for (const item of items) {
    const key = normalizePersonName(item.owner);
    if (!key) continue;
    byOwner.set(key, [...(byOwner.get(key) ?? []), item]);
  }
  return [...byOwner.entries()].map(([key, ownerItems]): WorkloadRow => {
    const matches = directory.get(key) ?? [];
    const person = matches.length === 1 ? matches[0] : null;
    const { placed, laneCount } = packLanes(ownerItems);
    return {
      key,
      name: person?.name ?? ownerItems[0].owner,
      department: person?.department ?? "",
      employeeId: person?.id ?? null,
      ambiguous: matches.length > 1,
      items: ownerItems,
      placed,
      laneCount,
      overlaps: overlapRanges(ownerItems),
    };
  });
}

export function itemsInWindow(items: WorkloadItem[], window: LeaveRange) {
  return items.filter((item) => item.startDate <= window.to && item.dueDate >= window.from);
}

export function overlapsTouchWindow(ranges: LeaveRange[], window: LeaveRange) {
  return ranges.some((range) => range.from <= window.to && range.to >= window.from);
}

/** Days between the start of the loaded range and a date, for pixel placement. */
export function dayOffset(rangeFrom: string, day: string) {
  return daysBetween(rangeFrom, day);
}
