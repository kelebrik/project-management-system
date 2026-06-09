import {
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { apiClient } from "./api/client";
import {
  adminDictionaryLabels,
  adminPermissionLabel,
  adminPermissionOrder,
  dictionaryItemToDraft,
  dictionaryLabel,
  systemSettingHasValue,
  userRoleLabel,
  userToDraft,
} from "./app/adminHelpers";
import type {
  GanttLinkEndpoint,
  ProjectCalendarOverride,
  ProjectDetails,
  ProjectListItem,
  ProjectUiState,
  SearchResult,
  WbsCriticalPath,
  WbsDependency,
  WbsDependencyType,
  WbsItem,
  WbsSnapshot,
  WbsSnapshotResponse,
  WbsTreeItem,
} from "./app/domainTypes";
import {
  artifactToForm,
  emptyIssueForm,
  issueToDraft,
  normalizePassportRows,
  projectToRegistryDraft,
  projectsToRegistryDrafts,
  raidToForm,
  wbsToForm,
  type WbsFormState,
} from "./app/formState";
import {
  apiBase,
  authenticatedFetch,
  isHttpsUrl,
  responseErrorMessage,
} from "./app/http";
import {
  artifactStatusLabel,
  auditActionLabel,
  auditObjectLabel,
  issuePrimaryJiraLink,
  issueSeverityLabel,
  issueStatusLabel,
  projectOptionLabel,
  projectScheduleHealth,
  projectStatusLabel,
  ragOptionLabel,
  raidStatusLabel,
  raidTypeLabel,
  riskTone,
  wbsStatusLabel,
} from "./app/labels";
import { normalizeJiraWorkSectionDrafts } from "./app/jiraWorkSections";
import {
  appPathForView,
  appRouteFromPath,
  initialRouteProjectCode,
  isAdminSectionViewName,
  isProjectSectionViewName,
  normalizeAppPath,
  normalizeProjectRouteCode,
  projectPathViews,
  writeProtectedViews,
  type AppView,
  type ProjectSectionView,
} from "./app/routes";
import {
  normalizeProjectModulesForUi,
  projectModuleKeyByView,
  projectModuleViewByKey,
  type ProjectModuleKey,
} from "./app/projectModules";
import {
  createMilestoneLabelLayoutFingerprint,
} from "./app/milestoneLabelLayout";
import {
  createMilestoneTimeline,
  createStructureMilestones,
} from "./app/milestoneModels";
import { buildProjectTree } from "./app/projectTree";
import {
  GANTT_HIERARCHY_LEVELS,
  GANTT_PANEL_HEIGHT_DEFAULT,
  GANTT_PANEL_WIDTH_DEFAULT,
  GANTT_SCALE_WIDTH,
  clampNumber,
  ganttPanelWidthBounds,
} from "./app/ganttConfig";
import { createOverviewDashboard } from "./app/overviewDashboardModel";
import { printSectionAsPdf } from "./app/pdfPrint";
import {
  createPortfolioStats,
  filterProjectOptions,
  getActiveProjects,
  getClosedProjects,
  getRecentProjects,
} from "./app/portfolioModels";
import {
  createRaidSummary,
  createRiskMatrix,
  filterRaidItems,
  groupRaidItems,
} from "./app/raidModels";
import { createResourceSummaryRows } from "./app/resourceModels";
import {
  latestIssueStatusUpdate,
  latestRaidStatusUpdate,
} from "./app/statusUpdates";
import {
  MilestoneSnakeTimelineSection,
  MilestoneTimelineSection,
} from "./components/MilestoneSections";
import { AppShell } from "./components/AppShell";
import { AuthPage } from "./components/AuthPage";
import { GlobalSearch } from "./components/GlobalSearch";
import { SavedViewControls } from "./components/SavedViewControls";
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  calendarDelayDays,
  calendarMonthDays,
  date,
  dateTime,
  fileSize,
  isDefaultWorkingDay,
  isoDate,
} from "./app/dateUtils";
import {
  PROJECT_CALENDAR_LABELS,
  WBS_DIRTY_FIELDS,
  WBS_PREDECESSOR_KEYS,
  WBS_TABLE_COLUMNS,
  normalizeWbsColumnOrder,
  normalizeWbsColumnWidths,
  normalizeWbsHiddenColumns,
  normalizeWbsSort,
  type ProjectCalendarCode,
  type WbsSortState,
  type WbsTableColumn,
  type WbsTableColumnKey,
} from "./app/wbsTable";
import {
  collapsedWbsIdsForLevel,
  parentIdFromWbsLevel,
  resolveDraftPredecessorCode,
  setsAreEqual,
  wbsDisplayLevel,
  wbsSnapshotsEqual,
} from "./app/wbsTree";
import {
  createActiveWbsHierarchyLevel,
  createCriticalPathIdSet,
  createDraftWbsCodes,
  createSortedStructureWbsTree,
  createVisibleWbsTree,
  createWbsTree,
  filterStructureWbsTreeByCriticalPath,
} from "./app/wbsViewModels";
import { createWbsGantt } from "./app/wbsGanttModel";
import {
  GANTT_LINK_ENDPOINT_GAP_PERCENT,
  GANTT_LINK_STUB_PERCENT,
  GANTT_ROW_HEIGHT,
  ganttDependencyPath,
  ganttPathDirection,
  ganttRoundedDependencyPath,
} from "./ganttDependencyPath";
import { useEditableCaptureHandlers } from "./app/useEditableCapture";
import { useGlobalSearch } from "./app/useGlobalSearch";
import { useAdminActionsController } from "./hooks/useAdminActionsController";
import { useAdminDataController } from "./hooks/useAdminDataController";
import { useAdminState } from "./hooks/useAdminState";
import { useAppFeedbackState } from "./hooks/useAppFeedbackState";
import { useArtifactsController } from "./hooks/useArtifactsController";
import { useArtifactState } from "./hooks/useArtifactState";
import { useAuthController } from "./hooks/useAuthController";
import { useAuthState } from "./hooks/useAuthState";
import { useIssueController } from "./hooks/useIssueController";
import { useIssueState } from "./hooks/useIssueState";
import { useMilestoneLabelLayoutState } from "./hooks/useMilestoneLabelLayoutState";
import { usePassportController } from "./hooks/usePassportController";
import { useProjectCoreState } from "./hooks/useProjectCoreState";
import { useProjectRegistryController } from "./hooks/useProjectRegistryController";
import { useRaidController } from "./hooks/useRaidController";
import { useRaidState } from "./hooks/useRaidState";
import { useSavedViewsController } from "./hooks/useSavedViewsController";
import { useSavedViewsState } from "./hooks/useSavedViewsState";
import { useWbsStructureTableController } from "./hooks/useWbsStructureTableController";
import { useWbsWorkspaceState } from "./hooks/useWbsWorkspaceState";
import { useWorkspaceFullscreen } from "./hooks/useWorkspaceFullscreen";
import {
  inferWbsScheduleDriver,
  type WbsScheduleDriver,
} from "./wbsScheduleDriver";
import { shouldApplyProjectSnapshotAfterWbsSave } from "./wbsProjectLoadGuard";
import "./App.css";

