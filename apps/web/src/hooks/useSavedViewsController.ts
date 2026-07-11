import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { apiClient } from "../api/client";
import type { SavedView } from "../app/domainTypes";
import { GANTT_HIERARCHY_LEVELS, clampNumber, type GanttScale } from "../app/ganttConfig";
import type { RaidTypeFilter } from "../app/raidModels";
import type { AppView } from "../app/routes";
import {
  normalizeWbsColumnOrder,
  normalizeWbsColumnWidths,
  normalizeWbsHiddenColumns,
  normalizeWbsSort,
  type WbsSortState,
  type WbsTableColumnKey,
} from "../app/wbsTable";

type UseSavedViewsControllerOptions = {
  activeView: AppView;
  authReady: boolean;
  selectedProjectId: string | null;
  currentUserRole: string | undefined;
  savedViewName: string;
  setSavedViews: Dispatch<SetStateAction<SavedView[]>>;
  setSavedViewName: Dispatch<SetStateAction<string>>;
  setSavingSavedView: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  wbsColumnOrder: WbsTableColumnKey[];
  setWbsColumnOrder: Dispatch<SetStateAction<WbsTableColumnKey[]>>;
  wbsHiddenColumns: WbsTableColumnKey[];
  setWbsHiddenColumns: Dispatch<SetStateAction<WbsTableColumnKey[]>>;
  wbsColumnWidths: Record<WbsTableColumnKey, number>;
  setWbsColumnWidths: Dispatch<SetStateAction<Record<WbsTableColumnKey, number>>>;
  wbsSort: WbsSortState | null;
  setWbsSort: Dispatch<SetStateAction<WbsSortState | null>>;
  activeWbsHierarchyLevel: number | null;
  setWbsHierarchyLevel: (level: number) => void;
  showStructureCriticalPath: boolean;
  setShowStructureCriticalPath: Dispatch<SetStateAction<boolean>>;
  ganttScale: GanttScale;
  setGanttScale: Dispatch<SetStateAction<GanttScale>>;
  ganttRangeDays: 30 | 90 | 180 | null;
  setGanttRangeDays: Dispatch<SetStateAction<30 | 90 | 180 | null>>;
  showGanttDependencies: boolean;
  setShowGanttDependencies: Dispatch<SetStateAction<boolean>>;
  showGanttCriticalPath: boolean;
  setShowGanttCriticalPath: Dispatch<SetStateAction<boolean>>;
  showGanttBaseline: boolean;
  setShowGanttBaseline: Dispatch<SetStateAction<boolean>>;
  showGanttForecast: boolean;
  setShowGanttForecast: Dispatch<SetStateAction<boolean>>;
  ganttWbsWidth: number;
  setGanttWbsWidth: Dispatch<SetStateAction<number>>;
  ganttPanelHeight: number;
  setGanttPanelHeight: Dispatch<SetStateAction<number>>;
  ganttPanelWidth: number;
  setGanttPanelWidth: Dispatch<SetStateAction<number>>;
  raidTypeFilter: RaidTypeFilter;
  setRaidTypeFilter: Dispatch<SetStateAction<RaidTypeFilter>>;
  raidDecisionOnly: boolean;
  setRaidDecisionOnly: Dispatch<SetStateAction<boolean>>;
  raidOverdueOnly: boolean;
  setRaidOverdueOnly: Dispatch<SetStateAction<boolean>>;
  raidHighOnly: boolean;
  setRaidHighOnly: Dispatch<SetStateAction<boolean>>;
};

function savedViewTypeForView(activeView: AppView) {
  if (activeView === "project-structure") return "structure";
  if (activeView === "project-gantt") return "gantt";
  if (activeView === "project-raid") return "risks";
  return null;
}

function isRaidTypeFilter(value: unknown): value is RaidTypeFilter {
  return (
    value === "ALL" ||
    value === "RISK" ||
    value === "DEPENDENCY" ||
    value === "ASSUMPTION"
  );
}

