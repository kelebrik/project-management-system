import type {
  DragEvent as ReactDragEvent,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import type { ProjectDetails, ProjectUiState } from "../app/domainTypes";
import {
  normalizeWbsColumnOrder,
  normalizeWbsHiddenColumns,
  type WbsSortState,
  type WbsTableColumnKey,
} from "../app/wbsTable";

type WbsColumnActionsDeps = {
  draggedWbsColumn: WbsTableColumnKey | null;
  isAuthenticated: boolean;
  isClosedProject: boolean;
  project: ProjectDetails | null;
  saveProjectUiState: (
    patch: ProjectUiState,
    options?: {
      wbsColumnOrder?: WbsTableColumnKey[];
      wbsHiddenColumns?: WbsTableColumnKey[];
      wbsColumnWidths?: Record<WbsTableColumnKey, number>;
      wbsSort?: WbsSortState | null;
    },
  ) => Promise<void>;
  setDraggedWbsColumn: Dispatch<SetStateAction<WbsTableColumnKey | null>>;
  setWbsColumnOrder: Dispatch<SetStateAction<WbsTableColumnKey[]>>;
  setWbsColumnWidths: Dispatch<
    SetStateAction<Record<WbsTableColumnKey, number>>
  >;
  setWbsHiddenColumns: Dispatch<SetStateAction<WbsTableColumnKey[]>>;
  setWbsSort: Dispatch<SetStateAction<WbsSortState | null>>;
  wbsColumnWidths: Record<WbsTableColumnKey, number>;
};

export function useWbsColumnActions({
  draggedWbsColumn,
  isAuthenticated,
  isClosedProject,
  project,
  saveProjectUiState,
  setDraggedWbsColumn,
  setWbsColumnOrder,
  setWbsColumnWidths,
  setWbsHiddenColumns,
  setWbsSort,
  wbsColumnWidths,
}: WbsColumnActionsDeps) {
  function startWbsColumnResize(
    columnKey: WbsTableColumnKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = wbsColumnWidths[columnKey];
    let latestWidths = wbsColumnWidths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        760,
        Math.max(56, startWidth + moveEvent.clientX - startX),
      );
      setWbsColumnWidths((current) => {
        latestWidths = {
          ...current,
          [columnKey]: nextWidth,
        };
        return latestWidths;
      });
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        { wbsColumnWidths: latestWidths },
        { wbsColumnWidths: latestWidths },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function moveWbsColumn(
    sourceKey: WbsTableColumnKey,
    targetKey: WbsTableColumnKey,
  ) {
    if (
      sourceKey === targetKey ||
      sourceKey === "level" ||
      targetKey === "level" ||
      sourceKey === "structure" ||
      targetKey === "structure"
    ) {
      return;
    }
    setWbsColumnOrder((current) => {
      const sourceIndex = current.indexOf(sourceKey);
      const targetIndex = current.indexOf(targetKey);
      if (sourceIndex === -1 || targetIndex === -1) return current;
      const next = normalizeWbsColumnOrder(current);
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      const normalizedNext = normalizeWbsColumnOrder(next);
      void saveProjectUiState(
        { wbsColumnOrder: normalizedNext },
        { wbsColumnOrder: normalizedNext },
      );
      return normalizedNext;
    });
  }

  function toggleWbsColumn(columnKey: WbsTableColumnKey) {
    if (columnKey === "level" || columnKey === "structure") return;
    setWbsHiddenColumns((current) => {
      const currentNormalized = normalizeWbsHiddenColumns(current);
      const isHidden = currentNormalized.includes(columnKey);
      const next = isHidden
        ? currentNormalized.filter((key) => key !== columnKey)
        : normalizeWbsHiddenColumns([...currentNormalized, columnKey]);
      void saveProjectUiState(
        { wbsHiddenColumns: next },
        { wbsHiddenColumns: next },
      );
      return next;
    });
  }

  function toggleWbsSort(columnKey: WbsTableColumnKey) {
    setWbsSort((current) => {
      const next =
        current?.columnKey !== columnKey
          ? { columnKey, direction: "asc" as const }
          : current.direction === "asc"
            ? { columnKey, direction: "desc" as const }
            : null;
      if (project && isAuthenticated && !isClosedProject) {
        void saveProjectUiState({ wbsSort: next }, { wbsSort: next });
      }
      return next;
    });
  }

  function startWbsColumnDrag(
    columnKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    if (columnKey === "level" || columnKey === "structure") {
      event.preventDefault();
      return;
    }
    setDraggedWbsColumn(columnKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnKey);
  }

  function dropWbsColumn(
    targetKey: WbsTableColumnKey,
    event: ReactDragEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    const sourceKey =
      (event.dataTransfer.getData("text/plain") as WbsTableColumnKey) ||
      draggedWbsColumn;
    if (sourceKey) moveWbsColumn(sourceKey, targetKey);
    setDraggedWbsColumn(null);
  }

  return {
    dropWbsColumn,
    startWbsColumnDrag,
    startWbsColumnResize,
    toggleWbsColumn,
    toggleWbsSort,
  };
}
