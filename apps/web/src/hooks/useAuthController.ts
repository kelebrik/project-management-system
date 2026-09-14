import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ApiError, apiBase, apiClient } from "../api/client";
import type { AuthMode, CurrentUser } from "../app/adminTypes";
import {
  canAccessAdminView,
  isAdminSectionViewName,
  isDevelopmentSectionViewName,
  writeProtectedViews,
  type AppView,
} from "../app/routes";
import {
  normalizeProjectModulesForUi,
  projectModuleViewByKey,
  type ProjectModule,
} from "../app/projectModules";

type OpenViewOptions = {
  replace?: boolean;
  projectCode?: string | null;
};

type UseAuthControllerOptions = {
  authMode: AuthMode;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;
  setCurrentUser: Dispatch<SetStateAction<CurrentUser | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  activeView: AppView;
  selectedProjectId: string | null;
  projectCode: string | null;
  projectModules: ProjectModule[];
  isAuthenticated: boolean;
  isAdminUser: boolean;
  isDemoUser?: boolean;
  isBusinessUnitAdmin: boolean;
  isBusinessUnitAdminResolved: boolean;
  openView: (view: AppView, options?: OpenViewOptions) => void;
  resetAdminState: () => void;
};

export type KeycloakAuthStatus = {
  enabled: boolean;
  hostname: string | null;
  resolved: boolean;
};

export function useAuthController({
  authMode,
  setAuthMode,
  setCurrentUser,
  setLoading,
  setError,
  setNotice,
  activeView,
  selectedProjectId,
  projectCode,
  projectModules,
  isAuthenticated,
  isAdminUser,
  isDemoUser = false,
  isBusinessUnitAdmin,
  isBusinessUnitAdminResolved,
  openView,
  resetAdminState,
}: UseAuthControllerOptions) {
  const [keycloakStatus, setKeycloakStatus] = useState<KeycloakAuthStatus>({
    enabled: false,
    hostname: null,
    resolved: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function initializeAuth() {
      setLoading(true);
      try {
        const me = await apiClient.get<{ user: CurrentUser }>(
          "/api/auth/me",
          "Не удалось проверить сессию",
        );
        if (cancelled) return;
        setCurrentUser(me.user);
        setAuthMode("ready");
      } catch (authError) {
        if (cancelled) return;
        if (authError instanceof ApiError && authError.status === 401) {
          setCurrentUser(null);
          setAuthMode("login");
          setError(null);
        } else {
          setCurrentUser(null);
          setAuthMode("login");
          setError(
            authError instanceof Error
              ? authError.message
              : "Не удалось проверить сессию",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initializeAuth();

    return () => {
      cancelled = true;
    };
  }, [setAuthMode, setCurrentUser, setError, setLoading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refreshCurrentUser = () => {
      void apiClient
        .get<{ user: CurrentUser }>("/api/auth/me", "Не удалось обновить сессию")
        .then((result) => setCurrentUser(result.user))
        .catch(() => undefined);
    };
    const refreshVisibleSession = () => {
      if (document.visibilityState === "visible") refreshCurrentUser();
    };
    window.addEventListener("focus", refreshCurrentUser);
    document.addEventListener("visibilitychange", refreshVisibleSession);
    return () => {
      window.removeEventListener("focus", refreshCurrentUser);
      document.removeEventListener("visibilitychange", refreshVisibleSession);
    };
  }, [isAuthenticated, setCurrentUser]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<KeycloakAuthStatus>("/api/auth/keycloak/status")
      .then((status) => {
        if (!cancelled) setKeycloakStatus({ ...status, resolved: true });
      })
      .catch(() => {
        if (!cancelled) {
          setKeycloakStatus({ enabled: false, hostname: null, resolved: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      setCurrentUser(null);
      setAuthMode("login");
      setNotice(null);
      setError("Для доступа к системе нужно войти");
    };
    window.addEventListener("pms-auth-required", onAuthRequired);
    return () => {
      window.removeEventListener("pms-auth-required", onAuthRequired);
    };
  }, [setAuthMode, setCurrentUser, setError, setNotice]);

  useEffect(() => {
    if (authMode !== "ready") return;
    const shouldRedirect =
      (!isAuthenticated && writeProtectedViews.has(activeView)) ||
      (isAuthenticated &&
        isBusinessUnitAdminResolved &&
        (
          (isAdminSectionViewName(activeView) &&
            !canAccessAdminView(activeView, isAdminUser, isBusinessUnitAdmin) && !isDemoUser) ||
          (isDevelopmentSectionViewName(activeView) && !isAdminUser && !isDemoUser)
        ));
    if (!shouldRedirect) return;

    const fallbackProjectModule = normalizeProjectModulesForUi(projectModules).find(
      (module) => module.enabled,
    );
    const fallbackProjectView = fallbackProjectModule
      ? projectModuleViewByKey[fallbackProjectModule.key]
      : "project-overview";
    const fallbackView = selectedProjectId ? fallbackProjectView : "portfolio";
    const redirectId = window.setTimeout(() => {
      setError(null);
      setNotice(null);
      openView(fallbackView, { replace: true, projectCode });
    }, 0);
    return () => window.clearTimeout(redirectId);
  }, [
    activeView,
    authMode,
    isAdminUser,
    isDemoUser,
    isBusinessUnitAdmin,
    isBusinessUnitAdminResolved,
    isAuthenticated,
    openView,
    projectCode,
    projectModules,
    selectedProjectId,
    setError,
    setNotice,
  ]);

  const logout = useCallback(async () => {
    setError(null);
    setNotice(null);
    await apiClient
      .post<null>("/api/auth/logout", undefined, "Не удалось выйти")
      .catch(() => null);
    setCurrentUser(null);
    setAuthMode("login");
    resetAdminState();
    setNotice(null);
  }, [
    resetAdminState,
    setAuthMode,
    setCurrentUser,
    setError,
    setNotice,
  ]);

  const loginWithKeycloak = useCallback(() => {
    const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(
      `${apiBase}/api/auth/keycloak/login?redirect=${encodeURIComponent(redirect)}`,
    );
  }, []);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setNotice(null);
      try {
        const result = await apiClient.post<{ user: CurrentUser }>(
          "/api/auth/login",
          { email, password },
          "Не удалось войти",
        );
        setCurrentUser(result.user);
        setAuthMode("ready");
      } catch (authError) {
        setError(
          authError instanceof Error ? authError.message : "Не удалось выполнить вход",
        );
      }
    },
    [setAuthMode, setCurrentUser, setError, setNotice],
  );

  return { logout, keycloakStatus, loginWithKeycloak, loginWithPassword };
}
