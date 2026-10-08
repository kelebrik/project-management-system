import type { AppViewKey } from "@pms/shared";

export type AppView = AppViewKey;

export type ProjectSectionView = Extract<
  AppView,
  | "project-overview"
  | "project-schedule"
  | "project-passport"
  | "project-business-requirements"
  | "project-current-work"
  | "project-structure"
  | "project-gantt"
  | "project-jira-work"
  | "project-issues"
  | "project-decisions"
  | "project-raid"
  | "project-changes"
  | "project-calendars"
  | "project-artifacts"
>;

export type AdminSectionView = Extract<
  AppView,
  | "admin"
  | "admin-users"
  | "admin-roles"
  | "admin-integrations"
  | "admin-health"
  | "admin-backups"
  | "admin-config"
  | "admin-projects"
  | "admin-business-units"
  | "admin-modules"
  | "admin-project-access"
  | "admin-audit"
  | "admin-analytics"
>;

export type DevelopmentSectionView = Extract<
  AppView,
  | "closed-projects"
  | "jira-reconciliation"
  | "decision-queue"
  | "lessons-register"
  | "raci-matrix"
  | "my-work"
  | "reports"
  | "automation-rules"
  | "schedule-legacy"
>;

/** Day-to-day operational tools, open to every signed-in user. */
export type OperationsSectionView = Extract<AppView, "leave-schedule" | "workload">;

export type FullscreenWorkspaceView = Extract<
  AppView,
  "project-structure" | "project-gantt" | "leave-schedule" | "workload"
> | "overview-milestones-by-phase" | "overview-milestones-all";

export const adminSectionViews: AdminSectionView[] = [
  "admin",
  "admin-users",
  "admin-roles",
  "admin-integrations",
  "admin-health",
  "admin-backups",
  "admin-config",
  "admin-projects",
  "admin-business-units",
  "admin-modules",
  "admin-project-access",
  "admin-audit",
  "admin-analytics",
];

export const businessUnitAdminSectionViews = new Set<AdminSectionView>([
  "admin-projects",
  "admin-project-access",
]);

export function canAccessAdminView(
  view: AdminSectionView,
  isSystemAdmin: boolean,
  isBusinessUnitAdmin: boolean,
) {
  return isSystemAdmin || (isBusinessUnitAdmin && businessUnitAdminSectionViews.has(view));
}

export const developmentSectionViews: DevelopmentSectionView[] = [
  "closed-projects",
  "jira-reconciliation",
  "decision-queue",
  "lessons-register",
  "raci-matrix",
  "my-work",
  "reports",
  "automation-rules",
  "schedule-legacy",
];

export const operationsSectionViews: OperationsSectionView[] = ["leave-schedule", "workload"];

export const writeProtectedViews = new Set<AppView>([
  "project-create",
  // My page is for everyone signed in: each person's own pages over the projects they may read.
  "my-page",
  // A page opened by a link: anyone signed in, each with their own access to projects.
  "shared-page",
  ...adminSectionViews,
  ...developmentSectionViews,
  ...operationsSectionViews,
]);

/**
 * Who is asking. `isPublicDemoVisitor` is true only for the built-in demo
 * identity the API hands out under PUBLIC_DEMO_MODE, so corporate installations
 * never widen access by accident.
 */
export type SectionAccess = {
  isAuthenticated: boolean;
  isAdminUser: boolean;
  isBusinessUnitAdmin: boolean;
  isPublicDemoVisitor: boolean;
};

export const noSectionAccess: SectionAccess = {
  isAuthenticated: false,
  isAdminUser: false,
  isBusinessUnitAdmin: false,
  isPublicDemoVisitor: false,
};

/**
 * Administration and Development are split into view and edit rights. A public
 * demo visitor may read them so the whole product is demonstrable, but only
 * reads them; every other section, Operations included, is theirs to edit
 * like any signed-in user's.
 */
export function canViewAppView(view: AppView, access: SectionAccess) {
  if (isAdminSectionViewName(view)) {
    return (
      access.isPublicDemoVisitor ||
      canAccessAdminView(view, access.isAdminUser, access.isBusinessUnitAdmin)
    );
  }
  if (isDevelopmentSectionViewName(view)) {
    return access.isPublicDemoVisitor || access.isAdminUser;
  }
  if (writeProtectedViews.has(view)) return access.isAuthenticated;
  return true;
}

export function canEditAppView(view: AppView, access: SectionAccess) {
  if (access.isPublicDemoVisitor) {
    return !isAdminSectionViewName(view) && !isDevelopmentSectionViewName(view);
  }
  if (isAdminSectionViewName(view)) {
    return canAccessAdminView(view, access.isAdminUser, access.isBusinessUnitAdmin);
  }
  if (isDevelopmentSectionViewName(view)) return access.isAdminUser;
  return access.isAuthenticated;
}

