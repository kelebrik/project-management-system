import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import {
  daysBetween,
  dayToDate,
  type LeaveCalendarDay,
  type LeaveHorizon,
  type LeaveRange,
  type buildLeaveTimeline,
} from "../../app/leaveScheduleModel";
import type { WorkloadItem, WorkloadLeave, WorkloadProject, WorkloadRow } from "../../app/workloadModel";
import { useI18n } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";
import { TimelineBackdrop } from "../timeline/TimelineBackdrop";
import { TimelineHeader } from "../timeline/TimelineHeader";
import { useTimelineViewport } from "../timeline/useTimelineViewport";

export type WorkloadSortKey = "name" | "tasks" | "overlap";
type Tooltip = { item: WorkloadItem; owner: string; x: number; y: number };
type RowGroup = { department: string | null; rows: WorkloadRow[] };

const COUNTS_WIDTH = 156;
const LANE_HEIGHT = 24;
const BAR_HEIGHT = 18;
const ROW_PADDING = 8;

export function WorkloadGrid({
  range,
  timeline,
  horizon,
  today,
  todayRequest,
  groups,
  counts,
  projectsById,
  colors,
  leavesByEmployee,
  overrides,
  sort,
  onSort,
  onOpenItem,
  onExtend,
  onVisibleWindowChange,
  showDepartment,
}: {
  range: LeaveRange;
  timeline: ReturnType<typeof buildLeaveTimeline>;
  horizon: LeaveHorizon;
  today: string;
  todayRequest: number;
  groups: RowGroup[];
  counts: Map<string, { tasks: number; overlap: number }>;
  projectsById: Map<string, WorkloadProject>;
  colors: Map<string, string>;
  leavesByEmployee: Map<string, WorkloadLeave[]>;
  overrides: Map<string, LeaveCalendarDay>;
  sort: { key: WorkloadSortKey; direction: "asc" | "desc" };
  onSort: (key: WorkloadSortKey) => void;
  onOpenItem: (item: WorkloadItem) => void;
  onExtend: (side: "before" | "after") => void;
  onVisibleWindowChange: (window: LeaveRange) => void;
  showDepartment: boolean;
}) {
  const { t, locale, labels } = useI18n();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const { shellRef, handleScroll, nameWidth, leftWidth, scale, dayWidth, totalDays, timelineWidth, px } =
    useTimelineViewport({
      range,
      horizon,
      today,
      todayRequest,
      secondColumnWidth: COUNTS_WIDTH,
      onExtend,
      onVisibleWindowChange,
    });
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    [locale],
  );
  const todayIndex = daysBetween(range.from, today);

  // Positions clipped to the loaded range, in days from its first day.
  const span = (from: string, to: string) => {
    const start = Math.max(0, daysBetween(range.from, from));
    const end = Math.min(totalDays - 1, daysBetween(range.from, to));
    return end < start ? null : { start, length: end - start + 1 };
  };

  const sortButton = (key: WorkloadSortKey, label: string) => (
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

  const tooltipItem = tooltip?.item;
  const tooltipProject = tooltipItem ? projectsById.get(tooltipItem.projectId) : undefined;

  return (
    <div
      className={`leave-grid-shell workload-grid-shell leave-scale-${scale.mode}`}
      onScroll={handleScroll}
      ref={shellRef}
      style={{ "--leave-name-width": `${nameWidth}px`, "--leave-planned-width": `${COUNTS_WIDTH}px` } as CSSProperties}
    >
      <div className="leave-grid" role="grid" style={{ width: `${leftWidth + timelineWidth}px` }}>
        <TimelineHeader
          nameHeader={sortButton("name", t("ui.workload.owner"))}
          scale={scale}
          secondHeader={
            <>
              {sortButton("tasks", t("ui.workload.tasks"))}
              <span title={t("ui.workload.overlapDays")}>{sortButton("overlap", t("ui.workload.overlapShort"))}</span>
            </>
          }
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
                  <span role="rowheader">{group.department || t("ui.workload.notInDirectory")}</span>
                </div>
              )}
              {group.rows.map((row) => {
                const height = row.laneCount * LANE_HEIGHT + ROW_PADDING;
                const rowCounts = counts.get(row.key) ?? { tasks: 0, overlap: 0 };
                return (
                  <div className="leave-grid-row leave-person-row workload-row" key={row.key} role="row">
                    <div className="leave-name-cell" role="rowheader" style={{ minHeight: `${height}px` }}>
                      <strong>{row.name}</strong>
                      {row.ambiguous && (
                        <AlertTriangle
                          aria-label={t("ui.workload.ambiguous")}
                          className="workload-ambiguous"
                          role="img"
                          size={13}
                        >
                          <title>{t("ui.workload.ambiguous")}</title>
                        </AlertTriangle>
                      )}
                      {showDepartment && row.department && <small>{row.department}</small>}
                    </div>
                    <div className="leave-planned-cell workload-counts" style={{ minHeight: `${height}px` }}>
                      <span>{rowCounts.tasks}</span>
                      <span className={rowCounts.overlap > 0 ? "has-overlap" : ""}>{rowCounts.overlap}</span>
                    </div>
                    <div
                      className="leave-time-lane workload-lane"
                      data-owner={row.key}
                      style={{ width: `${timelineWidth}px`, height: `${height}px` }}
                    >
                      {row.employeeId &&
                        (leavesByEmployee.get(row.employeeId) ?? []).map((leave) => {
                          const position = span(leave.startDate, leave.endDate);
                          return position ? (
                            <div
                              aria-hidden="true"
                              className="workload-leave"
                              key={leave.id}
                              style={{ left: px(position.start), width: px(position.length) }}
                            />
                          ) : null;
                        })}
                      {row.overlaps.map((overlap) => {
                        const position = span(overlap.from, overlap.to);
                        return position ? (
                          <div
                            aria-hidden="true"
                            className="workload-overlap"
                            key={overlap.from}
                            style={{ left: px(position.start), width: px(position.length) }}
                          />
                        ) : null;
                      })}
                      {row.placed.map(({ item, lane }) => {
                        const position = span(item.startDate, item.dueDate);
                        if (!position) return null;
                        const project = projectsById.get(item.projectId);
                        const label = `${project?.code ?? ""} · ${item.code} ${item.title}`;
                        const width = position.length * dayWidth;
                        return (
                          <button
                            aria-label={`${row.name}: ${label}, ${dayFormat.format(dayToDate(item.startDate))} – ${dayFormat.format(
                              dayToDate(item.dueDate),
                            )}`}
                            className={`workload-bar ${item.status === "DONE" ? "done" : ""}`}
                            key={item.id}
                            onBlur={() => setTooltip(null)}
                            onClick={() => {
                              setTooltip(null);
                              onOpenItem(item);
                            }}
                            onFocus={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              setTooltip({ item, owner: row.name, x: rect.left, y: rect.bottom });
                            }}
                            onPointerLeave={() => setTooltip(null)}
                            onPointerMove={(event) =>
                              setTooltip({ item, owner: row.name, x: event.clientX, y: event.clientY })
                            }
                            style={{
                              left: px(position.start),
                              width: `max(3px, ${width - (scale.mode === "day" ? 2 : 0)}px)`,
                              top: `${ROW_PADDING / 2 + lane * LANE_HEIGHT}px`,
                              height: `${BAR_HEIGHT}px`,
                              backgroundColor: colors.get(item.projectId) ?? "var(--text-muted)",
                            }}
                            type="button"
                          >
                            {width > 70 && <span>{label}</span>}
                          </button>
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
      {tooltipItem && (
        <div
          className="leave-tooltip"
          role="tooltip"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 336),
            top: tooltip.y + 170 > window.innerHeight ? tooltip.y - 150 : tooltip.y + 14,
          }}
        >
          <strong>{tooltip.owner}</strong>
          <span className="leave-tooltip-type">
            <i aria-hidden="true" style={{ backgroundColor: colors.get(tooltipItem.projectId) }} />
            {tooltipProject ? `${tooltipProject.code} — ${tooltipProject.name}` : ""}
          </span>
          <span>
            {tooltipItem.code} {tooltipItem.title}
          </span>
          <span>
            {dayFormat.format(dayToDate(tooltipItem.startDate))} – {dayFormat.format(dayToDate(tooltipItem.dueDate))} ·{" "}
            {labels.wbsStatusLabel(tooltipItem.status)}
          </span>
        </div>
      )}
    </div>
  );
}
