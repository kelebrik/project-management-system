import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { Suspense } from "react";
import { PageSkeleton } from "../components/Skeleton";
import { usePageContext } from "./PageContext";
import { canViewAppView, isDevelopmentSectionViewName, isOperationsSectionViewName } from "../app/routes";

import {
  ProjectDecisionsPage,
  JiraReconciliationPage,
  AdminAuditPageContent,
  AdminAnalyticsPageContent,
  AdminBackupsPageContent,
  AdminConfigPageContent,
  AdminHealthPageContent,
  AdminIntegrationsPageContent,
  AdminModulesPageContent,
  AdminProjectAccessPageContent,
  AdminProjectsPageContent,
  AdminRolesPageContent,
  AdminUsersPageContent,
  BusinessUnitsPageContent,
  ClosedProjectsPage,
  PortfolioPage,
  ProjectsPage,
  ReportsPage,
  ProjectArtifactsPage,
  ProjectBusinessRequirementsPage,
  ProjectCalendarsPage,
  ProjectCurrentWorkPage,
  DevelopmentOpenIssuesPage,
  ProjectJiraWorkPage,
  ProjectOverviewMilestonesPage,
  ProjectOverviewSummaryPage,
  ProjectPassportPage,
  ProjectRaidPage,
  ProjectChangesPage,
  ProjectWorkspacePage,
  WikiPage,
  LeaveSchedulePage,
  ProjectHistoryPage,
  WorkloadPage,
  MyWorkPage,
  AutomationRulesPage,
  ProjectSchedulePage,
  MyPagePage,
  SharedPagePage,
  RaciMatrixPage,
  LessonsRegisterPage,
  DecisionQueuePage,
} from "./pageModules";

function PageFallback() {
  const { t: uiText } = useInterfaceTranslation();
  return (
    <div className="page-loading-skeleton" aria-label={uiText("ui.projects.loadingPage")}>
      <PageSkeleton label={uiText("ui.projects.loadingPage")} />
    </div>
  );
}

export function AppPages() {
  const { activeView, isAdminSectionView, sectionAccess, project } =
    usePageContext();
  const isDevelopmentSectionView = isDevelopmentSectionViewName(activeView);
  const isOperationsSectionView = isOperationsSectionViewName(activeView);

  // Single gate for the whole page tree: routing and the auth controller use the
  // same rule, so a section is never navigable while its content stays blank.
  if (!canViewAppView(activeView, sectionAccess)) {
    return null;
  }

  if (!(project || activeView === "portfolio" || activeView === "projects" || activeView === "reports" || activeView === "wiki" || activeView === "shared-page" || activeView === "my-page" || activeView === "project-create" || activeView === "closed-projects" || isAdminSectionView || isDevelopmentSectionView || isOperationsSectionView)) {
    return null;
  }

  return (
    <Suspense fallback={<PageFallback />}>
      {activeView === "portfolio" && <PortfolioPage />}
      {activeView === "workload" && (
        <WorkloadPage />
      )}
      {activeView === "leave-schedule" && (
        <LeaveSchedulePage />
      )}
      {activeView === "my-work" && (
        <MyWorkPage />
      )}
      {activeView === "my-page" && (
        <MyPagePage />
      )}
      {activeView === "shared-page" && (
        <SharedPagePage />
      )}
      {activeView === "automation-rules" && (
        <AutomationRulesPage />
      )}
      {activeView === "raci-matrix" && (
        <RaciMatrixPage />
      )}
      {activeView === "lessons-register" && (
        <LessonsRegisterPage />
      )}
      {activeView === "decision-queue" && (
        <DecisionQueuePage />
      )}
      {(activeView === "projects" || activeView === "project-create") && <ProjectsPage />}
      {activeView === "reports" && <ReportsPage />}
      {activeView === "jira-reconciliation" && <JiraReconciliationPage />}
      {activeView === "wiki" && <WikiPage />}
      {project && activeView === "project-overview" && (
        <ProjectOverviewSummaryPage key={project.id} />
      )}
      {activeView === "closed-projects" && <ClosedProjectsPage />}

      <section className="content-grid">
        {activeView === "admin-users" && <AdminUsersPageContent />}
        {activeView === "admin-modules" && <AdminModulesPageContent />}
        {activeView === "admin-roles" && <AdminRolesPageContent />}
        {activeView === "admin-integrations" && <AdminIntegrationsPageContent />}
        {activeView === "admin-health" && <AdminHealthPageContent />}
        {activeView === "admin-backups" && <AdminBackupsPageContent />}
        {activeView === "admin-config" && <AdminConfigPageContent />}
        {activeView === "admin-projects" && <AdminProjectsPageContent />}
        {activeView === "admin-business-units" && <BusinessUnitsPageContent />}
        {activeView === "admin-project-access" && <AdminProjectAccessPageContent />}
        {activeView === "admin-audit" && <AdminAuditPageContent />}
        {activeView === "admin-analytics" && <AdminAnalyticsPageContent />}
        {project && activeView === "project-schedule" && (
          <ProjectSchedulePage />
        )}
        {/* The schedule before the Highcharts one, kept in Development for comparison and its two-page PDF. */}
        {project && activeView === "schedule-legacy" && <ProjectOverviewMilestonesPage />}
        {project && activeView === "project-passport" && <ProjectPassportPage />}
        {project && activeView === "project-business-requirements" && <ProjectBusinessRequirementsPage />}
        {project && activeView === "project-current-work" && <ProjectCurrentWorkPage key={project.id} />}
        {project && activeView === "project-changes" && <ProjectChangesPage />}
        {project && (activeView === "project-structure" || activeView === "project-gantt") && <ProjectWorkspacePage />}
        {project && activeView === "project-calendars" && <ProjectCalendarsPage />}
        {project && activeView === "project-history" && <ProjectHistoryPage />}
        {project && activeView === "project-jira-work" && <ProjectJiraWorkPage key={project.id} />}
        {project && activeView === "project-issues" && <DevelopmentOpenIssuesPage />}
        {project && activeView === "project-decisions" && <ProjectDecisionsPage />}
        {project && activeView === "project-raid" && <ProjectRaidPage />}
        {project && activeView === "project-artifacts" && <ProjectArtifactsPage />}
      </section>
    </Suspense>
  );
}
