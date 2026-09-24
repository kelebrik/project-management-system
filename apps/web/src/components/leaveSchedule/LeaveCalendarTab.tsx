import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import {
  addDays,
  calendarOverrides,
  dayToDate,
  isWorkingDay,
  weekdayIndex,
  workingDaysInRange,
  type LeaveCalendarDay,
  type LeaveScheduleData,
} from "../../app/leaveScheduleModel";
import { useI18n } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";

function monthDays(year: number, month: number) {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const days: string[] = [];
  for (let day = first; day.slice(0, 7) === first.slice(0, 7); day = addDays(day, 1)) days.push(day);
  return days;
}

export function LeaveCalendarTab({
  initialYear,
  today,
  canEdit,
  onChanged,
}: {
  initialYear: number;
  today: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const tag = intlLocale(locale);
  const [year, setYear] = useState(initialYear);
  const [days, setDays] = useState<LeaveCalendarDay[] | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await apiClient.get<LeaveScheduleData>(`/api/leave-schedule?from=${year}-01-01&to=${year}-12-31`);
    setDays(data.calendarDays);
  }, [year]);

  useEffect(() => {
    setDays(null);
    load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, [load]);

  const overrides = useMemo(() => calendarOverrides(days ?? []), [days]);
  const formats = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(tag, { month: "long", timeZone: "UTC" }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }),
      day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" }),
    }),
    [tag],
  );
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, index) => formats.weekday.format(dayToDate(addDays("2024-01-01", index)))),
    [formats],
  );
  const yearWorkingDays = days ? workingDaysInRange(`${year}-01-01`, `${year}-12-31`, overrides) : null;
  const weekdayHolidays = (days ?? []).filter(
    (day) => day.date.startsWith(`${year}-`) && !day.isWorkingDay && weekdayIndex(day.date) < 5,
  ).length;

  const selectDay = (date: string) => {
    setSelectedDate(date);
    setDescription(overrides.get(date)?.description ?? "");
  };

  const saveDay = async (date: string, working: boolean, text: string) => {
    setSaving(true);
    setError(null);
    try {
      const isDefault = working === weekdayIndex(date) < 5 && !text.trim();
      if (isDefault) await apiClient.delete(`/api/leave-schedule/calendar-days/${date}`);
      else await apiClient.put(`/api/leave-schedule/calendar-days/${date}`, { isWorkingDay: working, description: text });
      await load();
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const resetDay = async (date: string) => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.delete(`/api/leave-schedule/calendar-days/${date}`);
      setDescription("");
      await load();
      onChanged();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : String(resetError));
    } finally {
      setSaving(false);
    }
  };

  const selectedWorking = selectedDate ? isWorkingDay(selectedDate, overrides) : false;

  return (
    <section className="leave-calendar">
      <div className="leave-calendar-toolbar">
        <button aria-label={t("ui.leave.previous")} className="leave-icon-button" onClick={() => setYear(year - 1)} type="button">
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <strong>{year}</strong>
        <button aria-label={t("ui.leave.next")} className="leave-icon-button" onClick={() => setYear(year + 1)} type="button">
          <ChevronRight aria-hidden="true" size={18} />
        </button>
        {yearWorkingDays !== null && (
          <span>{t("ui.leave.workingDaysInYear", { working: yearWorkingDays, holidays: weekdayHolidays })}</span>
        )}
      </div>
      <p className="leave-calendar-note">
        {canEdit ? `${t("ui.leave.calendarHint")} ` : ""}
        {t("ui.leave.calendarSource")}
      </p>
      {error && (
        <p className="leave-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="leave-calendar-layout">
        <div className="leave-calendar-months">
          {Array.from({ length: 12 }, (_, month) => {
            const dates = monthDays(year, month);
            return (
              <section className="leave-calendar-month" key={month}>
                <h3>{formats.month.format(dayToDate(dates[0]))}</h3>
                <div className="leave-calendar-grid">
                  {weekdayLabels.map((label) => (
                    <span className="leave-calendar-weekday" key={label}>
                      {label}
                    </span>
                  ))}
                  {dates.map((date, index) => {
                    const override = overrides.get(date);
                    const working = isWorkingDay(date, overrides);
                    return (
                      <button
                        aria-label={formats.day.format(dayToDate(date))}
                        aria-pressed={selectedDate === date}
                        className={[
                          "leave-calendar-day",
                          working ? "" : "off",
                          override ? "changed" : "",
                          date === today ? "today" : "",
                          selectedDate === date ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={!days}
                        key={date}
                        onClick={() => {
                          selectDay(date);
                          // A click switches the day, as in actiPLANS; the panel edits its note.
                          if (canEdit && !saving) void saveDay(date, !working, override?.description ?? "");
                        }}
                        style={index === 0 ? { gridColumnStart: weekdayIndex(date) + 1 } : undefined}
                        title={override?.description || undefined}
                        type="button"
                      >
                        {Number(date.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        {selectedDate && (
          <aside className="leave-calendar-editor">
            <h3>{formats.day.format(dayToDate(selectedDate))}</h3>
            <p>{selectedWorking ? t("ui.leave.workingTime") : t("ui.leave.nonWorkingTime")}</p>
            {canEdit && (
              <>
                <label>
                  <span>{t("ui.leave.dayDescription")}</span>
                  <input maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>
                <div className="leave-calendar-actions">
                  <button
                    className="primary"
                    disabled={saving}
                    onClick={() => void saveDay(selectedDate, !selectedWorking, description)}
                    type="button"
                  >
                    {selectedWorking ? t("ui.leave.makeNonWorking") : t("ui.leave.makeWorking")}
                  </button>
                  {overrides.get(selectedDate) && (
                    <>
                      <button disabled={saving} onClick={() => void saveDay(selectedDate, selectedWorking, description)} type="button">
                        {t("ui.leave.save")}
                      </button>
                      <button disabled={saving} onClick={() => void resetDay(selectedDate)} type="button">
                        {t("ui.leave.resetDay")}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