export function useSavedViewsController({
  activeView,
  authReady,
  selectedProjectId,
  currentUserRole,
  savedViewName,
  setSavedViews,
  setSavedViewName,
  setSavingSavedView,
  setError,
  setNotice,
  wbsColumnOrder,
  setWbsColumnOrder,
  wbsHiddenColumns,
  setWbsHiddenColumns,
  wbsColumnWidths,
  setWbsColumnWidths,
  wbsSort,
  setWbsSort,
  activeWbsHierarchyLevel,
  setWbsHierarchyLevel,
  showStructureCriticalPath,
  setShowStructureCriticalPath,
  ganttScale,
  setGanttScale,
  ganttRangeDays,
  setGanttRangeDays,
  showGanttDependencies,
  setShowGanttDependencies,
  showGanttCriticalPath,
  setShowGanttCriticalPath,
  showGanttBaseline,
  setShowGanttBaseline,
  showGanttForecast,
  setShowGanttForecast,
  ganttWbsWidth,
  setGanttWbsWidth,
  ganttPanelHeight,
  setGanttPanelHeight,
  ganttPanelWidth,
  setGanttPanelWidth,
  raidTypeFilter,
  setRaidTypeFilter,
  raidDecisionOnly,
  setRaidDecisionOnly,
  raidOverdueOnly,
  setRaidOverdueOnly,
  raidHighOnly,
  setRaidHighOnly,
}: UseSavedViewsControllerOptions) {
  const savedViewType = useMemo(() => savedViewTypeForView(activeView), [activeView]);

  useEffect(() => {
    if (!authReady || !savedViewType || !selectedProjectId) {
      setSavedViews([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      viewType: savedViewType,
      projectId: selectedProjectId,
    });
    apiClient
      .get<SavedView[]>(
        `/api/saved-views?${params.toString()}`,
        "Не удалось загрузить сохраненные представления",
      )
      .then((views) => {
        if (!cancelled) setSavedViews(views);
      })
      .catch(() => {
        if (!cancelled) setSavedViews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, savedViewType, selectedProjectId, setSavedViews]);

  const currentSavedViewConfig = useCallback((): Record<string, unknown> => {
    if (activeView === "project-structure") {
      return {
        wbsColumnOrder,
        wbsHiddenColumns,
        wbsColumnWidths,
        wbsSort,
        activeWbsHierarchyLevel,
        showStructureCriticalPath,
      };
    }
    if (activeView === "project-gantt") {
      return {
        ganttScale,
        ganttRangeDays,
        activeWbsHierarchyLevel,
        showGanttDependencies,
        showGanttCriticalPath,
        showGanttBaseline,
        showGanttForecast,
        ganttWbsWidth,
        ganttPanelHeight,
        ganttPanelWidth,
      };
    }
    if (activeView === "project-raid") {
      return {
        raidTypeFilter,
        raidDecisionOnly,
        raidOverdueOnly,
        raidHighOnly,
      };
    }
    return {};
  }, [
    activeView,
    activeWbsHierarchyLevel,
    ganttPanelHeight,
    ganttPanelWidth,
    ganttScale,
    ganttRangeDays,
    ganttWbsWidth,
    raidDecisionOnly,
    raidHighOnly,
    raidOverdueOnly,
    raidTypeFilter,
    showGanttBaseline,
    showGanttCriticalPath,
    showGanttDependencies,
    showGanttForecast,
    showStructureCriticalPath,
    wbsColumnOrder,
    wbsColumnWidths,
    wbsHiddenColumns,
    wbsSort,
  ]);

  const applySavedView = useCallback(
    (view: SavedView) => {
      const config = view.config ?? {};
      if (Array.isArray(config.wbsColumnOrder)) {
        setWbsColumnOrder(normalizeWbsColumnOrder(config.wbsColumnOrder as WbsTableColumnKey[]));
      }
      if (Array.isArray(config.wbsHiddenColumns)) {
        setWbsHiddenColumns(normalizeWbsHiddenColumns(config.wbsHiddenColumns as WbsTableColumnKey[]));
      }
      if (config.wbsColumnWidths && typeof config.wbsColumnWidths === "object") {
        setWbsColumnWidths((current) =>
          normalizeWbsColumnWidths({
            ...current,
            ...(config.wbsColumnWidths as Partial<Record<WbsTableColumnKey, number>>),
          }),
        );
      }
      if (Object.prototype.hasOwnProperty.call(config, "wbsSort")) {
        setWbsSort(normalizeWbsSort(config.wbsSort));
      }
      if (
        typeof config.activeWbsHierarchyLevel === "number" &&
        GANTT_HIERARCHY_LEVELS.includes(config.activeWbsHierarchyLevel as 1 | 2 | 3 | 4 | 5)
      ) {
        setWbsHierarchyLevel(config.activeWbsHierarchyLevel);
      }
      if (typeof config.showStructureCriticalPath === "boolean") {
        setShowStructureCriticalPath(config.showStructureCriticalPath);
      }
      if (
        config.ganttScale === "week" ||
        config.ganttScale === "month" ||
        config.ganttScale === "quarter"
      ) {
        setGanttScale(config.ganttScale);
      }
      if (
        config.ganttRangeDays === null ||
        config.ganttRangeDays === 30 ||
        config.ganttRangeDays === 90 ||
        config.ganttRangeDays === 180
      ) {
        setGanttRangeDays(config.ganttRangeDays as 30 | 90 | 180 | null);
      }
      if (typeof config.showGanttDependencies === "boolean") {
        setShowGanttDependencies(config.showGanttDependencies);
      }
      if (typeof config.showGanttCriticalPath === "boolean") {
        setShowGanttCriticalPath(config.showGanttCriticalPath);
      }
      if (typeof config.showGanttBaseline === "boolean") {
        setShowGanttBaseline(config.showGanttBaseline);
      }
      if (typeof config.showGanttForecast === "boolean") {
        setShowGanttForecast(config.showGanttForecast);
      }
      if (typeof config.ganttWbsWidth === "number") {
        setGanttWbsWidth(clampNumber(config.ganttWbsWidth, 260, 640));
      }
      if (typeof config.ganttPanelHeight === "number") {
        setGanttPanelHeight(clampNumber(config.ganttPanelHeight, 320, 900));
      }
      if (typeof config.ganttPanelWidth === "number") {
        setGanttPanelWidth(config.ganttPanelWidth);
      }
      if (isRaidTypeFilter(config.raidTypeFilter)) {
        setRaidTypeFilter(config.raidTypeFilter);
      }
      if (typeof config.raidDecisionOnly === "boolean") {
        setRaidDecisionOnly(config.raidDecisionOnly);
      }
      if (typeof config.raidOverdueOnly === "boolean") {
        setRaidOverdueOnly(config.raidOverdueOnly);
      }
      if (typeof config.raidHighOnly === "boolean") {
        setRaidHighOnly(config.raidHighOnly);
      }
      void apiClient.post(`/api/saved-views/${view.id}/use`, undefined).catch(() => null);
      setNotice(`Представление "${view.name}" применено`);
    },
    [
      setGanttPanelHeight,
      setGanttPanelWidth,
      setGanttRangeDays,
      setGanttScale,
      setGanttWbsWidth,
      setNotice,
      setRaidDecisionOnly,
      setRaidHighOnly,
      setRaidOverdueOnly,
      setRaidTypeFilter,
      setShowGanttBaseline,
      setShowGanttCriticalPath,
      setShowGanttDependencies,
      setShowGanttForecast,
      setShowStructureCriticalPath,
      setWbsColumnOrder,
      setWbsColumnWidths,
      setWbsHiddenColumns,
      setWbsHierarchyLevel,
      setWbsSort,
    ],
  );

  const saveCurrentSavedView = useCallback(async () => {
    if (!savedViewType || !selectedProjectId) return;
    setSavingSavedView(true);
    setError(null);
    setNotice(null);
    try {
      const view = await apiClient.post<SavedView>(
        "/api/saved-views",
        {
          projectId: selectedProjectId,
          viewType: savedViewType,
          name: savedViewName.trim() || `Вид ${new Date().toLocaleString("ru-RU")}`,
          config: currentSavedViewConfig(),
          isShared: currentUserRole === "ADMIN",
          sortOrder: 0,
        },
        "Не удалось сохранить представление",
      );
      setSavedViews((current) => [view, ...current.filter((item) => item.id !== view.id)]);
      setSavedViewName("");
      setNotice("Представление сохранено");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить представление",
      );
    } finally {
      setSavingSavedView(false);
    }
  }, [
    currentSavedViewConfig,
    currentUserRole,
    savedViewName,
    savedViewType,
    selectedProjectId,
    setError,
    setNotice,
    setSavedViewName,
    setSavedViews,
    setSavingSavedView,
  ]);

  return {
    savedViewType,
    applySavedView,
    saveCurrentSavedView,
  };
}
