import { useMemo, type CSSProperties } from "react";
import { daysBetween, weekdayIndex, type LeaveCalendarDay, type LeaveRange } from "../../app/leaveScheduleModel";

/**
 * Painted once behind all rows: weekends and day/week lines as gradients,
 * holidays and working weekends from the production calendar, and today.
 */
export function TimelineBackdrop({
  range,
  overrides,
  todayIndex,
  leftWidth,
  timelineWidth,
  dayWidth,
  totalDays,
}: {
  range: LeaveRange;
  overrides: Map<string, LeaveCalendarDay>;
  todayIndex: number;
  leftWidth: number;
  timelineWidth: number;
  dayWidth: number;
  totalDays: number;
}) {
  const px = (days: number) => `${days * dayWidth}px`;
  const specialDays = useMemo(
    () =>
      [...overrides.values()]
        .filter((day) => day.date >= range.from && day.date <= range.to)
        .filter((day) => day.isWorkingDay !== weekdayIndex(day.date) < 5),
    [overrides, range.from, range.to],
  );
  const style = {
    left: `${leftWidth}px`,
    width: `${timelineWidth}px`,
    "--leave-day": `${dayWidth}px`,
    "--leave-week": `${dayWidth * 7}px`,
  } as CSSProperties;
  return (
    <div aria-hidden="true" className="leave-backdrop" style={style}>
      {specialDays.map((day) => (
        <div
          className={`leave-backdrop-day ${day.isWorkingDay ? "working" : "off"}`}
          key={day.date}
          style={{ left: px(daysBetween(range.from, day.date)), width: px(1) }}
          title={day.description || undefined}
        />
      ))}
      {todayIndex >= 0 && todayIndex < totalDays && (
        <div className="leave-backdrop-today" style={{ left: px(todayIndex), width: px(1) }} />
      )}
    </div>
  );
}
