import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { ApiError, apiBase, apiClient } from "../api/client";
import type {
  AuthFormState,
  AuthMode,
  CurrentUser,
} from "../app/adminTypes";
import {
  isAdminSectionViewName,
  isDevelopmentSectionViewName,
  writeProtectedViews,
  type AppView,
  type ProjectSectionView,
} from "../app/routes";
import {
  normalizeProjectModulesForUi,
  projectModuleViewByKey,
  type ProjectModule,
} from "../app/projectModules";
import { emptyAuthForm } from "../app/formState";

type OpenViewOptions = {
  replace?: boolean;
  projectCode?: string | null;
};

type UseAuthControllerOptions = {
  authMode: AuthMode;
  setAuthMode: Dispatch<SetStateAction<AuthMode>>;
  authForm: AuthFormState;
  setAuthForm: Dispatch<SetStateAction<AuthFormState>>;
  setAuthSubmitting: Dispatch<SetStateAction<boolean>>;
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
  firstEnabledProjectView: ProjectSectionView;
  openView: (view: AppView, options?: OpenViewOptions) => void;
  resetAdminState: () => void;
};

export type KeycloakAuthStatus = {
  enabled: boolean;
  hostname: string | null;
};

export function useAuthController({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  setAuthSubmitting,
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
  firstEnabledProjectView,
  openView,
  resetAdminState,
}: UseAuthControllerOptions) {
  const [keycloakStatus, setKeycloakStatus] = useState<KeycloakAuthStatus>({
    enabled: false,
    hostname: null,
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
          try {
            const setup = await apiClient.get<{ needsSetup: boolean }>(
              "/api/auth/setup-status",
              "Не удалось проверить первичную настройку",
            );
            if (cancelled) return;
            setAuthMode(setup.needsSetup ? "setup" : "ready");
          } catch (setupError) {
            setAuthMode("ready");
            setError(
              setupError instanceof Error
                ? setupError.message
                : "Не удалось проверить первичную настройку",
            );
          }
        } else {
          setAuthMode("ready");
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
    let cancelled = false;
    apiClient
      .get<KeycloakAuthStatus>("/api/auth/keycloak/status")
      .then((status) => {
        if (!cancelled) setKeycloakStatus(status);
      })
      .catch(() => {
        if (!cancelled) setKeycloakStatus({ enabled: false, hostname: null });
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
      setError("Для редактирования нужно войти в систему");
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
        ((isAdminSectionViewName(activeView) && activeView !== "admin-project-access") ||
          isDevelopmentSectionViewName(activeView)) &&
        !isAdminUser);
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
    isAuthenticated,
    openView,
    projectCode,
    projectModules,
    selectedProjectId,
    setError,
    setNotice,
  ]);

  const submitAuth = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAuthSubmitting(true);
      setError(null);
      setNotice(null);
      try {
        const path =
          authMode === "setup" ? "/api/auth/bootstrap" : "/api/auth/login";
        const payload =
          authMode === "setup"
            ? authForm
            : { email: authForm.email, password: authForm.password };
        const result = await apiClient.post<{ user: CurrentUser }>(
          path,
          payload,
          authMode === "setup"
            ? "Не удалось создать администратора"
            : "Не удалось войти",
        );
        setCurrentUser(result.user);
        setAuthMode("ready");
        setAuthForm(emptyAuthForm);
        setNotice(authMode === "setup" ? "Администратор создан" : "Вход выполнен");
      } catch (authError) {
        setError(
          authError instanceof Error
            ? authError.message
            : "Не удалось выполнить вход",
        );
      } finally {
        setAuthSubmitting(false);
      }
    },
    [
      authForm,
      authMode,
      setAuthForm,
      setAuthMode,
      setAuthSubmitting,
      setCurrentUser,
      setError,
      setNotice,
    ],
  );

  const logout = useCallback(async () => {
    setError(null);
    setNotice(null);
    await apiClient
      .post<null>("/api/auth/logout", undefined, "Не удалось выйти")
      .catch(() => null);
    setCurrentUser(null);
    setAuthMode("ready");
    if (writeProtectedViews.has(activeView)) {
      openView(selectedProjectId ? firstEnabledProjectView : "portfolio", {
        replace: true,
        projectCode,
      });
    }
    resetAdminState();
    setNotice("Включен режим только для просмотра");
  }, [
    activeView,
    firstEnabledProjectView,
    openView,
    projectCode,
    resetAdminState,
    selectedProjectId,
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

  return { submitAuth, logout, keycloakStatus, loginWithKeycloak };
}
