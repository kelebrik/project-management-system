import type { FocusEventHandler, KeyboardEventHandler } from "react";
import type { AuthMode } from "../app/adminTypes";
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
  auditActionLabel,
  auditFieldLabel,
  auditObjectLabel,
  issuePrimaryJiraLink,
  issueSeverityLabel,
  issueStatusLabel,
  projectOptionLabel,
  projectStatusLabel,
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
import type { AppView } from "../app/routes";
import {
  isDevelopmentSectionViewName,
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
  authForm: any;
  authMode: AuthMode;
  authSubmitting: boolean;
  context: Record<string, any>;
  currentUser: any;
  error: string | null;
  filteredProjectOptions: any[];
  firstEnabledProjectView: any;
  globalSearch: any;
  handleEditableFocus: FocusEventHandler<HTMLDivElement>;
  handleEditableKeyDown: KeyboardEventHandler<HTMLDivElement>;
  isAdminUser: boolean;
  isAuthenticated: boolean;
  isClosedProject: boolean;
  isProjectModuleEnabled: (key: any) => boolean;
  isReadOnly: boolean;
  keycloakEnabled: boolean;
  loading: boolean;
  logout: () => void;
  notice: string | null;
  onAuthFormChange: (value: any) => void;
  onAuthModeChange: (mode: "login" | "ready") => void;
  onErrorChange: (value: string | null) => void;
  onKeycloakLogin: () => void;
  onNoticeChange: (value: string | null) => void;
  onSubmitAuth: (event: any) => void;
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

function createViewTitle(project: any): Record<AppView, string> {
  return {
    portfolio: "Портфель",
    "portfolio-v2": "Портфель_v2",
    projects: "Проекты",
    wiki: "FAQ",
    resources: "Управление ресурсами",
    "resources-capacity": "Управление ресурсами",
    "project-create": "Создать новый проект",
    "project-overview": project?.name ?? "Состояние проекта",
    "project-schedule": project?.name ?? "График проекта",
    "project-passport": project?.name ?? "Паспорт проекта",
    "project-business-requirements": project?.name ?? "Бизнес требования",
    "project-pm-workspace": project?.name ?? "Рабочий стол PM",
    "project-structure": project?.name ?? "Структура",
    "project-gantt": project?.name ?? "Гантт",
    "project-jira-work": project?.name ?? "Работы в Jira",
    "project-issues": project?.name ?? "Открытые вопросы",
    "project-raid": project?.name ?? "Риски и проблемы",
    "project-changes": project?.name ?? "Управление изменениями",
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
    "admin-integrations": "Администрирование: интеграции и API",
    "admin-health": "Администрирование: system health",
    "admin-backups": "Администрирование: backup/restore",
    "admin-config": "Администрирование: import/export",
    "admin-projects": "Администрирование: реестр проектов",
    "admin-modules": "Администрирование: управление модулями",
    "admin-project-access": "Администрирование: доступ к проектам",
    "admin-audit": "Администрирование: журнал аудита",
  };
}

export function AppPresentation({
  authForm,
  authMode,
  authSubmitting,
  context,
  currentUser,
  error,
  filteredProjectOptions,
  firstEnabledProjectView,
  globalSearch,
  handleEditableFocus,
  handleEditableKeyDown,
  isAdminUser,
  isAuthenticated,
  isClosedProject,
  isProjectModuleEnabled,
  isReadOnly,
  keycloakEnabled,
  loading,
  logout,
  notice,
  onAuthFormChange,
  onAuthModeChange,
  onErrorChange,
  onKeycloakLogin,
  onNoticeChange,
  onSubmitAuth,
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
  sidebarCollapsed,
  toggleSidebar,
  topbarScheduleHealth,
}: AppPresentationProps) {
  const activeView = context.activeView as AppView;
  const isProjectSectionView = isProjectSectionViewName(activeView);
  const isResourceSectionView = isResourceSectionViewName(activeView);
  const isDevelopmentSectionView = isDevelopmentSectionViewName(activeView);
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
  const shouldShowAdminMenu = Boolean(isAdminUser && isAdminSectionView);
  const shouldShowDevelopmentMenu = Boolean(
    isAdminUser && isDevelopmentSectionView,
  );
  const viewTitle = createViewTitle(project);
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
    return <main className="loading">Загрузка системы управления проектами...</main>;
  }

  if (authMode === "setup" || authMode === "login") {
    const authPageMode = authMode;
    return (
      <AuthPage
        authForm={authForm}
        authMode={authPageMode}
        error={error}
        keycloakEnabled={keycloakEnabled}
        onContinueReadOnly={() => {
          onAuthModeChange("ready");
          onErrorChange(null);
          onNoticeChange(null);
        }}
        onFormChange={onAuthFormChange}
        onKeycloakLogin={onKeycloakLogin}
        onSubmit={onSubmitAuth}
        submitting={authSubmitting}
      />
    );
  }

  const pageContext = {
    ...context,
    adminDictionaryLabels,
    adminPermissionLabel,
    adminPermissionOrder,
    artifactStatusLabel,
    auditActionLabel,
    auditFieldLabel,
    auditObjectLabel,
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
  };

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
      isClosedProject={shouldShowClosedProjectBanner}
      isDevelopmentSectionView={isDevelopmentSectionView}
      isProjectModuleEnabled={isProjectModuleEnabled}
      isProjectSectionView={isProjectSectionView}
      isProjectView={isProjectView}
      isResourceSectionView={isResourceSectionView}
      isReadOnly={isReadOnly}
      logout={logout}
      notice={notice}
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
      scheduleHealth={topbarScheduleHealth}
      selectProject={selectProject}
      selectedProjectId={selectedProjectId}
      selectedProjectListItem={selectedProjectListItem}
      setProjectSearch={setProjectSearch}
      setShowProjectPicker={setShowProjectPicker}
      shouldShowAdminMenu={shouldShowAdminMenu}
      shouldShowDevelopmentMenu={shouldShowDevelopmentMenu}
      shouldShowProjectMenu={shouldShowProjectMenu}
      showProjectPicker={showProjectPicker}
      sidebarCollapsed={sidebarCollapsed}
      signedDaysLabel={signedDaysLabel}
      toggleSidebar={toggleSidebar}
      viewTitle={viewTitle}
    />
  );
}
