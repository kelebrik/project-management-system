import { useMemo, type ReactNode } from "react";
import { dayToDate, type LeaveScale, type buildLeaveTimeline } from "../../app/leaveScheduleModel";
import { useI18n } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";

/** Months, weeks and (when there is room) weekday letters above a time grid. */
export function TimelineHeader({
  timeline,
  scale,
  timelineWidth,
  todayIndex,
  nameHeader,
  secondHeader,
}: {
  timeline: ReturnType<typeof buildLeaveTimeline>;
  scale: LeaveScale;
  timelineWidth: number;
  todayIndex: number;
  nameHeader: ReactNode;
  secondHeader: ReactNode;
}) {
  const { locale } = useI18n();
  const tag = intlLocale(locale);
  const formats = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }),
      shortMonth: new Intl.DateTimeFormat(tag, { month: "short", year: "numeric", timeZone: "UTC" }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: "narrow", timeZone: "UTC" }),
    }),
    [tag],
  );
  const dayWidth = scale.dayWidth;
  const px = (days: number) => `${days * dayWidth}px`;
  const showWeekdays = scale.mode === "day" && dayWidth >= 11;
  // In week mode narrow weeks label every other week so numbers do not collide.
  const weekLabelEvery = scale.mode === "week" && dayWidth * 7 < 20 ? 2 : 1;
  const laneStyle = { width: `${timelineWidth}px` };

  return (
    <div className="leave-grid-head" role="rowgroup">
      <div className="leave-grid-row leave-head-months" role="row">
        <div className="leave-name-cell leave-head-corner" role="columnheader">
          {nameHeader}
        </div>
        <div className="leave-planned-cell leave-head-corner" role="columnheader">
          {secondHeader}
        </div>
        <div className="leave-time-lane" style={laneStyle}>
          {timeline.months.map((month) => (
            <div
              className="leave-head-month"
              key={month.key}
              role="columnheader"
              style={{ left: px(month.start), width: px(month.span) }}
            >
              <span>{(scale.mode === "week" ? formats.shortMonth : formats.month).format(dayToDate(month.date))}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="leave-grid-row leave-head-weeks" role="row">
        <div className="leave-name-cell" />
        <div className="leave-planned-cell" />
        <div className="leave-time-lane" style={laneStyle}>
          {timeline.weeks.map((week, index) => (
            <div
              className={`leave-head-week ${
                scale.mode === "week" && week.start <= todayIndex && todayIndex < week.start + week.span ? "today" : ""
              }`}
              key={week.key}
              style={{ left: px(week.start), width: px(week.span) }}
            >
              {index % weekLabelEvery === 0 ? Number(week.date.slice(8, 10)) : ""}
            </div>
          ))}
        </div>
      </div>
      {showWeekdays && (
        <div className="leave-grid-row leave-head-days" role="row">
          <div className="leave-name-cell" />
          <div className="leave-planned-cell" />
          <div className="leave-time-lane" style={laneStyle}>
            {timeline.days.map((day, index) => (
              <div
                className={`leave-head-day ${day.isWorking ? "" : "off"} ${day.isToday ? "today" : ""}`}
                key={day.date}
                style={{ left: px(index), width: px(1) }}
                title={day.holiday || undefined}
              >
                {formats.weekday.format(dayToDate(day.date))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
