import { startTransition, Suspense, type FocusEventHandler, type KeyboardEventHandler, type ReactNode } from "react";
import { preloadAppPage, WikiNavigation } from "../pages/pageModules";
import { appPathForView } from "../app/routes";
import { ShiftReasonPrompt } from "./scheduleShifts/ShiftReasonPrompt";
import { NotificationsBell } from "./notifications/NotificationsBell";
import { CloudHeaderSlot } from "./CloudSlot";
import { BookOpen, BriefcaseBusiness, ClipboardList, Code2, FolderTree, LayoutDashboard, Plus, Settings } from "lucide-react";

import type { Toast } from "../hooks/useAppFeedbackState";
import type { CurrentUser } from "../app/adminTypes";
import type { ProjectDetails, ProjectListItem } from "../app/domainTypes";
import type { ProjectModuleKey } from "../app/projectModules";
import {
  canViewAppView,
  isAdminSectionViewName,
  type AppView,
  type ProjectSectionView,
  type SectionAccess,
} from "../app/routes";
import { AppPages, IssueDrawer, PageBoundary } from "../pages";
import { PageContextProvider, type PageContextValue } from "../pages/PageContext";
import { ProjectCreateDialog } from "./projectCreate/ProjectCreateDialog";
import { AppTopbar } from "./AppTopbar";
import { BusinessUnitSwitcher } from "./BusinessUnitSwitcher";
import { ProjectPicker } from "./ProjectPicker";
import { adminNavItems, developmentNavItems, operationsNavItems, projectNavItems, splitProjectNavItems } from "./appNavItems";
import { ProjectMoreMenu } from "./ProjectMoreMenu";
import { SidebarIdentity } from "./SidebarIdentity";
import { SystemBanners } from "./SystemBanners";
import { ErrorBoundary, ErrorNotice } from "./ErrorBoundary";
import { DensityToggle } from "./DensityToggle";
import { LanguageToggle } from "./LanguageToggle";
import { NavTab } from "./NavTab";
import { useTheme } from "../hooks/useTheme";
import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";
import { useI18n } from "../i18n/I18nProvider";

type ScheduleHealth = {
  tone: string;
  label: string;
} | null;

type OpenView = (
  nextView: AppView,
  options?: { replace?: boolean; projectCode?: string | null },
) => void;

type AppShellProps = {
  activeView: AppView;
  currentUser: CurrentUser | null;
  toasts: Toast[];
  onDismissToast: (id: number) => void;
  filteredProjectOptions: ProjectListItem[];
  firstEnabledProjectView: ProjectSectionView;
  handleEditableFocus: FocusEventHandler<HTMLDivElement>;
  handleEditableKeyDown: KeyboardEventHandler<HTMLDivElement>;
  isAdminSectionView: boolean;
  canViewAdminSections: boolean;
  canViewDevelopmentSections: boolean;
  canViewOperationsSections: boolean;
  sectionAccess: SectionAccess;
  isAuthenticated: boolean;
  isClosedProject: boolean;
  isDevelopmentSectionView: boolean;
  isOperationsSectionView: boolean;
  isProjectModuleEnabled: (key: ProjectModuleKey) => boolean;
  isProjectSectionView: boolean;
  isProjectView: boolean;
  isReadOnly: boolean;
  logout: () => void;
  onAuthModeChange: (mode: "login") => void;
  onErrorChange: (value: string | null) => void;
  onNoticeChange: (value: string | null) => void;
  openView: OpenView;
  pageContext: PageContextValue;
  project: ProjectDetails | null;
  projectTargetSummary: {
    activeGoal: {
      title: string;
      baselineTargetDate: Date | null;
      currentTargetDate: Date | null;
      targetDate: Date | null;
    } | null;
    initialTargetDate: Date | null;
    currentTargetDate: Date | null;
    forecastFinishDate: Date | null;
    targetChangeDays: number | null;
    effectiveDelayDays: number | null;
  } | null;
  projectSearch: string;
  recentProjects: ProjectListItem[];
  renderGlobalSearch: (className?: string) => ReactNode;
  scheduleHealth: ScheduleHealth;
  selectProject: (projectId: string, nextView?: AppView) => void;
  selectedProjectId: string | null;
  selectedProjectListItem: ProjectListItem | null;
  setProjectSearch: (value: string) => void;
  setShowProjectPicker: (value: boolean) => void;
  shouldShowAdminMenu: boolean;
  shouldShowDevelopmentMenu: boolean;
  shouldShowOperationsMenu: boolean;
  shouldShowProjectMenu: boolean;
  showProjectPicker: boolean;
  signedDaysLabel: (value: number | null) => string;
  viewTitle: Record<AppView, string>;
};


