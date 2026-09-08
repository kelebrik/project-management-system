import { JiraReconciliationPage } from './JiraReconciliationPage';
import { lazy, Suspense } from "react";
import { PageSkeleton } from "../components/Skeleton";
import { AdminAuditPageContent } from "./AdminAuditPageContent";
import { AdminAnalyticsPageContent } from "./AdminAnalyticsPageContent";
import { AdminBackupsPageContent, AdminConfigPageContent, AdminHealthPageContent } from "./AdminStatusPages";
import { AdminDictionariesPageContent } from "./AdminDictionariesPageContent";
import { AdminIntegrationsPageContent } from "./AdminIntegrationsPageContent";
import { AdminModulesPageContent } from "./AdminModulesPageContent";
import { AdminProjectAccessPageContent } from "./AdminProjectAccessPageContent";
import { AdminProjectsPageContent } from "./AdminProjectsPageContent";
import { AdminRagPageContent, AdminTemplatesPageContent, AdminWorkflowsPageContent } from "./AdminSettingsPages";
import { AdminRolesPageContent } from "./AdminRolesPageContent";
import { AdminUsersPageContent } from "./AdminUsersPageContent";
import { BusinessUnitsPageContent } from "./BusinessUnitsPageContent";
import { ClosedProjectsPage } from "./ClosedProjectsPage";
import { PortfolioPage } from "./PortfolioPage";
import { ProjectsPage } from "./ProjectsPage";
import { ReportsPage } from "./ReportsPage";
import { ProjectArtifactsPage } from "./ProjectArtifactsPage";
import { ProjectBusinessRequirementsPage } from "./ProjectBusinessRequirementsPage";
import { ProjectCalendarsPage } from "./ProjectCalendarsPage";
import { ProjectCreatePage } from "./ProjectCreatePage";
import { ProjectCurrentWorkPage } from "./ProjectCurrentWorkPage";
import { ProjectIssuesPage } from "./ProjectIssuesPage";
import { ProjectJiraWorkPage } from "./ProjectJiraWorkPage";
import { ProjectOverviewMilestonesPage } from "./ProjectOverviewMilestonesPage";
import { ProjectOverviewSummaryPage } from "./ProjectOverviewSummaryPage";
import { ProjectPassportPage } from "./ProjectPassportPage";
import { ProjectRaidPage } from "./ProjectRaidPage";
import { ProjectBudgetPage, ProjectChangesPage } from "./ProjectSupportPages";
import { ProjectWorkspacePage } from "./ProjectWorkspacePage";
import {
  ResourceOverviewPage,
  ResourceCapacityPage,
} from "./ResourcePages";
import { usePageContext } from "./PageContext";
import { WikiPage } from "./WikiPage";
import { isDevelopmentSectionViewName } from "../app/routes";

const ProjectPmWorkspacePage = lazy(() =>
  import("./ProjectPmWorkspacePage").then((module) => ({
    default: module.ProjectPmWorkspacePage,
  })),
);
const DecisionQueuePage = lazy(() =>
  import("./DecisionQueuePage").then((module) => ({
    default: module.DecisionQueuePage,
  })),
);

function DevelopmentPageFallback() {
  return (
    <div className="page-loading-skeleton" aria-label="Загрузка страницы">
      <PageSkeleton label="Загрузка страницы" />
    </div>
  );
}

export function AppPages() {
  const { activeView, isAdminSectionView, isAdminUser, project } =
    usePageContext();
  const isDevelopmentSectionView = isDevelopmentSectionViewName(activeView);

  if (!(project || activeView === "portfolio" || activeView === "projects" || activeView === "reports" || activeView === "wiki" || activeView === "project-create" || activeView === "closed-projects" || isAdminSectionView || (isAdminUser && isDevelopmentSectionView))) {
    return null;
  }

  return (
    <>
      {activeView === "portfolio" && <PortfolioPage />}
      {isAdminUser && activeView === "decision-queue" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <DecisionQueuePage />
        </Suspense>
      )}
      {activeView === "projects" && <ProjectsPage />}
      {activeView === "reports" && <ReportsPage />}
      {isAdminUser && activeView === "jira-reconciliation" && <JiraReconciliationPage />}
      {activeView === "wiki" && <WikiPage />}
      {project && activeView === "project-overview" && (
        <ProjectOverviewSummaryPage key={project.id} />
      )}
      {activeView === "closed-projects" && <ClosedProjectsPage />}

      <section className="content-grid">
        {activeView === "project-create" && <ProjectCreatePage />}
        {activeView === "admin-users" && <AdminUsersPageContent />}
        {activeView === "admin-modules" && <AdminModulesPageContent />}
        {activeView === "admin-roles" && <AdminRolesPageContent />}
        {activeView === "admin-dictionaries" && <AdminDictionariesPageContent />}
        {activeView === "admin-templates" && <AdminTemplatesPageContent />}
        {activeView === "admin-rag" && <AdminRagPageContent />}
        {activeView === "admin-workflows" && <AdminWorkflowsPageContent />}
        {activeView === "admin-integrations" && <AdminIntegrationsPageContent />}
        {activeView === "admin-health" && <AdminHealthPageContent />}
        {activeView === "admin-backups" && <AdminBackupsPageContent />}
        {activeView === "admin-config" && <AdminConfigPageContent />}
        {activeView === "admin-projects" && <AdminProjectsPageContent />}
        {isAdminUser && activeView === "admin-business-units" && <BusinessUnitsPageContent />}
        {activeView === "admin-project-access" && <AdminProjectAccessPageContent />}
        {activeView === "admin-audit" && <AdminAuditPageContent />}
        {isAdminUser && activeView === "admin-analytics" && <AdminAnalyticsPageContent />}
        {isAdminUser && activeView === "resources" && <ResourceOverviewPage />}
        {isAdminUser && activeView === "resources-capacity" && <ResourceCapacityPage />}
        {project && activeView === "project-schedule" && <ProjectOverviewMilestonesPage />}
        {project && activeView === "project-passport" && <ProjectPassportPage />}
        {project && activeView === "project-business-requirements" && <ProjectBusinessRequirementsPage />}
        {project && activeView === "project-current-work" && <ProjectCurrentWorkPage key={project.id} />}
        {project && activeView === "project-changes" && <ProjectChangesPage />}
        {project && activeView === "project-budget" && <ProjectBudgetPage />}
        {isAdminUser && project && activeView === "project-pm-workspace" && (
          <Suspense fallback={<DevelopmentPageFallback />}>
            <ProjectPmWorkspacePage />
          </Suspense>
        )}
        {project && (activeView === "project-structure" || activeView === "project-gantt") && <ProjectWorkspacePage />}
        {project && activeView === "project-calendars" && <ProjectCalendarsPage />}
        {project && activeView === "project-jira-work" && <ProjectJiraWorkPage key={project.id} />}
        {project && activeView === "project-issues" && <ProjectIssuesPage />}
        {project && activeView === "project-raid" && <ProjectRaidPage />}
        {project && activeView === "project-artifacts" && <ProjectArtifactsPage />}
      </section>
    </>
  );
}
