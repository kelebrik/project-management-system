export type AppView =
  | "portfolio"
  | "project-create"
  | "project-overview"
  | "project-passport"
  | "project-structure"
  | "project-gantt"
  | "project-issues"
  | "project-raid"
  | "project-changes"
  | "project-resources"
  | "project-budget"
  | "project-calendars"
  | "project-artifacts"
  | "closed-projects"
  | "admin"
  | "admin-users"
  | "admin-roles"
  | "admin-dictionaries"
  | "admin-templates"
  | "admin-rag"
  | "admin-workflows"
  | "admin-jira"
  | "admin-integrations"
  | "admin-health"
  | "admin-backups"
  | "admin-config"
  | "admin-projects"
  | "admin-modules"
  | "admin-audit";

export type ProjectSectionView = Extract<
  AppView,
  | "project-overview"
  | "project-passport"
  | "project-structure"
  | "project-gantt"
  | "project-issues"
  | "project-raid"
  | "project-changes"
  | "project-resources"
  | "project-budget"
  | "project-calendars"
  | "project-artifacts"
>;

export type AdminSectionView = Extract<
  AppView,
  | "admin"
  | "admin-users"
  | "admin-roles"
  | "admin-dictionaries"
  | "admin-templates"
  | "admin-rag"
  | "admin-workflows"
  | "admin-jira"
  | "admin-integrations"
  | "admin-health"
  | "admin-backups"
  | "admin-config"
  | "admin-projects"
  | "admin-modules"
  | "admin-audit"
>;

export type FullscreenWorkspaceView = Extract<
  AppView,
  "project-structure" | "project-gantt"
> | "overview-milestones-by-phase" | "overview-milestones-all";

export const adminSectionViews: AdminSectionView[] = [
  "admin",
  "admin-users",
  "admin-roles",
  "admin-dictionaries",
  "admin-templates",
  "admin-rag",
  "admin-workflows",
  "admin-jira",
  "admin-integrations",
  "admin-health",
  "admin-backups",
  "admin-config",
  "admin-projects",
  "admin-modules",
  "admin-audit",
];

export const writeProtectedViews = new Set<AppView>([
  "project-create",
  ...adminSectionViews,
]);

export const projectSectionSlugs: Record<ProjectSectionView, string> = {
  "project-overview": "overview",
  "project-passport": "passport",
  "project-structure": "wbs",
  "project-gantt": "gantt",
  "project-issues": "issues",
  "project-raid": "risks",
  "project-changes": "changes",
  "project-resources": "resources",
  "project-budget": "budget",
  "project-calendars": "calendars",
  "project-artifacts": "artifacts",
};

export const appViewPaths: Record<AppView, string> = {
  portfolio: "/portfolio",
  "project-create": "/new-project",
  "project-overview": "/overview",
  "project-passport": "/passport",
  "project-structure": "/wbs",
  "project-gantt": "/gantt",
  "project-issues": "/issues",
  "project-raid": "/risks",
  "project-changes": "/changes",
  "project-resources": "/resources",
  "project-budget": "/budget",
  "project-calendars": "/calendars",
  "project-artifacts": "/artifacts",
  "closed-projects": "/closed-projects",
  admin: "/admin",
  "admin-users": "/admin/users",
  "admin-roles": "/admin/roles",
  "admin-dictionaries": "/admin/dictionaries",
  "admin-templates": "/admin/templates",
  "admin-rag": "/admin/rag",
  "admin-workflows": "/admin/workflows",
  "admin-jira": "/admin/jira",
  "admin-integrations": "/admin/integrations",
  "admin-health": "/admin/health",
  "admin-backups": "/admin/backups",
  "admin-config": "/admin/config",
  "admin-projects": "/admin/projects",
  "admin-modules": "/admin/modules",
  "admin-audit": "/admin/audit",
};

export const projectPathViews: Record<string, ProjectSectionView> = {
  overview: "project-overview",
  passport: "project-passport",
  wbs: "project-structure",
  structure: "project-structure",
  gantt: "project-gantt",
  issues: "project-issues",
  "open-issues": "project-issues",
  risks: "project-raid",
  raid: "project-raid",
  changes: "project-changes",
  resources: "project-resources",
  budget: "project-budget",
  calendars: "project-calendars",
  calendar: "project-calendars",
  artifacts: "project-artifacts",
};

export const appPathViews: Record<string, AppView> = {
  "/": "portfolio",
  "/portfolio": "portfolio",
  "/projects": "portfolio",
  "/new-project": "project-create",
  "/create-project": "project-create",
  "/overview": "project-overview",
  "/passport": "project-passport",
  "/wbs": "project-structure",
  "/structure": "project-structure",
  "/gantt": "project-gantt",
  "/issues": "project-issues",
  "/open-issues": "project-issues",
  "/risks": "project-raid",
  "/raid": "project-raid",
  "/changes": "project-changes",
  "/resources": "project-resources",
  "/budget": "project-budget",
  "/calendars": "project-calendars",
  "/calendar": "project-calendars",
  "/artifacts": "project-artifacts",
  "/closed-projects": "closed-projects",
  "/closed": "closed-projects",
  "/admin": "admin-projects",
  "/admin/users": "admin-users",
  "/admin/roles": "admin-roles",
  "/admin/dictionaries": "admin-dictionaries",
  "/admin/templates": "admin-templates",
  "/admin/rag": "admin-rag",
  "/admin/workflows": "admin-workflows",
  "/admin/jira": "admin-jira",
  "/admin/integrations": "admin-integrations",
  "/admin/health": "admin-health",
  "/admin/backups": "admin-backups",
  "/admin/config": "admin-config",
  "/admin/projects": "admin-projects",
  "/admin/modules": "admin-modules",
  "/admin/audit": "admin-audit",
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
