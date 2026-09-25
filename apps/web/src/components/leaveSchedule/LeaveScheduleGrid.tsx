import { ArrowDown, ArrowUp, UserCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  addDays,
  calendarDaysInRange,
  dayToDate,
  daysBetween,
  leaveTypeLabel,
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
import { TimelineBackdrop } from "../timeline/TimelineBackdrop";
import { TimelineHeader } from "../timeline/TimelineHeader";
import { useTimelineViewport } from "../timeline/useTimelineViewport";

type Timeline = ReturnType<typeof buildLeaveTimeline>;
type RowGroup = { department: string | null; employees: LeaveEmployee[] };
type Selection = { employeeId: string; left: number; anchor: number; current: number };
type Tooltip = { leave: LeaveRecord; x: number; y: number };

const PLANNED_WIDTH = 64;

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
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const { shellRef, handleScroll, nameWidth, leftWidth, scale, dayWidth, totalDays, timelineWidth, px } =
    useTimelineViewport({
      range,
      horizon,
      today,
      todayRequest,
      secondColumnWidth: PLANNED_WIDTH,
      onExtend,
      onVisibleWindowChange,
    });
  const tag = intlLocale(locale);
  const formats = useMemo(
    () => ({ day: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) }),
    [tag],
  );

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

  const todayIndex = daysBetween(range.from, today);

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
        <TimelineHeader
          nameHeader={
            <>
              {sortButton("name", t("ui.leave.sortEmployee"))}
              {sortButton("department", t("ui.leave.sortDepartment"))}
            </>
          }
          scale={scale}
          secondHeader={<span title={t("ui.leave.plannedDays")}>{sortButton("planned", t("ui.leave.plannedDaysShort"))}</span>}
          timeline={timeline}
          timelineWidth={timelineWidth}
          todayIndex={todayIndex}
        />
        <div className="leave-grid-body" role="rowgroup">
          <TimelineBackdrop
            dayWidth={dayWidth}
            leftWidth={leftWidth}
            overrides={overrides}
            range={range}
            timelineWidth={timelineWidth}
            todayIndex={todayIndex}
            totalDays={totalDays}
          />
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
