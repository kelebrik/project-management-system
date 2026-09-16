import type { FocusEventHandler, KeyboardEventHandler, ReactNode } from "react";
import {
  Archive,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderTree,
  GanttChartSquare,
  GitBranch,
  HardDriveDownload,
  HeartPulse,
  Import,
  Code2,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  NotebookText,
  Plus,
  Settings,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

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
import { AppTopbar } from "./AppTopbar";
import { BusinessUnitSwitcher } from "./BusinessUnitSwitcher";
import { ProjectPicker } from "./ProjectPicker";
import type { ProjectNavItem } from "./ProjectSidebarMenu";
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
  sectionAccess: SectionAccess;
  isAuthenticated: boolean;
  isClosedProject: boolean;
  isDevelopmentSectionView: boolean;
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
  shouldShowProjectMenu: boolean;
  showProjectPicker: boolean;
  signedDaysLabel: (value: number | null) => string;
  viewTitle: Record<AppView, string>;
};

const projectNavItems: ProjectNavItem[] = [
  {
    key: "overview",
    view: "project-overview",
    label: "view.project-overview",
    icon: <LayoutDashboard size={17} />,
  },
  {
    key: "overview",
    view: "project-schedule",
    label: "view.project-schedule",
    icon: <GanttChartSquare size={17} />,
  },
  {
    key: "gantt",
    view: "project-gantt",
    label: "view.project-gantt",
    icon: <GanttChartSquare size={17} />,
  },
  {
    key: "structure",
    view: "project-current-work",
    label: "view.project-current-work",
    icon: <ListTodo size={17} />,
  },
  {
    key: "structure",
    view: "project-structure",
    label: "view.project-structure",
    icon: <ListChecks size={17} />,
  },
  {
    key: "jiraWork",
    view: "project-jira-work",
    label: "view.project-jira-work",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    key: "passport",
    view: "project-passport",
    label: "view.project-passport",
    icon: <FileText size={17} />,
  },
  {
    key: "businessRequirements",
    view: "project-business-requirements",
    label: "view.project-business-requirements",
    icon: <FileSpreadsheet size={17} />,
  },
  {
    key: "issues",
    view: "project-issues",
    label: "view.project-issues",
    icon: <ShieldAlert size={17} />,
  },
  {
    key: "raid",
    view: "project-raid",
    label: "view.project-raid",
    icon: <BarChart3 size={17} />,
  },
  {
    key: "artifacts",
    view: "project-artifacts",
    label: "view.project-artifacts",
    icon: <FileArchive size={17} />,
  },
  {
    key: "calendars",
    view: "project-calendars",
    label: "view.project-calendars",
    icon: <CalendarDays size={17} />,
  },
];

type AdminNavItem = {
  view: AppView;
  label: TranslationKey;
  icon: ReactNode;
};

const adminNavItems: AdminNavItem[] = [
  {
    view: "admin-projects",
    label: "view.admin-projects",
    icon: <FolderTree size={17} />,
  },
  {
    view: "admin-business-units",
    label: "view.admin-business-units",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    view: "admin-modules",
    label: "view.admin-modules",
    icon: <SlidersHorizontal size={17} />,
  },
  {
    view: "admin-project-access",
    label: "view.admin-project-access",
    icon: <ShieldCheck size={17} />,
  },
  {
    view: "admin-users",
    label: "view.admin-users",
    icon: <Users size={17} />,
  },
  {
    view: "admin-roles",
    label: "view.admin-roles",
    icon: <KeyRound size={17} />,
  },
  {
    view: "admin-dictionaries",
    label: "view.admin-dictionaries",
    icon: <ListChecks size={17} />,
  },
  {
    view: "admin-templates",
    label: "view.admin-templates",
    icon: <GanttChartSquare size={17} />,
  },
  {
    view: "admin-rag",
    label: "view.admin-rag",
    icon: <SlidersHorizontal size={17} />,
  },
  {
    view: "admin-workflows",
    label: "view.admin-workflows",
    icon: <GitBranch size={17} />,
  },
  {
    view: "admin-integrations",
    label: "view.admin-integrations",
    icon: <GitBranch size={17} />,
  },
  {
    view: "admin-health",
    label: "view.admin-health",
    icon: <HeartPulse size={17} />,
  },
  {
    view: "admin-backups",
    label: "view.admin-backups",
    icon: <HardDriveDownload size={17} />,
  },
  {
    view: "admin-config",
    label: "view.admin-config",
    icon: <Import size={17} />,
  },
  {
    view: "admin-audit",
    label: "view.admin-audit",
    icon: <FileText size={17} />,
  },
  {
    view: "admin-analytics",
    label: "view.admin-analytics",
    icon: <BarChart3 size={17} />,
  },
];

const developmentNavItems: AdminNavItem[] = [
  { view: "portfolio-v2", label: "view.portfolio-v2", icon: <BriefcaseBusiness size={15} /> },
  { view: "jira-reconciliation", label: "view.jira-reconciliation", icon: <CircleHelp size={15} /> },
  {
    view: "project-pm-workspace",
    label: "view.project-pm-workspace",
    icon: <LayoutDashboard size={15} />,
  },
  {
    view: "decision-queue",
    label: "view.decision-queue",
    icon: <CircleHelp size={15} />,
  },
  {
    view: "resources",
    label: "view.resources",
    icon: <Users size={15} />,
  },
  {
    view: "resources-capacity",
    label: "view.resources-capacity",
    icon: <Settings2 size={15} />,
  },
];

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
  "project-raid": "tab.project-raid",
  "project-changes": "tab.project-changes",
  "project-budget": "tab.project-budget",
  "project-calendars": "tab.project-calendars",
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
  sectionAccess,
  isAuthenticated,
  isClosedProject,
  isDevelopmentSectionView,
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
          <button
            type="button"
            className={activeView === "reports" ? "active" : ""}
            onClick={() => openView("reports")}
          >
            <NotebookText size={15} /> {t("nav.reports")}
          </button>
          <button
            type="button"
            className={activeView === "closed-projects" ? "active" : ""}
            onClick={() => openView("closed-projects")}
          >
            <Archive size={15} /> {t("nav.archive")}
          </button>
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
              onClick={() => openView("resources")}
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
              className={activeView === "project-create" ? "active" : ""}
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
          {(activeView === "project-pm-workspace" || activeView === "decision-queue") && (
            <div className="section-project-picker">{projectPicker("project-pm-workspace")}</div>
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
        </PageContextProvider>
      </main>
    </div>
  );
}
