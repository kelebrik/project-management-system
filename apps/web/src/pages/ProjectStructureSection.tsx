import { Maximize2, Minimize2 } from "lucide-react";

import { usePageContext } from "./PageContext";
import type { WbsTableCssProperties } from "../app/uiStyleTypes";
import type { ProjectCalendarCode } from "../app/wbsTable";
import type { WbsItemStatus } from "../app/domainTypes";

export function ProjectStructureSection() {
  const {
    activeWbsHierarchyLevel,
    activeWbsItemId,
    dirtyWbsItemIds,
    draggedWbsColumn,
    draggedWbsItemId,
    dropWbsColumn,
    fullscreenWorkspaceView,
    GANTT_HIERARCHY_LEVELS,
    handleWbsPaste,
    isWbsCellDirty,
    orderedWbsColumns,
    project,
    redoWbsChange,
    renderSavedViewControls,
    renderWbsCell,
    reorderWbsRows,
    restoringWbsSnapshot,
    saveDirtyWbsItems,
    saveWbsBaseline,
    savingBaseline,
    savingWbsBulk,
    selectedWbsIds,
    setActiveWbsItemId,
    setDraggedWbsColumn,
    setSelectedWbsIds,
    setShowStructureCriticalPath,
    setShowWbsColumnMenu,
    setWbsDropTargetId,
    setWbsHierarchyLevel,
    showStructureCriticalPath,
    showWbsColumnMenu,
    startWbsColumnDrag,
    startWbsColumnResize,
    toggleWbsColumn,
    toggleWbsSort,
    toggleWorkspaceFullscreen,
    undoWbsChange,
    updateSelectedWbsDrafts,
    visibleStructureWbsTree,
    WBS_TABLE_COLUMNS,
    wbsDrafts,
    wbsDropTargetId,
    wbsHiddenColumns,
    wbsLevelWidth,
    wbsRedoStack,
    wbsSort,
    wbsStatusLabel,
    wbsTableTemplate,
    wbsUndoStack,
  } = usePageContext();

  return (
                        <>
                          <div className="gantt-controls wbs-structure-controls" aria-label="Панель управления Структурой">
                          <div className="gantt-controls-row">
                            <button
                              type="button"
                              className="workspace-fullscreen-button"
                              onClick={() =>
                                toggleWorkspaceFullscreen("project-structure")
                              }
                              aria-label={
                                fullscreenWorkspaceView === "project-structure"
                                  ? "Вернуть обычный режим Структуры"
                                  : "Развернуть Структуру на весь экран"
                              }
                              title={
                                fullscreenWorkspaceView === "project-structure"
                                  ? "Вернуть обычный режим"
                                  : "На весь экран"
                              }
                            >
                              {fullscreenWorkspaceView === "project-structure" ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                              {fullscreenWorkspaceView === "project-structure"
                                ? "Обычный режим"
                                : "На весь экран"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void undoWbsChange()}
                              onMouseDown={(event) => event.preventDefault()}
                              disabled={
                                restoringWbsSnapshot || wbsUndoStack.length === 0
                              }
                              aria-label="Откатить последнее изменение Структуры"
                              title="Назад"
                            >
                              ← Назад
                            </button>
                            <button
                              type="button"
                              onClick={() => void redoWbsChange()}
                              onMouseDown={(event) => event.preventDefault()}
                              disabled={
                                restoringWbsSnapshot || wbsRedoStack.length === 0
                              }
                              aria-label="Вернуть отмененное изменение Структуры"
                              title="Вперед"
                            >
                              Вперед →
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveDirtyWbsItems()}
                              disabled={savingWbsBulk || dirtyWbsItemIds.size === 0}
                            >
                              {savingWbsBulk ? "Сохраняю..." : "Сохранить изменения"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveWbsBaseline()}
                              disabled={savingBaseline || project.wbsItems.length === 0}
                            >
                              Зафиксировать базовый план
                            </button>
                            <button
                              type="button"
                              className={showStructureCriticalPath ? "active" : ""}
                              onClick={() =>
                                setShowStructureCriticalPath((current) => !current)
                              }
                              disabled={
                                (project.criticalPath?.criticalItemIds.length ?? 0) === 0
                              }
                              title="Показать только задачи критического пути"
                            >
                              Критический путь
                            </button>
                            <div className="column-menu">
                              <button
                                type="button"
                                onClick={() =>
                                  setShowWbsColumnMenu((current) => !current)
                                }
                              >
                                Колонки
                              </button>
                              {showWbsColumnMenu && (
                                <div className="column-menu-popover">
                                  {WBS_TABLE_COLUMNS.filter(
                                    (column) =>
                                      column.key !== "level" &&
                                      column.key !== "structure",
                                  ).map((column) => (
                                    <label key={column.key}>
                                      <input
                                        type="checkbox"
                                        checked={!wbsHiddenColumns.includes(column.key)}
                                        onChange={() => toggleWbsColumn(column.key)}
                                      />
                                      {column.label}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div
                              className="segmented-control hierarchy-control"
                              aria-label="Глубина иерархии Структуры"
                            >
                              {GANTT_HIERARCHY_LEVELS.map((level) => (
                                <button
                                  type="button"
                                  key={level}
                                  className={
                                    activeWbsHierarchyLevel === level ? "active" : ""
                                  }
                                  onClick={() => setWbsHierarchyLevel(level)}
                                  title={`Показать структуру до ${level} уровня`}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                            <span
                              className={`wbs-save-state ${dirtyWbsItemIds.size > 0 ? "dirty" : "saved"}`}
                            >
                              {dirtyWbsItemIds.size > 0
                                ? `Не сохранено: ${dirtyWbsItemIds.size}`
                                : "Сохранено"}
                            </span>
                          </div>
                          {renderSavedViewControls()}
                          {selectedWbsIds.size > 0 && (
                            <div className="wbs-bulk-toolbar">
                          <span>Выбрано: {selectedWbsIds.size}</span>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              updateSelectedWbsDrafts({
                                status: event.target.value as WbsItemStatus,
                              });
                              event.currentTarget.value = "";
                            }}
                            aria-label="Массово изменить статус"
                          >
                            <option value="">Статус</option>
                            <option value="NOT_STARTED">
                              {wbsStatusLabel("NOT_STARTED")}
                            </option>
                            <option value="IN_PROGRESS">
                              {wbsStatusLabel("IN_PROGRESS")}
                            </option>
                            <option value="AT_RISK">
                              {wbsStatusLabel("AT_RISK")}
                            </option>
                            <option value="BLOCKED">
                              {wbsStatusLabel("BLOCKED")}
                            </option>
                            <option value="DONE">{wbsStatusLabel("DONE")}</option>
                            <option value="CANCELLED">
                              {wbsStatusLabel("CANCELLED")}
                            </option>
                          </select>
                          <input
                            placeholder="Исполнитель"
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              updateSelectedWbsDrafts({
                                owner: event.currentTarget.value,
                              });
                              event.currentTarget.value = "";
                            }}
                            onBlur={(event) => {
                              if (!event.currentTarget.value.trim()) return;
                              updateSelectedWbsDrafts({
                                owner: event.currentTarget.value,
                              });
                              event.currentTarget.value = "";
                            }}
                          />
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              updateSelectedWbsDrafts({
                                calendarCode:
                                  event.target.value as ProjectCalendarCode,
                              });
                              event.currentTarget.value = "";
                            }}
                            aria-label="Массово изменить календарь"
                          >
                            <option value="">Календарь</option>
                            <option value="RU">RU</option>
                            <option value="CN">CN</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => setSelectedWbsIds(new Set())}
                          >
                            Снять выбор
                          </button>
                        </div>
                      )}
                          <div className="status-legend gantt-status-legend" aria-label="Легенда статусов Структуры">
                            <span><i className="tone-b" />В работе</span>
                            <span><i className="tone-g" />Сделано</span>
                            <span><i className="tone-r" />Провалено</span>
                            <span><i className="tone-p" />Просрочено</span>
                            <span><i className="tone-x" />Не начато</span>
                            <span><i className="tone-o" />Веха</span>
                          </div>
                        </div>
                    <div className="wbs-table-shell">
                      <div
                        className="wbs-excel-table"
                        onPaste={handleWbsPaste}
                        style={
                          {
                            "--wbs-table-template": wbsTableTemplate,
                            "--wbs-level-width": `${wbsLevelWidth}px`,
                          } as WbsTableCssProperties
                        }
                      >
                        <div className="wbs-table-head">
                          {orderedWbsColumns.map((column) => (
                            <span
                              key={column.key}
                              role="columnheader"
                              aria-sort={
                                wbsSort?.columnKey === column.key
                                  ? wbsSort.direction === "asc"
                                    ? "ascending"
                                    : "descending"
                                  : "none"
                              }
                              draggable={
                                column.key !== "level" &&
                                column.key !== "structure"
                              }
                            className={
                              draggedWbsColumn === column.key
                                ? `wbs-column-header ${column.key === "level" ? "level-column" : ""} ${column.key === "structure" ? "structure-column" : ""} dragging`
                                : `wbs-column-header ${column.key === "level" ? "level-column" : ""} ${column.key === "structure" ? "structure-column" : ""}`
                            }
                              onDragStart={(event) =>
                                startWbsColumnDrag(column.key, event)
                              }
                              onDragOver={(event) => {
                                if (
                                  draggedWbsColumn &&
                                  column.key !== "level" &&
                                  column.key !== "structure"
                                ) {
                                  event.preventDefault();
                                }
                              }}
                              onDrop={(event) => dropWbsColumn(column.key, event)}
                              onDragEnd={() => setDraggedWbsColumn(null)}
                            >
                              <button
                                type="button"
                                className={`wbs-column-sort ${wbsSort?.columnKey === column.key ? "active" : ""}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleWbsSort(column.key);
                                }}
                                title={`Сортировать по полю «${column.label}»`}
                              >
                                <span className="wbs-column-title">{column.label}</span>
                                <span className="wbs-sort-indicator" aria-hidden="true">
                                  {wbsSort?.columnKey === column.key
                                    ? wbsSort.direction === "asc"
                                      ? "↑"
                                      : "↓"
                                    : "↕"}
                                </span>
                              </button>
                              <button
                                type="button"
                                className="wbs-column-resizer"
                                onPointerDown={(event) =>
                                  startWbsColumnResize(column.key, event)
                                }
                                aria-label={`Изменить ширину колонки ${column.label}`}
                              />
                            </span>
                          ))}
                        </div>
                        {visibleStructureWbsTree.map((item) => {
                          const draft = wbsDrafts[item.id];
                          if (!draft) return null;
                          return (
                            <div
                              key={item.id}
                              className={`wbs-row-stack ${draggedWbsItemId === item.id ? "dragging" : ""} ${wbsDropTargetId === item.id ? "drop-target" : ""}`}
                              onDragOver={(event) => {
                                if (
                                  wbsSort ||
                                  !draggedWbsItemId ||
                                  draggedWbsItemId === item.id
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                setWbsDropTargetId(item.id);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (wbsSort) return;
                                const sourceId =
                                  event.dataTransfer.getData("application/x-wbs-item") ||
                                  draggedWbsItemId;
                                if (sourceId) {
                                  void reorderWbsRows(sourceId, item.id);
                                }
                              }}
                              onDragLeave={() =>
                                setWbsDropTargetId((current) =>
                                  current === item.id ? null : current,
                                )
                              }
                            >
                              <div
                                className={`wbs-table-row ${item.type === "MILESTONE" ? "milestone" : ""} ${activeWbsItemId === item.id ? "active" : ""}`}
                                onClick={() => setActiveWbsItemId(item.id)}
                              >
                                {orderedWbsColumns.map((column) => (
                                  <div
                                    key={`${item.id}-${column.key}`}
                                    className={`${isWbsCellDirty(column.key, item, draft) ? "dirty" : ""} ${
                                      column.key === "level"
                                        ? "wbs-cell-level"
                                        : column.key === "structure"
                                        ? "wbs-cell-structure"
                                        : "wbs-cell"
                                    }`}
                                  >
                                    {renderWbsCell(column.key, item, draft)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                          {project.wbsItems.length === 0 && (
                            <div className="empty-state">Структура еще не создана.</div>
                          )}
                          {project.wbsItems.length > 0 &&
                            visibleStructureWbsTree.length === 0 && (
                            <div className="empty-state">
                              Нет задач критического пути для текущего фильтра.
                            </div>
                          )}
                        </div>
                    </div>
                      </>
                      );
}
