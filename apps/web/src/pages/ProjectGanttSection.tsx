import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useMemo, useState } from "react";
import type { ScenarioResult } from "@pms/shared";
import { LocateFixed, Maximize2, Minimize2, Redo2, Undo2 } from "lucide-react";

import { usePageContext } from "./PageContext";
import { ProjectGanttPanel } from "./ProjectGanttPanel";
import { ScenarioPanel } from '../components/automation/ScenarioPanel';

export function ProjectGanttSection() {
  const { t: uiText } = useInterfaceTranslation();
  const {
    activeWbsHierarchyLevel,
    fullscreenWorkspaceView,
    GANTT_HIERARCHY_LEVELS,
    ganttScale,
    ganttRangeDays,
    project,
    currentUser,
    redoWbsChange,
    resetGanttPanelSize,
    restoringWbsSnapshot,
    setGanttScale,
    setGanttRangeDays,
    setShowGanttBaseline,
    setShowGanttForecast,
    setWbsHierarchyLevel,
    showGanttBaseline,
    showGanttCriticalPath,
    showGanttDependencies,
    showGanttForecast,
    toggleGanttCriticalPath,
    toggleGanttDependencies,
    toggleWorkspaceFullscreen,
    undoWbsChange,
    wbsRedoStack,
    wbsUndoStack,
  } = usePageContext();

  const sourceKey = useMemo(() => JSON.stringify([project.wbsItems, project.wbsDependencies, project.criticalPath]), [project.wbsItems, project.wbsDependencies, project.criticalPath]);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);

  return (
                        <>
                            <ScenarioPanel projectId={project.id} userId={currentUser?.id ?? 'viewer'} items={project.wbsItems} sourceKey={sourceKey} result={scenario} onResult={setScenario} />
                            <div className="gantt-controls">
                              <div className="gantt-controls-row">
                              {scenario && <div className="gantt-scenario-notice">
                                <span role="status">{uiText("ui.projects.ganttScenarioPreviewNotice")}</span>
                                <button type="button" onClick={() => setScenario(null)}>{uiText("ui.projects.ganttBackToWorkingPlan")}</button>
                              </div>}
                            <button
                              type="button"
                              className="workspace-fullscreen-button"
                              onClick={() => toggleWorkspaceFullscreen("project-gantt")}
                              aria-label={
                                fullscreenWorkspaceView === "project-gantt"
                                  ? uiText("ui.projects.ganttExitFullScreen")
                                  : uiText("ui.projects.ganttEnterFullScreen")
                              }
                              title={
                                fullscreenWorkspaceView === "project-gantt"
                                  ? uiText("ui.common.exitFullscreen")
                                  : uiText("ui.common.fullScreen")
                              }
                            >
                              {fullscreenWorkspaceView === "project-gantt" ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                              {fullscreenWorkspaceView === "project-gantt"
                                ? uiText("ui.common.normalMode")
                                : uiText("ui.common.fullScreen")}
                            </button>
                                <button
                                  type="button"
                                  onClick={() => void undoWbsChange()}
                                onMouseDown={(event) => event.preventDefault()}
                                disabled={
                                  Boolean(scenario) || restoringWbsSnapshot ||
                                  wbsUndoStack.length === 0
                                }
                                aria-label={uiText("ui.projects.ganttUndoLastChange")}
                                title={uiText("ui.projects.undoBackLabel")}
                              >
                                <Undo2 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void redoWbsChange()}
                                onMouseDown={(event) => event.preventDefault()}
                                disabled={
                                  Boolean(scenario) || restoringWbsSnapshot ||
                                  wbsRedoStack.length === 0
                                }
                                aria-label={uiText("ui.projects.ganttRedoLastChange")}
                                title={uiText("ui.projects.redoForwardLabel")}
                              >
                                <Redo2 size={15} />
                              </button>
                              <div className="segmented-control" aria-label={uiText("ui.projects.ganttZoomLabel")}>
                                <button
                                  type="button"
                                  className={ganttScale === "week" ? "active" : ""}
                                  onClick={() => setGanttScale("week")}
                                >
                                  {uiText("ui.projects.ganttZoomWeeks")}
                                </button>
                                <button
                                  type="button"
                                  className={ganttScale === "month" ? "active" : ""}
                                  onClick={() => setGanttScale("month")}
                                >
                                  {uiText("ui.projects.ganttZoomMonths")}
                                </button>
                                <button
                                  type="button"
                                  className={ganttScale === "quarter" ? "active" : ""}
                                  onClick={() => setGanttScale("quarter")}
                                >
                                  {uiText("ui.projects.ganttZoomQuarters")}
                                </button>
                              </div>
                              <div className="segmented-control" aria-label={uiText("ui.projects.ganttRangeLabel")}>
                                {([30, 90, 180] as const).map((days) => (
                                  <button
                                    type="button"
                                    className={ganttRangeDays === days ? "active" : ""}
                                    key={days}
                                    onClick={() => setGanttRangeDays(days)}
                                  >
                                    {days} {uiText("ui.portfolio.daysAbbrev")}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className={ganttRangeDays === null ? "active" : ""}
                                  onClick={() => setGanttRangeDays(null)}
                                >
                                  {uiText("ui.jira.all")}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  document
                                    .querySelector(".gantt-today")
                                    ?.scrollIntoView({
                                      inline: "center",
                                      block: "nearest",
                                      behavior: "smooth",
                                    })
                                }
                              >
                                <LocateFixed size={15} /> {uiText("ui.common.today")}
                              </button>
                              <details className="view-settings-menu">
                                <summary>{uiText("ui.projects.ganttViewSettingsLabel")}</summary>
                                <div className="view-settings-popover">
                                  <button
                                    type="button"
                                    className={showGanttDependencies ? "active" : ""}
                                    onClick={toggleGanttDependencies}
                                  >
                                    {uiText("ui.projects.ganttDependenciesToggle")}
                                  </button>
                                  <button
                                    type="button"
                                    className={showGanttCriticalPath ? "active" : ""}
                                    onClick={toggleGanttCriticalPath}
                                    title={uiText("ui.projects.ganttShowZeroFloatToggle")}
                                  >
                                    {uiText("ui.automation.criticalPath")}
                                  </button>
                                  <button
                                    type="button"
                                    className={showGanttBaseline ? "active" : ""}
                                    onClick={() =>
                                      setShowGanttBaseline((current) => !current)
                                    }
                                  >
                                    {uiText("ui.projects.ganttBaselineToggle")}
                                  </button>
                                  <button
                                    type="button"
                                    className={showGanttForecast ? "active" : ""}
                                    onClick={() =>
                                      setShowGanttForecast((current) => !current)
                                    }
                                  >
                                    {uiText("ui.projects.ganttForecastToggle")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void resetGanttPanelSize()}
                                  >
                                    {uiText("ui.projects.ganttResetSize")}
                                  </button>
                                </div>
                              </details>
                              <div className="segmented-control hierarchy-control" aria-label={uiText("ui.projects.ganttHierarchyDepthLabel")}>
                                {GANTT_HIERARCHY_LEVELS.map((level) => (
                                  <button
                                    type="button"
                                    key={level}
                                    className={activeWbsHierarchyLevel === level ? "active" : ""}
                                    onClick={() => setWbsHierarchyLevel(level)}
                                    title={`Показать иерархию до ${level} уровня`}
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="status-legend gantt-status-legend" aria-label={uiText("ui.projects.statusLegendTitle")}>
                              <span><i className="tone-b" />{uiText("ui.projects.statusInProgress")}</span>
                              <span><i className="tone-g" />{uiText("ui.projects.statusDone")}</span>
                              <span><i className="tone-r" />{uiText("ui.projects.statusFailed")}</span>
                              <span><i className="tone-p" />{uiText("ui.projects.statusOverdue")}</span>
                              <span><i className="tone-x" />{uiText("ui.projects.statusNotStarted")}</span>
                              <span><i className="tone-o" />{uiText("ui.projects.itemTypeMilestone")}</span>
                              <span><i className="tone-goal" />{uiText("ui.projects.itemTypeGoal")}</span>
                              <span><i className="tone-critical" />{uiText("ui.automation.criticalPath")}</span>
                              <span><i className="tone-near-critical" />{uiText("ui.projects.ganttFloatUpToFiveDays")}</span>
                            </div>
                            <div className="gantt-warnings">
                            {(scenario?.warnings ?? project.criticalPath?.warnings)?.map((warning) => (
                              <p className="gantt-warning" key={warning}>{warning}</p>
                            ))}
                            </div>
                          </div>
                          
                          <ProjectGanttPanel scenario={scenario} />
                        </>
                      );
}
