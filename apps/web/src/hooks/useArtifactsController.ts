import { useCallback, type Dispatch, type SetStateAction } from "react";
import { artifactPayload } from "../app/formPayloads";
import {
  emptyArtifactForm,
  type ArtifactFormState,
} from "../app/formState";
import { apiBase, authenticatedFetch } from "../app/http";
import type { ProjectDetails } from "../app/domainTypes";

type UseArtifactsControllerOptions = {
  project: ProjectDetails | null;
  artifactDrafts: Record<string, ArtifactFormState>;
  setArtifactDrafts: Dispatch<SetStateAction<Record<string, ArtifactFormState>>>;
  setExpandedArtifactId: Dispatch<SetStateAction<string | null>>;
  refreshProject: (projectId?: string) => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useArtifactsController({
  project,
  artifactDrafts,
  setArtifactDrafts,
  setExpandedArtifactId,
  refreshProject,
  setError,
  setNotice,
}: UseArtifactsControllerOptions) {
  const updateArtifactDraft = useCallback(
    (artifactId: string, patch: Partial<ArtifactFormState>) => {
      const current = artifactDrafts[artifactId];
      if (!current) return;
      setArtifactDrafts({
        ...artifactDrafts,
        [artifactId]: { ...current, ...patch },
      });
    },
    [artifactDrafts, setArtifactDrafts],
  );

  const saveArtifact = useCallback(
    async (artifactId: string) => {
      const draft = artifactDrafts[artifactId];
      if (!draft) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/project-artifacts/${artifactId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(artifactPayload(draft)),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось сохранить артефакт",
          );
        }
        await refreshProject();
        setNotice("Артефакт обновлен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить артефакт",
        );
      }
    },
    [artifactDrafts, refreshProject, setError, setNotice],
  );

  const deleteArtifact = useCallback(
    async (artifactId: string) => {
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/project-artifacts/${artifactId}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? "Не удалось удалить артефакт");
        }
        await refreshProject();
        setNotice("Артефакт удален");
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Не удалось удалить артефакт",
        );
      }
    },
    [refreshProject, setError, setNotice],
  );

  const createArtifactRow = useCallback(
    async (afterArtifactId?: string) => {
      if (!project) return;
      const currentArtifacts = [...project.artifacts].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );
      const afterIndex = afterArtifactId
        ? currentArtifacts.findIndex((artifact) => artifact.id === afterArtifactId)
        : currentArtifacts.length - 1;
      const sortOrder =
        afterIndex >= 0
          ? currentArtifacts[afterIndex].sortOrder + 1
          : currentArtifacts.length + 1;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${project.id}/artifacts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              artifactPayload({
                ...emptyArtifactForm,
                title: "Новый артефакт",
                owner: project.projectManager,
                sortOrder: String(sortOrder),
              }),
            ),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось создать артефакт",
          );
        }
        const orderedIds = currentArtifacts.map((artifact) => artifact.id);
        const insertIndex = afterIndex >= 0 ? afterIndex + 1 : orderedIds.length;
        orderedIds.splice(insertIndex, 0, result.id);
        await authenticatedFetch(`${apiBase}/api/projects/${project.id}/artifacts/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        });
        await refreshProject(project.id);
        setExpandedArtifactId(result.id);
        setNotice("Артефакт добавлен");
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось создать артефакт",
        );
      }
    },
    [project, refreshProject, setError, setExpandedArtifactId, setNotice],
  );

  const moveArtifact = useCallback(
    async (artifactId: string, direction: -1 | 1) => {
      if (!project) return;
      const sortedArtifacts = [...project.artifacts].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );
      const currentIndex = sortedArtifacts.findIndex(
        (artifact) => artifact.id === artifactId,
      );
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedArtifacts.length) {
        return;
      }
      const nextArtifacts = [...sortedArtifacts];
      [nextArtifacts[currentIndex], nextArtifacts[nextIndex]] = [
        nextArtifacts[nextIndex],
        nextArtifacts[currentIndex],
      ];
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${project.id}/artifacts/reorder`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderedIds: nextArtifacts.map((artifact) => artifact.id),
            }),
          },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.error ?? "Не удалось переместить артефакт");
        }
        await refreshProject(project.id);
      } catch (moveError) {
        setError(
          moveError instanceof Error
            ? moveError.message
            : "Не удалось переместить артефакт",
        );
      }
    },
    [project, refreshProject, setError, setNotice],
  );

  return {
    updateArtifactDraft,
    saveArtifact,
    deleteArtifact,
    createArtifactRow,
    moveArtifact,
  };
}
