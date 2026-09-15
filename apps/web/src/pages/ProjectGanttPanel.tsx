import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useMemo } from "react";
import type { ScenarioResult } from "@pms/shared";
import { createScenarioGantt } from "../app/scenarioGanttModel";
import { usePageContext } from "./PageContext";
import type { GanttCssProperties } from "../app/uiStyleTypes";

export function ProjectGanttPanel({ scenario = null }: { scenario?: ScenarioResult | null }) {
  const { t: uiText } = useInterfaceTranslation();
  const {
    activeGanttLinkIds,
    activeWbsItemId,
    clampNumber,
    collapsedWbsIds,
    completeGanttLinkDrag,
    date,
    GANTT_LINK_ENDPOINT_GAP_PERCENT,
    GANTT_LINK_STUB_PERCENT,
    GANTT_ROW_HEIGHT,
    GANTT_SCALE_WIDTH,
    ganttDependencyPath,
    ganttLinkDraft,
    ganttPanelHeight,
    ganttPanelWidth,
    ganttPathDirection,
    ganttRoundedDependencyPath,
    ganttScale,
    ganttTimelineRef,
    ganttWbsWidth,
    hoveredGanttItemId,
    project,
    setActiveWbsItemId,
    setHoveredGanttItemId,
    showGanttBaseline,
    showGanttCriticalPath,
    showGanttDependencies,
    showGanttForecast,
    startGanttLinkDrag,
    startGanttPanelResize,
    startGanttResize,
    toggleWbsCollapse,
    visibleWbsTree,
    wbsDisplayLevel,
    wbsGantt: workingGantt,
    ganttRangeDays,
  } = usePageContext();
  const wbsGantt = useMemo(() => scenario ? createScenarioGantt(visibleWbsTree, project.wbsDependencies ?? [], ganttRangeDays, scenario) : workingGantt, [scenario, visibleWbsTree, project.wbsDependencies, ganttRangeDays, workingGantt]);
  const primaryPeriods =
    ganttScale === "week"
      ? wbsGantt.weeks
      : ganttScale === "quarter"
        ? wbsGantt.quarters
        : wbsGantt.months;
  const subPeriods =
    ganttScale === "quarter"
      ? wbsGantt.months
      : ganttScale === "month"
        ? wbsGantt.weeks
        : [];

  return <div
                            className="gantt-panel"
                            style={
                              {
                                "--gantt-panel-height": `${ganttPanelHeight}px`,
                                "--gantt-panel-width":
                                  ganttPanelWidth > 0
                                    ? `min(${ganttPanelWidth}px, 100%)`
                                    : "100%",
                                "--gantt-wbs-width": `${ganttWbsWidth}px`,
                                "--gantt-timeline-width": `${Math.max(
                                  520,
                                  primaryPeriods.length *
                                    GANTT_SCALE_WIDTH[ganttScale],
                                )}px`,
                              } as GanttCssProperties
                            }
                          >
                          <div className="gantt-panel-scroll">
                      <div className="gantt-head">
                          <span>{uiText("ui.projects.structureTabLabel")}</span>
                      <button
                        type="button"
                        className="gantt-resizer"
                        onPointerDown={startGanttResize}
                        aria-label={uiText("ui.projects.structureColumnResizeHandle")}
                      />
                      <div className="gantt-scale">
                        {primaryPeriods.length > 0 ? (
                          primaryPeriods.map((period) => (
                            <span
                              key={period.label}
                              style={{
                                left: `${period.offset}%`,
                                width: `${period.width}%`,
                              }}
                              title={period.label}
                            >
                              {period.showLabel ? period.label : ""}
                            </span>
                          ))
                        ) : (
                          <span>{uiText("ui.projects.ganttTimeScaleLabel")}</span>
                        )}
                      </div>
                    </div>
                    <div className="gantt-body">
                      {wbsGantt.items.length === 0 && (
                        <div className="empty-state">
                          {uiText("ui.projects.ganttRequiresStartAndDueDates")}
                        </div>
                      )}
                      {wbsGantt.items.length > 0 && (
                        <>
                          <div className="gantt-labels">
                            {wbsGantt.items.map(
                              ({ item, critical, milestone, toneClass }) => (
                                <div
                                  className={`gantt-label gantt-label-${item.type.toLowerCase().replaceAll("_", "-")} ${critical ? "critical" : ""} ${
                                    activeWbsItemId === item.id ? "active" : ""
                                  } ${
                                    hoveredGanttItemId === item.id
                                      ? "hovered"
                                      : ""
                                  } ${
                                    activeGanttLinkIds.predecessors.has(item.id)
                                      ? "predecessor"
                                      : ""
                                  } ${
                                    activeGanttLinkIds.successors.has(item.id)
                                      ? "successor"
                                      : ""
                                  }`}
                                  key={item.id}
                                  style={{
                                    paddingLeft: `${wbsDisplayLevel(item) * 14 + 10}px`,
                                  }}
                                  onClick={() => setActiveWbsItemId(item.id)}
                                  onMouseEnter={() => setHoveredGanttItemId(item.id)}
                                  onMouseLeave={() => setHoveredGanttItemId(null)}
                                >
                                  {item.children.length > 0 ? (
                                    <button
                                      type="button"
                                      className="tree-toggle"
                                      onClick={() => toggleWbsCollapse(item.id)}
                                      aria-label={
                                        collapsedWbsIds.has(item.id)
                                          ? uiText("ui.projects.structureItemExpand")
                                          : uiText("ui.projects.structureItemCollapse")
                                      }
                                    >
                                      {collapsedWbsIds.has(item.id) ? "+" : "-"}
                                    </button>
                                  ) : (
                                    <span className="tree-spacer" />
                                  )}
                                  <span
                                    className={`wbs-color-dot ${milestone ? "tone-o" : toneClass}`}
                                  />
                                  <b>{item.code}</b>
                                  <span>{item.title}</span>
                                </div>
                              ),
                            )}
                          </div>
                          <button
                            type="button"
                            className="gantt-resizer body"
                            onPointerDown={startGanttResize}
                            aria-label={uiText("ui.projects.structureColumnResizeHandle")}
                          />
                          <div
                            className="gantt-timeline"
                            ref={ganttTimelineRef}
                            style={{ minHeight: `${wbsGantt.height}px` }}
                          >
                            <div className="gantt-month-grid" aria-hidden="true">
                              {primaryPeriods.map((period) => (
                                <span
                                  key={period.label}
                                  style={{
                                    left: `${period.offset}%`,
                                    width: `${period.width}%`,
                                  }}
                                />
                              ))}
                            </div>
                            {subPeriods.length > 0 && (
                              <div className="gantt-sub-grid" aria-hidden="true">
                                {subPeriods.map((period) => (
                                  <span
                                    key={`${ganttScale}-${period.label}`}
                                    style={{ left: `${period.offset}%` }}
                                  />
                                ))}
                              </div>
                            )}
                            {wbsGantt.todayOffset !== null && (
                              <span
                                className="gantt-today"
                                style={{ left: `${wbsGantt.todayOffset}%` }}
                                title={`Сегодня: ${date(new Date().toISOString())}`}
                              />
                            )}
                            {(showGanttDependencies || showGanttCriticalPath) && (
                              <svg
                                className={`gantt-links ${ganttLinkDraft ? "drawing" : ""}`}
                                viewBox={`0 0 100 ${wbsGantt.height}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                              >
                                <defs>
                                  <marker
                                    id="ganttDependencyArrow"
                                    markerHeight="7"
                                    markerWidth="8"
                                    orient="auto"
                                    refX="7"
                                    refY="3.5"
                                    viewBox="0 0 8 7"
                                  >
                                    <path d="M 0 0 L 8 3.5 L 0 7 z" />
                                  </marker>
                                </defs>
                                {wbsGantt.dependencyLines
                                  .filter(
                                    (line) =>
                                      !showGanttCriticalPath || line.critical,
                                  )
                                  .map((line) => {
                                    const endpointGap = line.fromMilestone
                                      ? 0
                                      : GANTT_LINK_ENDPOINT_GAP_PERCENT;
                                    const targetGap = line.toMilestone
                                      ? 0
                                      : GANTT_LINK_ENDPOINT_GAP_PERCENT;
                                    const startX = clampNumber(
                                      line.fromX + line.fromDirection * endpointGap,
                                      0,
                                      100,
                                    );
                                    const endX = clampNumber(
                                      line.toX - line.toDirection * targetGap,
                                      0,
                                      100,
                                    );
                                    return (
                                      <path
                                        className={`slot-${line.styleSlot}${
                                          showGanttCriticalPath
                                            ? " critical-path"
                                            : ""
                                        }${
                                          activeGanttLinkIds.sourceId &&
                                          (line.predecessorId ===
                                            activeGanttLinkIds.sourceId ||
                                            line.successorId ===
                                              activeGanttLinkIds.sourceId)
                                            ? " active"
                                            : ""
                                        }${
                                          ganttLinkDraft?.replaceDependencyId ===
                                          line.id
                                            ? " moving"
                                            : ""
                                        }`}
                                        onPointerDown={(event) =>
                                          !scenario && startGanttLinkDrag(
                                            {
                                              itemId: line.predecessorId,
                                              side: line.fromSide,
                                            },
                                            event,
                                            line.id,
                                          )
                                        }
                                        d={ganttDependencyPath({
                                          fromSide: line.fromSide,
                                          fromX: startX,
                                          fromY: line.fromY,
                                          toSide: line.toSide,
                                          toX: endX,
                                          toY: line.toY,
                                        })}
                                        key={line.id}
                                        data-dependency-type={line.type}
                                        aria-label={uiText("ui.projects.ganttDependencyLabel")}
                                      />
                                    );
                                  })}
                                {ganttLinkDraft &&
                                  (() => {
                                    const source = wbsGantt.items.find(
                                      (entry) => entry.item.id === ganttLinkDraft.itemId,
                                    );
                                    if (!source) return null;
                                    const sourceX =
                                      ganttLinkDraft.side === "start"
                                        ? source.offset
                                        : source.offset + (source.milestone ? 0 : source.width);
                                    const sourceY =
                                      wbsGantt.items.findIndex(
                                        (entry) => entry.item.id === source.item.id,
                                      ) *
                                        GANTT_ROW_HEIGHT +
                                      GANTT_ROW_HEIGHT / 2;
                                    return (
                                      <path
                                        className="draft"
                                        d={ganttRoundedDependencyPath([
                                          { x: sourceX, y: sourceY },
                                          {
                                            x:
                                              sourceX +
                                              ganttPathDirection(ganttLinkDraft.side) *
                                                GANTT_LINK_STUB_PERCENT,
                                            y: sourceY,
                                          },
                                          {
                                            x: ganttLinkDraft.pointerX,
                                            y: ganttLinkDraft.pointerY,
                                          },
                                        ])}
                                      />
                                    );
                                  })()}
                              </svg>
                            )}
                            {wbsGantt.items.map(
                              ({
                                item,
                                offset,
                                width,
                                milestone,
                                critical,
                                summary,
                                rangeLine,
                                bracket,
                                baselineRange,
                                  forecastRange,
                                  scheduleVarianceDays,
                                  toneClass,
                                  nearCritical,
                                  totalFloatWorkDays,
                                }) => (
                                  <div
                                  className={`gantt-track-row ${
                                    activeWbsItemId === item.id ? "active" : ""
                                  } ${
                                    hoveredGanttItemId === item.id
                                      ? "hovered"
                                      : ""
                                  } ${
                                    activeGanttLinkIds.predecessors.has(item.id)
                                      ? "predecessor"
                                      : ""
                                  } ${
                                    activeGanttLinkIds.successors.has(item.id)
                                      ? "successor"
                                      : ""
                                  } ${
                                    ganttLinkDraft ? "linking" : ""
                                  }`}
                                  key={item.id}
                                  style={{ height: `${GANTT_ROW_HEIGHT}px` }}
                                  onClick={() => setActiveWbsItemId(item.id)}
                                  onMouseEnter={() => setHoveredGanttItemId(item.id)}
                                  onMouseLeave={() => setHoveredGanttItemId(null)}
                                >
                                  {showGanttBaseline && baselineRange && (
                                    <i
                                      className="gantt-overlay baseline"
                                      style={{
                                        left: `${baselineRange.offset}%`,
                                        width: `${baselineRange.width}%`,
                                      }}
                                      title={`${item.code} базовый план: ${date(item.baselineStartDate)} - ${date(item.baselineDueDate)}`}
                                    />
                                  )}
                                  {showGanttForecast && forecastRange && (
                                    <i
                                      className={`gantt-overlay forecast ${scheduleVarianceDays > 0 ? "slipped" : ""}`}
                                      style={{
                                        left: `${forecastRange.offset}%`,
                                        width: `${forecastRange.width}%`,
                                      }}
                                      title={`${item.code} прогноз: ${date(item.forecastStartDate)} - ${date(item.forecastDueDate)}`}
                                    />
                                  )}
                                    <i
                                      className={`gantt-bar ${item.status.toLowerCase().replaceAll("_", "-")} ${toneClass} ${milestone ? "milestone" : ""} ${item.type === "GOAL" ? "goal" : ""} ${summary ? "summary" : ""} ${rangeLine ? "range-line" : ""} ${bracket ? "summary-bracket" : ""} ${showGanttCriticalPath && critical ? "critical-path" : ""} ${showGanttCriticalPath && nearCritical ? "near-critical-path" : ""}`}
                                      style={{
                                        left: `${offset}%`,
                                        width: milestone ? undefined : `${width}%`,
                                      }}
                                      title={`${item.code} ${item.title}: ${date(item.startDate)} - ${date(item.dueDate)}${
                                        totalFloatWorkDays === null
                                          ? ""
                                          : `. Резерв: ${totalFloatWorkDays} раб. дн.`
                                      }`}
                                    >
                                    {rangeLine && (
                                      <span className="gantt-range-label">
                                        {item.title} | {date(item.startDate)} - {date(item.dueDate)}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className="gantt-link-handle start"
                                      disabled={Boolean(scenario)}
                                      onPointerDown={(event) =>
                                        !scenario && startGanttLinkDrag(
                                          { itemId: item.id, side: "start" },
                                          event,
                                        )
                                      }
                                      onPointerUp={(event) =>
                                        !scenario && void completeGanttLinkDrag(
                                          { itemId: item.id, side: "start" },
                                          event,
                                        )
                                      }
                                      aria-label={`Начало связи ${item.code}`}
                                      title={uiText("ui.projects.ganttDependencyStart")}
                                    />
                                    <button
                                      type="button"
                                      className="gantt-link-handle end"
                                      disabled={Boolean(scenario)}
                                      onPointerDown={(event) =>
                                        !scenario && startGanttLinkDrag(
                                          { itemId: item.id, side: "end" },
                                          event,
                                        )
                                      }
                                      onPointerUp={(event) =>
                                        !scenario && void completeGanttLinkDrag(
                                          { itemId: item.id, side: "end" },
                                          event,
                                        )
                                      }
                                      aria-label={`Конец связи ${item.code}`}
                                      title={uiText("ui.projects.ganttDependencyEnd")}
                                    />
                                  </i>
                                  {item.jiraTicketUrl && (
                                    <a
                                      className="gantt-jira-badge"
                                      href={item.jiraTicketUrl}
                                      rel="noreferrer"
                                      style={{
                                        left: `calc(${offset + (milestone ? 0 : width)}% + 8px)`,
                                      }}
                                      target="_blank"
                                      title={`Открыть Jira: ${item.jiraTicketKey || item.jiraTicketUrl}`}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      Jira
                                    </a>
                                  )}
                                </div>
                              ),
                            )}
                          </div>
                        </>
                      )}
                      {project.wbsItems.length > visibleWbsTree.length && (
                        <div className="gantt-note">
                          {uiText("ui.projects.ganttCollapsedHierarchyHint")}
                        </div>
                      )}
                          </div>
                          {wbsGantt.items.length > 0 && (
                            <div className="gantt-minimap" aria-label={uiText("ui.projects.ganttRangeOverviewLabel")}>
                              {wbsGantt.items.slice(0, 80).map(({ item, offset, width, milestone }) => (
                                <i
                                  key={item.id}
                                  className={milestone ? "milestone" : ""}
                                  style={{ left: `${offset}%`, width: `${milestone ? 0.8 : Math.max(width, 0.8)}%` }}
                                />
                              ))}
                            </div>
                          )}
                      <button
                        type="button"
                        className="gantt-panel-resizer horizontal"
                        onPointerDown={(event) =>
                          startGanttPanelResize(event, "width")
                        }
                        aria-label={uiText("ui.projects.ganttResizeWidthHandle")}
                        title={uiText("ui.projects.ganttResizeWidthHandle")}
                      />
                      <button
                        type="button"
                        className="gantt-panel-resizer vertical"
                        onPointerDown={(event) =>
                          startGanttPanelResize(event, "height")
                        }
                        aria-label={uiText("ui.projects.ganttResizeHeightHandle")}
                        title={uiText("ui.projects.ganttResizeHeightHandle")}
                      />
                      <button
                        type="button"
                        className="gantt-panel-resizer corner"
                        onPointerDown={(event) =>
                          startGanttPanelResize(event, "both")
                        }
                        aria-label={uiText("ui.projects.ganttResizeHandle")}
                        title={uiText("ui.projects.ganttResizeHandle")}
                      />
                          </div>
                          </div>;
}
