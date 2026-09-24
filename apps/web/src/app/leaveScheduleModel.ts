import type { Locale } from "../i18n/types";

export type LeaveEmployee = {
  id: string;
  name: string;
  department: string;
  userId: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type LeaveType = {
  id: string;
  name: string;
  nameEn: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
};

export type LeaveRecord = {
  id: string;
  employeeId: string;
  typeId: string;
  /** Calendar days as YYYY-MM-DD, both inclusive. */
  startDate: string;
  endDate: string;
  comment: string;
};

export type LeaveCalendarDay = {
  date: string;
  isWorkingDay: boolean;
  description: string;
};

export type LeaveScheduleData = {
  employees: LeaveEmployee[];
  types: LeaveType[];
  leaves: LeaveRecord[];
  calendarDays: LeaveCalendarDay[];
};

export type LeaveHorizon = 1 | 3 | 6;
export type LeaveSortKey = "name" | "department" | "planned";

const DAY_MS = 86_400_000;

function parseDay(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function formatDay(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  return formatDay(parseDay(value) + days * DAY_MS);
}

export function addMonths(value: string, months: number) {
  const date = new Date(parseDay(value));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return formatDay(target.getTime());
}

/** Whole days from `start` to `end`; negative when `end` is earlier. */
export function daysBetween(start: string, end: string) {
  return Math.round((parseDay(end) - parseDay(start)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(value: string) {
  return (new Date(parseDay(value)).getUTCDay() + 6) % 7;
}

export function startOfWeek(value: string) {
  return addDays(value, -weekdayIndex(value));
}

export function localDay(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Converts a YYYY-MM-DD day to a Date at UTC midnight, for Intl formatting with timeZone UTC. */
export function dayToDate(value: string) {
  return new Date(parseDay(value));
}

export function calendarOverrides(days: LeaveCalendarDay[]) {
  return new Map(days.map((day) => [day.date, day]));
}

/** Working unless the production calendar says otherwise; weekends are Saturday and Sunday. */
export function isWorkingDay(value: string, overrides: Map<string, LeaveCalendarDay>) {
  return overrides.get(value)?.isWorkingDay ?? weekdayIndex(value) < 5;
}

export function workingDaysInRange(start: string, end: string, overrides: Map<string, LeaveCalendarDay>) {
  let count = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (isWorkingDay(day, overrides)) count += 1;
  }
  return count;
}

export function calendarDaysInRange(start: string, end: string) {
  return Math.max(0, daysBetween(start, end) + 1);
}

/** The visible period: whole weeks from the Monday of `anchor`, `months` long. */
export function leavePeriod(anchor: string, months: LeaveHorizon) {
  const from = startOfWeek(anchor);
  const lastDay = addDays(addMonths(from, months), -1);
  return { from, to: addDays(startOfWeek(lastDay), 6) };
}

export type LeaveTimelineDay = {
  date: string;
  dayOfMonth: number;
  weekday: number;
  isWorking: boolean;
  isToday: boolean;
  holiday: string;
};

export type LeaveTimelineSpan = { key: string; start: number; span: number; date: string };

export function buildLeaveTimeline(
  from: string,
  to: string,
  overrides: Map<string, LeaveCalendarDay>,
  today: string,
) {
  const days: LeaveTimelineDay[] = [];
  const months: LeaveTimelineSpan[] = [];
  const weeks: LeaveTimelineSpan[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const index = days.length;
    const weekday = weekdayIndex(date);
    days.push({
      date,
      dayOfMonth: Number(date.slice(8, 10)),
      weekday,
      isWorking: isWorkingDay(date, overrides),
      isToday: date === today,
      holiday: overrides.get(date)?.description ?? "",
    });
    const monthKey = date.slice(0, 7);
    if (months.at(-1)?.key !== monthKey) months.push({ key: monthKey, start: index, span: 0, date });
    months[months.length - 1].span += 1;
    if (weekday === 0 || weeks.length === 0) weeks.push({ key: date, start: index, span: 0, date });
    weeks[weeks.length - 1].span += 1;
  }
  return { days, months, weeks };
}

export type LeaveSegment = {
  leave: LeaveRecord;
  /** Zero-based column of the first visible day. */
  start: number;
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export function leaveSegments(leaves: LeaveRecord[], from: string, to: string) {
  const byEmployee = new Map<string, LeaveSegment[]>();
  for (const leave of leaves) {
    if (leave.endDate < from || leave.startDate > to) continue;
    const visibleStart = leave.startDate < from ? from : leave.startDate;
    const visibleEnd = leave.endDate > to ? to : leave.endDate;
    const segments = byEmployee.get(leave.employeeId) ?? [];
    segments.push({
      leave,
      start: daysBetween(from, visibleStart),
      span: daysBetween(visibleStart, visibleEnd) + 1,
      continuesBefore: leave.startDate < from,
      continuesAfter: leave.endDate > to,
    });
    byEmployee.set(leave.employeeId, segments);
  }
  return byEmployee;
}

/** Working days of each person's leaves that fall inside the period. */
export function plannedWorkingDays(
  leaves: LeaveRecord[],
  from: string,
  to: string,
  overrides: Map<string, LeaveCalendarDay>,
) {
  const totals = new Map<string, number>();
  for (const leave of leaves) {
    if (leave.endDate < from || leave.startDate > to) continue;
    const start = leave.startDate < from ? from : leave.startDate;
    const end = leave.endDate > to ? to : leave.endDate;
    totals.set(leave.employeeId, (totals.get(leave.employeeId) ?? 0) + workingDaysInRange(start, end, overrides));
  }
  return totals;
}

export function findOverlappingLeave(
  leaves: LeaveRecord[],
  candidate: Pick<LeaveRecord, "employeeId" | "startDate" | "endDate"> & { id?: string },
) {
  return (
    leaves.find(
      (leave) =>
        leave.employeeId === candidate.employeeId &&
        leave.id !== candidate.id &&
        leave.startDate <= candidate.endDate &&
        leave.endDate >= candidate.startDate,
    ) ?? null
  );
}

export function isAbsentOn(employeeId: string, leaves: LeaveRecord[], day: string) {
  return leaves.some((leave) => leave.employeeId === employeeId && leave.startDate <= day && leave.endDate >= day);
}

export type LeaveEmployeeFilter = {
  search: string;
  departments: string[];
  absentOn: string | null;
  showArchived: boolean;
};

export function filterLeaveEmployees(
  employees: LeaveEmployee[],
  leaves: LeaveRecord[],
  filter: LeaveEmployeeFilter,
  locale: Locale,
) {
  const query = filter.search.trim().toLocaleLowerCase(locale);
  const departments = new Set(filter.departments);
  return employees.filter(
    (employee) =>
      (filter.showArchived || employee.isActive) &&
      (!query || employee.name.toLocaleLowerCase(locale).includes(query)) &&
      (departments.size === 0 || departments.has(employee.department)) &&
      (!filter.absentOn || isAbsentOn(employee.id, leaves, filter.absentOn)),
  );
}

export function sortLeaveEmployees(
  employees: LeaveEmployee[],
  key: LeaveSortKey,
  direction: "asc" | "desc",
  planned: Map<string, number>,
  locale: Locale,
) {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const sign = direction === "asc" ? 1 : -1;
  return [...employees].sort((left, right) => {
    const primary =
      key === "department"
        ? collator.compare(left.department, right.department)
        : key === "planned"
          ? (planned.get(left.id) ?? 0) - (planned.get(right.id) ?? 0)
          : 0;
    return sign * (primary || collator.compare(left.name, right.name));
  });
}

export function groupLeaveEmployees(employees: LeaveEmployee[]) {
  const groups = new Map<string, LeaveEmployee[]>();
  for (const employee of employees) {
    const group = groups.get(employee.department) ?? [];
    group.push(employee);
    groups.set(employee.department, group);
  }
  return [...groups.entries()].map(([department, members]) => ({ department, employees: members }));
}

export function leaveDepartments(employees: LeaveEmployee[], locale: Locale) {
  return [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, locale),
  );
}

export function leaveTypeLabel(type: Pick<LeaveType, "name" | "nameEn"> | undefined, locale: Locale) {
  if (!type) return "";
  return locale === "en" && type.nameEn ? type.nameEn : type.name;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function leaveCsv(header: string[], rows: Array<Array<string | number>>) {
  // The byte order mark lets Excel open Cyrillic text correctly.
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
