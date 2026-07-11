import { useRef, useState } from "react";
import type {
  GanttLinkDraft,
  WbsSnapshot,
} from "../app/domainTypes";
import {
  GANTT_PANEL_HEIGHT_DEFAULT,
  GANTT_PANEL_WIDTH_DEFAULT,
  type GanttScale,
} from "../app/ganttConfig";
import {
  normalizeWbsColumnOrder,
  normalizeWbsColumnWidths,
  normalizeWbsHiddenColumns,
  type WbsSortState,
  type WbsTableColumnKey,
} from "../app/wbsTable";
import type { WbsFormState } from "../app/formState";

export function useWbsWorkspaceState() {
  const [wbsDrafts, setWbsDrafts] = useState<Record<string, WbsFormState>>({});
  const wbsDraftsRef = useRef<Record<string, WbsFormState>>({});
  const wbsSaveSequenceRef = useRef(0);
  const pendingWbsSaveCountRef = useRef(0);
  const latestWbsSaveSequenceByItemRef = useRef<Record<string, number>>({});
  const [collapsedWbsIds, setCollapsedWbsIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showGanttDependencies, setShowGanttDependencies] = useState(false);
  const [showGanttBaseline, setShowGanttBaseline] = useState(false);
  const [showGanttForecast, setShowGanttForecast] = useState(false);
  const [showGanttCriticalPath, setShowGanttCriticalPath] = useState(false);
  const [showStructureCriticalPath, setShowStructureCriticalPath] =
    useState(false);
  const [ganttScale, setGanttScale] = useState<GanttScale>("month");
  const [ganttRangeDays, setGanttRangeDays] = useState<30 | 90 | 180 | null>(90);
  const [showWbsColumnMenu, setShowWbsColumnMenu] = useState(false);
  const [ganttWbsWidth, setGanttWbsWidth] = useState(360);
  const [ganttPanelHeight, setGanttPanelHeight] = useState(
    GANTT_PANEL_HEIGHT_DEFAULT,
  );
  const [ganttPanelWidth, setGanttPanelWidth] = useState(
    GANTT_PANEL_WIDTH_DEFAULT,
  );
  const [wbsColumnWidths, setWbsColumnWidths] = useState<
    Record<WbsTableColumnKey, number>
  >(() => normalizeWbsColumnWidths());
  const [wbsColumnOrder, setWbsColumnOrder] = useState<WbsTableColumnKey[]>(
    () => normalizeWbsColumnOrder(),
  );
  const [wbsHiddenColumns, setWbsHiddenColumns] = useState<WbsTableColumnKey[]>(
    () => normalizeWbsHiddenColumns(),
  );
  const [wbsSort, setWbsSort] = useState<WbsSortState | null>(null);
  const [draggedWbsColumn, setDraggedWbsColumn] =
    useState<WbsTableColumnKey | null>(null);
  const [draggedWbsItemId, setDraggedWbsItemId] = useState<string | null>(null);
  const [wbsDropTargetId, setWbsDropTargetId] = useState<string | null>(null);
  const [wbsUndoStack, setWbsUndoStack] = useState<WbsSnapshot[]>([]);
  const [wbsRedoStack, setWbsRedoStack] = useState<WbsSnapshot[]>([]);
  const [restoringWbsSnapshot, setRestoringWbsSnapshot] = useState(false);
  const [activeWbsItemId, setActiveWbsItemId] = useState<string | null>(null);
  const [hoveredGanttItemId, setHoveredGanttItemId] = useState<string | null>(
    null,
  );
  const [ganttLinkDraft, setGanttLinkDraft] = useState<GanttLinkDraft | null>(
    null,
  );
  const ganttTimelineRef = useRef<HTMLDivElement | null>(null);
  const ganttLinkCompletedRef = useRef(false);
  const [selectedWbsIds, setSelectedWbsIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingWbsBulk, setSavingWbsBulk] = useState(false);
  const wbsUndoStackRef = useRef<WbsSnapshot[]>([]);
  const wbsRedoStackRef = useRef<WbsSnapshot[]>([]);

  return {
    wbsDrafts,
    setWbsDrafts,
    wbsDraftsRef,
    wbsSaveSequenceRef,
    pendingWbsSaveCountRef,
    latestWbsSaveSequenceByItemRef,
    collapsedWbsIds,
    setCollapsedWbsIds,
    showGanttDependencies,
    setShowGanttDependencies,
    showGanttBaseline,
    setShowGanttBaseline,
    showGanttForecast,
    setShowGanttForecast,
    showGanttCriticalPath,
    setShowGanttCriticalPath,
    showStructureCriticalPath,
    setShowStructureCriticalPath,
    ganttScale,
    setGanttScale,
    ganttRangeDays,
    setGanttRangeDays,
    showWbsColumnMenu,
    setShowWbsColumnMenu,
    ganttWbsWidth,
    setGanttWbsWidth,
    ganttPanelHeight,
    setGanttPanelHeight,
    ganttPanelWidth,
    setGanttPanelWidth,
    wbsColumnWidths,
    setWbsColumnWidths,
    wbsColumnOrder,
    setWbsColumnOrder,
    wbsHiddenColumns,
    setWbsHiddenColumns,
    wbsSort,
    setWbsSort,
    draggedWbsColumn,
    setDraggedWbsColumn,
    draggedWbsItemId,
    setDraggedWbsItemId,
    wbsDropTargetId,
    setWbsDropTargetId,
    wbsUndoStack,
    setWbsUndoStack,
    wbsRedoStack,
    setWbsRedoStack,
    restoringWbsSnapshot,
    setRestoringWbsSnapshot,
    activeWbsItemId,
    setActiveWbsItemId,
    hoveredGanttItemId,
    setHoveredGanttItemId,
    ganttLinkDraft,
    setGanttLinkDraft,
    ganttTimelineRef,
    ganttLinkCompletedRef,
    selectedWbsIds,
    setSelectedWbsIds,
    savingWbsBulk,
    setSavingWbsBulk,
    wbsUndoStackRef,
    wbsRedoStackRef,
  };
}
