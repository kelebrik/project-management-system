import { ArrowDown, ArrowUp, UserCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from "react";
import {
  addDays,
  calendarDaysInRange,
  dayToDate,
  daysBetween,
  leaveScale,
  leaveTypeLabel,
  visibleLeaveWindow,
  weekdayIndex,
  workingDaysInRange,
  type LeaveCalendarDay,
  type LeaveEmployee,
  type LeaveHorizon,
  type LeaveRange,
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
type Selection = { employeeId: string; left: number; anchor: number; current: number };
type Tooltip = { leave: LeaveRecord; x: number; y: number };

const PLANNED_WIDTH = 64;
/** Days from the left edge to today when the grid opens or "Today" is pressed. */
const TODAY_LEAD_DAYS = 7;

export function LeaveScheduleGrid({
  range,
  timeline,
  horizon,
  today,
  todayRequest,
  groups,
  segments,
  planned,
  typesById,
  employeesById,
  overrides,
  sort,
  onSort,
  canEdit,
  onCreate,
  onOpen,
  onExtend,
  onVisibleWindowChange,
  showDepartment,
}: {
  range: LeaveRange;
  timeline: Timeline;
  horizon: LeaveHorizon;
  today: string;
  /** Changes whenever the view should jump back to today. */
  todayRequest: number;
  groups: RowGroup[];
  segments: Map<string, LeaveSegment[]>;
  planned: Map<string, number>;
  typesById: Map<string, LeaveType>;
  employeesById: Map<string, LeaveEmployee>;
  overrides: Map<string, LeaveCalendarDay>;
  sort: { key: LeaveSortKey; direction: "asc" | "desc" };
  onSort: (key: LeaveSortKey) => void;
  canEdit: boolean;
  onCreate: (employeeId: string, startDate: string, endDate: string) => void;
  onOpen: (leave: LeaveRecord) => void;
  onExtend: (side: "before" | "after") => void;
  onVisibleWindowChange: (window: LeaveRange) => void;
  showDepartment: boolean;
}) {
  const { t, locale } = useI18n();
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellWidth, setShellWidth] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const nameWidth = shellWidth > 0 && shellWidth < 900 ? 150 : 230;
  const leftWidth = nameWidth + PLANNED_WIDTH;
  const viewportWidth = Math.max(0, shellWidth - leftWidth);
  const scale = leaveScale(horizon, viewportWidth);
  const dayWidth = scale.dayWidth;
  const totalDays = timeline.days.length;
  const timelineWidth = totalDays * dayWidth;
  const tag = intlLocale(locale);
  const formats = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }),
      shortMonth: new Intl.DateTimeFormat(tag, { month: "short", year: "numeric", timeZone: "UTC" }),
      weekday: new Intl.DateTimeFormat(tag, { weekday: "narrow", timeZone: "UTC" }),
      day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    }),
    [tag],
  );

  // Scroll bookkeeping: the date at the left edge survives zooming and loading
  // more weeks before the current ones.
  const leftDateRef = useRef<string | null>(null);
  const layoutRef = useRef<{ from: string; dayWidth: number } | null>(null);
  const extendingRef = useRef(false);
  const windowKeyRef = useRef("");

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => setShellWidth(shell.clientWidth));
    observer.observe(shell);
    setShellWidth(shell.clientWidth);
    return () => observer.disconnect();
  }, []);

  const reportWindow = (shell: HTMLDivElement) => {
    const visible = visibleLeaveWindow(range, shell.scrollLeft, viewportWidth, dayWidth);
    const key = `${visible.from}:${visible.to}`;
    if (key !== windowKeyRef.current) {
      windowKeyRef.current = key;
      onVisibleWindowChange(visible);
    }
    leftDateRef.current = addDays(range.from, Math.floor(shell.scrollLeft / dayWidth));
  };

  const scrollToDay = (shell: HTMLDivElement, day: string) => {
    shell.scrollLeft = Math.max(0, daysBetween(range.from, day) * dayWidth);
  };

  // Keep the same date at the left edge when the range grows backwards or the scale changes.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || viewportWidth <= 0) return;
    const previous = layoutRef.current;
    layoutRef.current = { from: range.from, dayWidth };
    if (!previous) {
      scrollToDay(shell, addDays(today, -TODAY_LEAD_DAYS));
    } else if ((previous.from !== range.from || previous.dayWidth !== dayWidth) && leftDateRef.current) {
      scrollToDay(shell, leftDateRef.current);
    }
    extendingRef.current = false;
    reportWindow(shell);
    // reportWindow and scrollToDay read the current props; the keys below cover them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, dayWidth, viewportWidth]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || todayRequest === 0) return;
    scrollToDay(shell, addDays(today, -TODAY_LEAD_DAYS));
    reportWindow(shell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayRequest]);

  const frameRef = useRef(0);
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const shell = event.currentTarget;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      reportWindow(shell);
      if (extendingRef.current) return;
      if (shell.scrollLeft < viewportWidth) {
        extendingRef.current = true;
        onExtend("before");
      } else if (shell.scrollLeft + shell.clientWidth > shell.scrollWidth - viewportWidth) {
        extendingRef.current = true;
        onExtend("after");
      }
    });
  };

  // Finishing a drag anywhere on the page creates the leave for the selected days.
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = selectionRef.current;
      if (!current) return;
      const index = Math.min(totalDays - 1, Math.max(0, Math.floor((event.clientX - current.left) / dayWidth)));
      if (index === current.current) return;
      selectionRef.current = { ...current, current: index };
      setSelection(selectionRef.current);
    };
    const finish = () => {
      const current = selectionRef.current;
      if (!current) return;
      selectionRef.current = null;
      setSelection(null);
      const first = Math.min(current.anchor, current.current);
      const last = Math.max(current.anchor, current.current);
      onCreate(current.employeeId, addDays(range.from, first), addDays(range.from, last));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [dayWidth, onCreate, range.from, totalDays]);

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

  const px = (days: number) => `${days * dayWidth}px`;
  const todayIndex = daysBetween(range.from, today);
  const showWeekdays = scale.mode === "day" && dayWidth >= 11;
  const weekWidth = dayWidth * 7;
  // In week mode narrow weeks label every other week so numbers do not collide.
  const weekLabelEvery = scale.mode === "week" && weekWidth < 20 ? 2 : 1;
  const specialDays = useMemo(
    () =>
      [...overrides.values()]
        .filter((day) => day.date >= range.from && day.date <= range.to)
        .filter((day) => day.isWorkingDay !== weekdayIndex(day.date) < 5),
    [overrides, range.from, range.to],
  );
  const backdropStyle = {
    left: `${leftWidth}px`,
    width: `${timelineWidth}px`,
    "--leave-day": `${dayWidth}px`,
    "--leave-week": `${weekWidth}px`,
  } as CSSProperties;

  const tooltipLeave = tooltip?.leave;
  const tooltipType = tooltipLeave ? typesById.get(tooltipLeave.typeId) : undefined;

  return (
    <div
      className={`leave-grid-shell leave-scale-${scale.mode}`}
      onScroll={handleScroll}
      ref={shellRef}
      style={{ "--leave-name-width": `${nameWidth}px`, "--leave-planned-width": `${PLANNED_WIDTH}px` } as CSSProperties}
    >
      <div className="leave-grid" role="grid" style={{ width: `${leftWidth + timelineWidth}px` }}>
        <div className="leave-grid-head" role="rowgroup">
          <div className="leave-grid-row leave-head-months" role="row">
            <div className="leave-name-cell leave-head-corner" role="columnheader">
              {sortButton("name", t("ui.leave.sortEmployee"))}
              {sortButton("department", t("ui.leave.sortDepartment"))}
            </div>
            <div className="leave-planned-cell leave-head-corner" role="columnheader" title={t("ui.leave.plannedDays")}>
              {sortButton("planned", t("ui.leave.plannedDaysShort"))}
            </div>
            <div className="leave-time-lane" style={{ width: `${timelineWidth}px` }}>
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
            <div className="leave-time-lane" style={{ width: `${timelineWidth}px` }}>
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
              <div className="leave-time-lane" style={{ width: `${timelineWidth}px` }}>
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
        <div className="leave-grid-body" role="rowgroup">
          <div aria-hidden="true" className="leave-backdrop" style={backdropStyle}>
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
                  >
                    <div className="leave-name-cell" role="rowheader">
                      <strong>{employee.name}</strong>
                      {employee.userId && (
                        <UserCheck aria-label={t("ui.leave.linkedUser")} className="leave-linked-user" role="img" size={13}>
                          <title>{t("ui.leave.linkedUser")}</title>
                        </UserCheck>
                      )}
                      {showDepartment && employee.department && <small>{employee.department}</small>}
                      {!employee.isActive && <em>{t("ui.leave.archived")}</em>}
                    </div>
                    <div className="leave-planned-cell">{planned.get(employee.id) ?? 0}</div>
                    <div
                      className="leave-time-lane leave-row-lane"
                      data-employee-id={employee.id}
                      onPointerDown={(event) => {
                        if (!canEdit || event.button !== 0 || event.target !== event.currentTarget) return;
                        event.preventDefault();
                        const left = event.currentTarget.getBoundingClientRect().left;
                        const index = Math.min(totalDays - 1, Math.max(0, Math.floor((event.clientX - left) / dayWidth)));
                        selectionRef.current = { employeeId: employee.id, left, anchor: index, current: index };
                        setSelection(selectionRef.current);
                      }}
                      style={{ width: `${timelineWidth}px` }}
                    >
                      {rowSelection && (
                        <div
                          aria-hidden="true"
                          className="leave-selection"
                          style={{
                            left: px(Math.min(rowSelection.anchor, rowSelection.current)),
                            width: px(Math.abs(rowSelection.current - rowSelection.anchor) + 1),
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
                            className={`leave-bar ${scale.mode === "day" ? "spaced" : ""} ${segment.continuesBefore ? "cut-start" : ""} ${
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
                            onPointerLeave={() => setTooltip(null)}
                            onPointerMove={(event) => setTooltip({ leave: segment.leave, x: event.clientX, y: event.clientY })}
                            style={{
                              left: px(segment.start),
                              // Day columns leave a small gap between bars; at week scale a day is
                              // a couple of pixels, so bars keep their exact span.
                              width: scale.mode === "day" ? `calc(${px(segment.span)} - 2px)` : px(segment.span),
                              backgroundColor: type?.color ?? "var(--text-muted)",
                            }}
                            type="button"
                          />
                        );
                      })}
                    </div>
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
