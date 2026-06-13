import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import type {
  GanttLinkEndpoint,
  ProjectDetails,
  WbsCriticalPath,
  WbsDependency,
  WbsDependencyType,
  WbsItem,
} from "../app/domainTypes";
import { apiBase, authenticatedFetch, responseErrorMessage } from "../app/http";

type GanttLinkDraft = GanttLinkEndpoint & {
  pointerX: number;
  pointerY: number;
  replaceDependencyId?: string;
};

type GanttDependencyActionsDeps = {
  applyWbsSnapshotResult: (
    nextItems: WbsItem[],
    nextDependencies?: WbsDependency[],
    nextCriticalPath?: WbsCriticalPath | null,
  ) => void;
  ganttLinkCompletedRef: MutableRefObject<boolean>;
  ganttLinkDraft: GanttLinkDraft | null;
  ganttTimelineRef: MutableRefObject<HTMLDivElement | null>;
  project: ProjectDetails | null;
  refreshProject: (projectId?: string) => Promise<void>;
  rememberWbsSnapshot: () => unknown;
  setActiveWbsItemId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setGanttLinkDraft: Dispatch<SetStateAction<GanttLinkDraft | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useGanttDependencyActions({
  applyWbsSnapshotResult,
  ganttLinkCompletedRef,
  ganttLinkDraft,
  ganttTimelineRef,
  project,
  refreshProject,
  rememberWbsSnapshot,
  setActiveWbsItemId,
  setError,
  setGanttLinkDraft,
  setNotice,
}: GanttDependencyActionsDeps) {
  function ganttEndpointToDependencyType(
    fromSide: GanttLinkEndpoint["side"],
    toSide: GanttLinkEndpoint["side"],
  ): WbsDependencyType {
    if (fromSide === "start" && toSide === "start") return "SS";
    if (fromSide === "start" && toSide === "end") return "SF";
    if (fromSide === "end" && toSide === "end") return "FF";
    return "FS";
  }

  function pointerToGanttPosition(event: PointerEvent | ReactPointerEvent) {
    const timeline = ganttTimelineRef.current;
    if (!timeline) return null;
    const rect = timeline.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
      y: event.clientY - rect.top,
    };
  }

  async function deleteGanttDependency(dependencyId: string) {
    if (!project) {
      setGanttLinkDraft(null);
      return;
    }
    rememberWbsSnapshot();
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase}/api/wbs-dependencies/${dependencyId}`,
        { method: "DELETE" },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error ?? "Не удалось удалить связь на Гантте");
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
      setNotice("Связь на Гантте удалена");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить связь на Гантте",
      );
    } finally {
      setGanttLinkDraft(null);
    }
  }

  function startGanttLinkDrag(
    endpoint: GanttLinkEndpoint,
    event: ReactPointerEvent<Element>,
    replaceDependencyId?: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const position = pointerToGanttPosition(event);
    if (!position) return;
    ganttLinkCompletedRef.current = false;
    setActiveWbsItemId(endpoint.itemId);
    setGanttLinkDraft({
      ...endpoint,
      pointerX: Math.max(0, Math.min(100, position.x)),
      pointerY: position.y,
      replaceDependencyId,
    });

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let draggedBeyondThreshold = false;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (
        Math.hypot(
          moveEvent.clientX - startClientX,
          moveEvent.clientY - startClientY,
        ) > 4
      ) {
        draggedBeyondThreshold = true;
      }
      const nextPosition = pointerToGanttPosition(moveEvent);
      if (!nextPosition) return;
      setGanttLinkDraft((current) =>
        current
          ? {
              ...current,
              pointerX: Math.max(0, Math.min(100, nextPosition.x)),
              pointerY: nextPosition.y,
            }
          : current,
      );
    };
    const onPointerUp = () => {
      window.setTimeout(() => {
        if (ganttLinkCompletedRef.current) {
          ganttLinkCompletedRef.current = false;
          return;
        }
        if (replaceDependencyId && draggedBeyondThreshold) {
          void deleteGanttDependency(replaceDependencyId);
        } else {
          setGanttLinkDraft(null);
        }
      }, 0);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function completeGanttLinkDrag(
    endpoint: GanttLinkEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    ganttLinkCompletedRef.current = true;
    if (!project || !ganttLinkDraft || ganttLinkDraft.itemId === endpoint.itemId) {
      setGanttLinkDraft(null);
      return;
    }
    const predecessorId = ganttLinkDraft.itemId;
    const successorId = endpoint.itemId;
    const type = ganttEndpointToDependencyType(ganttLinkDraft.side, endpoint.side);
    rememberWbsSnapshot();
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch(
        ganttLinkDraft.replaceDependencyId
          ? `${apiBase}/api/wbs-dependencies/${ganttLinkDraft.replaceDependencyId}`
          : `${apiBase}/api/projects/${project.id}/wbs-dependencies`,
        {
          method: ganttLinkDraft.replaceDependencyId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predecessorId,
            successorId,
            type,
            lagDays: 0,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          responseErrorMessage(result, "Не удалось создать связь на Гантте"),
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
      setNotice(
        ganttLinkDraft.replaceDependencyId
          ? "Связь на Гантте изменена"
          : "Связь на Гантте создана",
      );
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Не удалось создать связь на Гантте",
      );
    } finally {
      setGanttLinkDraft(null);
    }
  }

  return {
    completeGanttLinkDrag,
    startGanttLinkDrag,
  };
}
