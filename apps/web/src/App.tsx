import {
  useCallback,
  useEffect,
} from "react";
import { buildAppPresentationContext } from "./app/appPresentationContext";
import type {
  RaidItemType,
  SearchResult,
  WbsSnapshot,
} from "./app/domainTypes";
import {
  isProjectSectionViewName,
  isResourceSectionViewName,
  projectPathViews,
  type AppView,
} from "./app/routes";
import { projectModuleKeyByView } from "./app/projectModules";
import { isDefaultWorkingDay } from "./app/dateUtils";
import { useEditableCaptureHandlers } from "./app/useEditableCapture";
import { useGlobalSearch } from "./app/useGlobalSearch";
import { AppPresentation } from "./components/AppPresentation";
import { useGanttDependencyActions } from "./hooks/useGanttDependencyActions";
import { useGanttResizeActions } from "./hooks/useGanttResizeActions";
import { useProjectLifecycleActions } from "./hooks/useProjectLifecycleActions";
import { useAdminActionsController } from "./hooks/useAdminActionsController";
import { useAdminDataController } from "./hooks/useAdminDataController";
import { useAdminState } from "./hooks/useAdminState";
import { useAppFeedbackState } from "./hooks/useAppFeedbackState";
import { useAppRouting } from "./hooks/useAppRouting";
import { useAppDerivedData } from "./hooks/useAppDerivedData";
import { useArtifactsController } from "./hooks/useArtifactsController";
import { useArtifactState } from "./hooks/useArtifactState";
import { useAuthController } from "./hooks/useAuthController";
import { useAuthState } from "./hooks/useAuthState";
import { useIssueController } from "./hooks/useIssueController";
import { useIssueState } from "./hooks/useIssueState";
import { usePassportController } from "./hooks/usePassportController";
import { useProjectCoreState } from "./hooks/useProjectCoreState";
import { useProjectRegistryController } from "./hooks/useProjectRegistryController";
import { useRaidController } from "./hooks/useRaidController";
import { useRaidState } from "./hooks/useRaidState";
import { useSavedViewsState } from "./hooks/useSavedViewsState";
import { useWbsStructureTableController } from "./hooks/useWbsStructureTableController";
import { useWbsColumnActions } from "./hooks/useWbsColumnActions";
import { useWbsRowActions } from "./hooks/useWbsRowActions";
import { useWbsSnapshotActions } from "./hooks/useWbsSnapshotActions";
import { useWbsWorkspaceState } from "./hooks/useWbsWorkspaceState";
import "./App.css";

