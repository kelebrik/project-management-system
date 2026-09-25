import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { Translator } from "../i18n/types";
import type { FocusEventHandler, KeyboardEventHandler } from "react";
import type { AuthMode } from "../app/adminTypes";
import type { Toast } from "../hooks/useAppFeedbackState";
import { PageSkeleton } from "./Skeleton";
import {
  adminDictionaryLabels,
  adminPermissionLabel,
  adminPermissionOrder,
  dictionaryItemToDraft,
  dictionaryLabel,
  systemSettingHasValue,
  userRoleLabel,
  userToDraft,
} from "../app/adminHelpers";
import {
  calendarDelayDays,
  calendarMonthDays,
  date,
  dateTime,
  fileSize,
  isDefaultWorkingDay,
  isoDate,
  MONTH_LABELS,
  WEEKDAY_LABELS,
} from "../app/dateUtils";
import {
  artifactStatusLabel,
  issuePrimaryJiraLink,
  issueSeverityLabel,
  issueStatusLabel,
  projectOptionLabel,
  projectStatusLabel,
  projectScheduleHealth,
  ragOptionLabel,
  raidStatusLabel,
  raidTypeLabel,
  riskTone,
  wbsStatusLabel,
} from "../app/labels";
import { printSectionAsPdf } from "../app/pdfPrint";
import {
  signedDateDeltaDays,
  signedDaysLabel,
} from "../app/projectTargetModel";
import type { AppView, SectionAccess } from "../app/routes";
import {
  adminSectionViews,
  canViewAppView,
  developmentSectionViews,
  isDevelopmentSectionViewName,
  isOperationsSectionViewName,
  operationsSectionViews,
  isAdminSectionViewName,
  isProjectSectionViewName,
  isResourceSectionViewName,
} from "../app/routes";
import {
  PROJECT_CALENDAR_LABELS,
  WBS_TABLE_COLUMNS,
} from "../app/wbsTable";
import { wbsDisplayLevel } from "../app/wbsTree";
import { GANTT_HIERARCHY_LEVELS, GANTT_SCALE_WIDTH, clampNumber } from "../app/ganttConfig";
import {
  GANTT_LINK_ENDPOINT_GAP_PERCENT,
  GANTT_LINK_STUB_PERCENT,
  GANTT_ROW_HEIGHT,
  ganttDependencyPath,
  ganttPathDirection,
  ganttRoundedDependencyPath,
} from "../ganttDependencyPath";
import {
  MilestoneSnakeTimelineSection,
  MilestoneTimelineSection,
} from "./MilestoneSections";
import { AppShell } from "./AppShell";
import { AuthPage } from "./AuthPage";
import { GlobalSearch } from "./GlobalSearch";
import { SavedViewControls } from "./SavedViewControls";

type AppPresentationProps = {
  authMode: AuthMode;
  context: Record<string, any>;
  currentUser: any;
  error: string | null;
  toasts: Toast[];
  onDismissToast: (id: number) => void;
  filteredProjectOptions: any[];
  firstEnabledProjectView: any;
  globalSearch: any;
  handleEditableFocus: FocusEventHandler<HTMLDivElement>;
  handleEditableKeyDown: KeyboardEventHandler<HTMLDivElement>;
  isAdminUser: boolean;
  isAuthenticated: boolean;
  sectionAccess: SectionAccess;
  isClosedProject: boolean;
  isProjectModuleEnabled: (key: any) => boolean;
  isReadOnly: boolean;
  keycloakEnabled: boolean;
  loading: boolean;
  logout: () => void;
  onAuthModeChange: (mode: "login" | "ready") => void;
  onErrorChange: (value: string | null) => void;
  onKeycloakLogin: () => void;
  onPasswordLogin: (email: string, password: string) => Promise<void>;
  onNoticeChange: (value: string | null) => void;
  onSelectSearchResult: (result: any) => void;
  openView: (nextView: AppView, options?: { replace?: boolean; projectCode?: string | null }) => void;
  project: any;
  projectSearch: string;
  projectTargetSummary: any;
  recentProjects: any[];
  savedViewType: string | null;
  saveCurrentSavedView: () => Promise<void> | void;
  applySavedView: (view: any) => void;
  savedViewName: string;
  savedViews: any[];
  savingSavedView: boolean;
  selectProject: (projectId: string, nextView?: AppView) => void;
  selectedProjectId: string | null;
  selectedProjectListItem: any;
  setProjectSearch: (value: string) => void;
  setSavedViewName: (value: string) => void;
  setShowProjectPicker: (value: boolean) => void;
  showProjectPicker: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  topbarScheduleHealth: any;
};

