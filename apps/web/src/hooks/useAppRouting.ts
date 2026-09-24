import { useCallback, useEffect, useRef } from "react";
import { apiClient } from "../api/client";
import type { ProjectListItem } from "../app/domainTypes";
import { pickDefaultProject } from "../app/defaultProject";
import { projectsToRegistryDrafts } from "../app/formState";
import {
  appPathForView,
  appRouteFromPath,
  canViewAppView,
  initialRouteProjectCode,
  isAdminSectionViewName,
  isProjectSectionViewName,
  isDevelopmentSectionViewName,
  normalizeAppPath,
  normalizeProjectRouteCode,
  writeProtectedViews,
  type AppView,
} from "../app/routes";
import { projectModuleKeyByView } from "../app/projectModules";
import { useI18n } from "../i18n/I18nProvider";
import { hasPendingWbsBuffers } from "../components/WbsBufferedInput";

type AppRoutingDeps = Record<string, any>;

export function useAppRouting({
  activeView,
  authMode,
  firstEnabledProjectView,
  sectionAccess,
  isAuthenticated,
  isProjectModuleEnabled,
  dirtyWbsItemIds,
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
  const { t: uiText } = useI18n();
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
    if (authMode !== "ready") return;
    let cancelled = false;
    async function loadProjects() {
      setLoading(true);
      try {
        const data = await apiClient.get<ProjectListItem[]>(
          "/api/projects",
          uiText("ui.common.routeProjectsLoadFailed"),
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
            : uiText("ui.common.routeProjectsLoadFailed"),
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
    uiText,
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
        setError(uiText("ui.common.routeSignInToEdit"));
        return;
      }
      if (
        typeof window !== "undefined" &&
        ((window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved ||
          (dirtyWbsItemIds?.size ?? 0) > 0 ||
          hasPendingWbsBuffers()) &&
        !window.confirm(uiText("ui.common.routeUnsavedChangesConfirm"))
      ) {
        return;
      }
      if (!canViewAppView(nextView, sectionAccess)) {
        setError(
          uiText(
            isAdminSectionViewName(nextView)
              ? "ui.common.routeAdminSectionForbidden"
              : "ui.common.routeDevelopmentSectionForbidden",
          ),
        );
        return;
      }
      if (
        isProjectSectionViewName(nextView) &&
        !isProjectModuleEnabled(projectModuleKeyByView[nextView])
      ) {
        setError(uiText("ui.common.routeProjectPageDisabled"));
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
        const nextHash = nextView === "portfolio" ? "" : window.location.hash;
        const nextUrl = `${nextPath}${window.location.search}${nextHash}`;
        if (options?.replace) {
          window.history.replaceState(null, "", nextUrl);
        } else {
          window.history.pushState(null, "", nextUrl);
        }
      }
    },
    [
      activeView,
      sectionAccess,
      isAuthenticated,
      isProjectModuleEnabled,
      dirtyWbsItemIds,
      project?.code,
      selectedProjectListItem?.code,
      selectDefaultProject,
      setActiveView,
      setAuthMode,
      setError,
      setNotice,
      uiText,
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
      setError(uiText("ui.common.routeProjectNotFound", { code: routeProjectCode }));
      initialProjectCodeRef.current = null;
      return;
    }
    setSelectedProjectId(routeProject.id);
    initialProjectCodeRef.current = null;
  }, [projects, setError, setSelectedProjectId, uiText]);

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
