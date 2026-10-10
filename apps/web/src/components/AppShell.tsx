import type { FocusEventHandler, KeyboardEventHandler, ReactNode } from "react";
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
import { getWikiGroups } from "../i18n/wiki";
import { AppPages, IssueDrawer, PageBoundary } from "../pages";
import { PageContextProvider, type PageContextValue } from "../pages/PageContext";
import { ProjectCreateDialog } from "./projectCreate/ProjectCreateDialog";
import { AppTopbar } from "./AppTopbar";
import { BusinessUnitSwitcher } from "./BusinessUnitSwitcher";
import { ProjectPicker } from "./ProjectPicker";
import { adminNavItems, developmentNavItems, operationsNavItems, projectNavItems } from "./appNavItems";
import { SidebarIdentity } from "./SidebarIdentity";
import { SystemBanners } from "./SystemBanners";
import { LanguageToggle } from "./LanguageToggle";
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
  const { t, locale } = useI18n();
  const wikiGroups = getWikiGroups(locale);
  useTheme();
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
            <button
              type="button"
              className={activeView === "my-page" ? "active" : ""}
              onClick={() => openView("my-page")}
            >
              <LayoutDashboard size={15} /> {t("view.my-page")}
            </button>
          )}
          <button
            type="button"
            className={activeView === "portfolio" ? "active" : ""}
            onClick={() => openView("portfolio")}
          >
            <BriefcaseBusiness size={15} /> {t("view.portfolio")}
          </button>
          <button
            type="button"
            className={projectsActive ? "active" : ""}
            onClick={() => openView("projects")}
          >
            <FolderTree size={15} /> {t("nav.projects")}
          </button>
          {canViewOperationsSections && (
            <button
              type="button"
              className={isOperationsSectionView ? "active" : ""}
              onClick={() => openView("leave-schedule")}
            >
              <ClipboardList size={15} /> {t("nav.operations")}
            </button>
          )}
          {canViewAdminSections && (
            <button
              type="button"
              className={isAdminSectionView ? "active" : ""}
              onClick={() => openView("admin-projects")}
            >
              <Settings size={15} /> {t("nav.administration")}
            </button>
          )}
          {canViewDevelopmentSections && (
            <button
              type="button"
              className={isDevelopmentSectionView ? "active" : ""}
              onClick={() => openView("decision-queue")}
            >
              <Code2 size={15} /> {t("nav.development")}
            </button>
          )}
          <button
            type="button"
            className={activeView === "wiki" ? "active" : ""}
            onClick={() => openView("wiki")}
          >
            <BookOpen size={15} /> FAQ
          </button>
        </nav>
        <div className="global-header-search">
          {renderGlobalSearch("global-search-topbar")}
        </div>
        {currentUser && <NotificationsBell />}
        {currentUser && <CloudHeaderSlot user={currentUser} />}
        <LanguageToggle sidebarCollapsed />
      </header>

      {shouldShowProjectMenu && (
        <div className="section-navigation project-section-navigation">
          <div className="section-project-picker">
            {projectPicker(firstEnabledProjectView)}
          </div>
          <nav className="section-tabs" aria-label={t("nav.projectSections")}>
            <button
              type="button"
              className={activeView === "projects" ? "active" : ""}
              onClick={() => openView("projects")}
            >
              <FolderTree size={15} /> {t("nav.registry")}
            </button>
            {projectNavItems
              .filter((item) => isProjectModuleEnabled(item.key))
              .map((item) => (
                <button
                  type="button"
                  key={item.view}
                  className={activeView === item.view ? "active" : ""}
                  onClick={() => openView(item.view)}
                  title={t(item.label)}
                >
                  {item.icon}
                  {t(projectNavShortLabels[item.view] ?? item.label)}
                </button>
              ))}
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
            <button
              type="button"
              key={item.view}
              className={activeView === item.view ? "active" : ""}
              onClick={() => openView(item.view)}
            >
              {item.icon} {t(item.label)}
            </button>
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
              <button
                type="button"
                key={item.view}
                className={activeView === item.view ? "active" : ""}
                onClick={() => openView(item.view)}
              >
                {item.icon} {t(item.label)}
              </button>
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
                <button
                  type="button"
                  key={item.view}
                  className={activeView === item.view ? "active" : ""}
                  onClick={() => openView(item.view)}
                >
                  {item.icon} {t(item.label)}
                </button>
              ))}
          </nav>
        </div>
      )}

      {activeView === "wiki" && (
        <nav className="section-navigation section-tabs wiki-section-tabs" aria-label={t("nav.contents")}>
          {wikiGroups.flatMap((group) => [
            <a href={`#${group.id}`} key={group.id}>{group.title}</a>,
            ...group.articles.map((article) => (
              <a
                className="wiki-article-tab"
                href={`#${article.id}`}
                key={article.id}
              >
                {article.title}
              </a>
            )),
          ])}
        </nav>
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
          <PageBoundary
            view={activeView}
            isAdminSectionViewName={isAdminSectionViewName}
          >
            <AppPages />
          </PageBoundary>
          <IssueDrawer />
          <ShiftReasonPrompt />
          {pageContext.projectCreateOpen && <ProjectCreateDialog />}
        </PageContextProvider>
      </main>
    </div>
  );
}
