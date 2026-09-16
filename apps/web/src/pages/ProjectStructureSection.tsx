import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import { FileDown, Languages, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";
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
import {
  focusedWbsBranchState,
  resolveDraftPredecessorCode,
  wbsDraftDisplayLevel,
} from "../app/wbsTree";
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
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
  const {
    activeWbsHierarchyLevel,
    activeWbsItemId,
    dirtyWbsItemIds,
    deleteSelectedWbsItems,
    draggedWbsColumn,
    draggedWbsItemId,
    dropWbsColumn,
    draftWbsCodes,
    fullscreenWorkspaceView,
    GANTT_HIERARCHY_LEVELS,
    handleWbsPaste,
    isWbsCellDirty,
    isReadOnly,
    isAdminUser,
    orderedWbsColumns,
    project,
    printSectionAsPdf,
    redoWbsChange,
    renderWbsCell,
    reorderWbsRows,
    restoringWbsSnapshot,
    saveDirtyWbsItems,
    saveWbsBaseline,
    savingBaseline,
    savingWbsBulk,
    selectedWbsIds,
    setActiveWbsItemId,
    setCollapsedWbsIds,
    setDraggedWbsColumn,
    setSelectedWbsIds,
    setShowWbsColumnMenu,
    setShowStructureCriticalPath,
    setWbsDropTargetId,
    setWbsHierarchyLevel,
    setWbsSort,
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
  const confirm = useConfirm();
  const [requestedFocusItemId] = useState(() =>
    new URLSearchParams(window.location.search).get("focusWbs"),
  );
  const focusedBranch = useMemo(
    () =>
      requestedFocusItemId
        ? focusedWbsBranchState(project.wbsItems, requestedFocusItemId)
        : null,
    [project.wbsItems, requestedFocusItemId],
  );
  const appliedFocusItemIdRef = useRef<string | null>(null);
  const scrolledFocusItemIdRef = useRef<string | null>(null);

  const englishProjectName = wbsEnglishProjectName(project.name);
  const englishPrintTitle = `${englishProjectName} - Structure`;
  const [showEnglishMenu, setShowEnglishMenu] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const previousDirtyCountRef = useRef(dirtyWbsItemIds.size);
  const translationImportInputRef = useRef<HTMLInputElement | null>(null);
  const [manualEnglishTranslations, setManualEnglishTranslations] = useState(
    () => loadWbsEnglishManualTranslations(),
  );
  const [cachedEnglishTranslations] = useState(
    () => loadWbsEnglishTranslationCache(),
  );

  useLayoutEffect(() => {
    if (
      !focusedBranch ||
      appliedFocusItemIdRef.current === focusedBranch.activeItemId
    ) {
      return;
    }
    appliedFocusItemIdRef.current = focusedBranch.activeItemId;
    setWbsSort(null);
    setShowStructureCriticalPath(false);
    setCollapsedWbsIds(focusedBranch.collapsedIds);
    setActiveWbsItemId(focusedBranch.activeItemId);
  }, [
    focusedBranch,
    setActiveWbsItemId,
    setCollapsedWbsIds,
    setShowStructureCriticalPath,
    setWbsSort,
  ]);

  useEffect(() => {
    if (
      !focusedBranch ||
      scrolledFocusItemIdRef.current === focusedBranch.activeItemId
    ) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      const focusedRow = document.getElementById(
        `wbs-item-${focusedBranch.scrollItemId}`,
      );
      if (!focusedRow) return;
      scrolledFocusItemIdRef.current = focusedBranch.activeItemId;
      focusedRow.scrollIntoView({ behavior: "smooth", block: "center" });
      const url = new URL(window.location.href);
      url.searchParams.delete("focusWbs");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [focusedBranch, visibleStructureWbsTree]);
  const selectedWbsItemIds = useMemo(
    () => [...selectedWbsIds],
    [selectedWbsIds],
  );
  const selectedBaselineHasUnsavedChanges = selectedWbsItemIds.some((itemId) =>
    dirtyWbsItemIds.has(itemId),
  );

  useEffect(() => {
    if (
      previousDirtyCountRef.current > 0 &&
      dirtyWbsItemIds.size === 0 &&
      !savingWbsBulk
    ) {
      setLastSavedAt(new Date());
    }
    previousDirtyCountRef.current = dirtyWbsItemIds.size;
  }, [dirtyWbsItemIds.size, savingWbsBulk]);

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
      case "comment":
        return draft.comment;
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
      case "mattermostUrl":
        return draft.mattermostUrl;
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
                          <div className="gantt-controls wbs-structure-controls" aria-label={uiText("ui.projects.structureToolbarLabel")}>
                          <div className="gantt-controls-row">
                            <button
                              type="button"
                              className="workspace-fullscreen-button"
                              onClick={() =>
                                toggleWorkspaceFullscreen("project-structure")
                              }
                              aria-label={
                                fullscreenWorkspaceView === "project-structure"
                                  ? uiText("ui.projects.structureExitFullScreen")
                                  : uiText("ui.projects.structureEnterFullScreen")
                              }
                              title={
                                fullscreenWorkspaceView === "project-structure"
                                  ? uiText("ui.common.exitFullscreen")
                                  : uiText("ui.common.fullScreen")
                              }
                            >
                              {fullscreenWorkspaceView === "project-structure" ? (
                                <Minimize2 size={15} />
                              ) : (
                                <Maximize2 size={15} />
                              )}
                              {fullscreenWorkspaceView === "project-structure"
                                ? uiText("ui.common.normalMode")
                                : uiText("ui.common.fullScreen")}
                            </button>
                            {!isReadOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void undoWbsChange()}
                                  onMouseDown={(event) => event.preventDefault()}
                                  disabled={
                                    restoringWbsSnapshot ||
                                    wbsUndoStack.length === 0
                                  }
                                  aria-label={uiText("ui.projects.structureUndoLastChange")}
                                  title={uiText("ui.projects.undoBackLabel")}
                                >
                                  {uiText("ui.projects.structureUndoBackLabel")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void redoWbsChange()}
                                  onMouseDown={(event) => event.preventDefault()}
                                  disabled={
                                    restoringWbsSnapshot ||
                                    wbsRedoStack.length === 0
                                  }
                                  aria-label={uiText("ui.projects.structureRedoLastChange")}
                                  title={uiText("ui.projects.redoForwardLabel")}
                                >
                                  {uiText("ui.projects.structureRedoForwardLabel")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveDirtyWbsItems()}
                                  disabled={
                                    savingWbsBulk || dirtyWbsItemIds.size === 0
                                  }
                                >
                                  {savingWbsBulk
                                    ? uiText("ui.admin.savingEllipsisDots")
                                    : uiText("ui.projects.saveChangesAction")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void saveWbsBaseline()}
                                  disabled={
                                    savingBaseline ||
                                    project.wbsItems.length === 0
                                  }
                                >
                                  {uiText("ui.projects.structureSetBaselineAction")}
                                </button>
                              </>
                            )}
                            <div className="column-menu">
                              <button
                                type="button"
                                onClick={() =>
                                  setShowWbsColumnMenu((current) => !current)
                                }
                              >
                                {uiText("ui.projects.structureColumnsAction")}
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
                                      {uiText(`work.column.${column.key as WbsTableColumnKey}`)}
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
                                  uiText("structure.printTitle", { name: project.name ?? uiText("structure.projectFallback") }),
                                )
                              }
                              disabled={project.wbsItems.length === 0}
                              title={uiText("ui.projects.structureSaveToPdfAction")}
                            >
                              <FileDown size={15} />
                              PDF
                            </button>
                            {uiLocale === "ru" && <button
                              type="button"
                              className="wbs-pdf-button"
                              onClick={() =>
                                printSectionAsPdf(
                                  "project-structure-print-en",
                                  englishPrintTitle,
                                )
                              }
                              disabled={project.wbsItems.length === 0}
                              title={uiText("structure.savePdfEnAction")}
                            >
                              <FileDown size={15} />
                              PDF EN
                            </button>}
                            {uiLocale === "ru" && <div className="column-menu wbs-en-menu">
                              <button
                                type="button"
                                className="wbs-pdf-button"
                                onClick={() =>
                                  setShowEnglishMenu((current) => !current)
                                }
                                title={uiText("ui.projects.structureTranslationsImportExportAction")}
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
                                    {uiText("structure.translationsImport")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={exportEnglishTranslationsHtml}
                                    disabled={editableEnglishRows.length === 0}
                                  >
                                    {uiText("structure.translationsExport")}
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
                            </div>}
                            <div
                              className="segmented-control hierarchy-control"
                              aria-label={uiText("ui.projects.structureHierarchyDepthLabel")}
                            >
                              {GANTT_HIERARCHY_LEVELS.map((level) => (
                                <button
                                  type="button"
                                  key={level}
                                  className={
                                    activeWbsHierarchyLevel === level ? "active" : ""
                                  }
                                  onClick={() => setWbsHierarchyLevel(level)}
                                  title={uiText("structure.showLevel", { level })}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                            <span
                              className={`wbs-save-state ${savingWbsBulk ? "saving" : dirtyWbsItemIds.size > 0 ? "dirty" : "saved"}`}
                            >
                              {savingWbsBulk
                                ? uiText("structure.savingCount", { count: dirtyWbsItemIds.size })
                                : dirtyWbsItemIds.size > 0
                                  ? uiText("structure.dirtyCount", { count: dirtyWbsItemIds.size })
                                  : lastSavedAt
                                    ? uiText("structure.savedAt", { time: lastSavedAt.toLocaleTimeString(intlLocale(uiLocale), { hour: "2-digit", minute: "2-digit" }) })
                                    : uiText("ui.projects.allChangesSavedNotice")}
                            </span>
                          </div>
                          {selectedWbsIds.size > 0 && (
                            <div className="wbs-bulk-toolbar">
                          <span>{uiText("ui.projects.selectedCountPrefix")} {selectedWbsIds.size}</span>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (!event.target.value) return;
                              const status =
                                event.target.value as WbsItemStatus;
                              updateSelectedWbsDrafts({
                                status,
                                ...(status === "CANCELLED"
                                  ? { workDays: "0" }
                                  : {}),
                              });
                              event.currentTarget.value = "";
                            }}
                            aria-label={uiText("ui.projects.structureBulkChangeStatusAction")}
                          >
                            <option value="">{uiText("ui.admin.status")}</option>
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
                            placeholder={uiText("ui.jira.assignee")}
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
                            className="wbs-bulk-calendar"
                            aria-label={uiText("ui.projects.structureBulkChangeCalendarAction")}
                          >
                            <option value="">{uiText("ui.projects.calendarLabel")}</option>
                            <option value="RU">RU</option>
                            <option value="CN">CN</option>
                            <option value="RU_CN">RU+CN</option>
                          </select>
                          {isAdminUser && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => void saveWbsBaseline(selectedWbsItemIds)}
                              disabled={
                                savingBaseline ||
                                savingWbsBulk ||
                                selectedBaselineHasUnsavedChanges
                              }
                              title={
                                selectedBaselineHasUnsavedChanges
                                  ? uiText("ui.projects.structureSaveSelectedFirstHint")
                                  : uiText("ui.projects.structureSetSelectedDatesAsBaselineHint")
                              }
                            >
                              <RefreshCw size={15} />
                              {savingBaseline
                                ? uiText("ui.projects.structureUpdatingBaselineMessage")
                                : uiText("ui.projects.structureUpdateBaselineAction")}
                            </button>
                          )}
                          <button
                            type="button"
                            className="danger-button"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: uiText("structure.deleteTitle"),
                                  message:
                                    uiText("structure.deleteBody"),
                                  confirmLabel: uiText("structure.deleteAction"),
                                })
                              ) {
                                void deleteSelectedWbsItems();
                              }
                            }}
                            disabled={savingWbsBulk}
                          >
                            {uiText("ui.projects.deleteSelectedAction")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedWbsIds(new Set())}
                            disabled={savingWbsBulk}
                          >
                            {uiText("ui.projects.clearSelectionAction")}
                          </button>
                        </div>
                      )}
                          <div className="status-legend gantt-status-legend" aria-label={uiText("ui.projects.structureStatusLegendLabel")}>
                            <span><i className="tone-b" />{uiText("ui.projects.statusInProgress")}</span>
                            <span><i className="tone-g" />{uiText("ui.projects.statusDone")}</span>
                            <span><i className="tone-r" />{uiText("ui.projects.statusFailed")}</span>
                            <span><i className="tone-p" />{uiText("ui.projects.statusOverdue")}</span>
                            <span><i className="tone-x" />{uiText("ui.projects.statusNotStarted")}</span>
                            <span><i className="tone-o" />{uiText("ui.projects.itemTypeMilestone")}</span>
                            <span><i className="tone-goal" />{uiText("ui.projects.itemTypeGoal")}</span>
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
                                title={uiText("structure.sortColumn", { label: uiText(`work.column.${column.key as WbsTableColumnKey}`) })}
                              >
                                <span className="wbs-column-title">{uiText(`work.column.${column.key as WbsTableColumnKey}`)}</span>
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
                                aria-label={uiText("work.resizeColumn", { label: uiText(`work.column.${column.key as WbsTableColumnKey}`) })}
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
                              id={`wbs-item-${item.id}`}
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
                            <div className="empty-state">{uiText("ui.projects.structureNotCreatedYet")}</div>
                          )}
                          {project.wbsItems.length > 0 &&
                            visibleStructureWbsTree.length === 0 && (
                            <div className="empty-state">
                              {uiText("ui.projects.structureNoCriticalPathTasksForFilter")}
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