function App() {
  const initialProjectCodeRef = useRef<string | null>(initialRouteProjectCode());
  const {
    authMode,
    setAuthMode,
    currentUser,
    setCurrentUser,
    authForm,
    setAuthForm,
    authSubmitting,
    setAuthSubmitting,
  } = useAuthState();
  const { loading, setLoading, error, setError, notice, setNotice } =
    useAppFeedbackState();
  const {
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    project,
    setProject,
    projectRef,
    projectLoadSequenceRef,
    activeView,
    setActiveView,
    syncing,
    setSyncing,
    savingJira,
    setSavingJira,
    savingJiraWorkSections,
    setSavingJiraWorkSections,
    savingBaseline,
    setSavingBaseline,
    savingCalendar,
    setSavingCalendar,
    selectedCalendarYear,
    setSelectedCalendarYear,
    savingProjectRegistryId,
    setSavingProjectRegistryId,
    jiraForm,
    setJiraForm,
    jiraWorkSectionDrafts,
    setJiraWorkSectionDrafts,
    newProjectForm,
    setNewProjectForm,
    projectRegistryDrafts,
    setProjectRegistryDrafts,
    passportRows,
    setPassportRows,
    savingPassportRows,
    setSavingPassportRows,
    sidebarCollapsed,
    setSidebarCollapsed,
    projectSearch,
    setProjectSearch,
    showProjectPicker,
    setShowProjectPicker,
    recentProjectIds,
    setRecentProjectIds,
  } = useProjectCoreState();
  const {
    users,
    setUsers,
    userDrafts,
    setUserDrafts,
    auditEvents,
    setAuditEvents,
    newUserForm,
    setNewUserForm,
    savingUserId,
    setSavingUserId,
    creatingUser,
    setCreatingUser,
    rolePermissions,
    setRolePermissions,
    dictionaryItems,
    setDictionaryItems,
    dictionaryDrafts,
    setDictionaryDrafts,
    selectedDictionary,
    setSelectedDictionary,
    newDictionaryDraft,
    setNewDictionaryDraft,
    savingDictionaryItemId,
    setSavingDictionaryItemId,
    creatingDictionaryItem,
    setCreatingDictionaryItem,
    systemSettings,
    setSystemSettings,
    systemSettingsDraft,
    setSystemSettingsDraft,
    savingSystemSettings,
    setSavingSystemSettings,
    projectModules,
    setProjectModules,
    projectModuleDrafts,
    setProjectModuleDrafts,
    savingProjectModules,
    setSavingProjectModules,
    adminHealth,
    setAdminHealth,
    backupStatus,
    setBackupStatus,
    adminIntegrations,
    setAdminIntegrations,
    apiTokenDraft,
    setApiTokenDraft,
    webhookDraft,
    setWebhookDraft,
    createdApiToken,
    setCreatedApiToken,
    savingIntegration,
    setSavingIntegration,
    configTransferText,
    setConfigTransferText,
    importingConfig,
    setImportingConfig,
    savingRolePermissionId,
    setSavingRolePermissionId,
    resetAdminState,
  } = useAdminState();
  const {
    artifactDrafts,
    setArtifactDrafts,
    expandedArtifactId,
    setExpandedArtifactId,
  } = useArtifactState();
  const {
    raidForm,
    setRaidForm,
    raidDrafts,
    setRaidDrafts,
    raidStatusDrafts,
    setRaidStatusDrafts,
    expandedRaidId,
    setExpandedRaidId,
    raidTypeFilter,
    setRaidTypeFilter,
    raidDecisionOnly,
    setRaidDecisionOnly,
    raidOverdueOnly,
    setRaidOverdueOnly,
    raidHighOnly,
    setRaidHighOnly,
  } = useRaidState();
  const {
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
  } = useWbsWorkspaceState();
  const {
    creatingIssue,
    setCreatingIssue,
    issueForm,
    setIssueForm,
    taskDrafts,
    setTaskDrafts,
    issueLinkDrafts,
    setIssueLinkDrafts,
    issueEditDrafts,
    setIssueEditDrafts,
    issueStatusDrafts,
    setIssueStatusDrafts,
    issueFormErrors,
    setIssueFormErrors,
    expandedIssueId,
    setExpandedIssueId,
    issueDrawerMode,
    setIssueDrawerMode,
  } = useIssueState();
  const { savedViews, setSavedViews, savedViewName, setSavedViewName, savingSavedView, setSavingSavedView } =
    useSavedViewsState();
  const isAuthenticated = Boolean(currentUser);
  const isAdminUser = currentUser?.role === "ADMIN";
  const isClosedProject = project?.status === "CLOSED";
  const isReadOnly = !isAuthenticated || isClosedProject;
  const globalSearch = useGlobalSearch();
  const {
    reloadUsers,
    reloadAuditEvents,
    reloadAdminConfig,
    reloadAdminIntegrations,
    reloadAdminHealth,
  } = useAdminDataController({
    activeView,
    authReady: authMode === "ready",
    currentUser,
    setUsers,
    setUserDrafts,
    setAuditEvents,
    setRolePermissions,
    setDictionaryItems,
    setDictionaryDrafts,
    setSystemSettings,
    setSystemSettingsDraft,
    setProjectModules,
    setProjectModuleDrafts,
    setAdminHealth,
    setBackupStatus,
    setAdminIntegrations,
    setError,
  });

  const { handleEditableFocus, handleEditableKeyDown } =
    useEditableCaptureHandlers();

  useEffect(() => {
    const onPopState = () => {
      setError(null);
      setNotice(null);
      const route = appRouteFromPath(window.location.pathname);
      setActiveView(route.view);
      if (route.projectCode) {
        const nextProject = projects.find(
          (item) =>
            normalizeProjectRouteCode(item.code) ===
            normalizeProjectRouteCode(route.projectCode ?? ""),
        );
        if (nextProject) {
          setSelectedProjectId(nextProject.id);
        } else {
          initialProjectCodeRef.current = route.projectCode;
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [projects]);

  useEffect(() => {
    if (authMode !== "ready") return;
    let cancelled = false;

    async function loadProjects() {
      setLoading(true);
      try {
        const data = await apiClient.get<ProjectListItem[]>(
          "/api/projects",
          "Не удалось загрузить список проектов",
        );
        if (cancelled) return;
        const firstProject =
          data.find((item) => item.status !== "CLOSED") ?? data[0];
        const routeProjectCode = initialProjectCodeRef.current;
        const routeProject = routeProjectCode
          ? data.find(
              (item) =>
                normalizeProjectRouteCode(item.code) ===
                normalizeProjectRouteCode(routeProjectCode),
            )
          : null;
        setProjects(data);
        setProjectRegistryDrafts(projectsToRegistryDrafts(data));
        setSelectedProjectId(
          (current) => current ?? routeProject?.id ?? firstProject?.id ?? null,
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить список проектов",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [authMode]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const setWbsUndoHistory = useCallback((nextStack: WbsSnapshot[]) => {
    wbsUndoStackRef.current = nextStack;
    setWbsUndoStack(nextStack);
  }, []);

  const setWbsRedoHistory = useCallback((nextStack: WbsSnapshot[]) => {
    wbsRedoStackRef.current = nextStack;
    setWbsRedoStack(nextStack);
  }, []);

  const activeProjects = useMemo(
    () => getActiveProjects(projects),
    [projects],
  );
  const closedProjects = useMemo(
    () => getClosedProjects(projects),
    [projects],
  );
  const activeProjectTree = useMemo(
    () => buildProjectTree(activeProjects),
    [activeProjects],
  );
  const closedProjectTree = useMemo(
    () => buildProjectTree(closedProjects),
    [closedProjects],
  );
  const selectedProjectListItem = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const filteredDictionaryItems = useMemo(
    () =>
      dictionaryItems.filter((item) => item.dictionary === selectedDictionary),
    [dictionaryItems, selectedDictionary],
  );
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
  const openView = useCallback((
    nextView: AppView,
    options?: { replace?: boolean; projectCode?: string | null },
  ) => {
    setError(null);
    setNotice(null);
    if (!isAuthenticated && writeProtectedViews.has(nextView)) {
      setAuthMode("login");
      setError("Для редактирования нужно войти в систему");
      return;
    }
    if (isAdminSectionViewName(nextView) && !isAdminUser) {
      setError("Раздел администрирования доступен только администратору");
      return;
    }
    if (
      isProjectSectionViewName(nextView) &&
      !isProjectModuleEnabled(projectModuleKeyByView[nextView])
    ) {
      setError("Страница проекта отключена администратором");
      return;
    }
    setActiveView(nextView);
    const routeProjectCode =
      options?.projectCode ??
      selectedProjectListItem?.code ??
      project?.code ??
      null;
    const nextPath = appPathForView(nextView, routeProjectCode);
    if (window.location.pathname !== nextPath) {
      const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
      if (options?.replace) {
        window.history.replaceState(null, "", nextUrl);
      } else {
        window.history.pushState(null, "", nextUrl);
      }
    }
  }, [
    isAdminUser,
    isAuthenticated,
    isProjectModuleEnabled,
    project?.code,
    selectedProjectListItem?.code,
    setActiveView,
    setAuthMode,
    setError,
    setNotice,
  ]);
  const { submitAuth, logout } = useAuthController({
    authMode,
    setAuthMode,
    authForm,
    setAuthForm,
    setAuthSubmitting,
    setCurrentUser,
    setLoading,
    setError,
    setNotice,
    activeView,
    selectedProjectId,
    projectCode: project?.code ?? null,
    projectModules,
    isAuthenticated,
    isAdminUser,
    firstEnabledProjectView,
    openView,
    resetAdminState,
  });
  const resourceSummaryRows = useMemo(
    () => createResourceSummaryRows(project?.wbsItems ?? [], new Date()),
    [project?.wbsItems],
  );
  useEffect(() => {
    const routeProjectCode = initialProjectCodeRef.current;
    if (!routeProjectCode || projects.length === 0) return;

    const routeProject = projects.find(
      (item) =>
        normalizeProjectRouteCode(item.code) ===
        normalizeProjectRouteCode(routeProjectCode),
    );
    if (!routeProject) {
      setError(`Проект ${routeProjectCode} не найден`);
      initialProjectCodeRef.current = null;
      return;
    }

    setSelectedProjectId(routeProject.id);
    initialProjectCodeRef.current = null;
  }, [projects]);
  useEffect(() => {
    if (!selectedProjectListItem || !isProjectSectionViewName(activeView)) {
      return;
    }
    const expectedPath = appPathForView(activeView, selectedProjectListItem.code);
    if (normalizeAppPath(window.location.pathname) !== normalizeAppPath(expectedPath)) {
      window.history.replaceState(
        null,
        "",
        `${expectedPath}${window.location.search}${window.location.hash}`,
      );
    }
  }, [activeView, selectedProjectListItem]);
  useEffect(() => {
    if (!isProjectSectionViewName(activeView)) return;
    if (isProjectModuleEnabled(projectModuleKeyByView[activeView])) return;
    openView(firstEnabledProjectView, { replace: true });
  }, [activeView, firstEnabledProjectView, isProjectModuleEnabled]);
  const recentProjects = useMemo(
    () => getRecentProjects(projects, recentProjectIds),
    [projects, recentProjectIds],
  );
  const filteredProjectOptions = useMemo(
    () => filterProjectOptions(activeProjects, projectSearch),
    [activeProjects, projectSearch],
  );
  const portfolioStats = useMemo(
    () => createPortfolioStats(projects),
    [projects],
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
    () => createSortedStructureWbsTree(wbsTree, wbsDrafts, wbsSort),
    [wbsDrafts, wbsSort, wbsTree],
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
      setCollapsedWbsIds((current) => {
        const next = collapsedWbsIdsForLevel(wbsTree, level);
        return setsAreEqual(current, next) ? new Set() : next;
      });
    },
    [setCollapsedWbsIds, wbsTree],
  );
  const { savedViewType, applySavedView, saveCurrentSavedView } =
    useSavedViewsController({
      activeView,
      authReady: authMode === "ready",
      selectedProjectId,
      currentUserRole: currentUser?.role,
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
    });
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
  const { fullscreenWorkspaceView, toggleWorkspaceFullscreen } =
    useWorkspaceFullscreen(activeView);
  const { milestoneLabelOffsets, startMilestoneLabelDrag } =
    useMilestoneLabelLayoutState({
      project,
      projectRef,
      isReadOnly,
      milestoneLabelLayoutFingerprint,
      setProject,
      setError,
    });
  const overviewDashboard = useMemo(
    () => createOverviewDashboard(project, structureMilestones),
    [project, structureMilestones],
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
      }),
    [project?.criticalPath, project?.wbsDependencies, visibleWbsTree],
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
        .map((key) => wbsColumnsByKey.get(key))
        .filter(
          (column): column is WbsTableColumn =>
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
      const source = wbsToForm(item);
      const hasDirtyField = WBS_DIRTY_FIELDS.some(
        (field) => draft[field] !== source[field],
      );
      if (hasDirtyField || draftWbsCodes.get(item.id) !== item.code) {
        dirtyIds.add(item.id);
      }
    }
    return dirtyIds;
  }, [draftWbsCodes, project?.wbsItems, wbsDrafts]);
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
  async function syncJira() {
    if (!project) return;
    setSyncing(true);
    setError(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/jira/sync`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось синхронизировать Jira");
      }
      const refreshed = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/overview`,
      );
      applyProject(await refreshed.json());
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Не удалось синхронизировать Jira",
      );
    } finally {
      setSyncing(false);
    }
  }

  const applyProject = useCallback(
    (nextProject: ProjectDetails) => {
      projectRef.current = nextProject;
      const nextWbsDrafts = Object.fromEntries(
        nextProject.wbsItems.map((item) => [item.id, wbsToForm(item)]),
      );
      wbsDraftsRef.current = nextWbsDrafts;
      setProject(nextProject);
      setWbsUndoHistory([]);
      setWbsRedoHistory([]);
      setSidebarCollapsed(nextProject.uiState?.sidebarCollapsed ?? false);
      setWbsColumnOrder(
        normalizeWbsColumnOrder(nextProject.uiState?.wbsColumnOrder),
      );
      setWbsHiddenColumns(
        normalizeWbsHiddenColumns(nextProject.uiState?.wbsHiddenColumns),
      );
      setWbsColumnWidths((current) =>
        normalizeWbsColumnWidths({
          ...current,
          ...(nextProject.uiState?.wbsColumnWidths ?? {}),
        }),
      );
      setWbsSort(normalizeWbsSort(nextProject.uiState?.wbsSort));
      setGanttWbsWidth(
        clampNumber(nextProject.uiState?.ganttWbsWidth ?? 360, 260, 640),
      );
      setGanttPanelHeight(
        clampNumber(
          nextProject.uiState?.ganttPanelHeight ?? GANTT_PANEL_HEIGHT_DEFAULT,
          320,
          900,
        ),
      );
      setGanttPanelWidth(
        nextProject.uiState?.ganttPanelWidth ?? GANTT_PANEL_WIDTH_DEFAULT,
      );
      setPassportRows(normalizePassportRows(nextProject));
      setSelectedCalendarYear((currentYear) => {
        const startDate = nextProject.startDate
          ? new Date(nextProject.startDate)
          : new Date();
        const startYear = startDate.getFullYear();
        const allowedYears = [startYear, startYear + 1, startYear + 2];
        return currentYear && allowedYears.includes(currentYear)
          ? currentYear
          : startYear + 1;
      });
      setJiraForm({
        baseUrl: nextProject.jiraIntegration?.baseUrl ?? "",
        boardUrl: nextProject.jiraIntegration?.boardUrl ?? "",
        projectKey: nextProject.jiraIntegration?.projectKey ?? "",
        issuesJql: nextProject.jiraIntegration?.issuesJql ?? "",
        openIssuesJql: nextProject.jiraIntegration?.openIssuesJql ?? "",
      });
      setJiraWorkSectionDrafts(
        normalizeJiraWorkSectionDrafts(nextProject.jiraWorkSections),
      );
      setTaskDrafts(
        Object.fromEntries(
          nextProject.tasks.map((task) => [
            task.id,
            {
              jiraTicketKey: task.jiraTicketKey ?? "",
              jiraTicketUrl: task.jiraTicketUrl ?? "",
            },
          ]),
        ),
      );
      const allProjectIssues = [
        ...nextProject.issues,
        ...(nextProject.closedIssues ?? []),
      ];
      setIssueLinkDrafts(
        Object.fromEntries(
          allProjectIssues.map((issue) => [
            issue.id,
            { jiraKey: "", jiraUrl: "" },
          ]),
        ),
      );
      setIssueEditDrafts(
        Object.fromEntries(
          nextProject.issues.map((issue) => [issue.id, issueToDraft(issue)]),
        ),
      );
      setExpandedIssueId((currentIssueId) =>
        allProjectIssues.some((issue) => issue.id === currentIssueId)
          ? currentIssueId
          : null,
      );
      setWbsDrafts(nextWbsDrafts);
      setActiveWbsItemId((currentItemId) =>
        nextProject.wbsItems.some((item) => item.id === currentItemId)
          ? currentItemId
          : null,
      );
      setSelectedWbsIds(
        (currentIds) =>
          new Set(
            [...currentIds].filter((itemId) =>
              nextProject.wbsItems.some((item) => item.id === itemId),
            ),
          ),
      );
      setCollapsedWbsIds(
        (currentIds) =>
          new Set(
            [...currentIds].filter((itemId) =>
              nextProject.wbsItems.some((item) => item.id === itemId),
            ),
          ),
      );
      setArtifactDrafts(
        Object.fromEntries(
          nextProject.artifacts.map((item) => [item.id, artifactToForm(item)]),
        ),
      );
      setExpandedArtifactId((currentArtifactId) =>
        nextProject.artifacts.some((item) => item.id === currentArtifactId)
          ? currentArtifactId
          : null,
      );
      setRaidDrafts(
        Object.fromEntries(
          nextProject.raidItems.map((item) => [item.id, raidToForm(item)]),
        ),
      );
      setRaidStatusDrafts((current) =>
        Object.fromEntries(
          nextProject.raidItems.map((item) => [
            item.id,
            current[item.id] ?? { statusAt: isoDate(new Date()), text: "" },
          ]),
        ),
      );
      setExpandedRaidId((currentRaidId) =>
        nextProject.raidItems.some((item) => item.id === currentRaidId)
          ? currentRaidId
          : null,
      );
    },
    [setWbsRedoHistory, setWbsUndoHistory],
  );

  useEffect(() => {
    if (authMode !== "ready" || !selectedProjectId) return;
    let cancelled = false;
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
    const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${selectedProjectId}/overview`,
        "Не удалось загрузить проект",
      )
      .then((data: ProjectDetails) => {
        if (
          !cancelled &&
          shouldApplyProjectSnapshotAfterWbsSave({
            loadSequenceAtStart: loadSequence,
            currentLoadSequence: projectLoadSequenceRef.current,
            wbsSaveSequenceAtStart,
            currentWbsSaveSequence: wbsSaveSequenceRef.current,
            pendingWbsSavesAtStart,
            currentPendingWbsSaves: pendingWbsSaveCountRef.current,
          })
        ) {
          applyProject(data);
        }
      })
      .catch(() => setError("Не удалось загрузить проект"));
    return () => {
      cancelled = true;
    };
  }, [applyProject, authMode, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || activeView !== "project-overview") {
      return;
    }
    let cancelled = false;
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
    const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${selectedProjectId}/overview`,
        "Не удалось обновить обзор проекта",
      )
      .then((data) => {
        if (
          !cancelled &&
          shouldApplyProjectSnapshotAfterWbsSave({
            loadSequenceAtStart: loadSequence,
            currentLoadSequence: projectLoadSequenceRef.current,
            wbsSaveSequenceAtStart,
            currentWbsSaveSequence: wbsSaveSequenceRef.current,
            pendingWbsSavesAtStart,
            currentPendingWbsSaves: pendingWbsSaveCountRef.current,
          })
        ) {
          applyProject(data);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось обновить обзор проекта",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, applyProject, selectedProjectId]);

  function applyWbsSnapshotResult(
    nextItems: WbsItem[],
    nextDependencies?: WbsDependency[],
    nextCriticalPath?: WbsCriticalPath | null,
  ) {
    const currentProject = projectRef.current;
    const nextProject = currentProject
      ? {
          ...currentProject,
          wbsItems: nextItems,
          wbsDependencies: nextDependencies ?? currentProject.wbsDependencies,
          criticalPath:
            nextCriticalPath === undefined
              ? currentProject.criticalPath
              : nextCriticalPath,
        }
      : currentProject;
    projectRef.current = nextProject;
    setProject(nextProject);
    const nextWbsDrafts = Object.fromEntries(
      nextItems.map((item) => [item.id, wbsToForm(item)]),
    );
    wbsDraftsRef.current = nextWbsDrafts;
    setWbsDrafts(nextWbsDrafts);
    setCollapsedWbsIds(
      (currentIds) =>
        new Set(
          [...currentIds].filter((itemId) =>
            nextItems.some((item) => item.id === itemId),
          ),
        ),
    );
  }

  function applyWbsItems(nextItems: WbsItem[]) {
    applyWbsSnapshotResult(nextItems);
  }

  function getCurrentWbsSnapshot(): WbsSnapshot | null {
    if (!project) return null;
    return {
      wbsItems: project.wbsItems.map((item) => ({ ...item })),
      wbsDependencies: project.wbsDependencies.map((dependency) => ({
        predecessorId: dependency.predecessorId,
        successorId: dependency.successorId,
        type: dependency.type,
        lagDays: dependency.lagDays,
      })),
    };
  }

  function rememberWbsSnapshot() {
    const snapshot = getCurrentWbsSnapshot();
    if (!snapshot) return null;
    const previous = wbsUndoStackRef.current.at(-1);
    if (!previous || !wbsSnapshotsEqual(previous, snapshot)) {
      setWbsUndoHistory([...wbsUndoStackRef.current, snapshot].slice(-10));
    }
    setWbsRedoHistory([]);
    return snapshot;
  }

  async function restoreWbsSnapshot(
    snapshot: WbsSnapshot,
    direction: "undo" | "redo",
  ) {
    if (!project || restoringWbsSnapshot) return;
    const currentSnapshot = getCurrentWbsSnapshot();
    if (!currentSnapshot) return;
    setRestoringWbsSnapshot(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-snapshot/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось восстановить Структуру");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
      if (direction === "undo") {
        setWbsRedoHistory([...wbsRedoStackRef.current, currentSnapshot].slice(-10));
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
        setNotice("Откат Структуры выполнен");
      } else {
        setWbsUndoHistory([...wbsUndoStackRef.current, currentSnapshot].slice(-10));
        setWbsRedoHistory(wbsRedoStackRef.current.slice(0, -1));
        setNotice("Изменение Структуры восстановлено");
      }
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Не удалось восстановить Структуру",
      );
    } finally {
      setRestoringWbsSnapshot(false);
    }
  }

  async function undoWbsChange() {
    const snapshot = wbsUndoStackRef.current.at(-1);
    if (!snapshot) return;
    await restoreWbsSnapshot(snapshot, "undo");
  }

  async function redoWbsChange() {
    const snapshot = wbsRedoStackRef.current.at(-1);
    if (!snapshot) return;
    await restoreWbsSnapshot(snapshot, "redo");
  }

  async function saveWbsBaseline() {
    if (!project) return;
    if (
      !window.confirm(
        "Зафиксировать текущую Структуру как базовый план? Текущие даты станут датами базового плана.",
      )
    ) {
      return;
    }
    setSavingBaseline(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-baseline`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось сохранить базовый план");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
      setNotice("Базовый план Структуры сохранен");
    } catch (baselineError) {
      setError(
        baselineError instanceof Error
          ? baselineError.message
          : "Не удалось сохранить базовый план",
      );
    } finally {
      setSavingBaseline(false);
    }
  }

  async function toggleCalendarDay(
    calendarCode: ProjectCalendarCode,
    dateValue: Date,
  ) {
    if (!project) return;
    const dateKey = isoDate(dateValue);
    const overrideKey = `${calendarCode}:${dateKey}`;
    const currentOverride = calendarOverridesByKey.get(overrideKey);
    const currentWorkingDay =
      currentOverride?.isWorkingDay ?? isDefaultWorkingDay(dateValue);
    setSavingCalendar(overrideKey);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/calendar-overrides`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calendarCode,
            date: dateKey,
            isWorkingDay: !currentWorkingDay,
            description: !currentWorkingDay
              ? "Рабочий день"
              : "Выходной / праздничный день",
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось сохранить календарь");
      }
      setProject((current) => {
        if (!current) return current;
        const withoutCurrent = current.calendarOverrides.filter(
          (override) =>
            !(
              override.calendarCode === calendarCode &&
              isoDate(new Date(override.date)) === dateKey
            ),
        );
        return {
          ...current,
          calendarOverrides: [...withoutCurrent, result],
        };
      });
      await refreshProject(project.id);
    } catch (calendarError) {
      setError(
        calendarError instanceof Error
          ? calendarError.message
          : "Не удалось сохранить календарь",
      );
    } finally {
      setSavingCalendar(null);
    }
  }

  async function refreshProject(projectId = project?.id) {
    if (!projectId) return;
    const loadSequence = projectLoadSequenceRef.current + 1;
    projectLoadSequenceRef.current = loadSequence;
    const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
    const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
    const refreshed = await apiClient.get<ProjectDetails>(
      `/api/projects/${projectId}/overview`,
      "Не удалось загрузить проект",
    );
    if (
      !shouldApplyProjectSnapshotAfterWbsSave({
        loadSequenceAtStart: loadSequence,
        currentLoadSequence: projectLoadSequenceRef.current,
        wbsSaveSequenceAtStart,
        currentWbsSaveSequence: wbsSaveSequenceRef.current,
        pendingWbsSavesAtStart,
        currentPendingWbsSaves: pendingWbsSaveCountRef.current,
      })
    ) {
      return;
    }
    applyProject(refreshed);
  }

  async function saveJiraIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSavingJira(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/jira-integration`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jiraForm),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить Jira",
        );
      }
      await refreshProject(project.id);
      setNotice("Jira-настройки сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить Jira",
      );
    } finally {
      setSavingJira(false);
    }
  }

  async function saveJiraWorkSections(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSavingJiraWorkSections(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/jira-work-sections`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sections: jiraWorkSectionDrafts.map((section, index) => ({
              id: section.id ?? undefined,
              sortOrder: index,
              title: section.title.trim() || `Раздел ${index + 1}`,
              jql: section.jql.trim(),
            })),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить разделы Jira",
        );
      }
      await refreshProject(project.id);
      setNotice("Разделы Jira сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить разделы Jira",
      );
    } finally {
      setSavingJiraWorkSections(false);
    }
  }

  function openSearchResult(result: SearchResult) {
    globalSearch.clear();
    if (result.projectId) {
      setSelectedProjectId(result.projectId);
      const section =
        result.url.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "overview";
      const nextView = projectPathViews[section] ?? "project-overview";
      openView(nextView, { projectCode: result.projectCode });
      return;
    }
    openView("portfolio");
  }

  async function saveProjectUiState(
    patch: ProjectUiState,
    options?: {
      sidebarCollapsed?: boolean;
      wbsColumnOrder?: WbsTableColumnKey[];
      wbsHiddenColumns?: WbsTableColumnKey[];
      wbsColumnWidths?: Record<WbsTableColumnKey, number>;
      wbsSort?: WbsSortState | null;
      ganttPanelHeight?: number;
      ganttPanelWidth?: number;
      ganttWbsWidth?: number;
    },
  ) {
    if (!project) return;
    const nextUiState: ProjectUiState = {
      ...(project.uiState ?? {}),
      sidebarCollapsed: options?.sidebarCollapsed ?? sidebarCollapsed,
      wbsColumnOrder: options?.wbsColumnOrder ?? wbsColumnOrder,
      wbsHiddenColumns: options?.wbsHiddenColumns ?? wbsHiddenColumns,
      wbsColumnWidths: options?.wbsColumnWidths ?? wbsColumnWidths,
      wbsSort: options?.wbsSort ?? wbsSort,
      ganttPanelHeight: options?.ganttPanelHeight ?? ganttPanelHeight,
      ganttPanelWidth: options?.ganttPanelWidth ?? ganttPanelWidth,
      ganttWbsWidth: options?.ganttWbsWidth ?? ganttWbsWidth,
      ...patch,
    };
    setProject((current) =>
      current ? { ...current, uiState: nextUiState } : current,
    );
    const response = await authenticatedFetch(`${apiBase}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiState: nextUiState }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error ?? "Не удалось сохранить настройки интерфейса");
    }
  }

  const {
    updatePassportRow,
    addPassportRow,
    deletePassportRow,
    savePassportRows,
  } = usePassportController({
    projectId: project?.id ?? null,
    passportRows,
    setPassportRows,
    setSavingPassportRows,
    saveProjectUiState,
    refreshProject,
    setError,
    setNotice,
  });
  const {
    updateArtifactDraft,
    saveArtifact,
    deleteArtifact,
    createArtifactRow,
    moveArtifact,
  } = useArtifactsController({
    project,
    artifactDrafts,
    setArtifactDrafts,
    setExpandedArtifactId,
    refreshProject,
    setError,
    setNotice,
  });
  const {
    updateRaidDraft,
    updateRaidStatusDraft,
    createRaidItem,
    saveRaidItem,
    addRaidStatusUpdate,
    deleteRaidItem,
  } = useRaidController({
    projectId: project?.id ?? null,
    raidForm,
    setRaidForm,
    raidDrafts,
    setRaidDrafts,
    raidStatusDrafts,
    setRaidStatusDrafts,
    setExpandedRaidId,
    refreshProject,
    setError,
    setNotice,
  });
  const {
    createProject,
    updateProjectRegistryDraft,
    savePortfolioProjectIdentity,
    saveProjectRegistryItem,
    closeProject,
    deleteProject,
  } = useProjectRegistryController({
    projects,
    setProjects,
    project,
    setProject,
    selectedProjectId,
    setSelectedProjectId,
    newProjectForm,
    setNewProjectForm,
    projectRegistryDrafts,
    setProjectRegistryDrafts,
    setSavingProjectRegistryId,
    firstEnabledProjectView,
    openView,
    refreshProject,
    reloadAuditEvents,
    setError,
    setNotice,
  });
  const {
    createApiToken,
    toggleApiToken,
    createWebhook,
    toggleWebhook,
    testWebhook,
    updateUserDraft,
    updateDictionaryDraft,
    updateProjectModuleDraft,
    saveProjectModules,
    toggleRolePermission,
    createDictionaryItem,
    saveDictionaryItem,
    deactivateDictionaryItem,
    saveSystemSettings,
    exportAdminConfig,
    importAdminConfig,
    createUser,
    saveUser,
  } = useAdminActionsController({
    users,
    setUsers,
    userDrafts,
    setUserDrafts,
    newUserForm,
    setNewUserForm,
    setSavingUserId,
    setCreatingUser,
    rolePermissions,
    setRolePermissions,
    dictionaryItems,
    dictionaryDrafts,
    setDictionaryDrafts,
    newDictionaryDraft,
    setNewDictionaryDraft,
    setSavingDictionaryItemId,
    setCreatingDictionaryItem,
    systemSettingsDraft,
    setSystemSettings,
    setSystemSettingsDraft,
    setSavingSystemSettings,
    normalizedProjectModules,
    projectModuleDrafts,
    setProjectModules,
    setProjectModuleDrafts,
    setSavingProjectModules,
    apiTokenDraft,
    webhookDraft,
    setWebhookDraft,
    setCreatedApiToken,
    setSavingIntegration,
    configTransferText,
    setConfigTransferText,
    setImportingConfig,
    setSavingRolePermissionId,
    reloadUsers,
    reloadAuditEvents,
    reloadAdminConfig,
    reloadAdminIntegrations,
    setError,
    setNotice,
  });
  const {
    createOpenIssue,
    saveTaskJiraLink,
    updateIssueFormLink,
    addIssueFormLink,
    removeIssueFormLink,
    addIssueJiraLink,
    removeIssueJiraLink,
    updateIssueDraft,
    updateIssueStatusDraft,
    saveOpenIssue,
    closeOpenIssue,
    addIssueStatusUpdate,
    saveOpenIssueWithPayload,
  } = useIssueController({
    projectId: project?.id ?? null,
    issueForm,
    setIssueForm,
    taskDrafts,
    issueLinkDrafts,
    issueEditDrafts,
    setIssueEditDrafts,
    issueStatusDrafts,
    setIssueStatusDrafts,
    setIssueFormErrors,
    setCreatingIssue,
    setIssueDrawerMode,
    refreshProject,
    setError,
    setNotice,
  });

  function wbsPayload(
    itemId: string,
    form: WbsFormState,
    options: { scheduleDriver?: WbsScheduleDriver } = {},
  ) {
    const nextLevel = form.wbsLevel ? Number(form.wbsLevel) : null;
    const workDays = form.workDays.trim();
    const calendarDays = form.calendarDays.trim();
    const leadLagDays = form.leadLagDays.trim();
    const planWorkDays = form.planWorkDays.trim();
    const planCalendarDays = form.planCalendarDays.trim();
    const payload = {
      ...form,
      parentId: parentIdFromWbsLevel(
        itemId,
        nextLevel,
        wbsTree,
        wbsDraftsRef.current,
      ),
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      baselineStartDate: form.baselineStartDate || null,
      baselineDueDate: form.baselineDueDate || null,
      forecastStartDate: form.forecastStartDate || null,
      forecastDueDate: form.forecastDueDate || null,
      code: draftWbsCodes.get(itemId) ?? form.code,
      wbsLevel: nextLevel,
      ...Object.fromEntries(
        WBS_PREDECESSOR_KEYS.map((key) => [key, form[key] || null]),
      ),
      leadLagDays: leadLagDays ? Number(leadLagDays) : 0,
      workDays: workDays ? Number(workDays) : null,
      calendarDays: calendarDays ? Number(calendarDays) : null,
      excelStartDate: form.excelStartDate || null,
      excelEndDate: form.excelEndDate || null,
      planWorkDays: planWorkDays ? Number(planWorkDays) : null,
      planCalendarDays: planCalendarDays
        ? Number(planCalendarDays)
        : null,
      calendarCode: form.calendarCode,
      templateColor: form.templateColor || null,
      priority: form.priority || null,
      plannedCost: Number(form.plannedCost),
      forecastCost: Number(form.forecastCost),
      progress: Number(form.progress),
      jiraTicketKey: form.jiraTicketKey || null,
      jiraTicketUrl: form.jiraTicketUrl || null,
      description: form.description || null,
      sortOrder: Number(form.sortOrder),
    };
    return options.scheduleDriver
      ? { ...payload, scheduleDriver: options.scheduleDriver }
      : payload;
  }

  function isLatestWbsSave(itemId: string, saveSequence: number) {
    return (
      wbsSaveSequenceRef.current === saveSequence &&
      latestWbsSaveSequenceByItemRef.current[itemId] === saveSequence
    );
  }

  function updateWbsDraft(itemId: string, patch: Partial<WbsFormState>) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const nextDrafts = {
      ...wbsDraftsRef.current,
      [itemId]: { ...current, ...patch },
    };
    wbsDraftsRef.current = nextDrafts;
    setWbsDrafts(nextDrafts);
  }

  function updateSelectedWbsDrafts(patch: Partial<WbsFormState>) {
    if (selectedWbsIds.size === 0) return;
    setWbsDrafts((current) => {
      const next = { ...current };
      for (const itemId of selectedWbsIds) {
        if (!next[itemId]) continue;
        next[itemId] = { ...next[itemId], ...patch };
      }
      wbsDraftsRef.current = next;
      return next;
    });
  }

  async function saveDirtyWbsItems() {
    if (dirtyWbsItemIds.size === 0) return;
    setSavingWbsBulk(true);
    try {
      for (const itemId of dirtyWbsItemIds) {
        await saveWbsItem(itemId, { silent: true });
      }
      setNotice("Изменения Структуры сохранены");
    } finally {
      setSavingWbsBulk(false);
    }
  }

  function saveWbsDraftPatch(
    itemId: string,
    patch: Partial<WbsFormState>,
    options: { silent?: boolean; scheduleDriver?: WbsScheduleDriver } = {},
  ) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const nextDraft = { ...current, ...patch };
    const nextDrafts = {
      ...wbsDraftsRef.current,
      [itemId]: nextDraft,
    };
    wbsDraftsRef.current = nextDrafts;
    setWbsDrafts(nextDrafts);
    void saveWbsItem(itemId, { ...options, draftOverride: nextDraft });
  }

  function toggleWbsCollapse(itemId: string) {
    setCollapsedWbsIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function startGanttResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = ganttWbsWidth;
    let latestWidth = startWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        640,
        Math.max(260, startWidth + moveEvent.clientX - startX),
      );
      latestWidth = nextWidth;
      setGanttWbsWidth(nextWidth);
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        { ganttWbsWidth: latestWidth },
        { ganttWbsWidth: latestWidth },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function startGanttPanelResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    axis: "width" | "height" | "both",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const panel = event.currentTarget.closest(".gantt-panel");
    const bounds = ganttPanelWidthBounds(panel);
    const currentPanelWidth =
      panel?.getBoundingClientRect().width ?? ganttPanelWidth;
    const startWidth = clampNumber(
      currentPanelWidth,
      bounds.min,
      bounds.max,
    );
    const startHeight = ganttPanelHeight;
    let latestWidth =
      axis === "height" ? ganttPanelWidth : startWidth;
    let latestHeight = startHeight;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (axis === "width" || axis === "both") {
        latestWidth = clampNumber(
          startWidth + moveEvent.clientX - startX,
          bounds.min,
          bounds.max,
        );
        setGanttPanelWidth(latestWidth);
      }
      if (axis === "height" || axis === "both") {
        latestHeight = clampNumber(
          startHeight + moveEvent.clientY - startY,
          320,
          900,
        );
        setGanttPanelHeight(latestHeight);
      }
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      const patch: ProjectUiState = {
        ganttPanelHeight: latestHeight,
      };
      const options: {
        ganttPanelHeight?: number;
        ganttPanelWidth?: number;
      } = {
        ganttPanelHeight: latestHeight,
      };
      if (axis === "width" || axis === "both") {
        patch.ganttPanelWidth = latestWidth;
        options.ganttPanelWidth = latestWidth;
      }
      await saveProjectUiState(
        patch,
        options,
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function resetGanttPanelSize() {
    setGanttPanelHeight(GANTT_PANEL_HEIGHT_DEFAULT);
    setGanttPanelWidth(GANTT_PANEL_WIDTH_DEFAULT);
    await saveProjectUiState(
      {
        ganttPanelHeight: GANTT_PANEL_HEIGHT_DEFAULT,
        ganttPanelWidth: GANTT_PANEL_WIDTH_DEFAULT,
      },
      {
        ganttPanelHeight: GANTT_PANEL_HEIGHT_DEFAULT,
        ganttPanelWidth: GANTT_PANEL_WIDTH_DEFAULT,
      },
    );
  }

  function startWbsColumnResize(
    columnKey: WbsTableColumnKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = wbsColumnWidths[columnKey];
    let latestWidths = wbsColumnWidths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        760,
        Math.max(56, startWidth + moveEvent.clientX - startX),
      );
      setWbsColumnWidths((current) => {
        latestWidths = {
          ...current,
          [columnKey]: nextWidth,
        };
        return latestWidths;
      });
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        { wbsColumnWidths: latestWidths },
        { wbsColumnWidths: latestWidths },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function moveWbsColumn(
    sourceKey: WbsTableColumnKey,
    targetKey: WbsTableColumnKey,
  ) {
    if (
      sourceKey === targetKey ||
      sourceKey === "level" ||
      targetKey === "level" ||
      sourceKey === "structure" ||
      targetKey === "structure"
    ) {
      return;
    }
    setWbsColumnOrder((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      const targetIndex = current.indexOf(targetKey);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = normalizeWbsColumnOrder(current);
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      const normalizedNext = normalizeWbsColumnOrder(next);
      void saveProjectUiState(
        { wbsColumnOrder: normalizedNext },
        { wbsColumnOrder: normalizedNext },
      );
      return normalizedNext;
    });
  }

  function toggleWbsColumn(columnKey: WbsTableColumnKey) {
    if (columnKey === "level" || columnKey === "structure") return;
    setWbsHiddenColumns((current) => {
      const currentNormalized = normalizeWbsHiddenColumns(current);
      const isHidden = currentNormalized.includes(columnKey);
      const next = isHidden
        ? currentNormalized.filter((key) => key !== columnKey)
        : normalizeWbsHiddenColumns([...currentNormalized, columnKey]);
      void saveProjectUiState(
        { wbsHiddenColumns: next },
        { wbsHiddenColumns: next },
      );
      return next;
    });
  }

  function toggleWbsSort(columnKey: WbsTableColumnKey) {
    setWbsSort((current) => {
      const next =
        current?.columnKey !== columnKey
          ? { columnKey, direction: "asc" as const }
          : current.direction === "asc"
          ? { columnKey, direction: "desc" as const }
          : null;
      if (project && isAuthenticated && !isClosedProject) {
        void saveProjectUiState({ wbsSort: next }, { wbsSort: next });
      }
      return next;
    });
  }

  function startWbsColumnDrag(
    columnKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    if (columnKey === "level" || columnKey === "structure") {
      event.preventDefault();
      return;
    }
    setDraggedWbsColumn(columnKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnKey);
  }

  function dropWbsColumn(
    targetKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    const sourceKey =
      (event.dataTransfer.getData("text/plain") as WbsTableColumnKey) ||
      draggedWbsColumn;
    if (sourceKey) moveWbsColumn(sourceKey, targetKey);
    setDraggedWbsColumn(null);
  }

  async function saveWbsItem(
    itemId: string,
    options: {
      silent?: boolean;
      draftOverride?: WbsFormState;
      scheduleDriver?: WbsScheduleDriver;
    } = {},
  ) {
    const activeProject = projectRef.current ?? project;
    if (!activeProject) return;
    const draft =
      options.draftOverride ??
      wbsDraftsRef.current[itemId] ??
      wbsDrafts[itemId];
    if (!draft) return;
    const currentItem = activeProject.wbsItems.find(
      (item) => item.id === itemId,
    );
    const comparablePayload = wbsPayload(itemId, draft);
    if (!isHttpsUrl(draft.jiraTicketUrl)) {
      setError("Ссылка Jira должна начинаться с https://");
      return;
    }
    const currentPayload = currentItem
      ? wbsPayload(itemId, wbsToForm(currentItem))
      : null;
    const scheduleDriver =
      options.scheduleDriver ??
      inferWbsScheduleDriver(currentPayload, comparablePayload);
    const nextPayload = wbsPayload(itemId, draft, { scheduleDriver });
    const rowChanged =
      currentPayload !== null &&
      JSON.stringify(comparablePayload) !== JSON.stringify(currentPayload);
    const predecessorsChanged =
      currentItem !== undefined &&
      (WBS_PREDECESSOR_KEYS.some(
        (key) => comparablePayload[key] !== currentItem[key],
      ) ||
        comparablePayload.leadLagDays !== currentItem.leadLagDays);
    const requiresRenumber =
      currentItem !== undefined &&
      (comparablePayload.wbsLevel !== currentItem.wbsLevel ||
        comparablePayload.parentId !== currentItem.parentId ||
        draftWbsCodes.get(itemId) !== currentItem.code);
    if (
      currentItem &&
      !rowChanged
    ) {
      return;
    }
    if (rowChanged) rememberWbsSnapshot();
    setError(null);
    if (!options.silent) setNotice(null);
    const saveSequence = wbsSaveSequenceRef.current + 1;
    wbsSaveSequenceRef.current = saveSequence;
    latestWbsSaveSequenceByItemRef.current[itemId] = saveSequence;
    pendingWbsSaveCountRef.current += 1;
    try {
      const patchResult = await apiClient.patch<WbsSnapshotResponse>(
        `/api/wbs-items/${itemId}`,
        nextPayload,
        "Не удалось сохранить элемент Структуры",
      );
      const predecessorResult = predecessorsChanged
        ? await saveWbsPredecessors(itemId, { remember: false })
        : null;

      if (!isLatestWbsSave(itemId, saveSequence)) {
        return;
      }

      if (requiresRenumber) {
        const renumberResult = await apiClient.post<WbsSnapshotResponse>(
          `/api/projects/${activeProject.id}/wbs-items/renumber`,
          undefined,
          "Не удалось перенумеровать Структуру",
        );
        if (!isLatestWbsSave(itemId, saveSequence)) {
          return;
        }
        if (renumberResult.wbsItems) {
          applyWbsSnapshotResult(
            renumberResult.wbsItems,
            renumberResult.wbsDependencies,
            renumberResult.criticalPath,
          );
        } else {
          await refreshProject();
        }
      } else {
        const snapshotResult = predecessorResult?.wbsItems
          ? predecessorResult
          : patchResult;
        applyWbsSnapshotResult(
          snapshotResult.wbsItems,
          snapshotResult.wbsDependencies,
          snapshotResult.criticalPath,
        );
      }
      if (!options.silent) setNotice("Элемент Структуры обновлен");
    } catch (saveError) {
      if (!isLatestWbsSave(itemId, saveSequence)) {
        return;
      }
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить элемент Структуры",
      );
    } finally {
      pendingWbsSaveCountRef.current = Math.max(
        0,
        pendingWbsSaveCountRef.current - 1,
      );
    }
  }

  async function insertWbsRow(
    afterIndex: number,
    sourceRows: WbsTreeItem[] = visibleWbsTree,
  ) {
    if (!project) return;
    setError(null);
    setNotice(null);
    const previousItem = sourceRows[afterIndex];
    if (!previousItem) return;
    const nextItem = sourceRows[afterIndex + 1] ?? null;

    rememberWbsSnapshot();
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/insert-after`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            afterItemId: previousItem.id,
            beforeItemId: nextItem?.id ?? null,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось вставить строку Структуры",
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
    } catch (insertError) {
      setError(
        insertError instanceof Error
          ? insertError.message
          : "Не удалось вставить строку Структуры",
      );
    }
  }

  async function reorderWbsRows(sourceId: string, targetId: string) {
    if (!project || sourceId === targetId) return;
    const sourceIndex = wbsTree.findIndex((item) => item.id === sourceId);
    const targetIndex = wbsTree.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourceLevel = wbsTree[sourceIndex].level;
    let sourceEndIndex = sourceIndex + 1;
    while (
      sourceEndIndex < wbsTree.length &&
      wbsTree[sourceEndIndex].level > sourceLevel
    ) {
      sourceEndIndex += 1;
    }
    if (targetIndex > sourceIndex && targetIndex < sourceEndIndex) {
      return;
    }

    const movedBlock = wbsTree.slice(sourceIndex, sourceEndIndex);
    const remainingItems = [
      ...wbsTree.slice(0, sourceIndex),
      ...wbsTree.slice(sourceEndIndex),
    ];
    const nextTargetIndex = remainingItems.findIndex(
      (item) => item.id === targetId,
    );
    if (nextTargetIndex === -1) return;

    const nextItems = [...remainingItems];
    nextItems.splice(nextTargetIndex, 0, ...movedBlock);

    const normalizedItems = nextItems.map((item, index) => ({
      ...item,
      sortOrder: (index + 1) * 10,
    }));
    const previousSnapshot = rememberWbsSnapshot();
    applyWbsItems(normalizedItems);
    setError(null);
    setNotice(null);

    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: normalizedItems.map((item) => item.id),
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось переместить строку Структуры",
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      }
    } catch (reorderError) {
      if (previousSnapshot) {
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
      }
      await refreshProject(project.id);
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "Не удалось переместить строку Структуры",
      );
    } finally {
      setDraggedWbsItemId(null);
      setWbsDropTargetId(null);
    }
  }

  async function saveWbsPredecessors(
    itemId: string,
    options: { remember?: boolean } = {},
  ) {
    if (!project) return null;
    const draft = wbsDrafts[itemId];
    if (!draft) return null;
    const wbsByCode = new Map<string, WbsItem>();
    for (const item of project.wbsItems) {
      wbsByCode.set(item.code, item);
      const draftCode = draftWbsCodes.get(item.id);
      if (draftCode) {
        wbsByCode.set(draftCode, item);
      }
    }
    const desiredPredecessors = WBS_PREDECESSOR_KEYS.map((key) =>
      resolveDraftPredecessorCode(
        draft[key],
        wbsTree,
        wbsDrafts,
        draftWbsCodes,
      ),
    )
      .map((code) => code.trim())
      .filter(Boolean)
      .map((code) => {
        const predecessor = wbsByCode.get(code);
        if (!predecessor) {
          throw new Error(`Предшественник ${code} не найден в Структуре`);
        }
        return {
          predecessorId: predecessor.id,
          type: "FS" as WbsDependencyType,
          lagDays: Number(draft.leadLagDays),
        };
      });
    const uniquePredecessors = new Set(
      desiredPredecessors.map((draft) => draft.predecessorId),
    );
    if (uniquePredecessors.size !== desiredPredecessors.length) {
      throw new Error("Один предшественник нельзя указывать дважды");
    }
    if (uniquePredecessors.has(itemId)) {
      throw new Error("Элемент Структуры не может быть своим предшественником");
    }

    const existingDependencies = project.wbsDependencies.filter(
      (dependency) => dependency.successorId === itemId,
    );
    const dependenciesChanged =
      existingDependencies.length !== desiredPredecessors.length ||
      existingDependencies.some(
        (dependency) =>
          !desiredPredecessors.some(
            (draft) =>
              draft.predecessorId === dependency.predecessorId &&
              draft.type === dependency.type &&
              draft.lagDays === dependency.lagDays,
          ),
      );
    if (dependenciesChanged && options.remember !== false) {
      rememberWbsSnapshot();
    }
    let latestSnapshot: {
      wbsItems?: WbsItem[];
      wbsDependencies?: WbsDependency[];
      criticalPath?: WbsCriticalPath | null;
    } | null = null;
    for (const dependency of existingDependencies) {
      const shouldKeep = desiredPredecessors.some(
        (draft) =>
          draft.predecessorId === dependency.predecessorId &&
          draft.type === dependency.type,
      );
      if (!shouldKeep) {
        const response = await authenticatedFetch(
          `${apiBase}/api/wbs-dependencies/${dependency.id}`,
          { method: "DELETE" },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result.error ?? "Не удалось удалить связь Структуры");
        }
        latestSnapshot = result;
      }
    }

    for (const draft of desiredPredecessors) {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-dependencies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predecessorId: draft.predecessorId,
            successorId: itemId,
            type: draft.type,
            lagDays: draft.lagDays,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить связь Структуры",
        );
      }
      latestSnapshot = result;
    }
    return latestSnapshot;
  }

  function ganttEndpointToDependencyType(
    fromSide: GanttLinkEndpoint["side"],
    toSide: GanttLinkEndpoint["side"],
  ): WbsDependencyType {
    if (fromSide === "start" && toSide === "start") return "SS";
    if (fromSide === "start" && toSide === "end") return "SF";
    if (fromSide === "end" && toSide === "end") return "FF";
    return "FS";
  }

  function pointerToGanttPosition(event: PointerEvent | ReactPointerEvent) {
    const timeline = ganttTimelineRef.current;
    if (!timeline) return null;
    const rect = timeline.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
      y: event.clientY - rect.top,
    };
  }

  async function deleteGanttDependency(dependencyId: string) {
    if (!project) {
      setGanttLinkDraft(null);
      return;
    }
    rememberWbsSnapshot();
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/wbs-dependencies/${dependencyId}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить связь на Гантте");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
      setNotice("Связь на Гантте удалена");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить связь на Гантте",
      );
    } finally {
      setGanttLinkDraft(null);
    }
  }

  function startGanttLinkDrag(
    endpoint: GanttLinkEndpoint,
    event: ReactPointerEvent<Element>,
    replaceDependencyId?: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const position = pointerToGanttPosition(event);
    if (!position) return;
    ganttLinkCompletedRef.current = false;
    setActiveWbsItemId(endpoint.itemId);
    setGanttLinkDraft({
      ...endpoint,
      pointerX: Math.max(0, Math.min(100, position.x)),
      pointerY: position.y,
      replaceDependencyId,
    });

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let draggedBeyondThreshold = false;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (
        Math.hypot(
          moveEvent.clientX - startClientX,
          moveEvent.clientY - startClientY,
        ) > 4
      ) {
        draggedBeyondThreshold = true;
      }
      const nextPosition = pointerToGanttPosition(moveEvent);
      if (!nextPosition) return;
      setGanttLinkDraft((current) =>
        current
          ? {
              ...current,
              pointerX: Math.max(0, Math.min(100, nextPosition.x)),
              pointerY: nextPosition.y,
            }
          : current,
      );
    };
    const onPointerUp = () => {
      window.setTimeout(() => {
        if (ganttLinkCompletedRef.current) {
          ganttLinkCompletedRef.current = false;
          return;
        }
        if (replaceDependencyId && draggedBeyondThreshold) {
          void deleteGanttDependency(replaceDependencyId);
        } else {
          setGanttLinkDraft(null);
        }
      }, 0);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function completeGanttLinkDrag(
    endpoint: GanttLinkEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    ganttLinkCompletedRef.current = true;
    if (!project || !ganttLinkDraft || ganttLinkDraft.itemId === endpoint.itemId) {
      setGanttLinkDraft(null);
      return;
    }
    const predecessorId = ganttLinkDraft.itemId;
    const successorId = endpoint.itemId;
    const type = ganttEndpointToDependencyType(ganttLinkDraft.side, endpoint.side);
    rememberWbsSnapshot();
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        ganttLinkDraft.replaceDependencyId
          ? `${apiBase}/api/wbs-dependencies/${ganttLinkDraft.replaceDependencyId}`
          : `${apiBase}/api/projects/${project.id}/wbs-dependencies`,
        {
          method: ganttLinkDraft.replaceDependencyId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predecessorId,
            successorId,
            type,
            lagDays: 0,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseErrorMessage(result, "Не удалось создать связь на Гантте"),
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
      setNotice(
        ganttLinkDraft.replaceDependencyId
          ? "Связь на Гантте изменена"
          : "Связь на Гантте создана",
      );
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Не удалось создать связь на Гантте",
      );
    } finally {
      setGanttLinkDraft(null);
    }
  }

  async function deleteWbsItem(itemId: string) {
    if (!window.confirm("Удалить только выбранную строку Структуры?")) return;
    setError(null);
    setNotice(null);
    rememberWbsSnapshot();
    try {
      const response = await authenticatedFetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить элемент Структуры");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject();
      }
      setNotice("Элемент Структуры удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить элемент Структуры",
      );
    }
  }

  const { handleWbsPaste, isWbsCellDirty, renderWbsCell } =
    useWbsStructureTableController({
      activeWbsItemId,
      collapsedWbsIds,
      deleteWbsItem,
      draftWbsCodes,
      insertWbsRow,
      orderedWbsColumns,
      saveWbsDraftPatch,
      saveWbsItem,
      selectedWbsIds,
      setDraggedWbsItemId,
      setNotice,
      setSelectedWbsIds,
      setWbsDrafts,
      setWbsDropTargetId,
      toggleWbsCollapse,
      updateWbsDraft,
      visibleStructureWbsTree,
      wbsDrafts,
      wbsDraftsRef,
      wbsSort,
      wbsTree,
    });

  function openRaidItemFromOverview(itemId: string) {
    setRaidTypeFilter("RISK");
    setRaidDecisionOnly(false);
    setRaidOverdueOnly(false);
    setRaidHighOnly(true);
    setExpandedRaidId(itemId);
    openView("project-raid");
    window.setTimeout(() => {
      document
        .getElementById(`raid-item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function selectProject(projectId: string, nextView: AppView = activeView) {
    setError(null);
    setNotice(null);
    const nextProject = projects.find((item) => item.id === projectId);
    setSelectedProjectId(projectId);
    setProjectSearch("");
    setShowProjectPicker(false);
    setRecentProjectIds((current) => [
      projectId,
      ...current.filter((item) => item !== projectId),
    ].slice(0, 6));
    const requestedView =
      nextView === "portfolio" || nextView === "project-create"
        ? firstEnabledProjectView
        : nextView;
    const safeView =
      isProjectSectionViewName(requestedView) &&
      !isProjectModuleEnabled(projectModuleKeyByView[requestedView])
        ? firstEnabledProjectView
        : requestedView;
    openView(safeView, { projectCode: nextProject?.code ?? null });
  }

  const viewTitle: Record<AppView, string> = {
    portfolio: "Портфель проектов",
    "project-create": "Создать новый проект",
    "project-overview": project?.name ?? "Обзор и вехи",
    "project-passport": project?.name ?? "Паспорт проекта",
    "project-structure": project?.name ?? "Структура",
    "project-gantt": project?.name ?? "Гантт",
    "project-jira-work": project?.name ?? "Работы в Jira",
    "project-issues": project?.name ?? "Открытые вопросы",
    "project-raid": project?.name ?? "Риски и проблемы",
    "project-changes": project?.name ?? "Управление изменениями",
    "project-resources": project?.name ?? "Управление ресурсами",
    "project-budget": project?.name ?? "Управление бюджетом",
    "project-calendars": project?.name ?? "Календари",
    "project-artifacts": project?.name ?? "Артефакты проекта",
    "closed-projects": "Закрытые проекты",
    admin: "Администрирование",
    "admin-users": "Администрирование: пользователи",
    "admin-roles": "Администрирование: роли и права",
    "admin-dictionaries": "Администрирование: справочники",
    "admin-templates": "Администрирование: шаблоны Структуры",
    "admin-rag": "Администрирование: формулы RAG",
    "admin-workflows": "Администрирование: workflow",
    "admin-jira": "Администрирование: Jira",
    "admin-integrations": "Администрирование: интеграции и API",
    "admin-health": "Администрирование: system health",
    "admin-backups": "Администрирование: backup/restore",
    "admin-config": "Администрирование: import/export",
    "admin-projects": "Администрирование: реестр проектов",
    "admin-modules": "Администрирование: управление модулями",
    "admin-audit": "Администрирование: журнал аудита",
  };
  const isProjectSectionView = isProjectSectionViewName(activeView);
  const isProjectView = activeView === "project-create" || isProjectSectionView;
  const isAdminSectionView = isAdminSectionViewName(activeView);
  const shouldShowProjectMenu = Boolean(selectedProjectListItem && isProjectSectionView);
  const shouldShowAdminMenu = Boolean(isAdminUser && isAdminSectionView);
  const toggleSidebar = () => {
    const nextCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(nextCollapsed);
    if (project && isAuthenticated && !isClosedProject) {
      void saveProjectUiState(
        { sidebarCollapsed: nextCollapsed },
        { sidebarCollapsed: nextCollapsed },
      );
    }
  };
  const toggleGanttDependencies = () => {
    setShowGanttDependencies((current) => {
      const next = !current;
      if (next) {
        setShowGanttCriticalPath(false);
      }
      return next;
    });
  };
  const toggleGanttCriticalPath = () => {
    setShowGanttCriticalPath((current) => {
      const next = !current;
      if (next) {
        setShowGanttDependencies(false);
      }
      return next;
    });
  };
  const renderGlobalSearch = (className = "") => (
    <GlobalSearch
      className={className}
      loading={globalSearch.loading}
      onOpenChange={globalSearch.setOpen}
      onQueryChange={globalSearch.setQuery}
      onSelect={openSearchResult}
      open={globalSearch.open}
      query={globalSearch.query}
      results={globalSearch.results}
    />
  );
  const renderSavedViewControls = () => {
    if (!savedViewType) return null;
    return (
      <SavedViewControls
        disabled={!selectedProjectId}
        isAuthenticated={isAuthenticated}
        onNameChange={setSavedViewName}
        onSave={() => void saveCurrentSavedView()}
        onSelect={applySavedView}
        saving={savingSavedView}
        savedViewName={savedViewName}
        savedViews={savedViews}
      />
    );
  };

  if (loading) {
    return (
      <main className="loading">Загрузка системы управления проектами...</main>
    );
  }

  const pageContext = {
    activeGanttLinkIds,
    activeProjectTree,
    activeView,
    activeWbsHierarchyLevel,
    activeWbsItemId,
    addIssueFormLink,
    addIssueJiraLink,
    addIssueStatusUpdate,
    addPassportRow,
    addRaidStatusUpdate,
    adminDictionaryLabels,
    adminHealth,
    adminIntegrations,
    adminPermissionLabel,
    adminPermissionOrder,
    artifactDrafts,
    artifactStatusLabel,
    auditActionLabel,
    auditEvents,
    auditObjectLabel,
    backupStatus,
    calendarDelayDays,
    calendarMonthDays,
    calendarOverridesByKey,
    calendarYear,
    clampNumber,
    closeOpenIssue,
    closeProject,
    closedProjectTree,
    collapsedWbsIds,
    completeGanttLinkDrag,
    configTransferText,
    createApiToken,
    createArtifactRow,
    createDictionaryItem,
    createOpenIssue,
    createProject,
    createRaidItem,
    createUser,
    createWebhook,
    createdApiToken,
    creatingDictionaryItem,
    creatingIssue,
    creatingUser,
    currentUser,
    date,
    dateTime,
    deactivateDictionaryItem,
    deleteArtifact,
    deleteProject,
    deletePassportRow,
    deleteRaidItem,
    dictionaryDrafts,
    dictionaryItemToDraft,
    dictionaryLabel,
    dirtyWbsItemIds,
    draggedWbsColumn,
    draggedWbsItemId,
    dropWbsColumn,
    emptyIssueForm,
    expandedArtifactId,
    expandedIssueId,
    expandedRaidId,
    exportAdminConfig,
    fileSize,
    filteredDictionaryItems,
    firstEnabledProjectView,
    fullscreenWorkspaceView,
    GANTT_HIERARCHY_LEVELS,
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
    groupedRaidItems,
    handleWbsPaste,
    importAdminConfig,
    importingConfig,
    isAdminSectionView,
    isDefaultWorkingDay,
    isReadOnly,
    isoDate,
    issueDrawerMode,
    issueEditDrafts,
    issueForm,
    issueFormErrors,
    issueLinkDrafts,
    issuePrimaryJiraLink,
    issueSeverityLabel,
    issueStatusDrafts,
    issueStatusLabel,
    jiraForm,
    jiraWorkSectionDrafts,
    latestIssueStatusUpdate,
    latestRaidStatusUpdate,
    MilestoneSnakeTimelineSection,
    MilestoneTimelineSection,
    milestoneLabelOffsets,
    milestoneTimeline,
    MONTH_LABELS,
    moveArtifact,
    newDictionaryDraft,
    newProjectForm,
    newUserForm,
    normalizedProjectModules,
    openRaidItemFromOverview,
    openView,
    orderedWbsColumns,
    overviewDashboard,
    passportRows,
    portfolioStats,
    printSectionAsPdf,
    project,
    PROJECT_CALENDAR_LABELS,
    projectCalendarYears,
    projectModuleDrafts,
    projectOptionLabel,
    projectRegistryDrafts,
    projects,
    projectStatusLabel,
    projectToRegistryDraft,
    ragOptionLabel,
    raidDecisionOnly,
    raidDrafts,
    raidForm,
    raidHighOnly,
    raidOverdueOnly,
    raidStatusDrafts,
    raidStatusLabel,
    raidSummary,
    raidTypeFilter,
    raidTypeLabel,
    redoWbsChange,
    reloadAdminConfig,
    reloadAdminHealth,
    reloadAdminIntegrations,
    reloadAuditEvents,
    removeIssueFormLink,
    removeIssueJiraLink,
    renderSavedViewControls,
    renderWbsCell,
    reorderWbsRows,
    resetGanttPanelSize,
    resourceSummaryRows,
    restoringWbsSnapshot,
    riskMatrix,
    riskTone,
    rolePermissions,
    saveArtifact,
    saveDirtyWbsItems,
    saveDictionaryItem,
    saveJiraIntegration,
    saveJiraWorkSections,
    saveOpenIssue,
    saveOpenIssueWithPayload,
    savePassportRows,
    savePortfolioProjectIdentity,
    saveProjectModules,
    saveProjectRegistryItem,
    saveRaidItem,
    saveSystemSettings,
    saveTaskJiraLink,
    saveUser,
    saveWbsBaseline,
    savingBaseline,
    savingCalendar,
    savingDictionaryItemId,
    savingIntegration,
    savingJira,
    savingJiraWorkSections,
    savingPassportRows,
    savingProjectModules,
    savingProjectRegistryId,
    savingRolePermissionId,
    savingSystemSettings,
    savingUserId,
    savingWbsBulk,
    selectProject,
    selectedProjectId,
    selectedWbsIds,
    setActiveWbsItemId,
    setApiTokenDraft,
    setConfigTransferText,
    setDraggedWbsColumn,
    setExpandedArtifactId,
    setExpandedIssueId,
    setExpandedRaidId,
    setGanttScale,
    setHoveredGanttItemId,
    setIssueDrawerMode,
    setIssueForm,
    setIssueFormErrors,
    setIssueLinkDrafts,
    setJiraForm,
    setJiraWorkSectionDrafts,
    setNewDictionaryDraft,
    setNewProjectForm,
    setNewUserForm,
    setRaidDecisionOnly,
    setRaidForm,
    setRaidHighOnly,
    setRaidOverdueOnly,
    setRaidTypeFilter,
    setSelectedCalendarYear,
    setSelectedDictionary,
    setSelectedWbsIds,
    setShowGanttBaseline,
    setShowGanttForecast,
    setShowStructureCriticalPath,
    setShowWbsColumnMenu,
    setSystemSettingsDraft,
    setTaskDrafts,
    setWebhookDraft,
    setWbsDropTargetId,
    setWbsHierarchyLevel,
    showGanttBaseline,
    showGanttCriticalPath,
    showGanttDependencies,
    showGanttForecast,
    showStructureCriticalPath,
    showWbsColumnMenu,
    startGanttLinkDrag,
    startGanttPanelResize,
    startGanttResize,
    startMilestoneLabelDrag,
    startWbsColumnDrag,
    startWbsColumnResize,
    syncing,
    syncJira,
    systemSettingHasValue,
    systemSettings,
    systemSettingsDraft,
    taskDrafts,
    testWebhook,
    toggleCalendarDay,
    toggleApiToken,
    toggleGanttCriticalPath,
    toggleGanttDependencies,
    toggleRolePermission,
    toggleWebhook,
    toggleWbsCollapse,
    toggleWbsColumn,
    toggleWbsSort,
    toggleWorkspaceFullscreen,
    undoWbsChange,
    updateArtifactDraft,
    updateDictionaryDraft,
    updateIssueDraft,
    updateIssueFormLink,
    updateIssueStatusDraft,
    updatePassportRow,
    updateProjectModuleDraft,
    updateProjectRegistryDraft,
    updateRaidDraft,
    updateRaidStatusDraft,
    updateSelectedWbsDrafts,
    updateUserDraft,
    userDrafts,
    userRoleLabel,
    users,
    userToDraft,
    visibleStructureWbsTree,
    visibleWbsTree,
    WBS_TABLE_COLUMNS,
    WEEKDAY_LABELS,
    webhookDraft,
    wbsDisplayLevel,
    wbsDrafts,
    wbsDropTargetId,
    wbsGantt,
    wbsHiddenColumns,
    isWbsCellDirty,
    wbsLevelWidth,
    wbsRedoStack,
    wbsSort,
    wbsStatusLabel,
    wbsTableTemplate,
    wbsUndoStack,
  };

  if (authMode === "setup" || authMode === "login") {
    return (
      <AuthPage
        authForm={authForm}
        authMode={authMode}
        error={error}
        onContinueReadOnly={() => {
          setAuthMode("ready");
          setError(null);
          setNotice(null);
        }}
        onFormChange={setAuthForm}
        onSubmit={submitAuth}
        submitting={authSubmitting}
      />
    );
  }

  return (
    <AppShell
      activeView={activeView}
      currentUser={currentUser}
      error={error}
      filteredProjectOptions={filteredProjectOptions}
      firstEnabledProjectView={firstEnabledProjectView}
      handleEditableFocus={handleEditableFocus}
      handleEditableKeyDown={handleEditableKeyDown}
      isAdminSectionView={isAdminSectionView}
      isAdminUser={isAdminUser}
      isAuthenticated={isAuthenticated}
      isClosedProject={isClosedProject}
      isProjectModuleEnabled={isProjectModuleEnabled}
      isProjectSectionView={isProjectSectionView}
      isProjectView={isProjectView}
      isReadOnly={isReadOnly}
      logout={logout}
      notice={notice}
      onAuthModeChange={setAuthMode}
      onErrorChange={setError}
      onNoticeChange={setNotice}
      openView={openView}
      pageContext={pageContext}
      project={project}
      projectSearch={projectSearch}
      recentProjects={recentProjects}
      renderGlobalSearch={renderGlobalSearch}
      scheduleHealth={topbarScheduleHealth}
      selectProject={selectProject}
      selectedProjectId={selectedProjectId}
      selectedProjectListItem={selectedProjectListItem}
      setProjectSearch={setProjectSearch}
      setShowProjectPicker={setShowProjectPicker}
      shouldShowAdminMenu={shouldShowAdminMenu}
      shouldShowProjectMenu={shouldShowProjectMenu}
      showProjectPicker={showProjectPicker}
      sidebarCollapsed={sidebarCollapsed}
      toggleSidebar={toggleSidebar}
      viewTitle={viewTitle}
    />
  );
}

export default App;
