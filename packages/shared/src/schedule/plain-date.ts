/**
 * A calendar day without time or zone, as "YYYY-MM-DD". The schedule works on
 * these only: a day is the same day on the server and in any browser. Inside,
 * days are counted as whole numbers from 1970-01-01, so adding and comparing
 * days is plain arithmetic.
 */
export type PlainDate = string;

const PATTERN = /^(-?\d{4,6})-(\d{2})-(\d{2})$/;

/** Days from 1970-01-01 to a civil date (proleptic Gregorian), for any year. */
function daysFromCivil(year: number, month: number, day: number) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** The civil date of a day number. */
function civilFromDays(days: number) {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart < 10 ? monthPart + 3 : monthPart - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function pad(value: number, length: number) {
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.abs(value)).padStart(length, "0");
}

/** The PlainDate of a day number. */
export function plainDate(day: number): PlainDate {
  const civil = civilFromDays(day);
  return `${pad(civil.year, 4)}-${pad(civil.month, 2)}-${pad(civil.day, 2)}`;
}

/** The day number of a PlainDate; a malformed or impossible date (2026-02-30) is refused. */
export function dayNumber(value: PlainDate): number {
  const match = PATTERN.exec(value);
  if (!match) throw new Error(`Not a calendar date: ${value}`);
  const day = daysFromCivil(Number(match[1]), Number(match[2]), Number(match[3]));
  if (plainDate(day) !== value) throw new Error(`Not a calendar date: ${value}`);
  return day;
}

export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== "string" || !PATTERN.test(value)) return false;
  try {
    dayNumber(value);
    return true;
  } catch {
    return false;
  }
}

/** The day of the week of a day number: 0 is Sunday, 6 is Saturday, as Date.getUTCDay. */
export function weekday(day: number) {
  return (((day + 4) % 7) + 7) % 7;
}
