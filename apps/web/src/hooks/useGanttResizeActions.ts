import type {
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import type { ProjectUiState } from "../app/domainTypes";
import {
  GANTT_PANEL_HEIGHT_DEFAULT,
  GANTT_PANEL_WIDTH_DEFAULT,
  clampNumber,
  ganttPanelWidthBounds,
} from "../app/ganttConfig";

type GanttResizeActionsDeps = {
  ganttPanelHeight: number;
  ganttPanelWidth: number;
  ganttWbsWidth: number;
  saveProjectUiState: (
    patch: ProjectUiState,
    options?: {
      ganttPanelHeight?: number;
      ganttPanelWidth?: number;
      ganttWbsWidth?: number;
    },
  ) => Promise<void>;
  setGanttPanelHeight: Dispatch<SetStateAction<number>>;
  setGanttPanelWidth: Dispatch<SetStateAction<number>>;
  setGanttWbsWidth: Dispatch<SetStateAction<number>>;
};

export function useGanttResizeActions({
  ganttPanelHeight,
  ganttPanelWidth,
  ganttWbsWidth,
  saveProjectUiState,
  setGanttPanelHeight,
  setGanttPanelWidth,
  setGanttWbsWidth,
}: GanttResizeActionsDeps) {
  function startGanttResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = ganttWbsWidth;
    let latestWidth = startWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        640,
        Math.max(260, startWidth + moveEvent.clientX - startX),
      );
      latestWidth = nextWidth;
      setGanttWbsWidth(nextWidth);
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      await saveProjectUiState(
        { ganttWbsWidth: latestWidth },
        { ganttWbsWidth: latestWidth },
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function startGanttPanelResize(
    event: ReactPointerEvent<HTMLButtonElement>,
    axis: "width" | "height" | "both",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const panel = event.currentTarget.closest(".gantt-panel");
    const bounds = ganttPanelWidthBounds(panel);
    const currentPanelWidth =
      panel?.getBoundingClientRect().width ?? ganttPanelWidth;
    const startWidth = clampNumber(
      currentPanelWidth,
      bounds.min,
      bounds.max,
    );
    const startHeight = ganttPanelHeight;
    let latestWidth = axis === "height" ? ganttPanelWidth : startWidth;
    let latestHeight = startHeight;
    const onPointerMove = (moveEvent: PointerEvent) => {
      if (axis === "width" || axis === "both") {
        latestWidth = clampNumber(
          startWidth + moveEvent.clientX - startX,
          bounds.min,
          bounds.max,
        );
        setGanttPanelWidth(latestWidth);
      }
      if (axis === "height" || axis === "both") {
        latestHeight = clampNumber(
          startHeight + moveEvent.clientY - startY,
          320,
          900,
        );
        setGanttPanelHeight(latestHeight);
      }
    };
    const onPointerUp = async () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      const patch: ProjectUiState = {
        ganttPanelHeight: latestHeight,
      };
      const options: {
        ganttPanelHeight?: number;
        ganttPanelWidth?: number;
      } = {
        ganttPanelHeight: latestHeight,
      };
      if (axis === "width" || axis === "both") {
        patch.ganttPanelWidth = latestWidth;
        options.ganttPanelWidth = latestWidth;
      }
      await saveProjectUiState(patch, options);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function resetGanttPanelSize() {
    setGanttPanelHeight(GANTT_PANEL_HEIGHT_DEFAULT);
    setGanttPanelWidth(GANTT_PANEL_WIDTH_DEFAULT);
    await saveProjectUiState(
      {
        ganttPanelHeight: GANTT_PANEL_HEIGHT_DEFAULT,
        ganttPanelWidth: GANTT_PANEL_WIDTH_DEFAULT,
      },
      {
        ganttPanelHeight: GANTT_PANEL_HEIGHT_DEFAULT,
        ganttPanelWidth: GANTT_PANEL_WIDTH_DEFAULT,
      },
    );
  }

  return {
    resetGanttPanelSize,
    startGanttPanelResize,
    startGanttResize,
  };
}