function AppController() {
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
  const {
    loading,
    setLoading,
    error,
    setError,
    notice,
    setNotice,
    toasts,
    dismissToast,
  } = useAppFeedbackState();
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
    projectTargetDateDraft,
    setProjectTargetDateDraft,
    projectTargetChangeReason,
    setProjectTargetChangeReason,
    projectTargetApprovedBy,
    setProjectTargetApprovedBy,
    savingProjectTargetDate,
    setSavingProjectTargetDate,
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
    resourceProfileOverrides,
    setResourceProfileOverrides,
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
    projectAccesses,
    setProjectAccesses,
    projectAccessDraft,
    setProjectAccessDraft,
    savingProjectAccess,
    setSavingProjectAccess,
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
  const globalSearch = useGlobalSearch();
  const {
    reloadUsers,
    reloadAuditEvents,
    reloadAdminConfig,
    reloadAdminIntegrations,
    reloadProjectAccesses,
    reloadAdminHealth,
  } = useAdminDataController({
    activeView,
    authReady: authMode === "ready",
    currentUser,
    setUsers,
    setUserDrafts,
    setAuditEvents,
    setRolePermissions,
    setProjectAccesses,
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

  const derived = useAppDerivedData({ activeView, activeWbsItemId, authMode, collapsedWbsIds, currentUser, dictionaryItems, ganttPanelHeight, ganttPanelWidth, ganttRangeDays, ganttScale, ganttWbsWidth, hoveredGanttItemId, isAdminUser, isAuthenticated, isClosedProject, project, projectModules, projectRef, projectSearch, projects, raidDecisionOnly, raidHighOnly, raidOverdueOnly, raidTypeFilter, recentProjectIds, resourceProfileOverrides, savedViewName, selectedCalendarYear, selectedDictionary, selectedProjectId, setCollapsedWbsIds, setError, setGanttPanelHeight, setGanttPanelWidth, setGanttRangeDays, setGanttScale, setGanttWbsWidth, setNotice, setProject, setRaidDecisionOnly, setRaidHighOnly, setRaidOverdueOnly, setRaidTypeFilter, setResourceProfileOverrides, setSavedViewName, setSavedViews, setSavingSavedView, setShowGanttBaseline, setShowGanttCriticalPath, setShowGanttDependencies, setShowGanttForecast, setShowStructureCriticalPath, setWbsColumnOrder, setWbsColumnWidths, setWbsHiddenColumns, setWbsSort, showGanttBaseline, showGanttCriticalPath, showGanttDependencies, showGanttForecast, showStructureCriticalPath, wbsColumnOrder, wbsColumnWidths, wbsDrafts, wbsHiddenColumns, wbsSort });
  const { applySavedView, calendarOverridesByKey, dirtyWbsItemIds, draftWbsCodes, filteredProjectOptions, firstEnabledProjectView, isProjectModuleEnabled, isReadOnly, normalizedProjectModules, orderedWbsColumns, projectTargetSummary, recentProjects, saveCurrentSavedView, savedViewType, selectedProjectListItem, topbarScheduleHealth, visibleStructureWbsTree, visibleWbsTree, wbsTree } = derived;
  const { openView } = useAppRouting({
    activeView,
    authMode,
    firstEnabledProjectView,
    isAdminUser,
    isAuthenticated,
    isProjectModuleEnabled,
    project,
    projects,
    selectedProjectListItem,
    setActiveView,
    setAuthMode,
    setError,
    setLoading,
    setNotice,
    setProjectRegistryDrafts,
    setProjects,
    setSelectedProjectId,
  });
  const { submitAuth, logout, keycloakStatus, loginWithKeycloak } = useAuthController({
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
  const {
    refreshProject,
    saveJiraIntegration,
    saveJiraWorkSections,
    saveProjectTargetDate,
    saveProjectUiState,
    syncJira,
    toggleCalendarDay,
  } = useProjectLifecycleActions({
    activeView,
    authMode,
    calendarOverridesByKey,
    ganttPanelHeight,
    ganttPanelWidth,
    ganttWbsWidth,
    isDefaultWorkingDay,
    jiraForm,
    jiraWorkSectionDrafts,
    pendingWbsSaveCountRef,
    project,
    projectLoadSequenceRef,
    projectRef,
    projectTargetApprovedBy,
    projectTargetChangeReason,
    projectTargetDateDraft,
    projectTargetSummary,
    reloadAuditEvents,
    selectedProjectId,
    setActiveWbsItemId,
    setArtifactDrafts,
    setCollapsedWbsIds,
    setError,
    setExpandedArtifactId,
    setExpandedIssueId,
    setExpandedRaidId,
    setGanttPanelHeight,
    setGanttPanelWidth,
    setGanttWbsWidth,
    setIssueEditDrafts,
    setIssueLinkDrafts,
    setJiraForm,
    setJiraWorkSectionDrafts,
    setNotice,
    setPassportRows,
    setProject,
    setProjectTargetApprovedBy,
    setProjectTargetChangeReason,
    setProjectTargetDateDraft,
    setProjects,
    setRaidDrafts,
    setRaidStatusDrafts,
    setSavingCalendar,
    setSavingJira,
    setSavingJiraWorkSections,
    setSavingProjectTargetDate,
    setSelectedCalendarYear,
    setSelectedWbsIds,
    setSidebarCollapsed,
    setSyncing,
    setTaskDrafts,
    setWbsColumnOrder,
    setWbsColumnWidths,
    setWbsDrafts,
    setWbsHiddenColumns,
    setWbsRedoHistory,
    setWbsSort,
    setWbsUndoHistory,
    sidebarCollapsed,
    wbsColumnOrder,
    wbsColumnWidths,
    wbsDraftsRef,
    wbsHiddenColumns,
    wbsSaveSequenceRef,
    wbsSort,
  });

  const {
    applyWbsItems,
    applyWbsSnapshotResult,
    redoWbsChange,
    rememberWbsSnapshot,
    saveWbsBaseline,
    undoWbsChange,
  } = useWbsSnapshotActions({
    project,
    projectRef,
    refreshProject,
    restoringWbsSnapshot,
    setCollapsedWbsIds,
    setError,
    setNotice,
    setProject,
    setRestoringWbsSnapshot,
    setSavingBaseline,
    setWbsDrafts,
    setWbsRedoHistory,
    setWbsUndoHistory,
    wbsDraftsRef,
    wbsRedoStackRef,
    wbsUndoStackRef,
  });

  const { resetGanttPanelSize, startGanttPanelResize, startGanttResize } =
    useGanttResizeActions({
      ganttPanelHeight,
      ganttPanelWidth,
      ganttWbsWidth,
      saveProjectUiState,
      setGanttPanelHeight,
      setGanttPanelWidth,
      setGanttWbsWidth,
    });

  const {
    dropWbsColumn,
    startWbsColumnDrag,
    startWbsColumnResize,
    toggleWbsColumn,
    toggleWbsSort,
  } = useWbsColumnActions({
    draggedWbsColumn,
    isAuthenticated,
    isClosedProject,
    project,
    saveProjectUiState,
    setDraggedWbsColumn,
    setWbsColumnOrder,
    setWbsColumnWidths,
    setWbsHiddenColumns,
    setWbsSort,
    wbsColumnWidths,
  });

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
    convertRiskToProblem,
    convertRiskToAssumption,
    closeRaidItem,
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
    saveProjectPortfolio,
    saveProjectRegistryItem,
    closeProject,
    deleteProject,
  } = useProjectRegistryController({
    projects,
    currentUser,
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
    updateProjectAccessDraft,
    grantProjectAccess,
    updateProjectAccessLevel,
    deleteProjectAccess,
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
    projectAccessDraft,
    setProjectAccessDraft,
    setProjectAccesses,
    setSavingProjectAccess,
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
    reloadProjectAccesses,
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
    convertIssueToProblem,
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

  const {
    deleteSelectedWbsItems,
    deleteWbsItem,
    insertWbsRow,
    reorderWbsRows,
    saveDirtyWbsItems,
    saveWbsDraftPatch,
    saveWbsTypePatch,
    saveWbsItem,
    toggleWbsCollapse,
    updateSelectedWbsDrafts,
    updateWbsDraft,
  } = useWbsRowActions({
    applyWbsItems,
    applyWbsSnapshotResult,
    dirtyWbsItemIds,
    draftWbsCodes,
    latestWbsSaveSequenceByItemRef,
    pendingWbsSaveCountRef,
    project,
    projectRef,
    refreshProject,
    rememberWbsSnapshot,
    selectedWbsIds,
    setCollapsedWbsIds,
    setDraggedWbsItemId,
    setError,
    setNotice,
    setSelectedWbsIds,
    setSavingWbsBulk,
    setWbsDrafts,
    setWbsDropTargetId,
    setWbsUndoHistory,
    visibleWbsTree,
    wbsDrafts,
    wbsDraftsRef,
    wbsSaveSequenceRef,
    wbsTree,
    wbsUndoStackRef,
  });

  const { handleWbsPaste, isWbsCellDirty, renderWbsCell } =
    useWbsStructureTableController({
      activeWbsItemId,
      collapsedWbsIds,
      deleteWbsItem,
      draftWbsCodes,
      insertWbsRow,
      isReadOnly,
      orderedWbsColumns,
      saveWbsDraftPatch,
      saveWbsTypePatch,
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
      wbsDependencies: project?.wbsDependencies ?? [],
      wbsDrafts,
      wbsDraftsRef,
      wbsSort,
      wbsTree,
    });

  const { completeGanttLinkDrag, startGanttLinkDrag } =
    useGanttDependencyActions({
      applyWbsSnapshotResult,
      ganttLinkCompletedRef,
      ganttLinkDraft,
      ganttTimelineRef,
      project,
      refreshProject,
      rememberWbsSnapshot,
      setActiveWbsItemId,
      setError,
      setGanttLinkDraft,
      setNotice,
    });

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

  function openRaidItemFromOverview(
    itemId: string,
    itemType: RaidItemType = "RISK",
    projectId?: string,
  ) {
    setRaidTypeFilter(itemType);
    setRaidDecisionOnly(false);
    setRaidOverdueOnly(false);
    setRaidHighOnly(true);
    setExpandedRaidId(itemId);
    if (projectId) {
      selectProject(projectId, "project-raid");
    } else {
      openView("project-raid");
    }
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
    ]);
    const requestedView =
      nextView === "portfolio" ||
      nextView === "projects" ||
      nextView === "project-create" ||
      isResourceSectionViewName(nextView)
        ? firstEnabledProjectView
        : nextView;
    const safeView =
      isProjectSectionViewName(requestedView) &&
      !isProjectModuleEnabled(projectModuleKeyByView[requestedView])
        ? firstEnabledProjectView
        : requestedView;
    openView(safeView, { projectCode: nextProject?.code ?? null });
  }

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
      if (next) setShowGanttCriticalPath(false);
      return next;
    });
  };
  const toggleGanttCriticalPath = () => {
    setShowGanttCriticalPath((current) => {
      const next = !current;
      if (next) setShowGanttDependencies(false);
      return next;
    });
  };

  const presentationContext = buildAppPresentationContext(derived, {
    activeView, activeWbsItemId, collapsedWbsIds, currentUser, firstEnabledProjectView, isReadOnly, openView, project, projects, selectedProjectId, setError, setNotice,
    ...{ adminHealth, adminIntegrations, auditEvents, backupStatus, configTransferText, createdApiToken, creatingDictionaryItem, creatingUser, currentUser, dictionaryDrafts, importingConfig, newDictionaryDraft, newUserForm, setNewUserForm, rolePermissions, systemSettings, systemSettingsDraft, userDrafts, users, webhookDraft },
    ...{ artifactDrafts, expandedArtifactId, createArtifactRow, deleteArtifact, moveArtifact, saveArtifact, updateArtifactDraft, setExpandedArtifactId },
    ...{ closeOpenIssue, convertIssueToProblem, createOpenIssue, creatingIssue, expandedIssueId, issueDrawerMode, issueEditDrafts, issueForm, issueFormErrors, issueLinkDrafts, issueStatusDrafts, removeIssueFormLink, removeIssueJiraLink, saveOpenIssue, saveOpenIssueWithPayload, saveTaskJiraLink, taskDrafts, updateIssueDraft, updateIssueFormLink, updateIssueStatusDraft },
    ...{ jiraForm, jiraWorkSectionDrafts, saveJiraIntegration, saveJiraWorkSections, savingJira, savingJiraWorkSections, setJiraForm, setJiraWorkSectionDrafts, syncJira },
    ...{ addPassportRow, deletePassportRow, passportRows, savePassportRows, savingPassportRows, updatePassportRow },
    ...{ addRaidStatusUpdate, closeRaidItem, convertRiskToAssumption, convertRiskToProblem, expandedRaidId, raidDecisionOnly, raidDrafts, raidForm, raidHighOnly, raidOverdueOnly, raidStatusDrafts, raidTypeFilter, saveRaidItem, createRaidItem, deleteRaidItem, updateRaidDraft, updateRaidStatusDraft },
    ...{ newProjectForm, projectAccessDraft, projectAccesses, projectModuleDrafts, projectRegistryDrafts, projectTargetApprovedBy, projectTargetChangeReason, projectTargetDateDraft, savePortfolioProjectIdentity, saveProjectPortfolio, saveProjectRegistryItem, saveProjectTargetDate },
    ...{ addIssueFormLink, addIssueJiraLink, addIssueStatusUpdate, closeProject, createProject, deleteProject, reloadAuditEvents, saveProjectModules, setNewProjectForm, setProjectTargetApprovedBy, setProjectTargetChangeReason, setProjectTargetDateDraft, updateProjectModuleDraft, updateProjectRegistryDraft },
    ...{ createApiToken, createDictionaryItem, createUser, createWebhook, deactivateDictionaryItem, deleteProjectAccess, exportAdminConfig, grantProjectAccess, importAdminConfig, reloadAdminConfig, reloadAdminHealth, reloadAdminIntegrations, saveDictionaryItem, saveSystemSettings, saveUser, testWebhook, toggleApiToken, toggleRolePermission, toggleWebhook, updateDictionaryDraft, updateProjectAccessDraft, updateProjectAccessLevel, updateUserDraft },
    ...{ savingBaseline, savingCalendar, savingDictionaryItemId, savingIntegration, savingProjectAccess, savingProjectModules, savingProjectRegistryId, savingProjectTargetDate, savingRolePermissionId, savingSystemSettings, savingUserId },
    ...{ ganttRangeDays, setGanttRangeDays },
    ...{ completeGanttLinkDrag, deleteSelectedWbsItems, draggedWbsColumn, draggedWbsItemId, dropWbsColumn, ganttLinkDraft, ganttPanelHeight, ganttPanelWidth, ganttScale, ganttTimelineRef, ganttWbsWidth, handleWbsPaste, hoveredGanttItemId, isWbsCellDirty, redoWbsChange, renderWbsCell, reorderWbsRows, resetGanttPanelSize, restoringWbsSnapshot, saveDirtyWbsItems, saveWbsBaseline, saveWbsDraftPatch, saveWbsTypePatch, saveWbsItem, savingWbsBulk, selectedWbsIds, setActiveWbsItemId, setDraggedWbsColumn, setGanttScale, setHoveredGanttItemId, setSelectedWbsIds, setShowGanttBaseline, setShowGanttForecast, setShowStructureCriticalPath, setShowWbsColumnMenu, setWbsDropTargetId, showGanttBaseline, showGanttCriticalPath, showGanttDependencies, showGanttForecast, showStructureCriticalPath, showWbsColumnMenu, startGanttLinkDrag, startGanttPanelResize, startGanttResize, startWbsColumnDrag, startWbsColumnResize, toggleGanttCriticalPath, toggleGanttDependencies, toggleWbsCollapse, toggleWbsColumn, toggleWbsSort, undoWbsChange, updateSelectedWbsDrafts, updateWbsDraft, wbsDrafts, wbsDropTargetId, wbsHiddenColumns, wbsRedoStack, wbsSort, wbsUndoStack },
    ...{ deleteRaidItem, deleteProject, deleteProjectAccess, saveArtifact, setApiTokenDraft, setConfigTransferText, setExpandedIssueId, setExpandedRaidId, setIssueDrawerMode, setIssueForm, setIssueFormErrors, setIssueLinkDrafts, setNewDictionaryDraft, setProjectAccessDraft, setRaidDecisionOnly, setRaidForm, setRaidHighOnly, setRaidOverdueOnly, setRaidTypeFilter, setSelectedCalendarYear, setSelectedDictionary, setSystemSettingsDraft, setTaskDrafts, setWebhookDraft, syncing, toggleCalendarDay },
    openRaidItemFromOverview, selectProject, updatePassportRow,
  });

  return (
    <AppPresentation
      authForm={authForm}
      authMode={authMode}
      authSubmitting={authSubmitting}
      context={presentationContext}
      currentUser={currentUser}
      error={error}
      toasts={toasts}
      onDismissToast={dismissToast}
      filteredProjectOptions={filteredProjectOptions}
      firstEnabledProjectView={firstEnabledProjectView}
      globalSearch={globalSearch}
      handleEditableFocus={handleEditableFocus}
      handleEditableKeyDown={handleEditableKeyDown}
      isAdminUser={isAdminUser}
      isAuthenticated={isAuthenticated}
      isClosedProject={isClosedProject}
      isProjectModuleEnabled={isProjectModuleEnabled}
      isReadOnly={isReadOnly}
      keycloakEnabled={keycloakStatus.enabled}
      loading={loading}
      logout={logout}
      onAuthFormChange={setAuthForm}
      onKeycloakLogin={loginWithKeycloak}
      onAuthModeChange={setAuthMode}
      onErrorChange={setError}
      onNoticeChange={setNotice}
      onSubmitAuth={submitAuth}
      onSelectSearchResult={openSearchResult}
      openView={openView}
      project={project}
      projectSearch={projectSearch}
      projectTargetSummary={projectTargetSummary}
      recentProjects={recentProjects}
      savedViewType={savedViewType}
      saveCurrentSavedView={saveCurrentSavedView}
      applySavedView={applySavedView}
      savedViewName={savedViewName}
      savedViews={savedViews}
      savingSavedView={savingSavedView}
      selectProject={selectProject}
      selectedProjectId={selectedProjectId}
      selectedProjectListItem={selectedProjectListItem}
      setProjectSearch={setProjectSearch}
      setSavedViewName={setSavedViewName}
      setShowProjectPicker={setShowProjectPicker}
      showProjectPicker={showProjectPicker}
      sidebarCollapsed={sidebarCollapsed}
      toggleSidebar={toggleSidebar}
      topbarScheduleHealth={topbarScheduleHealth}
    />
  );
}

export default AppController;