function createViewTitle(project: any, t: Translator): Record<AppView, string> {
  return {
    portfolio: t("view.portfolio"),
    "portfolio-v2": t("view.portfolio-v2"),
    "leave-schedule": t("view.leave-schedule"),
    workload: t("view.workload"),
    "decision-queue": t("view.decision-queue"),
    "jira-reconciliation": t("view.jira-reconciliation"),
    projects: t("view.projects"),
    reports: t("view.reports"),
    wiki: t("view.wiki"),
    resources: t("view.resources"),
    "resources-capacity": t("view.resources-capacity"),
    "project-create": t("view.project-create"),
    "project-overview": project?.name ?? t("view.project-overview"),
    "project-schedule": project?.name ?? t("view.project-schedule"),
    "project-passport": project?.name ?? t("view.project-passport"),
    "project-business-requirements": project?.name ?? t("view.project-business-requirements"),
    "project-current-work": project?.name ?? t("view.project-current-work"),
    "project-pm-workspace": project?.name ?? t("view.project-pm-workspace"),
    "open-issues-redesign": project?.name ?? t("view.open-issues-redesign"),
    "project-structure": project?.name ?? t("view.project-structure"),
    "project-gantt": project?.name ?? t("view.project-gantt"),
    "project-jira-work": project?.name ?? t("view.project-jira-work"),
    "project-issues": project?.name ?? t("view.project-issues"),
    "project-raid": project?.name ?? t("view.project-raid"),
    "project-changes": project?.name ?? t("view.project-changes"),
    "project-budget": project?.name ?? t("view.project-budget"),
    "project-calendars": project?.name ?? t("view.project-calendars"),
    "project-artifacts": project?.name ?? t("view.project-artifacts"),
    "closed-projects": t("view.closed-projects"),
    admin: t("view.admin"),
    "admin-users": t("view.admin-users"),
    "admin-roles": t("view.admin-roles"),
    "admin-dictionaries": t("view.admin-dictionaries"),
    "admin-templates": t("view.admin-templates"),
    "admin-rag": t("view.admin-rag"),
    "admin-workflows": t("view.admin-workflows"),
    "admin-integrations": t("view.admin-integrations"),
    "admin-health": t("view.admin-health"),
    "admin-backups": t("view.admin-backups"),
    "admin-config": t("view.admin-config"),
    "admin-projects": t("view.admin-projects"),
    "admin-business-units": t("view.admin-business-units"),
    "admin-modules": t("view.admin-modules"),
    "admin-project-access": t("view.admin-project-access"),
    "admin-audit": t("view.admin-audit"),
    "admin-analytics": t("view.admin-analytics"),
  };
}

