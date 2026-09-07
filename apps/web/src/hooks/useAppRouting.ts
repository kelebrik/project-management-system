import { useCallback, useEffect, useRef } from "react";
import { apiClient } from "../api/client";
import type { ProjectListItem } from "../app/domainTypes";
import { pickDefaultProject } from "../app/defaultProject";
import { projectsToRegistryDrafts } from "../app/formState";
import {
  appPathForView,
  appRouteFromPath,
  canAccessAdminView,
  initialRouteProjectCode,
  isAdminSectionViewName,
  isDevelopmentSectionViewName,
  isProjectSectionViewName,
  normalizeAppPath,
  normalizeProjectRouteCode,
  writeProtectedViews,
  type AppView,
} from "../app/routes";
import { projectModuleKeyByView } from "../app/projectModules";

type AppRoutingDeps = Record<string, any>;

const LEGACY_PORTFOLIO_ROADMAP_PATHS = new Set([
  "/portfolio-v2",
  "/development/portfolio-v2",
]);

export function useAppRouting({
  activeView,
  authMode,
  firstEnabledProjectView,
  isAdminUser,
  isBusinessUnitAdmin,
  isAuthenticated,
  isProjectModuleEnabled,
  project,
  projects,
  selectedProjectListItem,
  setActiveView,
  setAuthMode,
  setError,
  setLoading,
  setNotice,
  setProjectRegistryDrafts,
  setProjects,
  setSelectedProjectId,
}: AppRoutingDeps) {
  const initialProjectCodeRef = useRef<string | null>(initialRouteProjectCode());
  const pendingDefaultProjectRef = useRef(false);
  const selectDefaultProject = useCallback(() => {
    const nextProject = pickDefaultProject(projects as ProjectListItem[]);
    pendingDefaultProjectRef.current = !nextProject;
    if (nextProject) setSelectedProjectId(nextProject.id);
  }, [projects, setSelectedProjectId]);

  useEffect(() => {
    const onPopState = () => {
      setError(null);
      setNotice(null);
      const route = appRouteFromPath(window.location.pathname);
      pendingDefaultProjectRef.current = false;
      if (activeView === "portfolio" && route.view === "projects" && !route.projectCode) {
        selectDefaultProject();
      }
      setActiveView(route.view);
      if (route.projectCode) {
        const nextProject = projects.find(
          (item: ProjectListItem) =>
            normalizeProjectRouteCode(item.code) ===
            normalizeProjectRouteCode(route.projectCode ?? ""),
        );
        if (nextProject) {
          setSelectedProjectId(nextProject.id);
        } else {
          initialProjectCodeRef.current = route.projectCode;
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activeView, projects, selectDefaultProject, setActiveView, setError, setNotice, setSelectedProjectId]);

  useEffect(() => {
    if (activeView !== "portfolio") return;
    if (!LEGACY_PORTFOLIO_ROADMAP_PATHS.has(normalizeAppPath(window.location.pathname))) {
      return;
    }
    window.history.replaceState(
      null,
      "",
      `/portfolio${window.location.search}#roadmap-v2`,
    );
  }, [activeView]);

  useEffect(() => {
    if (authMode !== "ready") return;
    let cancelled = false;
    async function loadProjects() {
      setLoading(true);
      try {
        const data = await apiClient.get<ProjectListItem[]>(
          "/api/projects",
          "Не удалось загрузить список проектов",
        );
        if (cancelled) return;
        const firstProject =
          data.find((item) => item.status !== "CLOSED") ?? data[0];
        const routeProjectCode = initialProjectCodeRef.current;
        const routeProject = routeProjectCode
          ? data.find(
              (item) =>
                normalizeProjectRouteCode(item.code) ===
                normalizeProjectRouteCode(routeProjectCode),
            )
          : null;
        setProjects(data);
        setProjectRegistryDrafts(projectsToRegistryDrafts(data));
        setSelectedProjectId(
          (current: string | null) =>
            current ?? routeProject?.id ?? firstProject?.id ?? null,
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить список проектов",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [
    authMode,
    setError,
    setLoading,
    setProjectRegistryDrafts,
    setProjects,
    setSelectedProjectId,
  ]);

  const openView = useCallback(
    (
      nextView: AppView,
      options?: { replace?: boolean; projectCode?: string | null },
    ) => {
      setError(null);
      setNotice(null);
      if (!isAuthenticated && writeProtectedViews.has(nextView)) {
        setAuthMode("login");
        setError("Для редактирования нужно войти в систему");
        return;
      }
      if (
        isAdminSectionViewName(nextView) &&
        !canAccessAdminView(nextView, isAdminUser, isBusinessUnitAdmin)
      ) {
        setError("Раздел администрирования доступен только администратору");
        return;
      }
      if (isDevelopmentSectionViewName(nextView) && !isAdminUser) {
        setError("Раздел разработки доступен только администратору");
        return;
      }
      if (
        isProjectSectionViewName(nextView) &&
        !isProjectModuleEnabled(projectModuleKeyByView[nextView])
      ) {
        setError("Страница проекта отключена администратором");
        return;
      }
      pendingDefaultProjectRef.current = false;
      if (activeView === "portfolio" && nextView === "projects" && !options?.projectCode) {
        selectDefaultProject();
      }
      setActiveView(nextView);
      const routeProjectCode =
        options?.projectCode ??
        (isDevelopmentSectionViewName(nextView)
          ? null
          : selectedProjectListItem?.code ?? project?.code ?? null);
      const nextPath = appPathForView(nextView, routeProjectCode);
      if (window.location.pathname !== nextPath) {
        const nextUrl = `${nextPath}${window.location.search}${window.location.hash}`;
        if (options?.replace) {
          window.history.replaceState(null, "", nextUrl);
        } else {
          window.history.pushState(null, "", nextUrl);
        }
      }
    },
    [
      activeView,
      isAdminUser,
      isBusinessUnitAdmin,
      isAuthenticated,
      isProjectModuleEnabled,
      project?.code,
      selectedProjectListItem?.code,
      selectDefaultProject,
      setActiveView,
      setAuthMode,
      setError,
      setNotice,
    ],
  );

  useEffect(() => {
    const routeProjectCode = initialProjectCodeRef.current;
    if (!routeProjectCode || projects.length === 0) return;
    const routeProject = projects.find(
      (item: ProjectListItem) =>
        normalizeProjectRouteCode(item.code) ===
        normalizeProjectRouteCode(routeProjectCode),
    );
    if (!routeProject) {
      setError(`Проект ${routeProjectCode} не найден`);
      initialProjectCodeRef.current = null;
      return;
    }
    setSelectedProjectId(routeProject.id);
    initialProjectCodeRef.current = null;
  }, [projects, setError, setSelectedProjectId]);

  // Resolve after the initial deep link so a later portfolio transition takes precedence.
  useEffect(() => {
    if (activeView !== "projects") {
      pendingDefaultProjectRef.current = false;
    } else if (pendingDefaultProjectRef.current && projects.length > 0) {
      selectDefaultProject();
    }
  }, [activeView, projects, selectDefaultProject]);

  useEffect(() => {
    if (!selectedProjectListItem || !isProjectSectionViewName(activeView)) {
      return;
    }
    const expectedPath = appPathForView(activeView, selectedProjectListItem.code);
    if (
      normalizeAppPath(window.location.pathname) !==
      normalizeAppPath(expectedPath)
    ) {
      window.history.replaceState(
        null,
        "",
        `${expectedPath}${window.location.search}${window.location.hash}`,
      );
    }
  }, [activeView, selectedProjectListItem]);

  useEffect(() => {
    if (!isProjectSectionViewName(activeView)) return;
    if (isProjectModuleEnabled(projectModuleKeyByView[activeView])) return;
    openView(firstEnabledProjectView, { replace: true });
  }, [activeView, firstEnabledProjectView, isProjectModuleEnabled, openView]);

  return { openView };
}
