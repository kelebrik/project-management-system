import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { apiClient } from "../api/client";
import { createChangedPatch } from "../app/changedPatch";
import type {
  ProjectDetails,
  WbsCriticalPath,
  WbsDependency,
  WbsItem,
  WbsSnapshot,
  WbsSnapshotResponse,
  WbsTreeItem,
} from "../app/domainTypes";
import { wbsToForm, type WbsFormState } from "../app/formState";
import { apiBase, authenticatedFetch, isHttpsUrl } from "../app/http";
import {
  WBS_PREDECESSOR_KEYS,
  WBS_PREDECESSOR_TYPE_BY_KEY,
} from "../app/wbsTable";
import {
  parentIdFromWbsLevel,
  resolveDraftPredecessorCode,
} from "../app/wbsTree";
import type { WbsScheduleDriver } from "../wbsScheduleDriver";
import { inferWbsScheduleDriver } from "../wbsScheduleDriver";

type WbsRowActionsDeps = {
  applyWbsItems: (nextItems: WbsItem[]) => void;
  applyWbsSnapshotResult: (
    nextItems: WbsItem[],
    nextDependencies?: WbsDependency[],
    nextCriticalPath?: WbsCriticalPath | null,
  ) => void;
  dirtyWbsItemIds: Set<string>;
  draftWbsCodes: Map<string, string>;
  latestWbsSaveSequenceByItemRef: MutableRefObject<Record<string, number>>;
  pendingWbsSaveCountRef: MutableRefObject<number>;
  project: ProjectDetails | null;
  projectRef: MutableRefObject<ProjectDetails | null>;
  refreshProject: (projectId?: string) => Promise<void>;
  rememberWbsSnapshot: () => WbsSnapshot | null;
  selectedWbsIds: Set<string>;
  setCollapsedWbsIds: Dispatch<SetStateAction<Set<string>>>;
  setDraggedWbsItemId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setSelectedWbsIds: Dispatch<SetStateAction<Set<string>>>;
  setSavingWbsBulk: Dispatch<SetStateAction<boolean>>;
  setWbsDrafts: Dispatch<SetStateAction<Record<string, WbsFormState>>>;
  setWbsDropTargetId: Dispatch<SetStateAction<string | null>>;
  setWbsUndoHistory: (nextStack: WbsSnapshot[]) => void;
  visibleWbsTree: WbsTreeItem[];
  wbsDrafts: Record<string, WbsFormState>;
  wbsDraftsRef: MutableRefObject<Record<string, WbsFormState>>;
  wbsUndoStackRef: MutableRefObject<WbsSnapshot[]>;
  wbsSaveSequenceRef: MutableRefObject<number>;
  wbsTree: WbsTreeItem[];
};