export function AppPresentation({
  authMode,
  context,
  currentUser,
  error,
  toasts,
  onDismissToast,
  filteredProjectOptions,
  firstEnabledProjectView,
  globalSearch,
  handleEditableFocus,
  handleEditableKeyDown,
  isAdminUser,
  isAuthenticated,
  sectionAccess,
  isClosedProject,
  isProjectModuleEnabled,
  isReadOnly,
  keycloakEnabled,
  loading,
  logout,
  onAuthModeChange,
  onErrorChange,
  onKeycloakLogin,
  onPasswordLogin,
  onNoticeChange,
  onSelectSearchResult,
  openView,
  project,
  projectSearch,
  projectTargetSummary,
  recentProjects,
  savedViewType,
  saveCurrentSavedView,
  applySavedView,
  savedViewName,
  savedViews,
  savingSavedView,
  selectProject,
  selectedProjectId,
  selectedProjectListItem,
  setProjectSearch,
  setSavedViewName,
  setShowProjectPicker,
  showProjectPicker,
}: AppPresentationProps) {
  const activeView = context.activeView as AppView;
  const isProjectSectionView = isProjectSectionViewName(activeView);
  const isResourceSectionView = isResourceSectionViewName(activeView);
  const isDevelopmentSectionView = isDevelopmentSectionViewName(activeView);
  const isOperationsSectionView = isOperationsSectionViewName(activeView);
  const isProjectView =
    activeView === "project-create" ||
    activeView === "project-pm-workspace" ||
    isProjectSectionView;
  const shouldShowClosedProjectBanner = Boolean(
    (isProjectSectionView || activeView === "project-pm-workspace") &&
      isClosedProject,
  );
  const isAdminSectionView = isAdminSectionViewName(activeView);
  const shouldShowProjectMenu = Boolean(
    activeView === "projects" ||
      activeView === "project-create" ||
      (selectedProjectListItem && isProjectSectionView),
  );
  const canViewAdminSections = adminSectionViews.some((view) =>
    canViewAppView(view, sectionAccess),
  );
  const canViewDevelopmentSections = developmentSectionViews.some((view) =>
    canViewAppView(view, sectionAccess),
  );
  const shouldShowAdminMenu = Boolean(canViewAdminSections && isAdminSectionView);
  const shouldShowDevelopmentMenu = Boolean(
    canViewDevelopmentSections && isDevelopmentSectionView,
  );
  const canViewOperationsSections = operationsSectionViews.some((view) =>
    canViewAppView(view, sectionAccess),
  );
  const shouldShowOperationsMenu = Boolean(canViewOperationsSections && isOperationsSectionView);
  const { t, locale, labels: localizedLabels, formatters } = useI18n();
  const viewTitle = useMemo(() => createViewTitle(project, t), [project, t]);
  const renderGlobalSearch = (className = "") => (
    <GlobalSearch
      className={className}
      loading={globalSearch.loading}
      onOpenChange={globalSearch.setOpen}
      onQueryChange={globalSearch.setQuery}
      onSelect={onSelectSearchResult}
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
      <main className="app-loading" aria-busy="true">
        <PageSkeleton label={t("common.loadingApp")} />
      </main>
    );
  }

  if (authMode === "login") {
    return (
      <AuthPage
        error={error}
        keycloakEnabled={keycloakEnabled}
        onKeycloakLogin={onKeycloakLogin}
        onPasswordLogin={onPasswordLogin}
      />
    );
  }

  const pageContext = {
    ...context,
    isProjectModuleEnabled,
    adminDictionaryLabels,
    adminPermissionLabel,
    adminPermissionOrder,
    artifactStatusLabel,
    calendarDelayDays,
    calendarMonthDays,
    clampNumber,
    date,
    dateTime,
    dictionaryItemToDraft,
    dictionaryLabel,
    fileSize,
    GANTT_HIERARCHY_LEVELS,
    GANTT_LINK_ENDPOINT_GAP_PERCENT,
    GANTT_LINK_STUB_PERCENT,
    GANTT_ROW_HEIGHT,
    GANTT_SCALE_WIDTH,
    ganttDependencyPath,
    ganttPathDirection,
    ganttRoundedDependencyPath,
    isAdminSectionView,
    isAdminUser,
    isDevelopmentSectionView,
    sectionAccess,
    isDefaultWorkingDay,
    isResourceSectionView,
    issuePrimaryJiraLink,
    issueSeverityLabel,
    issueStatusLabel,
    isoDate,
    MilestoneSnakeTimelineSection,
    MilestoneTimelineSection,
    MONTH_LABELS,
    printSectionAsPdf,
    PROJECT_CALENDAR_LABELS,
    projectOptionLabel,
    projectStatusLabel,
    ragOptionLabel,
    raidStatusLabel,
    raidTypeLabel,
    renderSavedViewControls,
    riskTone,
    signedDateDeltaDays,
    signedDaysLabel,
    systemSettingHasValue,
    userRoleLabel,
    userToDraft,
    WBS_TABLE_COLUMNS,
    WEEKDAY_LABELS,
    wbsDisplayLevel,
    wbsStatusLabel,
    ...localizedLabels,
    ...formatters,
  };

  return (
    <AppShell
      activeView={activeView}
      currentUser={currentUser}
      toasts={toasts}
      onDismissToast={onDismissToast}
      filteredProjectOptions={filteredProjectOptions}
      firstEnabledProjectView={firstEnabledProjectView}
      handleEditableFocus={handleEditableFocus}
      handleEditableKeyDown={handleEditableKeyDown}
      isAdminSectionView={isAdminSectionView}
      canViewAdminSections={canViewAdminSections}
      canViewDevelopmentSections={canViewDevelopmentSections}
      canViewOperationsSections={canViewOperationsSections}
      sectionAccess={sectionAccess}
      isAuthenticated={isAuthenticated}
      isClosedProject={shouldShowClosedProjectBanner}
      isDevelopmentSectionView={isDevelopmentSectionView}
      isOperationsSectionView={isOperationsSectionView}
      isProjectModuleEnabled={isProjectModuleEnabled}
      isProjectSectionView={isProjectSectionView}
      isProjectView={isProjectView}
      isReadOnly={isReadOnly}
      logout={logout}
      onAuthModeChange={() => onAuthModeChange("login")}
      onErrorChange={onErrorChange}
      onNoticeChange={onNoticeChange}
      openView={openView}
      pageContext={pageContext}
      project={project}
      projectTargetSummary={projectTargetSummary}
      projectSearch={projectSearch}
      recentProjects={recentProjects}
      renderGlobalSearch={renderGlobalSearch}
      scheduleHealth={project ? projectScheduleHealth(project.rag, context.overviewDashboard.scheduleVarianceFromStructure, locale) : null}
      selectProject={selectProject}
      selectedProjectId={selectedProjectId}
      selectedProjectListItem={selectedProjectListItem}
      setProjectSearch={setProjectSearch}
      setShowProjectPicker={setShowProjectPicker}
      shouldShowAdminMenu={shouldShowAdminMenu}
      shouldShowDevelopmentMenu={shouldShowDevelopmentMenu}
      shouldShowOperationsMenu={shouldShowOperationsMenu}
      shouldShowProjectMenu={shouldShowProjectMenu}
      showProjectPicker={showProjectPicker}
      signedDaysLabel={formatters.signedDaysLabel}
      viewTitle={viewTitle}
    />
  );
}
