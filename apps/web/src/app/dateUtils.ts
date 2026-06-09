export const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

export const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function date(value: string | Date | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function dateTime(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function fileSize(value: number | null | undefined) {
  if (!value) return "0 Б";
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

export function shortDate(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

export function daysBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
}

export function signedDaysBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function signedDaysUntil(value: string | null) {
  if (!value) return null;
  const target = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function calendarDelayDays(
  initialValue: string | null,
  currentValue: string | null,
) {
  if (!initialValue || !currentValue) return 0;
  const initialDate = startOfDay(new Date(initialValue));
  const currentDate = startOfDay(new Date(currentValue));
  if (Number.isNaN(initialDate.getTime()) || Number.isNaN(currentDate.getTime())) {
    return 0;
  }
  return Math.max(
    0,
    Math.round((currentDate.getTime() - initialDate.getTime()) / 86_400_000),
  );
}

export function signedWorkingDaysUntil(value: string | null) {
  if (!value) return null;
  const target = startOfDay(new Date(value));
  const today = startOfDay(new Date());
  if (Number.isNaN(target.getTime())) return null;
  const direction = target.getTime() >= today.getTime() ? 1 : -1;
  const cursor = new Date(today);
  let days = 0;
  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + direction);
    if (isDefaultWorkingDay(cursor)) {
      days += direction;
    }
  }
  return days;
}

export function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

export function addCalendarMonths(value: Date, months: number) {
  const targetMonth = value.getMonth() + months;
  const lastDayOfTargetMonth = new Date(
    value.getFullYear(),
    targetMonth + 1,
    0,
  ).getDate();
  return new Date(
    value.getFullYear(),
    targetMonth,
    Math.min(value.getDate(), lastDayOfTargetMonth),
  );
}

export function monthLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "numeric",
  }).format(value);
}

export function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarMonthDays(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const leadingEmpty = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from(
    { length: leadingEmpty },
    () => null,
  );
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, monthIndex, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function isDefaultWorkingDay(dateValue: Date) {
  const day = dateValue.getDay();
  return day !== 0 && day !== 6;
}
