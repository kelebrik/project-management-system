/** Where "Friday noon" and "nine in the morning" are; the default suits the teams the system serves. */
export function automationTimeZone() {
  const zone = process.env.AUTOMATION_TIME_ZONE?.trim() || 'Europe/Moscow';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'Europe/Moscow';
  }
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** The local calendar date (YYYY-MM-DD), ISO weekday (Monday = 1) and hour of a moment in a time zone. */
export function localMoment(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: WEEKDAYS[parts.weekday] ?? 0, hour: Number(parts.hour) };
}

/** The Monday of a local date's week, as YYYY-MM-DD. */
export function localWeekStart(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`);
  const weekday = day.getUTCDay() || 7;
  return new Date(day.getTime() - (weekday - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** A daily check runs once on each local day from this hour; a server that was down at that hour runs it when it is back the same day. */
export const DAILY_HOUR = 9;
/** The weekly check-in reminder: Friday from noon. */
export const WEEKLY_CHECK_IN = { weekday: 5, hour: 12 } as const;
