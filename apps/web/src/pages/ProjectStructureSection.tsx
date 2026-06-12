import { Maximize2, Minimize2 } from "lucide-react";

import { usePageContext } from "./PageContext";
import type { WbsTableCssProperties } from "../app/uiStyleTypes";
import type { ProjectCalendarCode } from "../app/wbsTable";
import type { WbsItem, WbsItemStatus } from "../app/domainTypes";
import { wbsToForm, type WbsFormState } from "../app/formState";

const DAY_MS = 86_400_000;

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseLocalDate(value: string | null) {
  if (!value) return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function nextWeekRange(today = new Date()) {
  const currentDay = startOfLocalDay(today);
  const mondayBasedDay = (currentDay.getDay() + 6) % 7;
  const start = new Date(currentDay.getTime() + (7 - mondayBasedDay) * DAY_MS);
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  const endInclusive = new Date(endExclusive.getTime() - DAY_MS);
  return { start, endExclusive, endInclusive };
}

function dateInRange(value: string | null, start: Date, endExclusive: Date) {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) return false;
  const date = startOfLocalDay(parsedDate);
  return date >= start && date < endExclusive;
}

function workTaskDateTime(value: string | null) {
  return parseLocalDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function compareWorkTasks(
  left: WbsItem,
  right: WbsItem,
  wbsDrafts: Record<string, WbsFormState>,
) {
  const leftDraft = taskDraft(left, wbsDrafts);
  const rightDraft = taskDraft(right, wbsDrafts);
  return (
    workTaskDateTime(leftDraft.startDate) - workTaskDateTime(rightDraft.startDate) ||
    workTaskDateTime(leftDraft.dueDate) - workTaskDateTime(rightDraft.dueDate) ||
    left.sortOrder - right.sortOrder ||
    left.code.localeCompare(right.code, "ru")
  );
}

function taskDraft(item: WbsItem, wbsDrafts: Record<string, WbsFormState>) {
  return wbsDrafts[item.id] ?? wbsToForm(item);
}

export function ProjectStructureSection() {
  const {
    activeWbsHierarchyLevel,
    activeWbsItemId,
    date,
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
    saveWbsDraftPatch,
    saveWbsItem,
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
    updateWbsDraft,
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
  const nextWeek = nextWeekRange();
  const allTasks = (project.wbsItems as WbsItem[])
    .filter((item) => item.type === "TASK")
    .sort((left, right) => compareWorkTasks(left, right, wbsDrafts));
  const tasksInProgress = allTasks.filter((item) => {
    const draft = taskDraft(item, wbsDrafts);
    return draft.status === "IN_PROGRESS";
  });
  const tasksStartingNextWeek = allTasks.filter((item) => {
    const draft = taskDraft(item, wbsDrafts);
    return (
      draft.status !== "DONE" &&
      draft.status !== "CANCELLED" &&
      dateInRange(draft.startDate, nextWeek.start, nextWeek.endExclusive)
    );
  });
  const saveTaskTitle = (itemId: string) => {
    void saveWbsItem(itemId, { silent: true });
  };
  const saveTaskStatus = (itemId: string, status: WbsItemStatus) => {
    saveWbsDraftPatch(itemId, { status }, { silent: true });
  };
  const saveTaskStart = (itemId: string, startDate: string) => {
    saveWbsDraftPatch(
      itemId,
      {
        startDate,
        forecastStartDate: startDate,
        excelStartDate: startDate,
      },
      { silent: true, scheduleDriver: "dates" },
    );
  };
  const saveTaskDue = (itemId: string, dueDate: string) => {
    saveWbsDraftPatch(
      itemId,
      {
        dueDate,
        forecastDueDate: dueDate,
        excelEndDate: dueDate,
      },
      { silent: true, scheduleDriver: "dates" },
    );
  };
  const renderWorkSummaryRows = (items: WbsItem[], emptyText: string) => {
    if (items.length === 0) {
      return <div className="work-summary-empty">{emptyText}</div>;
    }
    return (
      <div className="work-summary-table">
        <div className="work-summary-head">
          <span>Код</span>
          <span>Наименование</span>
          <span>Статус</span>
          <span>Старт</span>
          <span>Срок</span>
        </div>
        {items.map((item) => {
          const draft = taskDraft(item, wbsDrafts);
          return (
            <div
              className="work-summary-row"
              key={item.id}
              onFocus={() => setActiveWbsItemId(item.id)}
            >
              <button
                type="button"
                className="work-summary-code"
                onClick={() => setActiveWbsItemId(item.id)}
                title="Выделить задачу в Структуре"
              >
                {item.code}
              </button>
              <input
                value={draft.title}
                onChange={(event) =>
                  updateWbsDraft(item.id, { title: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => saveTaskTitle(item.id)}
              />
              <select
                value={draft.status}
                onChange={(event) =>
                  saveTaskStatus(item.id, event.target.value as WbsItemStatus)
                }
              >
                <option value="NOT_STARTED">
                  {wbsStatusLabel("NOT_STARTED")}
                </option>
                <option value="IN_PROGRESS">
                  {wbsStatusLabel("IN_PROGRESS")}
                </option>
                <option value="AT_RISK">{wbsStatusLabel("AT_RISK")}</option>
                <option value="BLOCKED">{wbsStatusLabel("BLOCKED")}</option>
                <option value="DONE">{wbsStatusLabel("DONE")}</option>
                <option value="CANCELLED">
                  {wbsStatusLabel("CANCELLED")}
                </option>
              </select>
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => saveTaskStart(item.id, event.target.value)}
              />
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => saveTaskDue(item.id, event.target.value)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
                        <>
                          <section className="work-summary-section">
                            <div className="panel-title">
                              <div>
                                <h2>Сводка по работам</h2>
                                <p>
                                  Задачи в работе и задачи со стартом на следующей неделе
                                </p>
                              </div>
                            </div>
                            <div className="work-summary-grid">
                              <article className="work-summary-pane">
                                <div className="work-summary-pane-title">
                                  <h3>Задачи в работе</h3>
                                  <span>{tasksInProgress.length}</span>
                                </div>
                                {renderWorkSummaryRows(
                                  tasksInProgress,
                                  "Задач в работе нет.",
                                )}
                              </article>
                              <article className="work-summary-pane">
                                <div className="work-summary-pane-title">
                                  <h3>Старт на следующей неделе</h3>
                                  <span>
                                    {date(nextWeek.start)} - {date(nextWeek.endInclusive)}
                                  </span>
                                </div>
                                {renderWorkSummaryRows(
                                  tasksStartingNextWeek,
                                  "Задач со стартом на следующей неделе нет.",
                                )}
                              </article>
                            </div>
                          </section>
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
                            <span><i className="tone-goal" />Цель</span>
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
                                className={`wbs-table-row ${
                                  item.type === "MILESTONE" || item.type === "GOAL"
                                    ? "milestone"
                                    : ""
                                } ${activeWbsItemId === item.id ? "active" : ""}`}
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
