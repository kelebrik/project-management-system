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
import { useI18n } from "../i18n/I18nProvider";
import { useConfirm } from "./useConfirm";

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
  const { t: uiText } = useI18n();
  const confirm = useConfirm();
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
              uiText("ui.projects.raidCreateFailed"),
          );
        }
        setRaidForm({ ...emptyRaidForm, type: raidForm.type });
        await refreshProject(projectId);
        setExpandedRaidId(result.id);
        setNotice(uiText("ui.projects.raidCreated"));
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : uiText("ui.projects.raidCreateFailed"),
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
      uiText,
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
              uiText("ui.projects.raidSaveFailed"),
          );
        }
        await refreshProject();
        setNotice(uiText("ui.projects.raidSaved"));
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : uiText("ui.projects.raidSaveFailed"),
        );
      }
    },
    [raidDrafts, refreshProject, setError, setNotice, uiText],
  );

  const patchRaidItem = useCallback(
    async (
      itemId: string,
      patch: Partial<ReturnType<typeof raidPayload>>,
      successMessage: string,
      fallbackError: string,
    ) => {
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(`${apiBase}/api/raid-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") || result.error || fallbackError,
          );
        }
        await refreshProject();
        setNotice(successMessage);
      } catch (patchError) {
        setError(patchError instanceof Error ? patchError.message : fallbackError);
      }
    },
    [refreshProject, setError, setNotice],
  );

  const convertRiskToProblem = useCallback(
    async (itemId: string) => {
      if (
        !(await confirm({
          title: uiText("ui.projects.raidConvertToProblemTitle"),
          message: uiText("ui.projects.raidConvertToProblemMessage"),
          confirmLabel: uiText("ui.projects.raidConvertConfirmLabel"),
          tone: "default",
        }))
      ) return;
      await patchRaidItem(
        itemId,
        { type: "DEPENDENCY" },
        uiText("ui.projects.raidConvertedToProblem"),
        uiText("ui.projects.raidConvertToProblemFailed"),
      );
    },
    [confirm, patchRaidItem, uiText],
  );

  const convertRiskToAssumption = useCallback(
    async (itemId: string) => {
      if (
        !(await confirm({
          title: uiText("ui.projects.raidConvertToAssumptionTitle"),
          message:
            uiText("ui.projects.raidConvertToAssumptionMessage"),
          confirmLabel: uiText("ui.projects.raidConvertConfirmLabel"),
          tone: "default",
        }))
      ) return;
      await patchRaidItem(
        itemId,
        { type: "ASSUMPTION", linkedRiskId: null },
        uiText("ui.projects.raidConvertedToAssumption"),
        uiText("ui.projects.raidConvertToAssumptionFailed"),
      );
    },
    [confirm, patchRaidItem, uiText],
  );

  const closeRaidItem = useCallback(
    async (itemId: string) => {
      if (
        !(await confirm({
          title: uiText("ui.projects.raidCloseEntryTitle"),
          message: uiText("ui.projects.raidCloseEntryMessage"),
          confirmLabel: uiText("ui.projects.raidCloseEntryConfirmLabel"),
          tone: "default",
        }))
      ) return;
      await patchRaidItem(
        itemId,
        { status: "CLOSED" },
        uiText("ui.projects.raidEntryClosed"),
        uiText("ui.projects.raidCloseEntryFailed"),
      );
    },
    [confirm, patchRaidItem, uiText],
  );

  const addRaidStatusUpdate = useCallback(
    async (itemId: string) => {
      const draft =
        raidStatusDrafts[itemId] ?? { statusAt: isoDate(new Date()), text: "" };
      if (!draft.text.trim()) {
        setError(uiText("ui.projects.raidStatusTextRequired"));
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
              uiText("ui.projects.raidStatusAddFailed"),
          );
        }
        setRaidStatusDrafts({
          ...raidStatusDrafts,
          [itemId]: { statusAt: isoDate(new Date()), text: "" },
        });
        await refreshProject();
        setNotice(uiText("ui.projects.raidStatusAdded"));
      } catch (statusError) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : uiText("ui.projects.raidStatusAddFailed"),
        );
      }
    },
    [raidStatusDrafts, refreshProject, setError, setNotice, setRaidStatusDrafts, uiText],
  );

  const deleteRaidItem = useCallback(
    async (itemId: string) => {
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(`${apiBase}/api/raid-items/${itemId}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? uiText("ui.projects.raidDeleteFailed"));
        }
        await refreshProject();
        setNotice(uiText("ui.projects.raidEntryDeleted"));
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : uiText("ui.projects.raidDeleteFailed"),
        );
      }
    },
    [refreshProject, setError, setNotice, uiText],
  );

  return {
    updateRaidDraft,
    updateRaidStatusDraft,
    createRaidItem,
    saveRaidItem,
    convertRiskToProblem,
    convertRiskToAssumption,
    closeRaidItem,
    addRaidStatusUpdate,
    deleteRaidItem,
  };
}
