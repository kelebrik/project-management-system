import { AdminAuditPageContent } from "./AdminAuditPageContent";
import { AdminBackupsPageContent, AdminConfigPageContent, AdminHealthPageContent } from "./AdminStatusPages";
import { AdminDictionariesPageContent } from "./AdminDictionariesPageContent";
import { AdminIntegrationsPageContent } from "./AdminIntegrationsPageContent";
import { AdminImportPageContent } from "./AdminImportPageContent";
import { AdminJiraProjectPage } from "./AdminJiraProjectPage";
import { AdminModulesPageContent } from "./AdminModulesPageContent";
import { AdminProjectAccessPageContent } from "./AdminProjectAccessPageContent";
import { AdminProjectsPageContent } from "./AdminProjectsPageContent";
import { AdminRagPageContent, AdminSystemJiraPageContent, AdminTemplatesPageContent, AdminWorkflowsPageContent } from "./AdminSettingsPages";
import { AdminRolesPageContent } from "./AdminRolesPageContent";
import { AdminUsersPageContent } from "./AdminUsersPageContent";
import { ClosedProjectsPage } from "./ClosedProjectsPage";
import { PortfolioPage } from "./PortfolioPage";
import { ProjectsPage } from "./ProjectsPage";
import { ProjectArtifactsPage } from "./ProjectArtifactsPage";
import { ProjectBusinessRequirementsPage } from "./ProjectBusinessRequirementsPage";
import { ProjectCalendarsPage } from "./ProjectCalendarsPage";
import { ProjectCreatePage } from "./ProjectCreatePage";
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

export function AppPages() {
  const { activeView, isAdminSectionView, isAdminUser, isResourceSectionView, project } =
    usePageContext();

  if (!(project || activeView === "portfolio" || activeView === "projects" || activeView === "project-create" || activeView === "closed-projects" || isAdminSectionView || (isAdminUser && isResourceSectionView))) {
    return null;
  }

  return (
    <>
      {activeView === "portfolio" && <PortfolioPage />}
      {activeView === "projects" && <ProjectsPage />}
      {project && activeView === "project-overview" && <ProjectOverviewSummaryPage />}
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
        {activeView === "admin-jira" && <AdminSystemJiraPageContent />}
        {activeView === "admin-integrations" && <AdminIntegrationsPageContent />}
        {activeView === "admin-import" && <AdminImportPageContent />}
        {activeView === "admin-health" && <AdminHealthPageContent />}
        {activeView === "admin-backups" && <AdminBackupsPageContent />}
        {activeView === "admin-config" && <AdminConfigPageContent />}
        {activeView === "admin-projects" && <AdminProjectsPageContent />}
        {activeView === "admin-project-access" && <AdminProjectAccessPageContent />}
        {activeView === "admin-audit" && <AdminAuditPageContent />}
        {isAdminUser && activeView === "resources" && <ResourceOverviewPage />}
        {isAdminUser && activeView === "resources-capacity" && <ResourceCapacityPage />}
        {project && activeView === "project-schedule" && <ProjectOverviewMilestonesPage />}
        {project && activeView === "project-passport" && <ProjectPassportPage />}
        {project && activeView === "project-business-requirements" && <ProjectBusinessRequirementsPage />}
        {project && activeView === "project-changes" && <ProjectChangesPage />}
        {project && activeView === "project-budget" && <ProjectBudgetPage />}
        {project && (activeView === "project-structure" || activeView === "project-gantt") && <ProjectWorkspacePage />}
        {project && activeView === "project-calendars" && <ProjectCalendarsPage />}
        {project && activeView === "admin-jira" && <AdminJiraProjectPage />}
        {project && activeView === "project-jira-work" && <ProjectJiraWorkPage />}
        {project && activeView === "project-issues" && <ProjectIssuesPage />}
        {project && activeView === "project-raid" && <ProjectRaidPage />}
        {project && activeView === "project-artifacts" && <ProjectArtifactsPage />}
      </section>
    </>
  );
}
