import type { AppStateBag } from "../app/appStateBag";
import { useCallback, useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { ProjectCalendarOverride, ProjectListItem } from "../app/domainTypes";
import { savedWbsForm } from "../app/formState";
import { projectScheduleHealth } from "../app/labels";
import {
  createMilestoneLabelLayoutFingerprint,
  createMilestoneLabelLayoutOffsetKeys,
} from "../app/milestoneLabelLayout";
import {
  createMilestoneTimeline,
  createStructureMilestones,
} from "../app/milestoneModels";
import { createOverviewDashboard } from "../app/overviewDashboardModel";
import {
  createPortfolioBlockingProblemGroups,
  createPortfolioGoalTimeline,
  createPortfolioKeyRiskGroups,
  createPortfolioRedZoneProjectIds,
  createPortfolioSummary,
  filterProjectOptions,
  getActiveProjects,
  getClosedProjects,
  getRecentProjects,
  visiblePortfolioBlockingProblemProjects,
  visiblePortfolioKeyRiskProjects,
} from "../app/portfolioModels";
import {
  closedRiskAndProblemItems,
  createRaidSummary,
  createRiskMatrix,
  filterRaidItems,
  groupRaidItems,
} from "../app/raidModels";
import { buildProjectTree } from "../app/projectTree";
import { createProjectTargetSummary } from "../app/projectTargetModel";
import { PUBLIC_DEMO_USER_ID } from "@pms/shared";
import {
  isAdminSectionViewName,
  isDevelopmentSectionViewName,
  isProjectSectionViewName,
  type ProjectSectionView,
} from "../app/routes";
import {
  normalizeProjectModulesForUi,
  projectModuleViewByKey,
  type ProjectModuleKey,
} from "../app/projectModules";
import {
  WBS_DIRTY_FIELDS,
  WBS_TABLE_COLUMNS,
  type WbsTableColumn,
  type WbsTableColumnKey,
} from "../app/wbsTable";
import { collapsedWbsIdsForLevel, setsAreEqual } from "../app/wbsTree";
import {
  createActiveWbsHierarchyLevel,
  createCriticalPathIdSet,
  createDraftWbsCodes,
  createSortedStructureWbsTree,
  createVisibleWbsTree,
  createWbsTree,
  filterStructureWbsTreeByCriticalPath,
} from "../app/wbsViewModels";
import { createWbsGantt } from "../app/wbsGanttModel";
import { isoDate } from "../app/dateUtils";
import { useMilestoneLabelLayoutState } from "./useMilestoneLabelLayoutState";
import { useWorkspaceFullscreen } from "./useWorkspaceFullscreen";

type AppDerivedDataDeps = AppStateBag;

export function useAppDerivedData(deps: AppDerivedDataDeps) {
  const { locale } = useI18n();
  const {
    activeView,
    activeWbsItemId,
    collapsedWbsIds,
    currentUser,
    ganttRangeDays,
    hoveredGanttItemId,
    isAdminUser,
    isAuthenticated,
    isClosedProject,
    project,
    projectModules,
    projectRef,
    projectSearch,
    projects,
    raidDecisionOnly,
    raidHighOnly,
    raidOverdueOnly,
    raidTypeFilter,
    recentProjectIds,
    selectedCalendarYear,
    selectedProjectId,
    setCollapsedWbsIds,
    setError,
    setProject,
    showStructureCriticalPath,
    wbsColumnOrder,
    wbsColumnWidths,
    wbsDrafts,
    wbsHiddenColumns,
    wbsSort,
  } = deps;

  const activeProjects = useMemo(() => getActiveProjects(projects), [projects]);
  const closedProjects = useMemo(() => getClosedProjects(projects), [projects]);
  const activeProjectTree = useMemo(
    () => buildProjectTree(activeProjects),
    [activeProjects],
  );
  const closedProjectTree = useMemo(
    () => buildProjectTree(closedProjects),
    [closedProjects],
  );
  const selectedProjectListItem = useMemo(
    () => (projects as ProjectListItem[]).find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedProjectAccessLevel =
    project?.currentUserAccessLevel ??
    selectedProjectListItem?.currentUserAccessLevel ??
    null;
  const canWriteSelectedProject =
    isAdminUser ||
    selectedProjectAccessLevel === "EDIT" ||
    selectedProjectAccessLevel === "ADMIN";
  const isSelectedProjectSection =
    isProjectSectionViewName(activeView) && Boolean(selectedProjectId);
  // The public demo may look around Administration and Development but edits
  // only the other sections.
  const isDemoLookOnlySection =
    currentUser?.id === PUBLIC_DEMO_USER_ID &&
    (isAdminSectionViewName(activeView) || isDevelopmentSectionViewName(activeView));
  const isReadOnly =
    !isAuthenticated ||
    isDemoLookOnlySection ||
    Boolean(isSelectedProjectSection && (isClosedProject || !canWriteSelectedProject));
  const normalizedProjectModules = useMemo(
    () => normalizeProjectModulesForUi(projectModules),
    [projectModules],
  );
  const projectModuleEnabledByKey = useMemo(
    () =>
      new Map(normalizedProjectModules.map((module) => [module.key, module.enabled])),
    [normalizedProjectModules],
  );
  const isProjectModuleEnabled = useCallback(
    (key: ProjectModuleKey) => projectModuleEnabledByKey.get(key) !== false,
    [projectModuleEnabledByKey],
  );
  const firstEnabledProjectView = useMemo<ProjectSectionView>(() => {
    const enabledModule = normalizedProjectModules.find((module) => module.enabled);
    return enabledModule ? projectModuleViewByKey[enabledModule.key] : "project-overview";
  }, [normalizedProjectModules]);
  const recentProjects = useMemo(
    () => getRecentProjects(projects, recentProjectIds),
    [projects, recentProjectIds],
  );
  const filteredProjectOptions = useMemo(
    () => filterProjectOptions(activeProjects, projectSearch),
    [activeProjects, projectSearch],
  );
  const portfolioGoalTimeline = useMemo(
    () => createPortfolioGoalTimeline(projects, locale),
    [locale, projects],
  );
  const portfolioBlockingProblemGroups = useMemo(
    () => createPortfolioBlockingProblemGroups(projects),
    [projects],
  );
  const portfolioKeyRiskGroups = useMemo(
    () => createPortfolioKeyRiskGroups(projects),
    [projects],
  );
  const visiblePortfolioProblemProjects = useMemo(
    () => visiblePortfolioBlockingProblemProjects(portfolioBlockingProblemGroups),
    [portfolioBlockingProblemGroups],
  );
  const visiblePortfolioRiskProjects = useMemo(
    () => visiblePortfolioKeyRiskProjects(portfolioKeyRiskGroups),
    [portfolioKeyRiskGroups],
  );
  const portfolioRedZoneProjectIds = useMemo(
    () =>
      createPortfolioRedZoneProjectIds(
        visiblePortfolioProblemProjects,
        visiblePortfolioRiskProjects,
      ),
    [visiblePortfolioProblemProjects, visiblePortfolioRiskProjects],
  );
  const portfolioSummary = useMemo(
    () => createPortfolioSummary(projects, portfolioGoalTimeline),
    [portfolioGoalTimeline, projects],
  );
  const wbsTree = useMemo(
    () => createWbsTree(project?.wbsItems ?? []),
    [project?.wbsItems],
  );
  const visibleWbsTree = useMemo(
    () => createVisibleWbsTree(wbsTree, collapsedWbsIds),
    [collapsedWbsIds, wbsTree],
  );
  const sortedStructureWbsTree = useMemo(
    () => createSortedStructureWbsTree(wbsTree, wbsDrafts, wbsSort, project?.criticalPath),
    [project?.criticalPath, wbsDrafts, wbsSort, wbsTree],
  );
  const visibleStructureBaseWbsTree = useMemo(
    () => createVisibleWbsTree(sortedStructureWbsTree, collapsedWbsIds),
    [collapsedWbsIds, sortedStructureWbsTree],
  );
  const structureCriticalPathIds = useMemo(
    () => createCriticalPathIdSet(project?.criticalPath),
    [project?.criticalPath],
  );
  const visibleStructureWbsTree = useMemo(
    () =>
      filterStructureWbsTreeByCriticalPath(
        visibleStructureBaseWbsTree,
        structureCriticalPathIds,
        showStructureCriticalPath,
      ),
    [
      showStructureCriticalPath,
      structureCriticalPathIds,
      visibleStructureBaseWbsTree,
    ],
  );
  const activeWbsHierarchyLevel = useMemo(
    () => createActiveWbsHierarchyLevel(collapsedWbsIds, wbsTree),
    [collapsedWbsIds, wbsTree],
  );
  const setWbsHierarchyLevel = useCallback(
    (level: number) => {
      setCollapsedWbsIds((current: Set<string>) => {
        const next = collapsedWbsIdsForLevel(wbsTree, level);
        return setsAreEqual(current, next) ? new Set() : next;
      });
    },
    [setCollapsedWbsIds, wbsTree],
  );
  const draftWbsCodes = useMemo(
    () => createDraftWbsCodes(wbsTree, wbsDrafts),
    [wbsDrafts, wbsTree],
  );
  const structureMilestones = useMemo(
    () => createStructureMilestones(project?.wbsItems ?? []),
    [project?.wbsItems],
  );
  const milestoneTimeline = useMemo(
    () => createMilestoneTimeline(project?.wbsItems ?? [], structureMilestones),
    [project?.wbsItems, structureMilestones],
  );
  const milestoneLabelLayoutFingerprint = useMemo(
    () => createMilestoneLabelLayoutFingerprint(milestoneTimeline),
    [milestoneTimeline],
  );
  const milestoneLabelLayoutOffsetKeys = useMemo(
    () => createMilestoneLabelLayoutOffsetKeys(milestoneTimeline),
    [milestoneTimeline],
  );
  const { fullscreenWorkspaceView, toggleWorkspaceFullscreen } =
    useWorkspaceFullscreen(activeView);
  const {
    activeMilestoneLabelDrag,
    milestoneLabelOffsets,
    startMilestoneLabelDrag,
  } =
    useMilestoneLabelLayoutState({
      project,
      projectRef,
      isReadOnly,
      milestoneLabelLayoutFingerprint,
      milestoneLabelLayoutOffsetKeys,
      setProject,
      setError,
    });
  const overviewDashboard = useMemo(
    () => createOverviewDashboard(project, structureMilestones),
    [project, structureMilestones],
  );
  const projectTargetSummary = useMemo(
    () => createProjectTargetSummary(project),
    [project],
  );
  const topbarScheduleHealth = project
    ? projectScheduleHealth(project.rag, overviewDashboard.scheduleVarianceFromStructure)
    : null;
  const raidSummary = useMemo(
    () => createRaidSummary(project?.raidItems ?? []),
    [project?.raidItems],
  );
  const filteredRaidItems = useMemo(
    () =>
      filterRaidItems(project?.raidItems ?? [], {
        raidTypeFilter,
        raidDecisionOnly,
        raidOverdueOnly,
        raidHighOnly,
        today: new Date(),
      }),
    [
      project?.raidItems,
      raidDecisionOnly,
      raidHighOnly,
      raidOverdueOnly,
      raidTypeFilter,
    ],
  );
  const closedRaidItems = useMemo(
    () => closedRiskAndProblemItems(project?.raidItems ?? []),
    [project?.raidItems],
  );
  const riskMatrix = useMemo(
    () => createRiskMatrix(project?.raidItems ?? []),
    [project?.raidItems],
  );
  const groupedRaidItems = useMemo(
    () => groupRaidItems(filteredRaidItems),
    [filteredRaidItems],
  );
  const wbsGantt = useMemo(
    () =>
      createWbsGantt({
        visibleWbsTree,
        criticalPath: project?.criticalPath,
        wbsDependencies: project?.wbsDependencies ?? [],
        rangeDays: ganttRangeDays,
        locale,
      }),
    [ganttRangeDays, locale, project?.criticalPath, project?.wbsDependencies, visibleWbsTree],
  );
  const wbsColumnsByKey = useMemo(
    () =>
      new Map<WbsTableColumnKey, WbsTableColumn>(
        WBS_TABLE_COLUMNS.map((column) => [column.key, column]),
      ),
    [],
  );
  const orderedWbsColumns = useMemo(
    () =>
      wbsColumnOrder
        .map((key: WbsTableColumnKey) => wbsColumnsByKey.get(key))
        .filter(
          (column: WbsTableColumn | undefined): column is WbsTableColumn =>
            Boolean(column) && !wbsHiddenColumns.includes(column.key),
        ),
    [wbsColumnOrder, wbsColumnsByKey, wbsHiddenColumns],
  );
  const wbsTableTemplate = useMemo(
    () =>
      orderedWbsColumns
        .map((column) => `${wbsColumnWidths[column.key]}px`)
        .join(" "),
    [orderedWbsColumns, wbsColumnWidths],
  );
  const wbsLevelWidth = wbsColumnWidths.level;
  const dirtyWbsItemIds = useMemo(() => {
    const dirtyIds = new Set<string>();
    for (const item of project?.wbsItems ?? []) {
      const draft = wbsDrafts[item.id];
      if (!draft) continue;
      const source = savedWbsForm(item, project?.wbsDependencies);
      const hasDirtyField = WBS_DIRTY_FIELDS.some(
        (field) => draft[field] !== source[field],
      );
      if (hasDirtyField || draftWbsCodes.get(item.id) !== item.code) {
        dirtyIds.add(item.id);
      }
    }
    return dirtyIds;
  }, [draftWbsCodes, project?.wbsDependencies, project?.wbsItems, wbsDrafts]);
  const activeGanttLinkIds = useMemo(() => {
    const sourceId = hoveredGanttItemId ?? activeWbsItemId;
    const predecessors = new Set<string>();
    const successors = new Set<string>();
    if (!hoveredGanttItemId) return { sourceId, predecessors, successors };
    for (const dependency of project?.wbsDependencies ?? []) {
      if (dependency.successorId === hoveredGanttItemId) {
        predecessors.add(dependency.predecessorId);
      }
      if (dependency.predecessorId === hoveredGanttItemId) {
        successors.add(dependency.successorId);
      }
    }
    return { sourceId, predecessors, successors };
  }, [activeWbsItemId, hoveredGanttItemId, project?.wbsDependencies]);
  const projectCalendarYears = useMemo(() => {
    const years: number[] = [];
    const collectYear = (value: string | null | undefined) => {
      if (!value) return;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        years.push(parsed.getFullYear());
      }
    };
    collectYear(project?.startDate);
    for (const item of project?.wbsItems ?? []) {
      collectYear(item.startDate);
      collectYear(item.dueDate);
      collectYear(item.baselineStartDate);
      collectYear(item.baselineDueDate);
      collectYear(item.forecastStartDate);
      collectYear(item.forecastDueDate);
    }
    const startYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear();
    return [startYear, startYear + 1, startYear + 2];
  }, [project?.startDate, project?.wbsItems]);
  const calendarYear = selectedCalendarYear ?? projectCalendarYears[1] ?? new Date().getFullYear();
  const calendarOverridesByKey = useMemo(() => {
    const map = new Map<string, ProjectCalendarOverride>();
    for (const override of project?.calendarOverrides ?? []) {
      map.set(
        `${override.calendarCode}:${isoDate(new Date(override.date))}`,
        override,
      );
    }
    return map;
  }, [project?.calendarOverrides]);

  return {
    // Whether the user may change the selected project at all, closed or not: lessons are written after closure.
    canWriteSelectedProject: isAuthenticated && !isDemoLookOnlySection && canWriteSelectedProject,
    activeGanttLinkIds,
    activeMilestoneLabelDrag,
    activeProjectTree,
    activeProjects,
    activeWbsHierarchyLevel,
    calendarOverridesByKey,
    calendarYear,
    closedProjectTree,
    closedProjects,
    closedRaidItems,
    dirtyWbsItemIds,
    draftWbsCodes,
    filteredProjectOptions,
    firstEnabledProjectView,
    fullscreenWorkspaceView,
    groupedRaidItems,
    isProjectModuleEnabled,
    isReadOnly,
    milestoneLabelOffsets,
    milestoneTimeline,
    normalizedProjectModules,
    orderedWbsColumns,
    overviewDashboard,
    portfolioBlockingProblemGroups,
    portfolioGoalTimeline,
    portfolioKeyRiskGroups,
    portfolioRedZoneProjectIds,
    portfolioSummary,
    projectCalendarYears,
    projectTargetSummary,
    recentProjects,
    riskMatrix,
    raidSummary,
    selectedProjectListItem,
    setWbsHierarchyLevel,
    startMilestoneLabelDrag,
    topbarScheduleHealth,
    toggleWorkspaceFullscreen,
    visiblePortfolioProblemProjects,
    visiblePortfolioRiskProjects,
    visibleStructureWbsTree,
    visibleWbsTree,
    wbsGantt,
    wbsLevelWidth,
    wbsTableTemplate,
    wbsTree,
  };
}
