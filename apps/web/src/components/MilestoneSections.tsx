import { type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { date, monthLabel, shortDate, startOfMonth } from "../app/dateUtils";
import {
  MILESTONE_TODAY_LABEL_ID,
  milestoneLabelOffsetKey,
  zeroMilestoneLabelOffset,
  type MilestoneLabelOffset,
  type MilestoneLabelOffsets,
  type MilestoneLabelScope,
} from "../app/milestoneLabelLayout";
import {
  MILESTONE_PHASE_LABEL_OFFSET,
  MILESTONE_PHASE_LANE_GRID_GAP,
  MILESTONE_SNAKE_PATH_D,
  buildSnakeMilestoneLayouts,
  buildSnakeMilestonePointLayouts,
  compressMilestoneTimelineOffset,
  interpolateSnakePoint,
  mapSnakeTimelineOffset,
  snakeLabelNormalPosition,
  snakeMonthLabelPosition,
  type MilestoneSnakePoint,
  type MilestoneTimelineModel,
  type SvgTextAnchor,
} from "../app/milestoneTimeline";
import { MILESTONE_SNAKE_HEIGHT, MILESTONE_SNAKE_WIDTH } from "../milestoneSnakePath";

type MilestonePointStyle = CSSProperties & {
  "--milestone-label-level": number;
  "--milestone-label-shift": string;
  "--milestone-connector-angle": string;
  "--milestone-drag-x"?: string;
  "--milestone-drag-y"?: string;
};

type MilestoneTimelineStyle = CSSProperties & {
  "--milestone-track-width": string;
  "--milestone-lane-height": string;
  "--milestone-label-offset": string;
  "--milestone-lane-gap": string;
};

const PHASE_LABEL_MAX_WIDTH_PX = 320;
const PHASE_LABEL_MIN_WIDTH_PX = 96;
const PHASE_POINT_GAP_PX = 28;
const PHASE_TIMELINE_LEFT_PX = 8;
const PHASE_TIMELINE_RIGHT_PX = 42;

function phaseTimelineLeft(offset: number) {
  return `calc(${PHASE_TIMELINE_LEFT_PX}px + ${(offset * 100).toFixed(3)}% - ${(offset * (PHASE_TIMELINE_LEFT_PX + PHASE_TIMELINE_RIGHT_PX)).toFixed(3)}px)`;
}

function phaseAxisTitlePreferredWidth(code: string | undefined, title: string) {
  const codeWidth = code ? Math.max(28, code.length * 8 + 18) : 0;
  const titleWidth = Math.ceil(title.length * 8);
  return Math.min(
    PHASE_LABEL_MAX_WIDTH_PX,
    Math.max(PHASE_LABEL_MIN_WIDTH_PX, codeWidth + titleWidth + 36),
  );
}

function phaseAxisTitleStyle(
  lane: MilestoneTimelineModel["lanes"][number],
  trackWidth: number,
) {
  const preferredWidth = phaseAxisTitlePreferredWidth(lane.code, lane.title);
  const usableWidth = Math.max(
    0,
    trackWidth - PHASE_TIMELINE_LEFT_PX - PHASE_TIMELINE_RIGHT_PX,
  );
  const protectedRanges = lane.items
    .map((item) => {
      const center = item.offset * usableWidth;
      return {
        start: Math.max(0, center - PHASE_POINT_GAP_PX),
        end: Math.min(usableWidth, center + PHASE_POINT_GAP_PX),
      };
    })
    .sort((left, right) => left.start - right.start);

  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  protectedRanges.forEach((range) => {
    if (range.start > cursor) {
      gaps.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  });
  if (cursor < usableWidth) {
    gaps.push({ start: cursor, end: usableWidth });
  }

  const preferredGap =
    gaps[0] && gaps[0].start === 0 && gaps[0].end >= Math.min(PHASE_LABEL_MIN_WIDTH_PX, preferredWidth)
      ? gaps[0]
      : gaps.find((gap) => gap.end - gap.start >= preferredWidth) ??
    gaps.reduce(
      (best, gap) =>
        gap.end - gap.start > best.end - best.start ? gap : best,
      { start: 0, end: Math.min(preferredWidth, usableWidth) },
    );
  const availableWidth = Math.max(0, preferredGap.end - preferredGap.start);
  const width = Math.min(
    preferredWidth,
    Math.max(Math.min(PHASE_LABEL_MIN_WIDTH_PX, usableWidth), availableWidth),
  );

  return {
    "--milestone-axis-title-left": `${Math.round(preferredGap.start)}px`,
    "--milestone-axis-title-width": `${Math.round(width)}px`,
  } as CSSProperties;
}

function MilestoneLegend() {
  return (
    <div className="milestone-legend" aria-label="Легенда вех">
      <span>
        <i className="green" /> Пройдена
      </span>
      <span>
        <i className="blue" /> В работе перед вехой
      </span>
      <span>
        <i className="red" /> Просрочена
      </span>
      <span>
        <i className="gray" /> Не начата или запланирована
      </span>
      <span>
        <i className="today" /> Сегодня
      </span>
    </div>
  );
}

export function MilestoneTimelineSection({
  sectionId,
  title = null,
  timeline,
  activeLabelDrag = null,
  labelOffsets,
  isFullscreen = false,
  variant = "card",
  onToggleFullscreen,
  onOpenStructure,
  onLabelPointerDown,
  onPrint,
}: {
  sectionId: string;
  title?: string | null;
  timeline: MilestoneTimelineModel;
  activeLabelDrag?: {
    scope: MilestoneLabelScope;
    milestoneId: string;
  } | null;
  labelOffsets: MilestoneLabelOffsets;
  isFullscreen?: boolean;
  variant?: "card" | "plain";
  onToggleFullscreen?: () => void;
  onOpenStructure: () => void;
  onLabelPointerDown: (
    scope: MilestoneLabelScope,
    milestoneId: string,
    offset: MilestoneLabelOffset,
    event: ReactPointerEvent<Element>,
  ) => void;
  onPrint: () => void;
}) {
  const hasHeader = Boolean(title) || Boolean(onToggleFullscreen) || Boolean(onPrint);

  return (
    <section
      className={
        variant === "plain"
          ? "milestone-section milestone-section-plain"
          : "milestone-section"
      }
      data-print-section={sectionId}
      id={sectionId}
    >
      {hasHeader && (
        <div className="milestone-section-head">
          {title && <h3>{title}</h3>}
          <div className="milestone-section-actions">
            <MilestoneLegend />
            {onToggleFullscreen && (
              <button
                type="button"
                className="workspace-fullscreen-button"
                onClick={onToggleFullscreen}
                aria-label={
                  isFullscreen
                    ? "Вернуть обычный режим вех по фазам"
                    : "Развернуть вехи по фазам на весь экран"
                }
                title={isFullscreen ? "Вернуть обычный режим" : "На весь экран"}
              >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                {isFullscreen ? "Обычный режим" : "На весь экран"}
              </button>
            )}
            <button type="button" onClick={onPrint}>
              Сохранить в PDF
            </button>
          </div>
        </div>
      )}
      <div
        className="milestone-timeline"
        style={
          {
            "--milestone-track-width": `${timeline.trackWidth}px`,
            "--milestone-lane-height": `${timeline.laneHeight}px`,
            "--milestone-label-offset": `${MILESTONE_PHASE_LABEL_OFFSET}px`,
            "--milestone-lane-gap": `${MILESTONE_PHASE_LANE_GRID_GAP}px`,
          } as MilestoneTimelineStyle
        }
      >
        {timeline.lanes.length > 0 ? (
          <div className="milestone-lanes">
            <div className="milestone-scale">
              <span>{shortDate(timeline.startDate)}</span>
              <span>{shortDate(timeline.endDate)}</span>
            </div>
            {timeline.lanes.map((lane) => (
              <div className="milestone-lane" key={lane.id}>
                <div className="milestone-lane-title" aria-hidden="true" />
                <div className="milestone-lane-canvas">
                  <div
                    className="milestone-axis-title"
                    style={phaseAxisTitleStyle(lane, timeline.trackWidth)}
                    title={`${lane.code ? `${lane.code} ` : ""}${lane.title}`}
                  >
                    {lane.code && <span>{lane.code}</span>}
                    <strong>{lane.title}</strong>
                  </div>
                  <div className="milestone-axis" aria-hidden="true" />
                  <div className="milestone-axis-arrow" aria-hidden="true" />
                  {timeline.todayOffset !== null && (
                    <span
                      className="milestone-today"
                      aria-hidden="true"
                      style={{
                        left: phaseTimelineLeft(timeline.todayOffset),
                      }}
                    />
                  )}
                  {lane.items.map(
                    ({
                      milestone,
                      state,
                      offset,
                      side,
                      level,
                      labelShiftPx,
                    }) => {
                      const manualOffset =
                        labelOffsets[
                          milestoneLabelOffsetKey("phase", milestone.id)
                        ] ?? zeroMilestoneLabelOffset;
                      const isLabelDragging =
                        activeLabelDrag?.scope === "phase" &&
                        activeLabelDrag.milestoneId === milestone.id;
                      return (
                        <span
                          className={`milestone-point ${side} ${state.tone}`}
                          key={milestone.id}
                          style={
                            {
                              left: phaseTimelineLeft(offset),
                              "--milestone-label-level": level,
                              "--milestone-label-shift": `${labelShiftPx}px`,
                              "--milestone-drag-x": `${manualOffset.x}px`,
                              "--milestone-drag-y": `${manualOffset.y}px`,
                              "--milestone-connector-angle":
                                labelShiftPx > 8
                                  ? side === "top"
                                    ? "13deg"
                                    : "-13deg"
                                  : labelShiftPx < -8
                                    ? side === "top"
                                      ? "-13deg"
                                      : "13deg"
                                    : side === "top"
                                      ? "-13deg"
                                      : "13deg",
                            } as MilestonePointStyle
                          }
                          title={`${milestone.code} ${milestone.title}: ${date(milestone.dueDate)}. ${state.label}.`}
                        >
                          <button
                            type="button"
                            className="milestone-marker-button"
                            onClick={onOpenStructure}
                            title={`${milestone.code} ${milestone.title}: ${date(milestone.dueDate)}. ${state.label}.`}
                          >
                            <span className="milestone-marker" />
                          </button>
                          <span
                            className={`milestone-caption draggable-milestone-label ${
                              isLabelDragging ? "is-dragging" : ""
                            }`}
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) =>
                              onLabelPointerDown(
                                "phase",
                                milestone.id,
                                manualOffset,
                                event,
                              )
                            }
                            title="Перетащить подпись вехи"
                          >
                            <span className="milestone-label-grip" aria-hidden="true">
                              ⋮⋮
                            </span>
                            <span className="milestone-date">
                              {shortDate(milestone.dueDate)}
                            </span>
                            <span className="milestone-label">
                              {milestone.title}
                            </span>
                          </span>
                        </span>
                      );
                    },
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            {timeline.hiddenStaleLaneCount
              ? "Фазы, у которых все вехи завершены более 3 недель назад, скрыты."
              : timeline.hasMilestonesOutsideRange
              ? "В окне от -2 до +4 месяцев от текущей даты нет вех."
              : "В Структуре пока нет элементов типа «Веха»."}
          </div>
        )}
      </div>
    </section>
  );
}

export function MilestoneSnakeTimelineSection({
  sectionId,
  title,
  timeline,
  labelOffsets,
  isFullscreen,
  onToggleFullscreen,
  onOpenStructure,
  onLabelPointerDown,
  onPrint,
}: {
  sectionId: string;
  title: string;
  timeline: MilestoneTimelineModel;
  labelOffsets: MilestoneLabelOffsets;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenStructure: () => void;
  onLabelPointerDown: (
    scope: MilestoneLabelScope,
    milestoneId: string,
    offset: MilestoneLabelOffset,
    event: ReactPointerEvent<Element>,
  ) => void;
  onPrint: () => void;
}) {
  const milestones = timeline.lanes.flatMap((lane) => lane.items);
  const inlineMilestones = milestones;
  const milestoneLayouts = buildSnakeMilestoneLayouts(inlineMilestones);
  const milestonePointLayouts = buildSnakeMilestonePointLayouts(milestones);
  const startTime = new Date(timeline.startDate).getTime();
  const endTime = new Date(timeline.endDate).getTime();
  const todayTime = new Date(timeline.todayDate).getTime();
  const range = endTime - startTime;
  const canCompressMonthTicks =
    timeline.todayOffset !== null &&
    Number.isFinite(todayTime) &&
    todayTime > startTime &&
    todayTime < endTime;
  const monthTicks = (() => {
    const start = startOfMonth(new Date(timeline.startDate));
    const end = startOfMonth(new Date(timeline.endDate));
    const ticks: Array<{
      label: string;
      point: MilestoneSnakePoint;
      labelX: number;
      labelY: number;
      labelAnchor: SvgTextAnchor;
    }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const rawProgress = canCompressMonthTicks
        ? compressMilestoneTimelineOffset(
            cursor.getTime(),
            startTime,
            todayTime,
            endTime,
            timeline.todayOffset,
          )
        : range === 0
          ? 0
          : (cursor.getTime() - startTime) / range;
      const point = interpolateSnakePoint(mapSnakeTimelineOffset(rawProgress));
      const labelPosition = snakeMonthLabelPosition(point);
      ticks.push({
        label: monthLabel(cursor).replace(".", ""),
        point,
        labelX: labelPosition.x,
        labelY: labelPosition.y,
        labelAnchor: labelPosition.anchor,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  })();

  return (
    <section
      className="milestone-section milestone-snake-section"
      data-print-section={sectionId}
      id={sectionId}
    >
      <div className="milestone-section-head">
        <h3>{title}</h3>
        <div className="milestone-section-actions">
          <MilestoneLegend />
          <button
            type="button"
            className="workspace-fullscreen-button"
            onClick={onToggleFullscreen}
            aria-label={
              isFullscreen
                ? "Вернуть обычный режим всех вех"
                : "Развернуть все вехи на весь экран"
            }
            title={isFullscreen ? "Вернуть обычный режим" : "На весь экран"}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {isFullscreen ? "Обычный режим" : "На весь экран"}
          </button>
          <button type="button" onClick={onPrint}>
            Сохранить в PDF
          </button>
        </div>
      </div>
      <div className="milestone-snake-layout">
        <div className="milestone-snake-shell">
        {milestones.length > 0 ? (
          <svg
            className="milestone-snake-svg"
            viewBox={`0 0 ${MILESTONE_SNAKE_WIDTH} ${MILESTONE_SNAKE_HEIGHT}`}
            role="img"
            aria-label="Все вехи проекта на змеевидной временной шкале"
          >
            <defs>
              <marker
                id="milestoneSnakeArrow"
                markerHeight="10"
                markerWidth="10"
                orient="auto"
                refX="8"
                refY="5"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>
            <rect
              x="0"
              y="0"
              width={MILESTONE_SNAKE_WIDTH}
              height={MILESTONE_SNAKE_HEIGHT}
              rx="10"
              fill="#fff"
            />
            <path
              d={MILESTONE_SNAKE_PATH_D}
              className="milestone-snake-axis"
              markerEnd="url(#milestoneSnakeArrow)"
            />
            {monthTicks.map((tick) => (
              <g key={`${tick.label}-${tick.point.x}-${tick.point.y}`}>
                <line
                  className="milestone-snake-tick"
                  x1={tick.point.x - tick.point.tangentY * 14}
                  x2={tick.point.x + tick.point.tangentY * 14}
                  y1={tick.point.y + tick.point.tangentX * 14}
                  y2={tick.point.y - tick.point.tangentX * 14}
                />
                <text
                  className="milestone-snake-month"
                  x={tick.labelX}
                  y={tick.labelY}
                  textAnchor={tick.labelAnchor}
                >
                  {tick.label}
                </text>
              </g>
            ))}
            {timeline.todayOffset !== null && (() => {
              const todayPoint = interpolateSnakePoint(
                mapSnakeTimelineOffset(timeline.todayOffset),
              );
              const todayManualOffset =
                labelOffsets[
                  milestoneLabelOffsetKey("all", MILESTONE_TODAY_LABEL_ID)
                ] ?? zeroMilestoneLabelOffset;
              const todayLabelPosition = snakeLabelNormalPosition(
                todayPoint,
                58,
                18,
              );
              const todayLabelX = todayLabelPosition.x + todayManualOffset.x;
              const todayLabelY = todayLabelPosition.y + todayManualOffset.y;
              return (
                <g>
                  <line
                    className="milestone-snake-today"
                    x1={todayPoint.x - todayPoint.tangentY * 42}
                    x2={todayPoint.x + todayPoint.tangentY * 42}
                    y1={todayPoint.y + todayPoint.tangentX * 42}
                    y2={todayPoint.y - todayPoint.tangentX * 42}
                  />
                  <line
                    className="milestone-snake-today-connector"
                    x1={todayPoint.x}
                    x2={todayLabelX - 8}
                    y1={todayPoint.y}
                    y2={todayLabelY - 4}
                  />
                  <g
                    className="milestone-snake-today-draggable"
                    onPointerDown={(event) =>
                      onLabelPointerDown(
                        "all",
                        MILESTONE_TODAY_LABEL_ID,
                        todayManualOffset,
                        event,
                      )
                    }
                  >
                    <text
                      className="milestone-snake-today-label"
                      x={todayLabelX}
                      y={todayLabelY}
                    >
                      сегодня
                    </text>
                    <rect
                      className="milestone-snake-today-hitbox"
                      x={todayLabelX - 4}
                      y={todayLabelY - 18}
                      width="58"
                      height="24"
                      rx="5"
                    />
                  </g>
                </g>
              );
            })()}
            <g className="milestone-snake-label-layer">
              {milestoneLayouts.map(({ entry, point, label, lines }) => {
                const manualOffset =
                  labelOffsets[
                    milestoneLabelOffsetKey("all", entry.milestone.id)
                  ] ?? zeroMilestoneLabelOffset;
                const boxX = label.boxX + manualOffset.x;
                const boxY = label.boxY + manualOffset.y;
                const connectorX = label.connectorX + manualOffset.x;
                const connectorY = label.connectorY + manualOffset.y;
                const dateY = label.dateY + manualOffset.y;
                return (
                  <g
                    key={`label-${entry.milestone.id}`}
                    className={`milestone-snake-item milestone-snake-label-draggable ${entry.state.tone}`}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) =>
                      onLabelPointerDown(
                        "all",
                        entry.milestone.id,
                        manualOffset,
                        event,
                      )
                    }
                    tabIndex={0}
                  >
                    <line
                      className="milestone-snake-connector"
                      x1={point.x}
                      x2={connectorX}
                      y1={point.y}
                      y2={connectorY}
                    />
                    <rect
                      className="milestone-snake-label-box"
                      x={boxX}
                      y={boxY}
                      width={label.boxWidth}
                      height={label.boxHeight}
                      rx="7"
                    />
                    <rect
                      className="milestone-snake-label-grip"
                      x={boxX + label.boxWidth - 17}
                      y={boxY + 7}
                      width="9"
                      height={label.boxHeight - 14}
                      rx="3"
                    />
                    <circle
                      className="milestone-snake-drag-dot"
                      cx={boxX + label.boxWidth - 12.5}
                      cy={boxY + 15}
                      r="1.4"
                    />
                    <circle
                      className="milestone-snake-drag-dot"
                      cx={boxX + label.boxWidth - 12.5}
                      cy={boxY + 22}
                      r="1.4"
                    />
                    <circle
                      className="milestone-snake-drag-dot"
                      cx={boxX + label.boxWidth - 12.5}
                      cy={boxY + 29}
                      r="1.4"
                    />
                    {lines.map((line, lineIndex) => (
                      <text
                        className="milestone-snake-title"
                        key={`${entry.milestone.id}-${line}`}
                        x={boxX + 10}
                        y={boxY + 19 + lineIndex * 13}
                      >
                        {line}
                      </text>
                    ))}
                    <text
                      className="milestone-snake-date"
                      x={boxX + 10}
                      y={dateY}
                    >
                      {shortDate(entry.milestone.dueDate)}
                    </text>
                    <rect
                      className="milestone-snake-label-hitbox"
                      x={boxX}
                      y={boxY}
                      width={label.boxWidth}
                      height={label.boxHeight}
                      rx="7"
                    />
                    <title>
                      {`${entry.milestone.code} ${entry.milestone.title}: ${date(entry.milestone.dueDate)}. ${entry.state.label}.`}
                    </title>
                  </g>
                );
              })}
            </g>
            {milestonePointLayouts.map(({ entry, point }, index) => {
              return (
                <g
                  key={`point-${entry.milestone.id}`}
                  className={`milestone-snake-item ${entry.state.tone}`}
                  onClick={onOpenStructure}
                  tabIndex={0}
                >
                  <circle
                    className="milestone-snake-marker"
                    cx={point.x}
                    cy={point.y}
                    r="11"
                  />
                  <text
                    className="milestone-snake-marker-number"
                    x={point.x}
                    y={point.y + 4}
                  >
                    {index + 1}
                  </text>
                  <title>
                    {`${index + 1}. ${entry.milestone.code} ${entry.milestone.title}: ${date(entry.milestone.dueDate)}. ${entry.state.label}.`}
                  </title>
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="empty-state">
            {timeline.hasMilestonesOutsideRange
              ? "Вехи не попали в диапазон графика."
              : "В Структуре пока нет элементов типа «Веха»."}
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
