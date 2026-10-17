import { preloadablePage } from "../app/preloadablePage";
import type { AppView } from "../app/routes";

// Keep each page behind its route so opening a project does not load every section.
export const ProjectDecisionsPage = preloadablePage(() => import("./ProjectDecisionsPage").then(module => ({ default: module.ProjectDecisionsPage })));
export const JiraReconciliationPage = preloadablePage(() => import("./JiraReconciliationPage").then(module => ({ default: module.JiraReconciliationPage })));
export const AdminAuditPageContent = preloadablePage(() => import("./AdminAuditPageContent").then(module => ({ default: module.AdminAuditPageContent })));
export const AdminAnalyticsPageContent = preloadablePage(() => import("./AdminAnalyticsPageContent").then(module => ({ default: module.AdminAnalyticsPageContent })));
export const AdminBackupsPageContent = preloadablePage(() => import("./AdminStatusPages").then(module => ({ default: module.AdminBackupsPageContent })));
export const AdminConfigPageContent = preloadablePage(() => import("./AdminStatusPages").then(module => ({ default: module.AdminConfigPageContent })));
export const AdminHealthPageContent = preloadablePage(() => import("./AdminStatusPages").then(module => ({ default: module.AdminHealthPageContent })));
export const AdminIntegrationsPageContent = preloadablePage(() => import("./AdminIntegrationsPageContent").then(module => ({ default: module.AdminIntegrationsPageContent })));
export const AdminModulesPageContent = preloadablePage(() => import("./AdminModulesPageContent").then(module => ({ default: module.AdminModulesPageContent })));
export const AdminProjectAccessPageContent = preloadablePage(() => import("./AdminProjectAccessPageContent").then(module => ({ default: module.AdminProjectAccessPageContent })));
export const AdminProjectsPageContent = preloadablePage(() => import("./AdminProjectsPageContent").then(module => ({ default: module.AdminProjectsPageContent })));
export const AdminRolesPageContent = preloadablePage(() => import("./AdminRolesPageContent").then(module => ({ default: module.AdminRolesPageContent })));
export const AdminUsersPageContent = preloadablePage(() => import("./AdminUsersPageContent").then(module => ({ default: module.AdminUsersPageContent })));
export const BusinessUnitsPageContent = preloadablePage(() => import("./BusinessUnitsPageContent").then(module => ({ default: module.BusinessUnitsPageContent })));
export const ClosedProjectsPage = preloadablePage(() => import("./ClosedProjectsPage").then(module => ({ default: module.ClosedProjectsPage })));
export const PortfolioPage = preloadablePage(() => import("./PortfolioPage").then(module => ({ default: module.PortfolioPage })));
export const ProjectsPage = preloadablePage(() => import("./ProjectsPage").then(module => ({ default: module.ProjectsPage })));
export const ReportsPage = preloadablePage(() => import("./ReportsPage").then(module => ({ default: module.ReportsPage })));
export const ProjectArtifactsPage = preloadablePage(() => import("./ProjectArtifactsPage").then(module => ({ default: module.ProjectArtifactsPage })));
export const ProjectBusinessRequirementsPage = preloadablePage(() => import("./ProjectBusinessRequirementsPage").then(module => ({ default: module.ProjectBusinessRequirementsPage })));
export const ProjectCalendarsPage = preloadablePage(() => import("./ProjectCalendarsPage").then(module => ({ default: module.ProjectCalendarsPage })));
export const ProjectCurrentWorkPage = preloadablePage(() => import("./ProjectCurrentWorkPage").then(module => ({ default: module.ProjectCurrentWorkPage })));
export const DevelopmentOpenIssuesPage = preloadablePage(() => import("./DevelopmentOpenIssuesPage").then(module => ({ default: module.DevelopmentOpenIssuesPage })));
export const ProjectJiraWorkPage = preloadablePage(() => import("./ProjectJiraWorkPage").then(module => ({ default: module.ProjectJiraWorkPage })));
export const ProjectOverviewMilestonesPage = preloadablePage(() => import("./ProjectOverviewMilestonesPage").then(module => ({ default: module.ProjectOverviewMilestonesPage })));
export const ProjectOverviewSummaryPage = preloadablePage(() => import("./ProjectOverviewSummaryPage").then(module => ({ default: module.ProjectOverviewSummaryPage })));
export const ProjectPassportPage = preloadablePage(() => import("./ProjectPassportPage").then(module => ({ default: module.ProjectPassportPage })));
export const ProjectRaidPage = preloadablePage(() => import("./ProjectRaidPage").then(module => ({ default: module.ProjectRaidPage })));
export const ProjectChangesPage = preloadablePage(() => import("./ProjectSupportPages").then(module => ({ default: module.ProjectChangesPage })));
export const ProjectWorkspacePage = preloadablePage(() => import("./ProjectWorkspacePage").then(module => ({ default: module.ProjectWorkspacePage })));
export const WikiPage = preloadablePage(() => import("./WikiPage").then(module => ({ default: module.WikiPage })));

