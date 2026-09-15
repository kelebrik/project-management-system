import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import type { ProjectCalendarCode } from "../app/wbsTable";

export function ProjectCalendarsPage() {
  const { t } = useI18n();
  const ctx = usePageContext();
  const {
    calendarMonthDays,
    calendarOverridesByKey,
    calendarYear,
    isDefaultWorkingDay,
    isoDate,
    MONTH_LABELS,
    projectCalendarYears,
    savingCalendar,
    setSelectedCalendarYear,
    toggleCalendarDay,
    WEEKDAY_LABELS,
  } = ctx;

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <h2>{t("calendar.title")}</h2>
                        <p>
                          {t("calendar.description")}
                      </p>
                    </div>
                  </div>
                  <div className="calendar-page">
                    <div className="calendar-controls">
                      <span>{t("calendar.year")}</span>
                      <div className="segmented-control" aria-label={t("calendar.yearLabel")}>
                        {projectCalendarYears.map((year) => (
                          <button
                            type="button"
                            key={year}
                            className={calendarYear === year ? "active" : ""}
                            onClick={() => setSelectedCalendarYear(year)}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(["RU", "CN"] as ProjectCalendarCode[]).map(
                      (calendarCode) => (
                        <section className="calendar-board" key={calendarCode}>
                          <div className="calendar-board-title">
                            <h3>{t("calendar.name", { code: calendarCode })}</h3>
                            <span>{calendarYear}</span>
                          </div>
                          <div className="calendar-months">
                            {Array.from({ length: 12 }, (_, monthIndex) => (
                              <div className="calendar-month" key={monthIndex}>
                                <strong>{MONTH_LABELS[monthIndex]}</strong>
                                <div className="calendar-weekdays">
                                  {WEEKDAY_LABELS.map((label) => (
                                    <span key={label}>{label}</span>
                                  ))}
                                </div>
                                <div className="calendar-days">
                                  {calendarMonthDays(
                                    calendarYear,
                                    monthIndex,
                                  ).map((dayValue, index) => {
                                    if (!dayValue) {
                                      return (
                                        <span
                                          className="calendar-day empty"
                                          key={`empty-${index}`}
                                        />
                                      );
                                    }
                                    const dateKey = isoDate(dayValue);
                                    const overrideKey = `${calendarCode}:${dateKey}`;
                                    const override =
                                      calendarOverridesByKey.get(overrideKey);
                                    const isWorkingDay =
                                      override?.isWorkingDay ??
                                      isDefaultWorkingDay(dayValue);
                                    return (
                                      <button
                                        type="button"
                                        className={`calendar-day ${isWorkingDay ? "working" : "holiday"} ${override ? "custom" : ""}`}
                                        key={dateKey}
                                        onClick={() =>
                                          void toggleCalendarDay(
                                            calendarCode,
                                            dayValue,
                                          )
                                        }
                                        disabled={
                                          savingCalendar === overrideKey
                                        }
                                        title={
                                          isWorkingDay
                                            ? t("calendar.working")
                                            : t("calendar.holiday")
                                        }
                                      >
                                        {dayValue.getDate()}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ),
                    )}
                  </div>
                </article>
              );
}
