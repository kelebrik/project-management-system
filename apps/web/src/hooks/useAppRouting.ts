import { useCallback, useEffect, useRef } from "react";
import { apiClient } from "../api/client";
import type { ProjectListItem } from "../app/domainTypes";
import { projectsToRegistryDrafts } from "../app/formState";
import {
  appPathForView,
  appRouteFromPath,
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

export function useAppRouting({
  activeView,
  authMode,
  firstEnabledProjectView,
  isAdminUser,
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

  useEffect(() => {
    const onPopState = () => {
      setError(null);
      setNotice(null);
      const route = appRouteFromPath(window.location.pathname);
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
  }, [projects, setActiveView, setError, setNotice, setSelectedProjectId]);

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
      if (isAdminSectionViewName(nextView) && !isAdminUser) {
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
      isAdminUser,
      isAuthenticated,
      isProjectModuleEnabled,
      project?.code,
      selectedProjectListItem?.code,
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
