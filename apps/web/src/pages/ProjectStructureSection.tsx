import { FileDown, Languages, Maximize2, Minimize2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { usePageContext } from "./PageContext";
import type { WbsFormState } from "../app/formState";
import { wbsToForm } from "../app/formState";
import {
  createWbsEnglishTranslationHtml,
  loadWbsEnglishManualTranslations,
  loadWbsEnglishTranslationCache,
  normalizeWbsEnglishSourceTitle,
  parseWbsEnglishTranslationHtml,
  resolveWbsEnglishTitle,
  saveWbsEnglishManualTranslations,
  WBS_COLUMN_EN_LABELS,
  WBS_STATUS_EN_LABELS,
  WBS_TYPE_EN_LABELS,
  wbsEnglishProjectName,
} from "../app/wbsEnglishPrint";
import { resolveDraftPredecessorCode, wbsDraftDisplayLevel } from "../app/wbsTree";
import type { WbsTableCssProperties } from "../app/uiStyleTypes";
import type { ProjectCalendarCode, WbsTableColumnKey } from "../app/wbsTable";
import type { WbsItemStatus, WbsTreeItem } from "../app/domainTypes";

function emptyValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function formatPercent(value: string | number | null | undefined) {
  const normalizedValue = emptyValue(value);
  return normalizedValue ? `${normalizedValue}%` : "";
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function ProjectStructureSection() {
  const {
    activeWbsHierarchyLevel,
    activeWbsItemId,
    dirtyWbsItemIds,
    draggedWbsColumn,
    draggedWbsItemId,
    dropWbsColumn,
    draftWbsCodes,
    fullscreenWorkspaceView,
    GANTT_HIERARCHY_LEVELS,
    handleWbsPaste,
    isWbsCellDirty,
    orderedWbsColumns,
    project,
    printSectionAsPdf,
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
    wbsTree,
    wbsUndoStack,
  } = usePageContext();

  const englishProjectName = wbsEnglishProjectName(project.name);
  const englishPrintTitle = `${englishProjectName} - Structure`;
  const [showEnglishMenu, setShowEnglishMenu] = useState(false);
  const translationImportInputRef = useRef<HTMLInputElement | null>(null);
  const [manualEnglishTranslations, setManualEnglishTranslations] = useState(
    () => loadWbsEnglishManualTranslations(),
  );
  const [cachedEnglishTranslations] = useState(
    () => loadWbsEnglishTranslationCache(),
  );

  const englishStructureRows = useMemo(
    () =>
      visibleStructureWbsTree.map((item: WbsTreeItem) => {
        const draft = wbsDrafts[item.id] ?? wbsToForm(item);
        const displayCode = draftWbsCodes.get(item.id) ?? draft.code;
        const translation = resolveWbsEnglishTitle({
          code: displayCode,
          title: draft.title,
          projectName: project.name,
          manualTranslations: manualEnglishTranslations,
          cachedTranslations: cachedEnglishTranslations,
        });
        return {
          draft,
          displayCode,
          displayLevel: wbsDraftDisplayLevel(item, draft),
          item,
          normalizedTitle: normalizeWbsEnglishSourceTitle(draft.title),
          translation,
        };
      }),
    [
      cachedEnglishTranslations,
      draftWbsCodes,
      manualEnglishTranslations,
      project.name,
      visibleStructureWbsTree,
      wbsDrafts,
    ],
  );
  const editableEnglishRows = useMemo(() => {
    const seenTitles = new Set<string>();
    return englishStructureRows.filter((row) => {
      if (!row.normalizedTitle || seenTitles.has(row.normalizedTitle)) {
        return false;
      }
      seenTitles.add(row.normalizedTitle);
      return true;
    });
  }, [englishStructureRows]);

  const exportEnglishTranslationsHtml = () => {
    const html = createWbsEnglishTranslationHtml({
      projectName: englishProjectName,
      exportedAt: new Date(),
      rows: editableEnglishRows.map((row) => ({
        code: row.displayCode,
        sourceTitle: row.draft.title,
        translatedTitle: row.translation.text,
        translationSource: row.translation.source,
      })),
    });
    downloadTextFile(
      `${safeFilename(englishProjectName || "Project")} - WBS EN translations.html`,
      html,
      "text/html;charset=utf-8",
    );
    setShowEnglishMenu(false);
  };

  const importEnglishTranslationsHtml = async (file: File | null | undefined) => {
    if (!file) return;
    const html = await file.text();
    const importedTranslations = parseWbsEnglishTranslationHtml(html);
    const nextTranslations = {
      ...manualEnglishTranslations,
      ...importedTranslations,
    };
    setManualEnglishTranslations(nextTranslations);
    saveWbsEnglishManualTranslations(nextTranslations);
    setShowEnglishMenu(false);
  };

  const handleEnglishImportInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    void importEnglishTranslationsHtml(file).finally(() => {
      if (translationImportInputRef.current) {
        translationImportInputRef.current.value = "";
      }
    });
  };

  const englishWbsCellValue = (
    columnKey: WbsTableColumnKey,
    item: WbsTreeItem,
    draft: WbsFormState,
    displayCode: string,
    translatedTitle: string,
  ) => {
    switch (columnKey) {
      case "level":
        return draft.wbsLevel || emptyValue(item.wbsLevel ?? item.level + 1);
      case "structure":
        return `${displayCode} ${translatedTitle}`.trim();
      case "type":
        return WBS_TYPE_EN_LABELS[draft.type];
      case "status":
        return WBS_STATUS_EN_LABELS[draft.status];
      case "owner":
        return draft.owner;
      case "start":
        return draft.startDate;
      case "due":
        return draft.dueDate;
      case "workDays":
        return draft.workDays;
      case "calendarDays":
        return draft.calendarDays;
      case "calendar":
        return draft.calendarCode;
      case "effortPercent":
        return formatPercent(draft.effortPercent);
      case "progress":
        return formatPercent(draft.progress);
      case "jiraTicketUrl":
        return draft.jiraTicketUrl;
      case "predecessor1":
      case "predecessor2":
      case "predecessor3":
      case "predecessor4":
      case "predecessor5":
      case "predecessor6":
        return resolveDraftPredecessorCode(
          draft[columnKey],
          wbsTree,
          wbsDrafts,
          draftWbsCodes,
        );
      case "leadLag":
        return draft.leadLagDays;
      default:
        return "";
    }
  };

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
                            <button
                              type="button"
                              className="wbs-pdf-button"
                              onClick={() =>
                                printSectionAsPdf(
                                  "project-structure-print",
                                  `${project.name ?? "Проект"} - Структура`,
                                )
                              }
                              disabled={project.wbsItems.length === 0}
                              title="Сохранить Структуру в PDF"
                            >
                              <FileDown size={15} />
                              PDF
                            </button>
                            <button
                              type="button"
                              className="wbs-pdf-button"
                              onClick={() =>
                                printSectionAsPdf(
                                  "project-structure-print-en",
                                  englishPrintTitle,
                                )
                              }
                              disabled={project.wbsItems.length === 0}
                              title="Save Structure to PDF in English"
                            >
                              <FileDown size={15} />
                              PDF EN
                            </button>
                            <div className="column-menu wbs-en-menu">
                              <button
                                type="button"
                                className="wbs-pdf-button"
                                onClick={() =>
                                  setShowEnglishMenu((current) => !current)
                                }
                                title="Импорт и экспорт английских переводов Структуры"
                              >
                                <Languages size={15} />
                                EN
                              </button>
                              {showEnglishMenu && (
                                <div className="column-menu-popover wbs-en-menu-popover">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      translationImportInputRef.current?.click()
                                    }
                                  >
                                    Import
                                  </button>
                                  <button
                                    type="button"
                                    onClick={exportEnglishTranslationsHtml}
                                    disabled={editableEnglishRows.length === 0}
                                  >
                                    Export
                                  </button>
                                </div>
                              )}
                              <input
                                ref={translationImportInputRef}
                                type="file"
                                accept=".html,text/html"
                                className="wbs-translation-import-input"
                                onChange={handleEnglishImportInputChange}
                              />
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
                            <option value="IN_REVIEW">
                              {wbsStatusLabel("IN_REVIEW")}
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
                    <div
                      className="wbs-table-shell"
                      data-print-section="project-structure"
                      id="project-structure-print"
                    >
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
                    <div
                      className="wbs-english-print-shell"
                      data-print-section="project-structure-en"
                      id="project-structure-print-en"
                      aria-hidden="true"
                    >
                      <div className="wbs-english-print-title">
                        {englishPrintTitle}
                      </div>
                      <div
                        className="wbs-english-print-table"
                        style={
                          {
                            "--wbs-table-template": wbsTableTemplate,
                          } as WbsTableCssProperties
                        }
                      >
                        <div className="wbs-english-print-head">
                          {orderedWbsColumns.map((column) => (
                            <div
                              key={`en-head-${column.key}`}
                              className={`wbs-english-print-cell wbs-english-print-head-cell ${
                                column.key === "level"
                                  ? "level-column"
                                  : column.key === "structure"
                                  ? "structure-column"
                                  : ""
                              }`}
                            >
                              {WBS_COLUMN_EN_LABELS[column.key]}
                            </div>
                          ))}
                        </div>
                        {englishStructureRows.map((row) => {
                          const {
                            displayCode,
                            displayLevel,
                            draft,
                            item,
                            translation,
                          } = row;
                          const translatedTitle = translation.text;
                          return (
                            <div
                              key={`en-row-${item.id}`}
                              className={`wbs-english-print-row ${
                                item.type === "MILESTONE" || item.type === "GOAL"
                                  ? "milestone"
                                  : ""
                              }`}
                            >
                              {orderedWbsColumns.map((column) => (
                                <div
                                  key={`en-cell-${item.id}-${column.key}`}
                                  className={`wbs-english-print-cell ${
                                    column.key === "level"
                                      ? "wbs-english-print-level"
                                      : column.key === "structure"
                                      ? "wbs-english-print-structure"
                                      : ""
                                  }`}
                                >
                                  {column.key === "structure" ? (
                                    <div
                                      className="wbs-english-structure-cell"
                                      style={{
                                        paddingLeft: `${displayLevel * 12 + 4}px`,
                                      }}
                                    >
                                      <span className="wbs-english-code">
                                        {displayCode}
                                      </span>
                                      <span>{translatedTitle}</span>
                                    </div>
                                  ) : (
                                    englishWbsCellValue(
                                      column.key,
                                      item,
                                      draft,
                                      displayCode,
                                      translatedTitle,
                                    )
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                      </>
                      );
}