const projectNavShortLabels: Partial<Record<ProjectSectionView, TranslationKey>> = {
  "project-overview": "tab.project-overview",
  "project-schedule": "tab.project-schedule",
  "project-passport": "tab.project-passport",
  "project-business-requirements": "tab.project-business-requirements",
  "project-current-work": "tab.project-current-work",
  "project-structure": "tab.project-structure",
  "project-gantt": "tab.project-gantt",
  "project-jira-work": "tab.project-jira-work",
  "project-issues": "tab.project-issues",
  "project-decisions": "tab.project-decisions",
  "project-raid": "tab.project-raid",
  "project-changes": "tab.project-changes",
  "project-calendars": "tab.project-calendars",
  "project-history": "tab.project-history",
  "project-artifacts": "tab.project-artifacts",
};

export function AppShell({
  activeView,
  currentUser,
  toasts,
  onDismissToast,
  filteredProjectOptions,
  firstEnabledProjectView,
  handleEditableFocus,
  handleEditableKeyDown,
  isAdminSectionView,
  canViewAdminSections,
  canViewDevelopmentSections,
  canViewOperationsSections,
  sectionAccess,
  isAuthenticated,
  isClosedProject,
  isDevelopmentSectionView,
  isOperationsSectionView,
  isProjectModuleEnabled,
  isProjectSectionView,
  isProjectView,
  isReadOnly,
  logout,
  onAuthModeChange,
  onErrorChange,
  onNoticeChange,
  openView,
  pageContext,
  project,
  projectTargetSummary,
  projectSearch,
  recentProjects,
  renderGlobalSearch,
  scheduleHealth,
  selectProject,
  selectedProjectId,
  selectedProjectListItem,
  setProjectSearch,
  setShowProjectPicker,
  shouldShowAdminMenu,
  shouldShowDevelopmentMenu,
  shouldShowOperationsMenu,
  shouldShowProjectMenu,
  showProjectPicker,
  signedDaysLabel,
  viewTitle,
}: AppShellProps) {
  const { t } = useI18n();
  useTheme();
  // Keep the current workspace visible while the destination code arrives.
  const navigate = (view: AppView) => startTransition(() => openView(view));
  const projectSections = splitProjectNavItems(projectNavItems, isProjectModuleEnabled);
  const login = () => {
    onAuthModeChange("login");
    onErrorChange(null);
    onNoticeChange(null);
  };
  const projectPicker = (targetView: AppView = firstEnabledProjectView) => (
    <ProjectPicker
      filteredProjects={filteredProjectOptions}
      isOpen={showProjectPicker}
      onOpenChange={setShowProjectPicker}
      onProjectSearchChange={setProjectSearch}
      onProjectSelect={selectProject}
      projectSearch={projectSearch}
      recentProjects={recentProjects}
      selectedProject={selectedProjectListItem}
      selectedProjectId={selectedProjectId}
      targetView={targetView}
    />
  );
  const projectsActive =
    activeView === "projects" ||
    activeView === "project-create" ||
    isProjectSectionView;

  return (
    <div
      className={`app-shell top-navigation-shell ${isReadOnly ? "read-only-mode" : ""}`}
      onFocusCapture={handleEditableFocus}
      onKeyDownCapture={handleEditableKeyDown}
    >
      <header className="app-global-header">
        <SidebarIdentity
          currentUser={currentUser}
          onLogin={login}
          onLogout={logout}
        />
        <BusinessUnitSwitcher />
        <nav className="global-section-nav" aria-label={t("nav.mainSections")}>
          {isAuthenticated && (
            <NavTab
              view="my-page"
              active={activeView === "my-page"}
              onNavigate={navigate}
            >
              <LayoutDashboard size={15} /> {t("view.my-page")}
            </NavTab>
          )}
          <NavTab
            view="portfolio"
            active={activeView === "portfolio"}
            onNavigate={navigate}
          >
            <BriefcaseBusiness size={15} /> {t("view.portfolio")}
          </NavTab>
          <NavTab
            view="projects"
            active={projectsActive}
            onNavigate={navigate}
          >
            <FolderTree size={15} /> {t("nav.projects")}
          </NavTab>
          {canViewOperationsSections && (
            <NavTab
              view="leave-schedule"
              active={isOperationsSectionView}
              onNavigate={navigate}
            >
              <ClipboardList size={15} /> {t("nav.operations")}
            </NavTab>
          )}
          {canViewAdminSections && (
            <NavTab
              view="admin-projects"
              active={isAdminSectionView}
              onNavigate={navigate}
            >
              <Settings size={15} /> {t("nav.administration")}
            </NavTab>
          )}
          {canViewDevelopmentSections && (
            <NavTab
              view="decision-queue"
              active={isDevelopmentSectionView}
              onNavigate={navigate}
            >
              <Code2 size={15} /> {t("nav.development")}
            </NavTab>
          )}
          <NavTab
            view="wiki"
            active={activeView === "wiki"}
            onNavigate={navigate}
          >
            <BookOpen size={15} /> FAQ
          </NavTab>
        </nav>
        <div className="global-header-search">
          {renderGlobalSearch("global-search-topbar")}
        </div>
        {currentUser && <NotificationsBell />}
        {currentUser && <CloudHeaderSlot user={currentUser} />}
        <DensityToggle sidebarCollapsed />
        <LanguageToggle sidebarCollapsed />
      </header>

      {shouldShowProjectMenu && (
        <div className="section-navigation project-section-navigation">
          <div className="section-project-picker">
            {projectPicker(firstEnabledProjectView)}
          </div>
          <nav className="section-tabs" aria-label={t("nav.projectSections")}>
            <NavTab
              view="projects"
              active={activeView === "projects"}
              onNavigate={navigate}
            >
              <FolderTree size={15} /> {t("nav.registry")}
            </NavTab>
            {projectSections.pinned.map((item) => (
                <NavTab
                  key={item.view}
                  view={item.view}
                  projectCode={project?.code ?? null}
                  active={activeView === item.view}
                  onNavigate={navigate}
                  title={t(item.label)}
                >
                  {item.icon}
                  {t(projectNavShortLabels[item.view] ?? item.label)}
                </NavTab>
              ))}
            <ProjectMoreMenu
              items={projectSections.more}
              activeView={activeView}
              labelOf={(item) => projectNavShortLabels[item.view] ?? item.label}
              hrefOf={(view) => appPathForView(view, project?.code ?? null)}
              onNavigate={navigate}
              onPreload={preloadAppPage}
            />
            <button
              type="button"
              className={pageContext.projectCreateOpen ? "active" : ""}
              onClick={() => void pageContext.openProjectCreate()}
            >
              <Plus size={15} /> {t("common.create")}
            </button>
          </nav>
        </div>
      )}

      {shouldShowAdminMenu && (
        <nav className="section-navigation section-tabs" aria-label={t("nav.administration")}>
          {adminNavItems
            .filter((item) => canViewAppView(item.view, sectionAccess))
            .map((item) => (
            <NavTab
              key={item.view}
              view={item.view}
              active={activeView === item.view}
              onNavigate={navigate}
            >
              {item.icon} {t(item.label)}
            </NavTab>
            ))}
        </nav>
      )}

      {shouldShowDevelopmentMenu && (
        <div className="section-navigation development-section-navigation">
          {(activeView === "decision-queue" || activeView === "raci-matrix" || activeView === "my-work" || activeView === "automation-rules" || activeView === "schedule-legacy") && (
            <div className="section-project-picker">
              {projectPicker(activeView)}
            </div>
          )}
          <nav className="section-tabs" aria-label={t("nav.development")}>
            {developmentNavItems
              .filter((item) => canViewAppView(item.view, sectionAccess))
              .map((item) => (
              <NavTab
                key={item.view}
                view={item.view}
                active={activeView === item.view}
                onNavigate={navigate}
              >
                {item.icon} {t(item.label)}
              </NavTab>
            ))}
          </nav>
        </div>
      )}

      {shouldShowOperationsMenu && (
        <div className="section-navigation operations-section-navigation">
          <nav className="section-tabs" aria-label={t("nav.operations")}>
            {operationsNavItems
              .filter((item) => canViewAppView(item.view, sectionAccess))
              .map((item) => (
                <NavTab
                  key={item.view}
                  view={item.view}
                  active={activeView === item.view}
                  onNavigate={navigate}
                >
                  {item.icon} {t(item.label)}
                </NavTab>
              ))}
          </nav>
        </div>
      )}

      {activeView === "wiki" && (
        // A failed shared wiki chunk is reported by the page below; the header stays usable.
        <ErrorBoundary resetKey={activeView} fallback={() => null}>
          <Suspense fallback={<nav className="section-navigation section-tabs wiki-section-tabs" aria-label={t("nav.contents")} aria-busy="true" />}>
            <WikiNavigation />
          </Suspense>
        </ErrorBoundary>
      )}

      <main className="workspace">
        <AppTopbar
          activeView={activeView}
          isProjectView={isProjectView}
          project={project}
          projectTargetSummary={projectTargetSummary}
          scheduleHealth={scheduleHealth}
          signedDaysLabel={signedDaysLabel}
          viewTitle={viewTitle}
        />
        <SystemBanners
          toasts={toasts}
          isAuthenticated={isAuthenticated}
          isClosedProject={isClosedProject}
          onDismissToast={onDismissToast}
          onLogin={login}
        />

        <PageContextProvider value={pageContext}>
          {/* A page that fails to draw says so; the menus stay, and another page starts afresh. */}
          <ErrorBoundary
            resetKey={`${activeView}:${selectedProjectId ?? ""}`}
            fallback={(error, retry) => (
              <ErrorNotice
                error={error}
                retry={retry}
                texts={{ title: t("ui.errors.pageTitle"), stale: t("ui.errors.staleBuild"), other: t("ui.errors.other"), reload: t("ui.errors.reload"), retry: t("ui.errors.retry") }}
              />
            )}
          >
            <PageBoundary
              view={activeView}
              isAdminSectionViewName={isAdminSectionViewName}
            >
              <AppPages />
            </PageBoundary>
          </ErrorBoundary>
          <IssueDrawer />
          <ShiftReasonPrompt />
          {pageContext.projectCreateOpen && <ProjectCreateDialog />}
        </PageContextProvider>
      </main>
    </div>
  );
}
