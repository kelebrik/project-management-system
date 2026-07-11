import { LocateFixed, Maximize2, Minimize2, Redo2, Undo2 } from "lucide-react";

import { usePageContext } from "./PageContext";
import { ProjectGanttPanel } from "./ProjectGanttPanel";

export function ProjectGanttSection() {
  const {
    activeWbsHierarchyLevel,
    fullscreenWorkspaceView,
    GANTT_HIERARCHY_LEVELS,
    ganttScale,
    project,
    redoWbsChange,
    resetGanttPanelSize,
    restoringWbsSnapshot,
    setGanttScale,
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

  return (
                        <>
                            <div className="gantt-controls">
                              <div className="gantt-controls-row">
                            <button
                              type="button"
                              className="workspace-fullscreen-button"
                              onClick={() => toggleWorkspaceFullscreen("project-gantt")}
                              aria-label={
                                fullscreenWorkspaceView === "project-gantt"
                                  ? "Вернуть обычный режим Гантта"
                                  : "Развернуть Гантт на весь экран"
                              }
                              title={
                                fullscreenWorkspaceView === "project-gantt"
                                  ? "Вернуть обычный режим"
                                  : "На весь экран"
                              }
                            >
                              {fullscreenWorkspaceView === "project-gantt" ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                              {fullscreenWorkspaceView === "project-gantt"
                                ? "Обычный режим"
                                : "На весь экран"}
                            </button>
                                <button
                                  type="button"
                                  onClick={() => void undoWbsChange()}
                                onMouseDown={(event) => event.preventDefault()}
                                disabled={
                                  restoringWbsSnapshot ||
                                  wbsUndoStack.length === 0
                                }
                                aria-label="Откатить последнее изменение Гантта"
                                title="Назад"
                              >
                                <Undo2 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void redoWbsChange()}
                                onMouseDown={(event) => event.preventDefault()}
                                disabled={
                                  restoringWbsSnapshot ||
                                  wbsRedoStack.length === 0
                                }
                                aria-label="Вернуть отмененное изменение Гантта"
                                title="Вперед"
                              >
                                <Redo2 size={15} />
                              </button>
                              <div className="segmented-control" aria-label="Масштаб Гантта">
                                <button
                                  type="button"
                                  className={ganttScale === "week" ? "active" : ""}
                                  onClick={() => setGanttScale("week")}
                                >
                                  Недели
                                </button>
                                <button
                                  type="button"
                                  className={ganttScale === "month" ? "active" : ""}
                                  onClick={() => setGanttScale("month")}
                                >
                                  Месяцы
                                </button>
                                <button
                                  type="button"
                                  className={ganttScale === "quarter" ? "active" : ""}
                                  onClick={() => setGanttScale("quarter")}
                                >
                                  Кварталы
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
                                <LocateFixed size={15} /> Сегодня
                              </button>
                              <details className="view-settings-menu">
                                <summary>Настройки вида</summary>
                                <div className="view-settings-popover">
                                  <button
                                    type="button"
                                    className={showGanttDependencies ? "active" : ""}
                                    onClick={toggleGanttDependencies}
                                  >
                                    Связи
                                  </button>
                                  <button
                                    type="button"
                                    className={showGanttCriticalPath ? "active" : ""}
                                    onClick={toggleGanttCriticalPath}
                                    title="Показать задачи и связи с нулевым резервом"
                                  >
                                    Критический путь
                                  </button>
                                  <button
                                    type="button"
                                    className={showGanttBaseline ? "active" : ""}
                                    onClick={() =>
                                      setShowGanttBaseline((current) => !current)
                                    }
                                  >
                                    Базовый план
                                  </button>
                                  <button
                                    type="button"
                                    className={showGanttForecast ? "active" : ""}
                                    onClick={() =>
                                      setShowGanttForecast((current) => !current)
                                    }
                                  >
                                    Прогноз
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void resetGanttPanelSize()}
                                  >
                                    Сбросить размер
                                  </button>
                                </div>
                              </details>
                              <div className="segmented-control hierarchy-control" aria-label="Глубина иерархии Гантта">
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
                            <div className="status-legend gantt-status-legend" aria-label="Легенда статусов">
                              <span><i className="tone-b" />В работе</span>
                              <span><i className="tone-g" />Сделано</span>
                              <span><i className="tone-r" />Провалено</span>
                              <span><i className="tone-p" />Просрочено</span>
                              <span><i className="tone-x" />Не начато</span>
                              <span><i className="tone-o" />Веха</span>
                              <span><i className="tone-goal" />Цель</span>
                              <span><i className="tone-critical" />Критический путь</span>
                              <span><i className="tone-near-critical" />Резерв до 5 дн.</span>
                            </div>
                            {project.criticalPath?.warnings?.map((warning) => (
                              <p className="gantt-warning" key={warning}>{warning}</p>
                            ))}
                          </div>
                          
                          <ProjectGanttPanel />
                        </>
                      );
}