export const projectSectionSlugs: Record<ProjectSectionView, string> = {
  "project-overview": "overview",
  "project-schedule": "schedule",
  "project-passport": "passport",
  "project-business-requirements": "business-requirements",
  "project-current-work": "current-work",
  "project-structure": "wbs",
  "project-gantt": "gantt",
  "project-jira-work": "jira-work",
  "project-issues": "issues",
  "project-decisions": "decisions",
  "project-raid": "risks",
  "project-changes": "changes",
  "project-calendars": "calendars",
  "project-artifacts": "artifacts",
};

export const appViewPaths: Record<AppView, string> = {
  portfolio: "/portfolio",
  "leave-schedule": "/operations/leave-schedule",
  workload: "/operations/workload",
  "decision-queue": "/development/decision-queue",
  "lessons-register": "/development/lessons",
  "raci-matrix": "/development/raci",
  "my-work": "/development/my-work",
  "my-page": "/my-page",
  "shared-page": "/shared-page",
  "automation-rules": "/development/rules",
  "schedule-legacy": "/development/schedule-legacy",
  "jira-reconciliation": "/development/jira-reconciliation",
  projects: "/projects",
  reports: "/development/reports",
  wiki: "/faq",
  "project-create": "/new-project",
  "project-overview": "/overview",
  "project-schedule": "/schedule",
  "project-passport": "/passport",
  "project-business-requirements": "/business-requirements",
  "project-current-work": "/current-work",
  "project-structure": "/wbs",
  "project-gantt": "/gantt",
  "project-jira-work": "/jira-work",
  "project-issues": "/issues",
  "project-decisions": "/decisions",
  "project-raid": "/risks",
  "project-changes": "/changes",
  "project-calendars": "/calendars",
  "project-artifacts": "/artifacts",
  "closed-projects": "/development/archive",
  admin: "/admin",
  "admin-users": "/admin/users",
  "admin-roles": "/admin/roles",
  "admin-integrations": "/admin/integrations",
  "admin-health": "/admin/health",
  "admin-backups": "/admin/backups",
  "admin-config": "/admin/config",
  "admin-projects": "/admin/projects",
  "admin-business-units": "/admin/business-units",
  "admin-modules": "/admin/modules",
  "admin-project-access": "/admin/project-access",
  "admin-audit": "/admin/audit",
  "admin-analytics": "/admin/analytics",
};

export const projectPathViews: Record<string, ProjectSectionView> = {
  overview: "project-overview",
  schedule: "project-schedule",
  milestones: "project-schedule",
  passport: "project-passport",
  "business-requirements": "project-business-requirements",
  requirements: "project-business-requirements",
  "current-work": "project-current-work",
  // Retired sections open the project overview instead of a blank page.
  "pm-workspace": "project-overview",
  workspace: "project-overview",
  wbs: "project-structure",
  structure: "project-structure",
  gantt: "project-gantt",
  "jira-work": "project-jira-work",
  jirawork: "project-jira-work",
  issues: "project-issues",
  "open-issues": "project-issues",
  decisions: "project-decisions",
  risks: "project-raid",
  raid: "project-raid",
  changes: "project-changes",
  budget: "project-overview",
  calendars: "project-calendars",
  calendar: "project-calendars",
  artifacts: "project-artifacts",
};

