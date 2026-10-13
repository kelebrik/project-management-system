import { useI18n } from "../i18n/I18nProvider";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import type {
  ProjectDetails,
  WbsCriticalPath,
  WbsDependency,
  WbsItem,
} from "../app/domainTypes";
import type { WbsFormState, wbsToForm } from "../app/formState";
import { mergeWbsDrafts } from "../app/wbsDraftMerge";
import { apiBase, authenticatedFetch } from "../app/http";
import { confirmedStructure, onStructureChange, provideWriteTag, reportStructureWriteFailure, StructureWriteSettledError } from "../app/structureStore";
import { capUndoHistory, openUndoStep, rebaseAfterExactRevert, recordChange, revertRequest, stepIsEmpty, type WbsUndoStep } from "../app/undoHistory";
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
  setWbsRedoHistory: (nextStack: WbsUndoStep[]) => void;
  setWbsUndoHistory: (nextStack: WbsUndoStep[]) => void;
  wbsDraftsRef: MutableRefObject<Record<string, ReturnType<typeof wbsToForm>>>;
  wbsRedoStackRef: MutableRefObject<WbsUndoStep[]>;
  wbsUndoStackRef: MutableRefObject<WbsUndoStep[]>;
};

/** The requests of Structure edits whose changes join the open step back. */
const STRUCTURE_EDIT = /\/(wbs-items|wbs-dependencies)(\/|$|\?)/;

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
    options: { sentDrafts?: Record<string, WbsFormState> } = {},
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
    // Merge instead of replacing, so a save response never erases text the
    // user is still typing in this or another row.
    const nextWbsDrafts = mergeWbsDrafts({
      localDrafts: wbsDraftsRef.current,
      previous: currentProject
        ? { items: currentProject.wbsItems, dependencies: currentProject.wbsDependencies }
        : null,
      next: { items: nextItems, dependencies: nextWbsDependencies },
      sentDrafts: options.sentDrafts,
    });
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

  // The step the edits of this page are gathered into, and the one an undo or redo in flight records its own change in.
  const openStepRef = useRef<WbsUndoStep | null>(null);
  const revertStepRef = useRef<WbsUndoStep | null>(null);

  // A write the server made whose answer was lost: the copy caught up with it, the page shows that copy.
  useEffect(() => {
    const onSettled = (event: Event) => {
      const projectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      const current = projectRef.current;
      const state = projectId ? confirmedStructure(projectId) : null;
      if (!current || !state || current.id !== projectId) return;
      applyWbsSnapshotResult(state.items, state.dependencies, state.criticalPath);
      // The project's calendar comes with the Structure it was read with.
      if (state.calendarOverrides && projectRef.current) {
        projectRef.current = { ...projectRef.current, calendarOverrides: state.calendarOverrides };
        setProject(projectRef.current);
      }
    };
    window.addEventListener("pms-structure-settled", onSettled);
    return () => window.removeEventListener("pms-structure-settled", onSettled);
  });

  // A write leaving now belongs to the open step; its answer is recorded there even when another edit has begun since.
  useEffect(() => provideWriteTag(() => openStepRef.current), []);
  useEffect(() => onStructureChange((change) => {
    if (change.requestPath.includes("/wbs-snapshot/revert")) {
      if (revertStepRef.current) recordChange(revertStepRef.current, change);
      return;
    }
    const step = change.tag as WbsUndoStep | null;
    if (!step || !STRUCTURE_EDIT.test(change.requestPath)) return;
    recordChange(step, change);
    // A step joins the history with its first change, so an edit that changed nothing leaves no step.
    if (!wbsUndoStackRef.current.includes(step) && (!stepIsEmpty(step) || step.incomplete)) {
      setWbsUndoHistory(capUndoHistory([...wbsUndoStackRef.current, step]));
    }
  }), [setWbsUndoHistory, wbsUndoStackRef]);

  /** Opens a new step back for the edit about to be sent; its changes come with the answers. */
  function rememberWbsSnapshot() {
    if (!project) return null;
    const step = openUndoStep(project.id);
    openStepRef.current = step;
    setWbsRedoHistory([]);
    return step;
  }

  /**
   * Sends one step back and records what the server did as the step for the
   * other direction. A step the page could not follow, or that others have
   * changed since, is dropped with the reason.
   */
  async function revertWbsStep(direction: "undo" | "redo") {
    if (!project || restoringWbsSnapshot) return;
    const from = direction === "undo" ? wbsUndoStackRef : wbsRedoStackRef;
    const setFrom = direction === "undo" ? setWbsUndoHistory : setWbsRedoHistory;
    const setTo = direction === "undo" ? setWbsRedoHistory : setWbsUndoHistory;
    const to = direction === "undo" ? wbsRedoStackRef : wbsUndoStackRef;
    const stack = from.current.filter((step) => !stepIsEmpty(step) || step.incomplete);
    const step = stack.at(-1);
    if (!step) {
      setFrom([]);
      return;
    }
    // Later edits start a new step; nothing more joins this one.
    openStepRef.current = null;
    if (step.incomplete || step.projectId !== project.id) {
      setFrom(stack.slice(0, -1));
      setError("Этот шаг отменить нельзя: страница обновила данные проекта");
      return;
    }
    setRestoringWbsSnapshot(true);
    setError(null);
    setNotice(null);
    const recorded = openUndoStep(project.id);
    revertStepRef.current = recorded;
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-snapshot/revert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(revertRequest(step)),
        },
      );
      const result = await response.json().catch(() => null);
      if (response.status === 409 && result?.code === "UNDO_CONFLICT") {
        setFrom(stack.slice(0, -1));
        throw new Error(result.error);
      }
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
      const remaining = stack.slice(0, -1);
      if (result?.recalculated === false) rebaseAfterExactRevert(remaining.at(-1), step, recorded.afterVersion);
      setFrom(remaining);
      if (!stepIsEmpty(recorded) || recorded.incomplete) setTo(capUndoHistory([...to.current, recorded]));
      setNotice(direction === "undo" ? "Откат Структуры выполнен" : "Изменение Структуры восстановлено");
    } catch (restoreError) {
      // The server took the step back, its answer was lost: the step is done, and the way back is not known well enough to offer.
      if (restoreError instanceof StructureWriteSettledError) setFrom(stack.slice(0, -1));
      reportStructureWriteFailure(restoreError, "Не удалось восстановить Структуру", setError, setNotice);
    } finally {
      revertStepRef.current = null;
      setRestoringWbsSnapshot(false);
    }
  }

  async function undoWbsChange() {
    await revertWbsStep("undo");
  }

  async function redoWbsChange() {
    await revertWbsStep("redo");
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
      reportStructureWriteFailure(baselineError, t("baseline.saveError"), setError, setNotice);
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
