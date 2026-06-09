import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { raidPayload } from "../app/formPayloads";
import {
  emptyRaidForm,
  type RaidFormState,
} from "../app/formState";
import { apiBase, authenticatedFetch } from "../app/http";
import { isoDate } from "../app/dateUtils";

type RaidStatusDraft = { statusAt: string; text: string };

type UseRaidControllerOptions = {
  projectId: string | null;
  raidForm: RaidFormState;
  setRaidForm: Dispatch<SetStateAction<RaidFormState>>;
  raidDrafts: Record<string, RaidFormState>;
  setRaidDrafts: Dispatch<SetStateAction<Record<string, RaidFormState>>>;
  raidStatusDrafts: Record<string, RaidStatusDraft>;
  setRaidStatusDrafts: Dispatch<SetStateAction<Record<string, RaidStatusDraft>>>;
  setExpandedRaidId: Dispatch<SetStateAction<string | null>>;
  refreshProject: (projectId?: string) => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useRaidController({
  projectId,
  raidForm,
  setRaidForm,
  raidDrafts,
  setRaidDrafts,
  raidStatusDrafts,
  setRaidStatusDrafts,
  setExpandedRaidId,
  refreshProject,
  setError,
  setNotice,
}: UseRaidControllerOptions) {
  const updateRaidDraft = useCallback(
    (itemId: string, patch: Partial<RaidFormState>) => {
      const current = raidDrafts[itemId];
      if (!current) return;
      setRaidDrafts({
        ...raidDrafts,
        [itemId]: { ...current, ...patch },
      });
    },
    [raidDrafts, setRaidDrafts],
  );

  const updateRaidStatusDraft = useCallback(
    (itemId: string, patch: Partial<RaidStatusDraft>) => {
      const current =
        raidStatusDrafts[itemId] ?? { statusAt: isoDate(new Date()), text: "" };
      setRaidStatusDrafts({
        ...raidStatusDrafts,
        [itemId]: { ...current, ...patch },
      });
    },
    [raidStatusDrafts, setRaidStatusDrafts],
  );

  const createRaidItem = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${projectId}/raid-items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(raidPayload(raidForm)),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось создать запись о риске",
          );
        }
        setRaidForm({ ...emptyRaidForm, type: raidForm.type });
        await refreshProject(projectId);
        setExpandedRaidId(result.id);
        setNotice("Запись о риске создана");
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось создать запись о риске",
        );
      }
    },
    [
      projectId,
      raidForm,
      refreshProject,
      setError,
      setExpandedRaidId,
      setNotice,
      setRaidForm,
    ],
  );

  const saveRaidItem = useCallback(
    async (itemId: string) => {
      const draft = raidDrafts[itemId];
      if (!draft) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(`${apiBase}/api/raid-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(raidPayload(draft)),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось сохранить запись о риске",
          );
        }
        await refreshProject();
        setNotice("Запись о риске обновлена");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить запись о риске",
        );
      }
    },
    [raidDrafts, refreshProject, setError, setNotice],
  );

  const addRaidStatusUpdate = useCallback(
    async (itemId: string) => {
      const draft =
        raidStatusDrafts[itemId] ?? { statusAt: isoDate(new Date()), text: "" };
      if (!draft.text.trim()) {
        setError("Заполните текст статуса");
        return;
      }
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/raid-items/${itemId}/status-updates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              statusAt: draft.statusAt || isoDate(new Date()),
              text: draft.text.trim(),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось добавить статус",
          );
        }
        setRaidStatusDrafts({
          ...raidStatusDrafts,
          [itemId]: { statusAt: isoDate(new Date()), text: "" },
        });
        await refreshProject();
        setNotice("Статус добавлен");
      } catch (statusError) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : "Не удалось добавить статус",
        );
      }
    },
    [raidStatusDrafts, refreshProject, setError, setNotice, setRaidStatusDrafts],
  );

  const deleteRaidItem = useCallback(
    async (itemId: string) => {
      if (!window.confirm("Удалить запись о риске?")) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(`${apiBase}/api/raid-items/${itemId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? "Не удалось удалить запись о риске");
        }
        await refreshProject();
        setNotice("Запись удалена");
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Не удалось удалить запись о риске",
        );
      }
    },
    [refreshProject, setError, setNotice],
  );

  return {
    updateRaidDraft,
    updateRaidStatusDraft,
    createRaidItem,
    saveRaidItem,
    addRaidStatusUpdate,
    deleteRaidItem,
  };
}
