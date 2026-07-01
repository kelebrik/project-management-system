import type { FocusEventHandler, KeyboardEventHandler, ReactNode } from "react";
import {
  Archive,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import type { CurrentUser } from "../app/adminTypes";
import type { ProjectDetails, ProjectListItem } from "../app/domainTypes";
import type { ProjectModuleKey } from "../app/projectModules";
import {
  isAdminSectionViewName,
  type AppView,
  type ProjectSectionView,
} from "../app/routes";
import { AppPages, IssueDrawer, PageBoundary } from "../pages";
import { PageContextProvider, type PageContextValue } from "../pages/PageContext";
import { AppTopbar } from "./AppTopbar";
import { NavLabel } from "./NavLabel";
import { ProjectPicker } from "./ProjectPicker";
import {
  ProjectSidebarMenu,
  type ProjectNavItem,
} from "./ProjectSidebarMenu";
import { ResourceSidebarMenu } from "./ResourceSidebarMenu";
import { SidebarIdentity } from "./SidebarIdentity";
import { SystemBanners } from "./SystemBanners";

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
  error: string | null;
  filteredProjectOptions: ProjectListItem[];
  firstEnabledProjectView: ProjectSectionView;
  handleEditableFocus: FocusEventHandler<HTMLDivElement>;
  handleEditableKeyDown: KeyboardEventHandler<HTMLDivElement>;
  isAdminSectionView: boolean;
  isAdminUser: boolean;
  isAuthenticated: boolean;
  isClosedProject: boolean;
  isProjectModuleEnabled: (key: ProjectModuleKey) => boolean;
  isProjectSectionView: boolean;
  isProjectView: boolean;
  isResourceSectionView: boolean;
  isReadOnly: boolean;
  logout: () => void;
  notice: string | null;
  onAuthModeChange: (mode: "login") => void;
  onErrorChange: (value: string | null) => void;
  onNoticeChange: (value: string | null) => void;
  openView: OpenView;
  pageContext: PageContextValue;
  project: ProjectDetails | null;
  projectTargetSummary: {
    activeGoal: {
      title: string;
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
  sidebarCollapsed: boolean;
  signedDaysLabel: (value: number | null) => string;
  toggleSidebar: () => void;
  viewTitle: Record<AppView, string>;
};

const projectNavItems: ProjectNavItem[] = [
  {
    key: "overview",
    view: "project-overview",
    label: "Состояние проекта",
    icon: <LayoutDashboard size={17} />,
  },
  {
    key: "overview",
    view: "project-schedule",
    label: "График проекта",
    icon: <GanttChartSquare size={17} />,
  },
  {
    key: "passport",
    view: "project-passport",
    label: "Паспорт проекта",
    icon: <FileText size={17} />,
  },
  {
    key: "businessRequirements",
    view: "project-business-requirements",
    label: "Бизнес требования",
    icon: <FileSpreadsheet size={17} />,
  },
  {
    key: "structure",
    view: "project-structure",
    label: "Структура",
    icon: <ListChecks size={17} />,
  },
  {
    key: "gantt",
    view: "project-gantt",
    label: "Гантт",
    icon: <GanttChartSquare size={17} />,
  },
  {
    key: "jiraWork",
    view: "project-jira-work",
    label: "Работы в Jira",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    key: "issues",
    view: "project-issues",
    label: "Открытые вопросы",
    icon: <ShieldAlert size={17} />,
  },
  {
    key: "raid",
    view: "project-raid",
    label: "Риски и проблемы",
    icon: <BarChart3 size={17} />,
  },
  {
    key: "changes",
    view: "project-changes",
    label: "Управление изменениями",
    icon: <GitBranch size={17} />,
  },
  {
    key: "budget",
    view: "project-budget",
    label: "Управление бюджетом",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    key: "calendars",
    view: "project-calendars",
    label: "Календари",
    icon: <CalendarDays size={17} />,
  },
  {
    key: "artifacts",
    view: "project-artifacts",
    label: "Артефакты проекта",
    icon: <FileArchive size={17} />,
  },
];

type AdminNavItem = {
  view: AppView;
  label: string;
  icon: ReactNode;
};

const adminNavItems: AdminNavItem[] = [
  {
    view: "admin-projects",
    label: "Реестр проектов",
    icon: <FolderTree size={17} />,
  },
  {
    view: "admin-modules",
    label: "Управление модулями",
    icon: <SlidersHorizontal size={17} />,
  },
  {
    view: "admin-project-access",
    label: "Доступ к проектам",
    icon: <ShieldCheck size={17} />,
  },
  {
    view: "admin-users",
    label: "Пользователи",
    icon: <Users size={17} />,
  },
  {
    view: "admin-roles",
    label: "Роли и права",
    icon: <KeyRound size={17} />,
  },
  {
    view: "admin-dictionaries",
    label: "Справочники",
    icon: <ListChecks size={17} />,
  },
  {
    view: "admin-templates",
    label: "Шаблоны Структуры",
    icon: <GanttChartSquare size={17} />,
  },
  {
    view: "admin-rag",
    label: "Формулы RAG",
    icon: <SlidersHorizontal size={17} />,
  },
  {
    view: "admin-workflows",
    label: "Workflow согласований",
    icon: <GitBranch size={17} />,
  },
  {
    view: "admin-jira",
    label: "Jira",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    view: "admin-integrations",
    label: "Интеграции и API",
    icon: <GitBranch size={17} />,
  },
  {
    view: "admin-health",
    label: "System health",
    icon: <HeartPulse size={17} />,
  },
  {
    view: "admin-backups",
    label: "Backup/restore",
    icon: <HardDriveDownload size={17} />,
  },
  {
    view: "admin-config",
    label: "Import/export",
    icon: <Import size={17} />,
  },
  {
    view: "admin-import",
    label: "Импорт",
    icon: <FileSpreadsheet size={17} />,
  },
  {
    view: "admin-audit",
    label: "Журнал аудита",
    icon: <FileText size={17} />,
  },
];

export function AppShell({
  activeView,
  currentUser,
  error,
  filteredProjectOptions,
  firstEnabledProjectView,
  handleEditableFocus,
  handleEditableKeyDown,
  isAdminSectionView,
  isAdminUser,
  isAuthenticated,
  isClosedProject,
  isProjectModuleEnabled,
  isProjectSectionView,
  isProjectView,
  isResourceSectionView,
  isReadOnly,
  logout,
  notice,
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
  sidebarCollapsed,
  signedDaysLabel,
  toggleSidebar,
  viewTitle,
}: AppShellProps) {
  const navLabel = (icon: ReactNode, label: string) => (
    <NavLabel icon={icon} label={label} sidebarCollapsed={sidebarCollapsed} />
  );

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isReadOnly ? "read-only-mode" : ""}`}
      onFocusCapture={handleEditableFocus}
      onKeyDownCapture={handleEditableKeyDown}
    >
      <button
        type="button"
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={
          sidebarCollapsed
            ? "Развернуть боковую панель"
            : "Свернуть боковую панель"
        }
        title={
          sidebarCollapsed
            ? "Развернуть боковую панель"
            : "Свернуть боковую панель"
        }
      >
        {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
      <aside className="sidebar">
        <SidebarIdentity
          currentUser={currentUser}
          onLogin={() => {
            onAuthModeChange("login");
            onErrorChange(null);
            onNoticeChange(null);
          }}
          onLogout={logout}
        />
        <nav>
          <button
            type="button"
            className={activeView === "portfolio" ? "active" : ""}
            onClick={() => openView("portfolio")}
            aria-label="Портфель"
          >
            {navLabel(<BriefcaseBusiness size={17} />, "Портфель")}
          </button>
          <ProjectSidebarMenu
            activeView={activeView}
            isProjectModuleEnabled={isProjectModuleEnabled}
            isProjectSectionView={isProjectSectionView}
            navLabel={navLabel}
            onOpenView={openView}
            projectNavItems={projectNavItems}
            projectPicker={
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
                targetView={firstEnabledProjectView}
              />
            }
            shouldShowProjectMenu={shouldShowProjectMenu}
          />
          <button
            type="button"
            className={activeView === "closed-projects" ? "active" : ""}
            onClick={() => openView("closed-projects")}
            aria-label="Закрытые проекты"
          >
            {navLabel(<Archive size={17} />, "Закрытые проекты")}
          </button>
          {isAdminUser && (
            <>
              <button
                type="button"
                className={isAdminSectionView ? "active" : ""}
                onClick={() => openView("admin-projects")}
                aria-label="Администрирование"
              >
                {navLabel(<Settings size={17} />, "Администрирование")}
              </button>
              {shouldShowAdminMenu && (
                <div className="sidebar-group">
                  <div className="project-menu">
                    {adminNavItems.map((item) => (
                      <button
                        type="button"
                        key={item.view}
                        className={
                          activeView === item.view
                            ? "active nested child"
                            : "nested child"
                        }
                        onClick={() => openView(item.view)}
                        aria-label={item.label}
                      >
                        {navLabel(item.icon, item.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {isAdminUser && (
            <>
              <button
                type="button"
                className={isResourceSectionView ? "active" : ""}
                onClick={() => openView("resources")}
                aria-label="Разработка"
              >
                {navLabel(<Code2 size={17} />, "Разработка")}
              </button>
              {shouldShowDevelopmentMenu && (
                <ResourceSidebarMenu
                  activeView={activeView}
                  isResourceSectionView={isResourceSectionView}
                  navLabel={navLabel}
                  onOpenView={openView}
                />
              )}
            </>
          )}
        </nav>
      </aside>

      <main className="workspace">
        <AppTopbar
          activeView={activeView}
          isProjectView={isProjectView}
          project={project}
          projectTargetSummary={projectTargetSummary}
          scheduleHealth={scheduleHealth}
          search={renderGlobalSearch("global-search-topbar")}
          signedDaysLabel={signedDaysLabel}
          viewTitle={viewTitle}
        />
        <SystemBanners
          error={error}
          isAuthenticated={isAuthenticated}
          isClosedProject={isClosedProject}
          notice={notice}
          onErrorDismiss={() => onErrorChange(null)}
          onLogin={() => {
            onAuthModeChange("login");
            onErrorChange(null);
            onNoticeChange(null);
          }}
          onNoticeDismiss={() => onNoticeChange(null)}
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
