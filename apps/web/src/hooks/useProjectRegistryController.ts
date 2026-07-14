import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { apiClient } from "../api/client";
import type { ProjectDetails, ProjectListItem } from "../app/domainTypes";
import { projectPayload } from "../app/formPayloads";
import {
  newProjectFormDefaults,
  projectToRegistryDraft,
  projectsToRegistryDrafts,
  type ProjectFormState,
  type ProjectRegistryDraft,
} from "../app/formState";
import { apiBase, authenticatedFetch } from "../app/http";
import type { AppView } from "../app/routes";

type OpenView = (
  nextView: AppView,
  options?: { replace?: boolean; projectCode?: string | null },
) => void;

type UseProjectRegistryControllerOptions = {
  projects: ProjectListItem[];
  setProjects: Dispatch<SetStateAction<ProjectListItem[]>>;
  project: ProjectDetails | null;
  setProject: Dispatch<SetStateAction<ProjectDetails | null>>;
  selectedProjectId: string | null;
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>;
  newProjectForm: ProjectFormState;
  setNewProjectForm: Dispatch<SetStateAction<ProjectFormState>>;
  projectRegistryDrafts: Record<string, ProjectRegistryDraft>;
  setProjectRegistryDrafts: Dispatch<
    SetStateAction<Record<string, ProjectRegistryDraft>>
  >;
  setSavingProjectRegistryId: Dispatch<SetStateAction<string | null>>;
  firstEnabledProjectView: AppView;
  openView: OpenView;
  refreshProject: (projectId?: string) => Promise<void>;
  reloadAuditEvents: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useProjectRegistryController({
  projects,
  setProjects,
  project,
  setProject,
  selectedProjectId,
  setSelectedProjectId,
  newProjectForm,
  setNewProjectForm,
  projectRegistryDrafts,
  setProjectRegistryDrafts,
  setSavingProjectRegistryId,
  firstEnabledProjectView,
  openView,
  refreshProject,
  reloadAuditEvents,
  setError,
  setNotice,
}: UseProjectRegistryControllerOptions) {
  const currentProjectId = project?.id ?? null;

  const applyProjectMasterRecord = useCallback(
    (updated: ProjectListItem) => {
      setProjects((currentProjects) =>
        currentProjects.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      setProjectRegistryDrafts((currentDrafts) => ({
        ...currentDrafts,
        [updated.id]: projectToRegistryDraft(updated),
      }));
      setSelectedProjectId((currentId) => currentId ?? updated.id);
      setProject((currentProject) => {
        if (currentProject?.id !== updated.id) return currentProject;
        return {
          ...currentProject,
          parentId: updated.parentId,
          code: updated.code,
          name: updated.name,
          portfolio: updated.portfolio,
          sponsor: updated.sponsor,
          projectManager: updated.projectManager,
          status: updated.status,
          rag: updated.rag,
          startDate: updated.startDate,
          initialTargetDate: updated.initialTargetDate,
          targetDate: updated.targetDate,
          progress: updated.progress,
          scheduleVariance: updated.scheduleVariance,
          budgetPlanned: updated.budgetPlanned,
          budgetForecast: updated.budgetForecast,
          summary: updated.summary,
          sortOrder: updated.sortOrder,
          uiState: updated.uiState,
          jiraIntegration: updated.jiraIntegration,
          targetDateChanges: updated.targetDateChanges,
          currentUserAccessLevel: updated.currentUserAccessLevel,
          _count: updated._count,
        };
      });
    },
    [setProject, setProjectRegistryDrafts, setProjects, setSelectedProjectId],
  );

  const reloadProjects = useCallback(
    async (selectedId?: string) => {
      const data = await apiClient.get<ProjectListItem[]>(
        "/api/projects",
        "Не удалось загрузить список проектов",
      );
      setProjects(data);
      setProjectRegistryDrafts(projectsToRegistryDrafts(data));
      if (selectedId) {
        setSelectedProjectId(selectedId);
      } else {
        setSelectedProjectId((currentId) => {
          if (currentId && data.some((item) => item.id === currentId)) {
            return currentId;
          }
          return (
            data.find((item) => item.status !== "CLOSED")?.id ??
            data[0]?.id ??
            null
          );
        });
      }
    },
    [setProjectRegistryDrafts, setProjects, setSelectedProjectId],
  );

  const createProject = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(`${apiBase}/api/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectPayload(newProjectForm)),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось создать проект",
          );
        }
        if (!result.id) {
          throw new Error("API не вернул идентификатор созданного проекта");
        }
        setNewProjectForm(newProjectFormDefaults());
        openView("project-structure", { replace: true });
        setSelectedProjectId(result.id);
        setProject(null);
        await reloadProjects(result.id);
        await refreshProject(result.id);
        await reloadAuditEvents();
        setNotice(`Проект ${result.code} создан`);
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось создать проект",
        );
      }
    },
    [
      newProjectForm,
      openView,
      refreshProject,
      reloadAuditEvents,
      reloadProjects,
      setError,
      setNewProjectForm,
      setNotice,
      setProject,
      setSelectedProjectId,
    ],
  );

  const updateProjectRegistryDraft = useCallback(
    (projectId: string, patch: Partial<ProjectRegistryDraft>) => {
      setProjectRegistryDrafts((current) => {
        const sourceProject = projects.find((item) => item.id === projectId);
        const currentDraft =
          current[projectId] ??
          (sourceProject ? projectToRegistryDraft(sourceProject) : null);
        if (!currentDraft) return current;
        return {
          ...current,
          [projectId]: {
            ...currentDraft,
            ...patch,
          },
        };
      });
    },
    [projects, setProjectRegistryDrafts],
  );

  const savePortfolioProjectIdentity = useCallback(
    async (projectId: string, draftOverride?: ProjectRegistryDraft) => {
      const draft = draftOverride ?? projectRegistryDrafts[projectId];
      if (!draft) return;
      const sourceProject = projects.find((item) => item.id === projectId);
      const code = draft.code.trim();
      const name = draft.name.trim();
      if (!code || !name) {
        setError("Код и наименование проекта обязательны");
        return;
      }
      if (
        sourceProject &&
        sourceProject.code === code &&
        sourceProject.name === name
      ) {
        return;
      }
      setSavingProjectRegistryId(projectId);
      setError(null);
      setNotice(null);
      try {
        const updated = await apiClient.patch<ProjectListItem>(
          `/api/projects/${projectId}`,
          { code, name },
          "Не удалось сохранить проект",
        );
        applyProjectMasterRecord(updated);
        await reloadProjects();
        if (currentProjectId === projectId) {
          await refreshProject(projectId);
        }
        await reloadAuditEvents();
        setNotice(`Проект ${code} обновлен`);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить проект",
        );
      } finally {
        setSavingProjectRegistryId(null);
      }
    },
    [
      applyProjectMasterRecord,
      currentProjectId,
      projectRegistryDrafts,
      projects,
      refreshProject,
      reloadAuditEvents,
      reloadProjects,
      setError,
      setNotice,
      setSavingProjectRegistryId,
    ],
  );

  const saveProjectPortfolio = useCallback(
    async (projectId: string) => {
      const draft = projectRegistryDrafts[projectId];
      if (!draft) return;
      const sourceProject = projects.find((item) => item.id === projectId);
      const portfolio = draft.portfolio.trim();
      if (!portfolio) {
        setError("Укажите портфель проекта");
        return;
      }
      if (sourceProject?.portfolio === portfolio) {
        return;
      }
      setSavingProjectRegistryId(projectId);
      setError(null);
      setNotice(null);
      try {
        const updated = await apiClient.patch<ProjectListItem>(
          `/api/projects/${projectId}`,
          { portfolio },
          "Не удалось сохранить портфель проекта",
        );
        applyProjectMasterRecord(updated);
        await reloadProjects(selectedProjectId ?? projectId);
        if (currentProjectId === projectId) {
          await refreshProject(projectId);
        }
        await reloadAuditEvents();
        setNotice("Портфель проекта обновлен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить портфель проекта",
        );
      } finally {
        setSavingProjectRegistryId(null);
      }
    },
    [
      applyProjectMasterRecord,
      currentProjectId,
      projectRegistryDrafts,
      projects,
      refreshProject,
      reloadAuditEvents,
      reloadProjects,
      selectedProjectId,
      setError,
      setNotice,
      setSavingProjectRegistryId,
    ],
  );

  const saveProjectRegistryItem = useCallback(
    async (projectId: string, draftOverride?: ProjectRegistryDraft) => {
      const draft = draftOverride ?? projectRegistryDrafts[projectId];
      if (!draft) return;
      const code = draft.code.trim();
      const name = draft.name.trim();
      if (!code || !name) {
        setError("Код и наименование проекта обязательны");
        return;
      }
      setSavingProjectRegistryId(projectId);
      setError(null);
      setNotice(null);
      try {
        const updated = await apiClient.patch<ProjectListItem>(
          `/api/projects/${projectId}`,
          {
            code,
            name,
            parentId: draft.parentId || null,
            projectManager:
              draft.projectManager.trim() || "Руководитель проекта",
            status: draft.status,
            rag: draft.rag,
            sortOrder: Number(draft.sortOrder) || 0,
          },
          "Не удалось сохранить проект",
        );
        applyProjectMasterRecord(updated);
        await reloadProjects(selectedProjectId ?? projectId);
        if (currentProjectId === projectId) {
          await refreshProject(projectId);
        }
        await reloadAuditEvents();
        setNotice(`Проект ${code} обновлен`);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить проект",
        );
      } finally {
        setSavingProjectRegistryId(null);
      }
    },
    [
      applyProjectMasterRecord,
      currentProjectId,
      projectRegistryDrafts,
      refreshProject,
      reloadAuditEvents,
      reloadProjects,
      selectedProjectId,
      setError,
      setNotice,
      setSavingProjectRegistryId,
    ],
  );

  const closeProject = useCallback(
    async (projectId: string) => {
      const sourceProject = projects.find((item) => item.id === projectId);
      if (!sourceProject) return;
      if (
        !window.confirm(
          `Закрыть проект ${sourceProject.code}? После закрытия проект будет доступен только для чтения даже администратору.`,
        )
      ) {
        return;
      }
      setSavingProjectRegistryId(projectId);
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${projectId}/close`,
          { method: "POST" },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error ?? "Не удалось закрыть проект");
        }
        await reloadProjects(
          selectedProjectId === projectId
            ? projects.find(
                (item) => item.id !== projectId && item.status !== "CLOSED",
              )?.id
            : selectedProjectId ?? undefined,
        );
        if (selectedProjectId === projectId) {
          setProject(null);
          openView("closed-projects");
        }
        await reloadAuditEvents();
        setNotice(`Проект ${sourceProject.code} закрыт`);
      } catch (closeError) {
        setError(
          closeError instanceof Error
            ? closeError.message
            : "Не удалось закрыть проект",
        );
      } finally {
        setSavingProjectRegistryId(null);
      }
    },
    [
      openView,
      projects,
      reloadAuditEvents,
      reloadProjects,
      selectedProjectId,
      setError,
      setNotice,
      setProject,
      setSavingProjectRegistryId,
    ],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const sourceProject = projects.find((item) => item.id === projectId);
      if (!sourceProject) return;
      setSavingProjectRegistryId(projectId);
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${projectId}`,
          { method: "DELETE" },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error ?? "Не удалось удалить проект");
        }
        const nextSelectedProjectId =
          selectedProjectId === projectId
            ? projects.find(
                (item) => item.id !== projectId && item.status !== "CLOSED",
              )?.id
            : selectedProjectId ?? undefined;
        await reloadProjects(nextSelectedProjectId);
        if (selectedProjectId === projectId) {
          setProject(null);
          openView(nextSelectedProjectId ? firstEnabledProjectView : "portfolio");
        }
        await reloadAuditEvents();
        setNotice(`Проект ${sourceProject.code} удален`);
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Не удалось удалить проект",
        );
      } finally {
        setSavingProjectRegistryId(null);
      }
    },
    [
      firstEnabledProjectView,
      openView,
      projects,
      reloadAuditEvents,
      reloadProjects,
      selectedProjectId,
      setError,
      setNotice,
      setProject,
      setSavingProjectRegistryId,
    ],
  );

  return {
    reloadProjects,
    createProject,
    updateProjectRegistryDraft,
    savePortfolioProjectIdentity,
    saveProjectPortfolio,
    saveProjectRegistryItem,
    closeProject,
    deleteProject,
  };
}