export function useWbsRowActions({
  applyWbsItems,
  applyWbsSnapshotResult,
  dirtyWbsItemIds,
  draftWbsCodes,
  latestWbsSaveSequenceByItemRef,
  pendingWbsSaveCountRef,
  project,
  projectRef,
  refreshProject,
  rememberWbsSnapshot,
  selectedWbsIds,
  setCollapsedWbsIds,
  setDraggedWbsItemId,
  setError,
  setNotice,
  setSelectedWbsIds,
  setSavingWbsBulk,
  setWbsDrafts,
  setWbsDropTargetId,
  setWbsUndoHistory,
  visibleWbsTree,
  wbsDrafts,
  wbsDraftsRef,
  wbsUndoStackRef,
  wbsSaveSequenceRef,
  wbsTree,
}: WbsRowActionsDeps) {
  function wbsPayload(
    itemId: string,
    form: WbsFormState,
    options: { scheduleDriver?: WbsScheduleDriver } = {},
  ) {
    const nextLevel = form.wbsLevel ? Number(form.wbsLevel) : null;
    const workDays = form.workDays.trim();
    const calendarDays = form.calendarDays.trim();
    const leadLagDays = form.leadLagDays.trim();
    const planWorkDays = form.planWorkDays.trim();
    const planCalendarDays = form.planCalendarDays.trim();
    const effortPercent = form.effortPercent.trim();
    const payload = {
      ...form,
      parentId: parentIdFromWbsLevel(
        itemId,
        nextLevel,
        wbsTree,
        wbsDraftsRef.current,
      ),
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      baselineStartDate: form.baselineStartDate || null,
      baselineDueDate: form.baselineDueDate || null,
      forecastStartDate: form.forecastStartDate || null,
      forecastDueDate: form.forecastDueDate || null,
      code: draftWbsCodes.get(itemId) ?? form.code,
      wbsLevel: nextLevel,
      ...Object.fromEntries(
        WBS_PREDECESSOR_KEYS.map((key) => [key, form[key] || null]),
      ),
      leadLagDays: leadLagDays ? Number(leadLagDays) : 0,
      workDays: workDays ? Number(workDays) : null,
      calendarDays: calendarDays ? Number(calendarDays) : null,
      excelStartDate: form.excelStartDate || null,
      excelEndDate: form.excelEndDate || null,
      planWorkDays: planWorkDays ? Number(planWorkDays) : null,
      planCalendarDays: planCalendarDays ? Number(planCalendarDays) : null,
      calendarCode: form.calendarCode,
      templateColor: form.templateColor || null,
      priority: form.priority || null,
      effortPercent: effortPercent ? Number(effortPercent) : 0,
      plannedCost: Number(form.plannedCost),
      forecastCost: Number(form.forecastCost),
      progress: Number(form.progress),
      jiraTicketKey: form.jiraTicketKey || null,
      jiraTicketUrl: form.jiraTicketUrl || null,
      description: form.description || null,
      sortOrder: Number(form.sortOrder),
    };
    return options.scheduleDriver
      ? { ...payload, scheduleDriver: options.scheduleDriver }
      : payload;
  }

  function wbsItemPatchPayload(
    payload: ReturnType<typeof wbsPayload>,
    currentPayload?: ReturnType<typeof wbsPayload> | null,
  ) {
    const {
      predecessor1Type,
      predecessor2Type,
      predecessor3Type,
      predecessor4Type,
      predecessor5Type,
      predecessor6Type,
      ...itemPayload
    } = payload;
    if (!currentPayload) return itemPayload;

    return createChangedPatch(itemPayload, currentPayload);
  }

  function isLatestWbsSave(itemId: string, saveSequence: number) {
    return latestWbsSaveSequenceByItemRef.current[itemId] === saveSequence;
  }

  function updateWbsDraft(itemId: string, patch: Partial<WbsFormState>) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const nextDrafts = {
      ...wbsDraftsRef.current,
      [itemId]: { ...current, ...patch },
    };
    wbsDraftsRef.current = nextDrafts;
    setWbsDrafts(nextDrafts);
  }

  function updateSelectedWbsDrafts(patch: Partial<WbsFormState>) {
    if (selectedWbsIds.size === 0) return;
    setWbsDrafts((current) => {
      const next = { ...current };
      for (const itemId of selectedWbsIds) {
        if (!next[itemId]) continue;
        next[itemId] = { ...next[itemId], ...patch };
      }
      wbsDraftsRef.current = next;
      return next;
    });
  }

  async function saveDirtyWbsItems() {
    if (dirtyWbsItemIds.size === 0) return;
    const activeProject = projectRef.current ?? project;
    if (!activeProject) return;

    const dirtyIds = [...dirtyWbsItemIds];
    let items: Array<{
      id: string;
      patch: ReturnType<typeof wbsItemPatchPayload>;
      predecessorsChanged: boolean;
      requiresRenumber: boolean;
    }>;
    try {
      items = dirtyIds.map((itemId) => {
        const draft = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
        const currentItem = activeProject.wbsItems.find((item) => item.id === itemId);
        if (!draft || !currentItem) {
          throw new Error("Не удалось подготовить изменения Структуры");
        }
        if (!isHttpsUrl(draft.jiraTicketUrl)) {
          throw new Error("Ссылка Jira должна начинаться с https://");
        }
        const currentPayload = wbsPayload(
          itemId,
          wbsToForm(currentItem, activeProject.wbsDependencies),
        );
        const comparablePayload = wbsPayload(itemId, draft);
        const scheduleDriver =
          draft.status === "CANCELLED" && draft.workDays === "0"
            ? "workDays"
            : inferWbsScheduleDriver(currentPayload, comparablePayload);
        const patch = wbsItemPatchPayload(
          wbsPayload(itemId, draft, { scheduleDriver }),
          currentPayload,
        );
        const predecessorsChanged =
          WBS_PREDECESSOR_KEYS.some((key) => {
            const typeKey = WBS_PREDECESSOR_TYPE_BY_KEY[key];
            return (
              comparablePayload[key] !== currentItem[key] ||
              comparablePayload[typeKey] !== currentPayload[typeKey]
            );
          }) || comparablePayload.leadLagDays !== currentItem.leadLagDays;
        const requiresRenumber =
          comparablePayload.wbsLevel !== currentItem.wbsLevel ||
          comparablePayload.parentId !== currentItem.parentId ||
          draftWbsCodes.get(itemId) !== currentItem.code;
        return { id: itemId, patch, predecessorsChanged, requiresRenumber };
      });
    } catch (prepareError) {
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "Не удалось подготовить изменения Структуры",
      );
      return;
    }

    setSavingWbsBulk(true);
    setError(null);
    setNotice(null);
    const saveSequence = wbsSaveSequenceRef.current + 1;
    wbsSaveSequenceRef.current = saveSequence;
    dirtyIds.forEach((itemId) => {
      latestWbsSaveSequenceByItemRef.current[itemId] = saveSequence;
    });
    pendingWbsSaveCountRef.current += 1;
    try {
      let snapshotResult = await apiClient.patch<WbsSnapshotResponse>(
        `/api/projects/${activeProject.id}/wbs-items/bulk`,
        {
          items: items.map(({ id, patch }) => ({ id, patch })),
          renumber: items.some((item) => item.requiresRenumber),
        },
        "Не удалось сохранить изменения Структуры",
      );

      for (const item of items.filter((candidate) => candidate.predecessorsChanged)) {
        const predecessorResult = await saveWbsPredecessors(item.id, {
          remember: false,
        });
        if (predecessorResult?.wbsItems) snapshotResult = predecessorResult;
      }

      if (dirtyIds.some((itemId) => !isLatestWbsSave(itemId, saveSequence))) return;
      applyWbsSnapshotResult(
        snapshotResult.wbsItems,
        snapshotResult.wbsDependencies,
        snapshotResult.criticalPath,
      );
      setNotice("Изменения Структуры сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить изменения Структуры",
      );
    } finally {
      pendingWbsSaveCountRef.current = Math.max(
        0,
        pendingWbsSaveCountRef.current - 1,
      );
      setSavingWbsBulk(false);
    }
  }

  function saveWbsDraftPatch(
    itemId: string,
    patch: Partial<WbsFormState>,
    options: { silent?: boolean; scheduleDriver?: WbsScheduleDriver } = {},
  ) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const nextDraft = { ...current, ...patch };
    const nextDrafts = {
      ...wbsDraftsRef.current,
      [itemId]: nextDraft,
    };
    wbsDraftsRef.current = nextDrafts;
    setWbsDrafts(nextDrafts);
    void saveWbsItem(itemId, { ...options, draftOverride: nextDraft });
  }

  function getWbsSubtreeRange(itemId: string) {
    const startIndex = wbsTree.findIndex((item) => item.id === itemId);
    if (startIndex === -1) return null;
    const sourceLevel = wbsTree[startIndex].wbsLevel ?? wbsTree[startIndex].level + 1;
    let endIndex = startIndex + 1;
    while (
      endIndex < wbsTree.length &&
      (wbsTree[endIndex].wbsLevel ?? wbsTree[endIndex].level + 1) > sourceLevel
    ) {
      endIndex += 1;
    }
    return { startIndex, endIndex, sourceLevel };
  }

  async function reorderWbsRowsWithMetadata(
    nextItems: WbsItem[],
    metadata: {
      levelsById?: Record<string, number>;
      typesById?: Partial<Record<string, WbsItem["type"]>>;
    } = {},
    notice = "Структура обновлена",
  ) {
    if (!project) return;
    const normalizedItems = nextItems.map((item, index) => ({
      ...item,
      sortOrder: (index + 1) * 10,
      wbsLevel: metadata.levelsById?.[item.id] ?? item.wbsLevel,
      type: metadata.typesById?.[item.id] ?? item.type,
    }));
    const previousSnapshot = rememberWbsSnapshot();
    applyWbsItems(normalizedItems);
    setError(null);
    setNotice(null);

    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: normalizedItems.map((item) => item.id),
            levelsById: metadata.levelsById,
            typesById: metadata.typesById,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось обновить Структуру",
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      }
      if (notice) setNotice(notice);
    } catch (reorderError) {
      if (previousSnapshot) {
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
      }
      await refreshProject(project.id);
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "Не удалось обновить Структуру",
      );
    } finally {
      setDraggedWbsItemId(null);
      setWbsDropTargetId(null);
    }
  }

  function saveWbsTypePatch(
    itemId: string,
    nextType: WbsItem["type"],
    options: { silent?: boolean } = {},
  ) {
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current) return;
    const range = getWbsSubtreeRange(itemId);
    const sourceItem = range ? wbsTree[range.startIndex] : null;
    if (
      project &&
      range &&
      sourceItem?.type === "WORK_PACKAGE" &&
      nextType === "PHASE"
    ) {
      const block = wbsTree.slice(range.startIndex, range.endIndex);
      const phaseStartIndex = (() => {
        for (let index = range.startIndex - 1; index >= 0; index -= 1) {
          const candidateLevel = wbsTree[index].wbsLevel ?? wbsTree[index].level + 1;
          if (candidateLevel === 1) return index;
        }
        return range.startIndex;
      })();
      const levelOffset = Math.max(0, range.sourceLevel - 1);
      const levelsById = Object.fromEntries(
        block.map((item) => [
          item.id,
          Math.max(1, (item.wbsLevel ?? item.level + 1) - levelOffset),
        ]),
      );
      const blockIds = new Set(block.map((item) => item.id));
      const remainingItems = wbsTree.filter((item) => !blockIds.has(item.id));
      const insertIndex = remainingItems.findIndex(
        (item) => item.id === wbsTree[phaseStartIndex]?.id,
      );
      const nextItems = [...remainingItems];
      nextItems.splice(Math.max(0, insertIndex), 0, ...block);
      const nextDrafts = {
        ...wbsDraftsRef.current,
        [itemId]: { ...current, type: nextType, wbsLevel: "1" },
      };
      wbsDraftsRef.current = nextDrafts;
      setWbsDrafts(nextDrafts);
      void reorderWbsRowsWithMetadata(
        nextItems,
        {
          levelsById,
          typesById: { [itemId]: nextType },
        },
        options.silent ? "" : "Пакет работ преобразован в фазу",
      );
      return;
    }

    saveWbsDraftPatch(itemId, { type: nextType }, { ...options, silent: true });
  }

  function toggleWbsCollapse(itemId: string) {
    setCollapsedWbsIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function saveWbsItem(
    itemId: string,
    options: {
      silent?: boolean;
      draftOverride?: WbsFormState;
      scheduleDriver?: WbsScheduleDriver;
    } = {},
  ) {
    const activeProject = projectRef.current ?? project;
    if (!activeProject) return;
    const draft =
      options.draftOverride ??
      wbsDraftsRef.current[itemId] ??
      wbsDrafts[itemId];
    if (!draft) return;
    const currentItem = activeProject.wbsItems.find(
      (item) => item.id === itemId,
    );
    const comparablePayload = wbsPayload(itemId, draft);
    if (!isHttpsUrl(draft.jiraTicketUrl)) {
      setError("Ссылка Jira должна начинаться с https://");
      return;
    }
    const currentPayload = currentItem
      ? wbsPayload(itemId, wbsToForm(currentItem, activeProject.wbsDependencies))
      : null;
    const scheduleDriver =
      options.scheduleDriver ??
      inferWbsScheduleDriver(currentPayload, comparablePayload);
    const nextPayload = wbsPayload(itemId, draft, { scheduleDriver });
    const rowChanged =
      currentPayload !== null &&
      JSON.stringify(comparablePayload) !== JSON.stringify(currentPayload);
    const predecessorsChanged =
      currentItem !== undefined &&
        (WBS_PREDECESSOR_KEYS.some((key) => {
          const typeKey = WBS_PREDECESSOR_TYPE_BY_KEY[key];
          return (
            comparablePayload[key] !== currentItem[key] ||
            comparablePayload[typeKey] !== currentPayload?.[typeKey]
          );
        }) ||
          comparablePayload.leadLagDays !== currentItem.leadLagDays);
    const requiresRenumber =
      currentItem !== undefined &&
      (comparablePayload.wbsLevel !== currentItem.wbsLevel ||
        comparablePayload.parentId !== currentItem.parentId ||
        draftWbsCodes.get(itemId) !== currentItem.code);
    if (currentItem && !rowChanged) return;
    if (rowChanged) rememberWbsSnapshot();
    setError(null);
    if (!options.silent) setNotice(null);
    const saveSequence = wbsSaveSequenceRef.current + 1;
    wbsSaveSequenceRef.current = saveSequence;
    latestWbsSaveSequenceByItemRef.current[itemId] = saveSequence;
    pendingWbsSaveCountRef.current += 1;
    try {
      const patchResult = await apiClient.patch<WbsSnapshotResponse>(
        `/api/wbs-items/${itemId}`,
        wbsItemPatchPayload(nextPayload, currentPayload),
        "Не удалось сохранить элемент Структуры",
        { "X-WBS-Project-ID": activeProject.id },
      );
      const predecessorResult = predecessorsChanged
        ? await saveWbsPredecessors(itemId, { remember: false })
        : null;

      if (!isLatestWbsSave(itemId, saveSequence)) return;

      if (requiresRenumber) {
        const renumberResult = await apiClient.post<WbsSnapshotResponse>(
          `/api/projects/${activeProject.id}/wbs-items/renumber`,
          undefined,
          "Не удалось перенумеровать Структуру",
        );
        if (!isLatestWbsSave(itemId, saveSequence)) return;
        if (renumberResult.wbsItems) {
          applyWbsSnapshotResult(
            renumberResult.wbsItems,
            renumberResult.wbsDependencies,
            renumberResult.criticalPath,
          );
        } else {
          await refreshProject();
        }
      } else {
        const snapshotResult = predecessorResult?.wbsItems
          ? predecessorResult
          : patchResult;
        applyWbsSnapshotResult(
          snapshotResult.wbsItems,
          snapshotResult.wbsDependencies,
          snapshotResult.criticalPath,
        );
      }
      if (!options.silent) setNotice("Элемент Структуры обновлен");
    } catch (saveError) {
      if (!isLatestWbsSave(itemId, saveSequence)) return;
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить элемент Структуры",
      );
    } finally {
      pendingWbsSaveCountRef.current = Math.max(
        0,
        pendingWbsSaveCountRef.current - 1,
      );
    }
  }

  async function insertWbsRow(
    afterIndex: number,
    sourceRows: WbsTreeItem[] = visibleWbsTree,
  ) {
    if (!project) return;
    setError(null);
    setNotice(null);
    const previousItem = sourceRows[afterIndex];
    if (!previousItem) return;
    const nextItem = sourceRows[afterIndex + 1] ?? null;

    rememberWbsSnapshot();
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/insert-after`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            afterItemId: previousItem.id,
            beforeItemId: nextItem?.id ?? null,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось вставить строку Структуры",
        );
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
    } catch (insertError) {
      setError(
        insertError instanceof Error
          ? insertError.message
          : "Не удалось вставить строку Структуры",
      );
    }
  }

  async function reorderWbsRows(sourceId: string, targetId: string) {
    if (!project || sourceId === targetId) return;
    const sourceIndex = wbsTree.findIndex((item) => item.id === sourceId);
    const targetIndex = wbsTree.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const sourceLevel = wbsTree[sourceIndex].level;
    let sourceEndIndex = sourceIndex + 1;
    while (
      sourceEndIndex < wbsTree.length &&
      wbsTree[sourceEndIndex].level > sourceLevel
    ) {
      sourceEndIndex += 1;
    }
    if (targetIndex > sourceIndex && targetIndex < sourceEndIndex) return;

    const movedBlock = wbsTree.slice(sourceIndex, sourceEndIndex);
    const remainingItems = [
      ...wbsTree.slice(0, sourceIndex),
      ...wbsTree.slice(sourceEndIndex),
    ];
    const nextTargetIndex = remainingItems.findIndex(
      (item) => item.id === targetId,
    );
    if (nextTargetIndex === -1) return;

    const nextItems = [...remainingItems];
    nextItems.splice(nextTargetIndex, 0, ...movedBlock);

    const normalizedItems = nextItems.map((item, index) => ({
      ...item,
      sortOrder: (index + 1) * 10,
    }));
    const previousSnapshot = rememberWbsSnapshot();
    applyWbsItems(normalizedItems);
    setError(null);
    setNotice(null);

    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${project.id}/wbs-items/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedIds: normalizedItems.map((item) => item.id),
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.error?.formErrors?.join(", ") ||
            result?.error ||
            "Не удалось переместить строку Структуры",
        );
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      }
    } catch (reorderError) {
      if (previousSnapshot) {
        setWbsUndoHistory(wbsUndoStackRef.current.slice(0, -1));
      }
      await refreshProject(project.id);
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "Не удалось переместить строку Структуры",
      );
    } finally {
      setDraggedWbsItemId(null);
      setWbsDropTargetId(null);
    }
  }

  async function saveWbsPredecessors(
    itemId: string,
    options: { remember?: boolean } = {},
  ) {
    const activeProject = projectRef.current ?? project;
    if (!activeProject) return null;
    const draft = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!draft) return null;
    const wbsByCode = new Map<string, WbsItem>();
    for (const item of activeProject.wbsItems) {
      wbsByCode.set(item.code, item);
      const draftCode = draftWbsCodes.get(item.id);
      if (draftCode) wbsByCode.set(draftCode, item);
    }
    const desiredPredecessors = WBS_PREDECESSOR_KEYS.map((key) => ({
      code: resolveDraftPredecessorCode(
        draft[key],
        wbsTree,
        wbsDraftsRef.current,
        draftWbsCodes,
      ).trim(),
      type: draft[WBS_PREDECESSOR_TYPE_BY_KEY[key]] ?? "FS",
    }))
      .filter(({ code }) => Boolean(code))
      .map(({ code, type }) => {
        const predecessor = wbsByCode.get(code);
        if (!predecessor) {
          throw new Error(`Предшественник ${code} не найден в Структуре`);
        }
        return {
          predecessorId: predecessor.id,
          type,
          lagDays: Number(draft.leadLagDays),
        };
      });
    const uniquePredecessors = new Set(
      desiredPredecessors.map((draft) => draft.predecessorId),
    );
    if (uniquePredecessors.size !== desiredPredecessors.length) {
      throw new Error("Один предшественник нельзя указывать дважды");
    }
    if (uniquePredecessors.has(itemId)) {
      throw new Error("Элемент Структуры не может быть своим предшественником");
    }

    const existingDependencies = activeProject.wbsDependencies.filter(
      (dependency) => dependency.successorId === itemId,
    );
    const dependenciesChanged =
      existingDependencies.length !== desiredPredecessors.length ||
      existingDependencies.some(
        (dependency) =>
          !desiredPredecessors.some(
            (draft) =>
              draft.predecessorId === dependency.predecessorId &&
              draft.type === dependency.type &&
              draft.lagDays === dependency.lagDays,
          ),
      );
    if (dependenciesChanged && options.remember !== false) {
      rememberWbsSnapshot();
    }
    let latestSnapshot: {
      wbsItems?: WbsItem[];
      wbsDependencies?: WbsDependency[];
      criticalPath?: WbsCriticalPath | null;
    } | null = null;
    for (const dependency of existingDependencies) {
      const shouldKeep = desiredPredecessors.some(
        (draft) => draft.predecessorId === dependency.predecessorId,
      );
      if (!shouldKeep) {
        const response = await authenticatedFetch(
          `${apiBase}/api/wbs-dependencies/${dependency.id}`,
          {
            method: "DELETE",
            headers: { "X-WBS-Project-ID": activeProject.id },
          },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result.error ?? "Не удалось удалить связь Структуры");
        }
        latestSnapshot = result;
      }
    }

    for (const draft of desiredPredecessors) {
      const response = await authenticatedFetch(
        `${apiBase}/api/projects/${activeProject.id}/wbs-dependencies`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-WBS-Project-ID": activeProject.id,
          },
          body: JSON.stringify({
            predecessorId: draft.predecessorId,
            successorId: itemId,
            type: draft.type,
            lagDays: draft.lagDays,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить связь Структуры",
        );
      }
      latestSnapshot = result;
    }
    return latestSnapshot;
  }

  async function deleteWbsItem(itemId: string) {
    if (!window.confirm("Удалить только выбранную строку Структуры?")) return;
    setError(null);
    setNotice(null);
    rememberWbsSnapshot();
    try {
      const response = await authenticatedFetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "DELETE",
        headers: { "X-WBS-Project-ID": project?.id ?? "" },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить элемент Структуры");
      }
      if (result?.wbsItems) {
        applyWbsSnapshotResult(
          result.wbsItems,
          result.wbsDependencies,
          result.criticalPath,
        );
      } else {
        await refreshProject();
      }
      setNotice("Элемент Структуры удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить элемент Структуры",
      );
    }
  }

  async function deleteSelectedWbsItems() {
    if (!project || selectedWbsIds.size === 0) return;
    const itemIds = [...selectedWbsIds].filter((itemId) =>
      project.wbsItems.some((item) => item.id === itemId),
    );
    if (itemIds.length === 0) {
      setSelectedWbsIds(new Set());
      return;
    }
    if (!window.confirm(`Удалить выбранные строки Структуры: ${itemIds.length}?`)) return;

    setError(null);
    setNotice(null);
    setSavingWbsBulk(true);
    rememberWbsSnapshot();
    try {
      const response = await authenticatedFetch(`${apiBase}/api/projects/${project.id}/wbs-items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить выбранные элементы Структуры");
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
      setSelectedWbsIds(new Set());
      setNotice(`Удалено элементов Структуры: ${result?.deletedCount ?? itemIds.length}`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить выбранные элементы Структуры",
      );
    } finally {
      setSavingWbsBulk(false);
    }
  }

  return {
    deleteSelectedWbsItems,
    deleteWbsItem,
    insertWbsRow,
    reorderWbsRows,
    saveDirtyWbsItems,
    saveWbsDraftPatch,
    saveWbsTypePatch,
    saveWbsItem,
    toggleWbsCollapse,
    updateSelectedWbsDrafts,
    updateWbsDraft,
  };
}