export const appPathViews: Record<string, AppView> = {
  "/": "portfolio",
  "/portfolio": "portfolio",
  "/projects": "projects",
  "/reports": "reports",
  "/faq": "wiki",
  "/wiki": "wiki",
  "/development": "decision-queue",
  // Earlier addresses keep working after the sections moved.
  "/development/leave-schedule": "leave-schedule",
  "/operations": "leave-schedule",
  "/operations/leave-schedule": "leave-schedule",
  "/operations/workload": "workload",
  "/development/reports": "reports",
  "/development/archive": "closed-projects",
  "/development/decision-queue": "decision-queue",
  "/development/lessons": "lessons-register",
  "/development/raci": "raci-matrix",
  "/development/my-work": "my-work",
  "/my-page": "my-page",
  // My page lived in Development first; its old address still opens it.
  "/development/my-page": "my-page",
  "/shared-page": "shared-page",
  "/development/rules": "automation-rules",
  "/development/schedule-legacy": "schedule-legacy",
  "/development/jira-reconciliation": "jira-reconciliation",
  // Addresses of retired pages lead to the nearest page that still exists.
  "/portfolio-v2": "portfolio",
  "/development/portfolio-v2": "portfolio",
  "/development/pm-workspace": "my-work",
  "/development/workspace": "my-work",
  "/pm-workspace": "my-work",
  "/workspace": "my-work",
  "/resources": "workload",
  "/resources/overview": "workload",
  "/resources/workload": "workload",
  "/resources/schedule": "workload",
  "/resources/allocations": "workload",
  "/resources/directory": "workload",
  "/resources/resources": "workload",
  "/resources/requests": "workload",
  "/resources/capacity": "workload",
  "/resources/settings": "workload",
  "/development/resources": "workload",
  "/development/resources/overview": "workload",
  "/development/resources/workload": "workload",
  "/development/resources/schedule": "workload",
  "/development/resources/allocations": "workload",
  "/development/resources/directory": "workload",
  "/development/resources/resources": "workload",
  "/development/resources/requests": "workload",
  "/development/resources/capacity": "workload",
  "/development/resources/settings": "workload",
  "/new-project": "project-create",
  "/create-project": "project-create",
  "/overview": "project-overview",
  "/schedule": "project-schedule",
  "/milestones": "project-schedule",
  "/passport": "project-passport",
  "/business-requirements": "project-business-requirements",
  "/requirements": "project-business-requirements",
  "/current-work": "project-current-work",
  "/wbs": "project-structure",
  "/structure": "project-structure",
  "/gantt": "project-gantt",
  "/jira-work": "project-jira-work",
  "/jirawork": "project-jira-work",
  "/issues": "project-issues",
  "/open-issues": "project-issues",
  "/decisions": "project-decisions",
  "/risks": "project-raid",
  "/raid": "project-raid",
  "/changes": "project-changes",
  "/budget": "project-overview",
  "/calendars": "project-calendars",
  "/calendar": "project-calendars",
  "/artifacts": "project-artifacts",
  "/closed-projects": "closed-projects",
  "/closed": "closed-projects",
  "/admin": "admin-projects",
  "/admin/users": "admin-users",
  "/admin/roles": "admin-roles",
  "/admin/dictionaries": "admin-projects",
  "/admin/templates": "admin-projects",
  "/admin/integrations": "admin-integrations",
  "/admin/health": "admin-health",
  "/admin/backups": "admin-backups",
  "/admin/config": "admin-config",
  "/admin/projects": "admin-projects",
  "/admin/business-units": "admin-business-units",
  "/admin/modules": "admin-modules",
  "/admin/project-access": "admin-project-access",
  "/admin/audit": "admin-audit",
  "/admin/analytics": "admin-analytics",
};

export function normalizeAppPath(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path.toLowerCase();
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function appRouteFromPath(pathname: string) {
  const legacyView = appPathViews[normalizeAppPath(pathname)];
  if (legacyView) {
    return { view: legacyView, projectCode: null as string | null };
  }

  const segments = pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map(decodePathSegment);
  const [projectCode, section] = segments;
  const projectView = projectPathViews[section?.toLowerCase() ?? ""];
  if (projectCode && projectView) {
    return { view: projectView, projectCode };
  }

  return { view: "portfolio" as AppView, projectCode: null as string | null };
}

export function appViewFromPath(pathname: string): AppView {
  return appRouteFromPath(pathname).view;
}

export function isProjectSectionViewName(
  view: AppView,
): view is ProjectSectionView {
  return view in projectSectionSlugs;
}

export function isAdminSectionViewName(view: AppView): view is AdminSectionView {
  return adminSectionViews.includes(view as AdminSectionView);
}

export function isDevelopmentSectionViewName(
  view: AppView,
): view is DevelopmentSectionView {
  return developmentSectionViews.includes(view as DevelopmentSectionView);
}

export function isOperationsSectionViewName(view: AppView): view is OperationsSectionView {
  return operationsSectionViews.includes(view as OperationsSectionView);
}

export function appPathForView(view: AppView, projectCode?: string | null) {
  if (isProjectSectionViewName(view)) {
    const slug = projectSectionSlugs[view];
    return projectCode ? `/${encodeURIComponent(projectCode)}/${slug}` : `/${slug}`;
  }
  return appViewPaths[view] ?? "/portfolio";
}

export function normalizeProjectRouteCode(value: string) {
  return value.trim().toLowerCase();
}

export function initialAppView(): AppView {
  if (typeof window === "undefined") return "portfolio";
  return appViewFromPath(window.location.pathname);
}

export function initialRouteProjectCode() {
  if (typeof window === "undefined") return null;
  return appRouteFromPath(window.location.pathname).projectCode;
}
