import { useI18n } from "../i18n/I18nProvider";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  ProjectDetails,
  WbsCriticalPath,
  WbsDependency,
  WbsItem,
  WbsSnapshot,
} from "../app/domainTypes";
import { wbsToForm } from "../app/formState";
import { apiBase, authenticatedFetch } from "../app/http";
import { wbsSnapshotsEqual } from "../app/wbsTree";
import { useConfirm } from "./useConfirm";

type WbsSnapshotActionDeps = {
  project: ProjectDetails | null;
  projectRef: MutableRefObject<ProjectDetails | null>;
  refreshProject: (projectId?: string) => Promise<void>;
  restoringWbsSnapshot: boolean;
  setCollapsedWbsIds: Dispatch<SetStateAction<Set<string>>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setProject: Dispatch<SetStateAction<ProjectDetails | null>>;
  setRestoringWbsSnapshot: Dispatch<SetStateAction<boolean>>;
  setSavingBaseline: Dispatch<SetStateAction<boolean>>;
  setWbsDrafts: Dispatch<SetStateAction<Record<string, ReturnType<typeof wbsToForm>>>>;
  setWbsRedoHistory: (nextStack: WbsSnapshot[]) => void;
  setWbsUndoHistory: (nextStack: WbsSnapshot[]) => void;
  wbsDraftsRef: MutableRefObject<Record<string, ReturnType<typeof wbsToForm>>>;
  wbsRedoStackRef: MutableRefObject<WbsSnapshot[]>;
  wbsUndoStackRef: MutableRefObject<WbsSnapshot[]>;
};

export function useWbsSnapshotActions({
  project,
  projectRef,
  refreshProject,
  restoringWbsSnapshot,
  setCollapsedWbsIds,
  setError,
  setNotice,
  setProject,
  setRestoringWbsSnapshot,
  setSavingBaseline,
  setWbsDrafts,
  setWbsRedoHistory,
  setWbsUndoHistory,
  wbsDraftsRef,
  wbsRedoStackRef,
  wbsUndoStackRef,
}: WbsSnapshotActionDeps) {
  const confirm = useConfirm();
  const { t } = useI18n();
  function applyWbsSnapshotResult(
    nextItems: WbsItem[],
    nextDependencies?: WbsDependency[],
    nextCriticalPath?: WbsCriticalPath | null,
  ) {
    const currentProject = projectRef.current;
    const nextProject = currentProject
      ? {
          ...currentProject,
          wbsItems: nextItems,
          wbsDependencies: nextDependencies ?? currentProject.wbsDependencies,
          criticalPath:
            nextCriticalPath === undefined
              ? currentProject.criticalPath
              : nextCriticalPath,
        }
      : currentProject;
    projectRef.current = nextProject;
    setProject(nextProject);
    const nextWbsDependencies =
      nextDependencies ?? currentProject?.wbsDependencies ?? [];
    const nextWbsDrafts = Object.fromEntries(
      nextItems.map((item) => [item.id, wbsToForm(item, nextWbsDependencies)]),
    );
    wbsDraftsRef.current = nextWbsDrafts;
    setWbsDrafts(nextWbsDrafts);
    setCollapsedWbsIds(
      (currentIds) =>
        new Set(
          [...currentIds].filter((itemId) =>
            nextItems.some((item) => item.id === itemId),
          ),
        ),
    );
  }

  function applyWbsItems(nextItems: WbsItem[]) {
    applyWbsSnapshotResult(nextItems);
  }

  function getCurrentWbsSnapshot(): WbsSnapshot | null {
    if (!project) return null;
    return {
      wbsItems: project.wbsItems.map((item) => ({ ...item })),
      wbsDependencies: project.wbsDependencies.map((dependency) => ({
        predecessorId: dependency.predecessorId,
        successorId: dependency.successorId,
        type: dependency.type,
        lagDays: dependency.lagDays,
      })),
    };
  }

  function rememberWbsSnapshot() {
    const snapshot = getCurrentWbsSnapshot();
    if (!snapshot) return null;
    const previous = wbsUndoStackRef.current.at(-1);
    if (!previous || !wbsSnapshotsEqual(previous, snapshot)) {
      setWbsUndoHistory([...wbsUndoStackRef.current, snapshot].slice(-10));
    }
    setWbsRedoHistory([]);
    return snapshot;
  }

  async function restoreWbsSnapshot(
    snapshot: WbsSnapshot,
    direction: "undo" | "redo",
  ) {
    if (!project || restoringWbsSnapshot) return;
    const currentSnapshot = getCurrentWbsSnapshot();
    if (!currentSnapshot) return;
    setRestoringWbsSnapshot(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-snapshot/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось восстановить Структуру");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
      if (direction === "undo") {
        setWbsRedoHistory([...wbsRedoStackRef.current, currentSnapshot].slice(-10));
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
        setNotice("Откат Структуры выполнен");
      } else {
        setWbsUndoHistory([...wbsUndoStackRef.current, currentSnapshot].slice(-10));
        setWbsRedoHistory(wbsRedoStackRef.current.slice(0, -1));
        setNotice("Изменение Структуры восстановлено");
      }
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "Не удалось восстановить Структуру",
      );
    } finally {
      setRestoringWbsSnapshot(false);
    }
  }

  async function undoWbsChange() {
    const snapshot = wbsUndoStackRef.current.at(-1);
    if (!snapshot) return;
    await restoreWbsSnapshot(snapshot, "undo");
  }

  async function redoWbsChange() {
    const snapshot = wbsRedoStackRef.current.at(-1);
    if (!snapshot) return;
    await restoreWbsSnapshot(snapshot, "redo");
  }

  async function saveWbsBaseline(itemIds?: string[]) {
    if (!project) return;
    const selectedCount = itemIds?.length ?? 0;
    if (
      !(await confirm({
        title:
          selectedCount > 0
            ? t("baseline.confirmSelectedTitle")
            : t("baseline.confirmAllTitle"),
        message:
          selectedCount > 0
            ? t("baseline.confirmSelectedMessage", { count: selectedCount })
            : t("baseline.confirmAllMessage"),
        confirmLabel: selectedCount > 0 ? t("baseline.updateAction") : t("baseline.setAction"),
        tone: "default",
      }))
    ) {
      return;
    }
    setSavingBaseline(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-baseline`,
        {
          method: "POST",
          ...(selectedCount > 0 ? { body: JSON.stringify({ itemIds }) } : {}),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? t("baseline.saveError"));
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject(project.id);
      }
      setNotice(
        selectedCount > 0
          ? t("baseline.savedSelected", { count: selectedCount })
          : t("baseline.savedAll"),
      );
    } catch (baselineError) {
      setError(
        baselineError instanceof Error
          ? baselineError.message
          : t("baseline.saveError"),
      );
    } finally {
      setSavingBaseline(false);
    }
  }

  return {
    applyWbsItems,
    applyWbsSnapshotResult,
    redoWbsChange,
    rememberWbsSnapshot,
    saveWbsBaseline,
    undoWbsChange,
  };
}
