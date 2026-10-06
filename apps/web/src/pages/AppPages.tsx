import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { ProjectDecisionsPage } from "./ProjectDecisionsPage";
import { JiraReconciliationPage } from './JiraReconciliationPage';
import { lazy, Suspense } from "react";
import { PageSkeleton } from "../components/Skeleton";
import { AdminAuditPageContent } from "./AdminAuditPageContent";
import { AdminAnalyticsPageContent } from "./AdminAnalyticsPageContent";
import { AdminBackupsPageContent, AdminConfigPageContent, AdminHealthPageContent } from "./AdminStatusPages";
import { AdminIntegrationsPageContent } from "./AdminIntegrationsPageContent";
import { AdminModulesPageContent } from "./AdminModulesPageContent";
import { AdminProjectAccessPageContent } from "./AdminProjectAccessPageContent";
import { AdminProjectsPageContent } from "./AdminProjectsPageContent";
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
import { ProjectCurrentWorkPage } from "./ProjectCurrentWorkPage";
import { DevelopmentOpenIssuesPage } from "./DevelopmentOpenIssuesPage";
import { ProjectJiraWorkPage } from "./ProjectJiraWorkPage";
import { ProjectOverviewMilestonesPage } from "./ProjectOverviewMilestonesPage";
import { ProjectOverviewSummaryPage } from "./ProjectOverviewSummaryPage";
import { ProjectPassportPage } from "./ProjectPassportPage";
import { ProjectRaidPage } from "./ProjectRaidPage";
import { ProjectChangesPage } from "./ProjectSupportPages";
import { ProjectWorkspacePage } from "./ProjectWorkspacePage";
import { usePageContext } from "./PageContext";
import { WikiPage } from "./WikiPage";
import { canViewAppView, isDevelopmentSectionViewName, isOperationsSectionViewName } from "../app/routes";

const LeaveSchedulePage = lazy(() =>
  import("./LeaveSchedulePage").then((module) => ({
    default: module.LeaveSchedulePage,
  })),
);
const WorkloadPage = lazy(() =>
  import("./WorkloadPage").then((module) => ({
    default: module.WorkloadPage,
  })),
);
const MyWorkPage = lazy(() =>
  import("./MyWorkPage").then((module) => ({
    default: module.MyWorkPage,
  })),
);
const AutomationRulesPage = lazy(() => import("./AutomationRulesPage"));
const MyPagePage = lazy(() =>
  import("./MyPagePage").then((module) => ({
    default: module.MyPagePage,
  })),
);
const RaciMatrixPage = lazy(() =>
  import("./RaciMatrixPage").then((module) => ({
    default: module.RaciMatrixPage,
  })),
);
const LessonsRegisterPage = lazy(() =>
  import("./LessonsRegisterPage").then((module) => ({
    default: module.LessonsRegisterPage,
  })),
);
const DecisionQueuePage = lazy(() =>
  import("./DecisionQueuePage").then((module) => ({
    default: module.DecisionQueuePage,
  })),
);

function DevelopmentPageFallback() {
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

  if (!(project || activeView === "portfolio" || activeView === "projects" || activeView === "reports" || activeView === "wiki" || activeView === "project-create" || activeView === "closed-projects" || isAdminSectionView || isDevelopmentSectionView || isOperationsSectionView)) {
    return null;
  }

  return (
    <>
      {activeView === "portfolio" && <PortfolioPage />}
      {activeView === "workload" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <WorkloadPage />
        </Suspense>
      )}
      {activeView === "leave-schedule" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <LeaveSchedulePage />
        </Suspense>
      )}
      {activeView === "my-work" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <MyWorkPage />
        </Suspense>
      )}
      {activeView === "my-page" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <MyPagePage />
        </Suspense>
      )}
      {activeView === "automation-rules" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <AutomationRulesPage />
        </Suspense>
      )}
      {activeView === "raci-matrix" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <RaciMatrixPage />
        </Suspense>
      )}
      {activeView === "lessons-register" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <LessonsRegisterPage />
        </Suspense>
      )}
      {activeView === "decision-queue" && (
        <Suspense fallback={<DevelopmentPageFallback />}>
          <DecisionQueuePage />
        </Suspense>
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
        {project && activeView === "project-schedule" && <ProjectOverviewMilestonesPage />}
        {project && activeView === "project-passport" && <ProjectPassportPage />}
        {project && activeView === "project-business-requirements" && <ProjectBusinessRequirementsPage />}
        {project && activeView === "project-current-work" && <ProjectCurrentWorkPage key={project.id} />}
        {project && activeView === "project-changes" && <ProjectChangesPage />}
        {project && (activeView === "project-structure" || activeView === "project-gantt") && <ProjectWorkspacePage />}
        {project && activeView === "project-calendars" && <ProjectCalendarsPage />}
        {project && activeView === "project-jira-work" && <ProjectJiraWorkPage key={project.id} />}
        {project && activeView === "project-issues" && <DevelopmentOpenIssuesPage />}
        {project && activeView === "project-decisions" && <ProjectDecisionsPage />}
        {project && activeView === "project-raid" && <ProjectRaidPage />}
        {project && activeView === "project-artifacts" && <ProjectArtifactsPage />}
      </section>
    </>
  );
}
