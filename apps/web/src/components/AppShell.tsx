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
  isAdminSectionViewName,
  type AppView,
  type ProjectSectionView,
} from "../app/routes";
import { wikiGroups } from "../app/wikiContent";
import { AppPages, IssueDrawer, PageBoundary } from "../pages";
import { PageContextProvider, type PageContextValue } from "../pages/PageContext";
import { AppTopbar } from "./AppTopbar";
import { ProjectPicker } from "./ProjectPicker";
import type { ProjectNavItem } from "./ProjectSidebarMenu";
import { SidebarIdentity } from "./SidebarIdentity";
import { SystemBanners } from "./SystemBanners";
import { ThemeToggle } from "./ThemeToggle";

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
  isAdminUser: boolean;
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
    view: "admin-audit",
    label: "Журнал аудита",
    icon: <FileText size={17} />,
  },
];

const developmentNavItems: AdminNavItem[] = [
  {
    view: "portfolio-v2",
    label: "Портфель_v2",
    icon: <BarChart3 size={15} />,
  },
  {
    view: "project-pm-workspace",
    label: "Рабочий стол PM",
    icon: <LayoutDashboard size={15} />,
  },
  {
    view: "decision-queue",
    label: "Очередь решений",
    icon: <CircleHelp size={15} />,
  },
  {
    view: "resources",
    label: "Управление ресурсами",
    icon: <Users size={15} />,
  },
  {
    view: "resources-capacity",
    label: "Параметры ресурсов",
    icon: <Settings2 size={15} />,
  },
];

const projectNavShortLabels: Partial<Record<ProjectSectionView, string>> = {
  "project-overview": "Состояние",
  "project-schedule": "График",
  "project-passport": "Паспорт",
  "project-business-requirements": "Требования",
  "project-structure": "Структура",
  "project-gantt": "Гантт",
  "project-jira-work": "Работы Jira",
  "project-issues": "Вопросы",
  "project-raid": "Риски",
  "project-changes": "Изменения",
  "project-budget": "Бюджет",
  "project-calendars": "Календари",
  "project-artifacts": "Артефакты",
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
  isAdminUser,
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
        <nav className="global-section-nav" aria-label="Основные разделы">
          <button
            type="button"
            className={activeView === "portfolio" ? "active" : ""}
            onClick={() => openView("portfolio")}
          >
            <BriefcaseBusiness size={15} /> Портфель
          </button>
          <button
            type="button"
            className={projectsActive ? "active" : ""}
            onClick={() => openView("projects")}
          >
            <FolderTree size={15} /> Проекты
          </button>
          <button
            type="button"
            className={activeView === "reports" ? "active" : ""}
            onClick={() => openView("reports")}
          >
            <NotebookText size={15} /> Отчёты
          </button>
          <button
            type="button"
            className={activeView === "closed-projects" ? "active" : ""}
            onClick={() => openView("closed-projects")}
          >
            <Archive size={15} /> Архив
          </button>
          {isAdminUser && (
            <button
              type="button"
              className={isAdminSectionView ? "active" : ""}
              onClick={() => openView("admin-projects")}
            >
              <Settings size={15} /> Администрирование
            </button>
          )}
          {isAdminUser && (
            <button
              type="button"
              className={isDevelopmentSectionView ? "active" : ""}
              onClick={() => openView("resources")}
            >
              <Code2 size={15} /> Разработка
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
        <ThemeToggle sidebarCollapsed />
      </header>

      {shouldShowProjectMenu && (
        <div className="section-navigation project-section-navigation">
          <div className="section-project-picker">
            {projectPicker(firstEnabledProjectView)}
          </div>
          <nav className="section-tabs" aria-label="Разделы проекта">
            <button
              type="button"
              className={activeView === "projects" ? "active" : ""}
              onClick={() => openView("projects")}
            >
              <FolderTree size={15} /> Реестр
            </button>
            {projectNavItems
              .filter((item) => isProjectModuleEnabled(item.key))
              .map((item) => (
                <button
                  type="button"
                  key={item.view}
                  className={activeView === item.view ? "active" : ""}
                  onClick={() => openView(item.view)}
                  title={item.label}
                >
                  {item.icon}
                  {projectNavShortLabels[item.view] ?? item.label}
                </button>
              ))}
            <button
              type="button"
              className={activeView === "project-create" ? "active" : ""}
              onClick={() => openView("project-create")}
            >
              <Plus size={15} /> Создать
            </button>
          </nav>
        </div>
      )}

      {shouldShowAdminMenu && (
        <nav className="section-navigation section-tabs" aria-label="Администрирование">
          {adminNavItems.map((item) => (
            <button
              type="button"
              key={item.view}
              className={activeView === item.view ? "active" : ""}
              onClick={() => openView(item.view)}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
      )}

      {shouldShowDevelopmentMenu && (
        <div className="section-navigation development-section-navigation">
          {(activeView === "project-pm-workspace" || activeView === "decision-queue") && (
            <div className="section-project-picker">{projectPicker("project-pm-workspace")}</div>
          )}
          <nav className="section-tabs" aria-label="Разработка">
            {developmentNavItems.map((item) => (
              <button
                type="button"
                key={item.view}
                className={activeView === item.view ? "active" : ""}
                onClick={() => openView(item.view)}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {activeView === "wiki" && (
        <nav className="section-navigation section-tabs wiki-section-tabs" aria-label="Оглавление FAQ">
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