export const LeaveSchedulePage = preloadablePage(() =>
  import("./LeaveSchedulePage").then((module) => ({
    default: module.LeaveSchedulePage,
  })),
);
export const ProjectHistoryPage = preloadablePage(() =>
  import("./ProjectHistoryPage").then((module) => ({
    default: module.ProjectHistoryPage,
  })),
);
export const WorkloadPage = preloadablePage(() =>
  import("./WorkloadPage").then((module) => ({
    default: module.WorkloadPage,
  })),
);
export const MyWorkPage = preloadablePage(() =>
  import("./MyWorkPage").then((module) => ({
    default: module.MyWorkPage,
  })),
);
export const AutomationRulesPage = preloadablePage(() => import("./AutomationRulesPage"));
export const ProjectSchedulePage = preloadablePage(() => import("./ProjectSchedulePage"));
export const MyPagePage = preloadablePage(() =>
  import("./MyPagePage").then((module) => ({
    default: module.MyPagePage,
  })),
);
export const SharedPagePage = preloadablePage(() =>
  import("./SharedPagePage").then((module) => ({
    default: module.SharedPagePage,
  })),
);
export const RaciMatrixPage = preloadablePage(() =>
  import("./RaciMatrixPage").then((module) => ({
    default: module.RaciMatrixPage,
  })),
);
export const LessonsRegisterPage = preloadablePage(() =>
  import("./LessonsRegisterPage").then((module) => ({
    default: module.LessonsRegisterPage,
  })),
);
export const DecisionQueuePage = preloadablePage(() =>
  import("./DecisionQueuePage").then((module) => ({
    default: module.DecisionQueuePage,
  })),
);

export const WikiNavigation = preloadablePage(() => import("./WikiPage").then(module => ({ default: module.WikiNavigation })));

const pages: Partial<Record<AppView, { preload: () => void }>> = {
  "portfolio": PortfolioPage,
  "projects": ProjectsPage,
  "project-create": ProjectsPage,
  "reports": ReportsPage,
  "wiki": WikiPage,
  "workload": WorkloadPage,
  "leave-schedule": LeaveSchedulePage,
  "my-work": MyWorkPage,
  "my-page": MyPagePage,
  "shared-page": SharedPagePage,
  "automation-rules": AutomationRulesPage,
  "raci-matrix": RaciMatrixPage,
  "lessons-register": LessonsRegisterPage,
  "decision-queue": DecisionQueuePage,
  "jira-reconciliation": JiraReconciliationPage,
  "project-overview": ProjectOverviewSummaryPage,
  "closed-projects": ClosedProjectsPage,
  "admin-users": AdminUsersPageContent,
  "admin-modules": AdminModulesPageContent,
  "admin-roles": AdminRolesPageContent,
  "admin-integrations": AdminIntegrationsPageContent,
  "admin-health": AdminHealthPageContent,
  "admin-backups": AdminBackupsPageContent,
  "admin-config": AdminConfigPageContent,
  "admin-projects": AdminProjectsPageContent,
  "admin-business-units": BusinessUnitsPageContent,
  "admin-project-access": AdminProjectAccessPageContent,
  "admin-audit": AdminAuditPageContent,
  "admin-analytics": AdminAnalyticsPageContent,
  "project-schedule": ProjectSchedulePage,
  "schedule-legacy": ProjectOverviewMilestonesPage,
  "project-passport": ProjectPassportPage,
  "project-business-requirements": ProjectBusinessRequirementsPage,
  "project-current-work": ProjectCurrentWorkPage,
  "project-changes": ProjectChangesPage,
  "project-structure": ProjectWorkspacePage,
  "project-gantt": ProjectWorkspacePage,
  "project-calendars": ProjectCalendarsPage,
  "project-history": ProjectHistoryPage,
  "project-jira-work": ProjectJiraWorkPage,
  "project-issues": DevelopmentOpenIssuesPage,
  "project-decisions": ProjectDecisionsPage,
  "project-raid": ProjectRaidPage,
  "project-artifacts": ProjectArtifactsPage,
};

/** Start the destination code while authentication/data load, or when navigation is intended. */
export function preloadAppPage(view: AppView) {
  pages[view]?.preload();
  if (view === "wiki") WikiNavigation.preload();
}
