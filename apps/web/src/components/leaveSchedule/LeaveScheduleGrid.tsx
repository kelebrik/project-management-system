import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  calendarDaysInRange,
  dayToDate,
  leaveTypeLabel,
  workingDaysInRange,
  type LeaveCalendarDay,
  type LeaveEmployee,
  type LeaveRecord,
  type LeaveSegment,
  type LeaveSortKey,
  type LeaveType,
  type buildLeaveTimeline,
} from "../../app/leaveScheduleModel";
import { useI18n } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";

type Timeline = ReturnType<typeof buildLeaveTimeline>;
type RowGroup = { department: string | null; employees: LeaveEmployee[] };
type Selection = { employeeId: string; anchor: number; current: number };
type Tooltip = { leave: LeaveRecord; x: number; y: number };

const DAY_WIDTH = { 1: 30, 3: 18, 6: 12 } as const;

export function LeaveScheduleGrid({
  timeline,
  groups,
  segments,
  planned,
  typesById,
  employeesById,
  overrides,
  horizon,
  sort,
  onSort,
  canEdit,
  onCreate,
  onOpen,
  showDepartment,
}: {
  timeline: Timeline;
  groups: RowGroup[];
  segments: Map<string, LeaveSegment[]>;
  planned: Map<string, number>;
  typesById: Map<string, LeaveType>;
  employeesById: Map<string, LeaveEmployee>;
  overrides: Map<string, LeaveCalendarDay>;
  horizon: 1 | 3 | 6;
  sort: { key: LeaveSortKey; direction: "asc" | "desc" };
  onSort: (key: LeaveSortKey) => void;
  canEdit: boolean;
  onCreate: (employeeId: string, startDate: string, endDate: string) => void;
  onOpen: (leave: LeaveRecord) => void;
  showDepartment: boolean;
}) {
  const { t, locale } = useI18n();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const tag = intlLocale(locale);
  const formats = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: "narrow", timeZone: "UTC" }),
      day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    }),
    [tag],
  );
  const dayCount = timeline.days.length;
  const style = {
    "--leave-days": dayCount,
    "--leave-day-width": `${DAY_WIDTH[horizon]}px`,
  } as CSSProperties;

  // Finishing a drag anywhere on the page creates the leave for the selected days.
  useEffect(() => {
    const finish = () => {
      const current = selectionRef.current;
      if (!current) return;
      selectionRef.current = null;
      setSelection(null);
      const first = Math.min(current.anchor, current.current);
      const last = Math.max(current.anchor, current.current);
      onCreate(current.employeeId, timeline.days[first].date, timeline.days[last].date);
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [onCreate, timeline.days]);

  const dayIndexOf = (target: EventTarget) => {
    const value = (target as HTMLElement).dataset?.dayIndex;
    return value === undefined ? null : Number(value);
  };

  const updateSelection = (next: Selection | null) => {
    selectionRef.current = next;
    setSelection(next);
  };

  const sortButton = (key: LeaveSortKey, label: string) => (
    <button
      aria-pressed={sort.key === key}
      className={`leave-sort-button ${sort.key === key ? "active" : ""}`}
      onClick={() => onSort(key)}
      type="button"
    >
      {label}
      {sort.key === key &&
        (sort.direction === "asc" ? <ArrowDown aria-hidden="true" size={13} /> : <ArrowUp aria-hidden="true" size={13} />)}
    </button>
  );

  const dayClass = (index: number) => {
    const day = timeline.days[index];
    return [
      "leave-day",
      day.isWorking ? "" : "off",
      day.weekday === 0 ? "week-start" : "",
      day.isToday ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const tooltipLeave = tooltip?.leave;
  const tooltipType = tooltipLeave ? typesById.get(tooltipLeave.typeId) : undefined;

  return (
    <div className="leave-grid-shell" style={style}>
      <div className="leave-grid" role="grid" aria-rowcount={groups.reduce((sum, group) => sum + group.employees.length, 0) + 3}>
        <div className="leave-grid-head" role="rowgroup">
          <div className="leave-grid-row leave-head-months" role="row">
            <div className="leave-name-cell leave-head-corner" role="columnheader">
              {sortButton("name", t("ui.leave.sortEmployee"))}
              {sortButton("department", t("ui.leave.sortDepartment"))}
            </div>
            <div className="leave-planned-cell leave-head-corner" role="columnheader" title={t("ui.leave.plannedDays")}>
              {sortButton("planned", t("ui.leave.plannedDaysShort"))}
            </div>
            {timeline.months.map((month) => (
              <div
                className="leave-head-month"
                key={month.key}
                role="columnheader"
                style={{ gridColumn: `${month.start + 3} / span ${month.span}` }}
              >
                <span>{formats.month.format(dayToDate(month.date))}</span>
              </div>
            ))}
          </div>
          <div className="leave-grid-row leave-head-weeks" role="row">
            <div className="leave-name-cell" />
            <div className="leave-planned-cell" />
            {timeline.weeks.map((week) => (
              <div
                className="leave-head-week"
                key={week.key}
                style={{ gridColumn: `${week.start + 3} / span ${week.span}` }}
              >
                {Number(week.date.slice(8, 10))}
              </div>
            ))}
          </div>
          <div className="leave-grid-row leave-head-days" role="row">
            <div className="leave-name-cell" />
            <div className="leave-planned-cell" />
            {timeline.days.map((day, index) => (
              <div
                className={dayClass(index)}
                key={day.date}
                style={{ gridColumn: index + 3 }}
                title={day.holiday || undefined}
              >
                {formats.weekday.format(dayToDate(day.date))}
              </div>
            ))}
          </div>
        </div>
        <div className="leave-grid-body" role="rowgroup">
          {groups.map((group) => (
            <div className="leave-group" key={group.department ?? "all"}>
              {group.department !== null && (
                <div className="leave-group-title" role="row">
                  <span role="rowheader">{group.department || t("ui.leave.noDepartment")}</span>
                </div>
              )}
              {group.employees.map((employee) => {
                const rowSelection = selection?.employeeId === employee.id ? selection : null;
                return (
                  <div
                    className={`leave-grid-row leave-person-row ${employee.isActive ? "" : "archived"}`}
                    key={employee.id}
                    role="row"
                    onPointerDown={(event) => {
                      const index = dayIndexOf(event.target);
                      if (!canEdit || index === null || event.button !== 0) return;
                      event.preventDefault();
                      updateSelection({ employeeId: employee.id, anchor: index, current: index });
                    }}
                    onPointerOver={(event) => {
                      const current = selectionRef.current;
                      const index = dayIndexOf(event.target);
                      if (!current || current.employeeId !== employee.id || index === null || index === current.current) return;
                      updateSelection({ ...current, current: index });
                    }}
                  >
                    <div className="leave-name-cell" role="rowheader">
                      <strong>{employee.name}</strong>
                      {showDepartment && employee.department && <small>{employee.department}</small>}
                      {!employee.isActive && <em>{t("ui.leave.archived")}</em>}
                    </div>
                    <div className="leave-planned-cell">{planned.get(employee.id) ?? 0}</div>
                    {timeline.days.map((day, index) => (
                      <div
                        className={dayClass(index)}
                        data-day-index={index}
                        key={day.date}
                        style={{ gridColumn: index + 3 }}
                      />
                    ))}
                    {rowSelection && (
                      <div
                        aria-hidden="true"
                        className="leave-selection"
                        style={{
                          gridColumn: `${Math.min(rowSelection.anchor, rowSelection.current) + 3} / span ${
                            Math.abs(rowSelection.current - rowSelection.anchor) + 1
                          }`,
                        }}
                      />
                    )}
                    {(segments.get(employee.id) ?? []).map((segment) => {
                      const type = typesById.get(segment.leave.typeId);
                      const label = `${employee.name}: ${leaveTypeLabel(type, locale)}, ${formats.day.format(
                        dayToDate(segment.leave.startDate),
                      )} – ${formats.day.format(dayToDate(segment.leave.endDate))}`;
                      return (
                        <button
                          aria-label={label}
                          className={`leave-bar ${segment.continuesBefore ? "cut-start" : ""} ${
                            segment.continuesAfter ? "cut-end" : ""
                          }`}
                          key={segment.leave.id}
                          onBlur={() => setTooltip(null)}
                          onClick={() => {
                            setTooltip(null);
                            if (canEdit) onOpen(segment.leave);
                          }}
                          onFocus={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setTooltip({ leave: segment.leave, x: rect.left, y: rect.bottom });
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerLeave={() => setTooltip(null)}
                          onPointerMove={(event) => setTooltip({ leave: segment.leave, x: event.clientX, y: event.clientY })}
                          style={{
                            gridColumn: `${segment.start + 3} / span ${segment.span}`,
                            backgroundColor: type?.color ?? "var(--text-muted)",
                          }}
                          type="button"
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {tooltipLeave && (
        <div
          className="leave-tooltip"
          role="tooltip"
          style={{
            // Keep the card on screen near the right and bottom edges.
            left: Math.min(tooltip.x + 14, window.innerWidth - 336),
            top: tooltip.y + 170 > window.innerHeight ? tooltip.y - 150 : tooltip.y + 14,
          }}
        >
          <strong>{employeesById.get(tooltipLeave.employeeId)?.name}</strong>
          <span className="leave-tooltip-type">
            <i style={{ backgroundColor: tooltipType?.color }} aria-hidden="true" />
            {leaveTypeLabel(tooltipType, locale)} ({formats.day.format(dayToDate(tooltipLeave.startDate))} –{" "}
            {formats.day.format(dayToDate(tooltipLeave.endDate))})
          </span>
          <span>
            {t("ui.leave.tooltipDays", {
              working: workingDaysInRange(tooltipLeave.startDate, tooltipLeave.endDate, overrides),
              calendar: calendarDaysInRange(tooltipLeave.startDate, tooltipLeave.endDate),
            })}
          </span>
          {tooltipLeave.comment && (
            <span className="leave-tooltip-comment">
              <b>{t("ui.leave.comment")}:</b> “{tooltipLeave.comment}”
            </span>
          )}
        </div>
      )}
    </div>
  );
}
