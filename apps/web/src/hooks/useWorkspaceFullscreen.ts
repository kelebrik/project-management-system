import { useEffect, useState } from "react";
import type { AppView, FullscreenWorkspaceView } from "../app/routes";

/** The views where a full-screen workspace may stay open: the milestones live on the old schedule in Development. */
function expectedViewsForFullscreen(
  fullscreenWorkspaceView: FullscreenWorkspaceView,
): AppView[] {
  return fullscreenWorkspaceView === "overview-milestones-by-phase" ||
    fullscreenWorkspaceView === "overview-milestones-all"
    ? ["schedule-legacy", "project-schedule"]
    : [fullscreenWorkspaceView];
}

export function useWorkspaceFullscreen(activeView: AppView) {
  const [fullscreenWorkspaceView, setFullscreenWorkspaceView] =
    useState<FullscreenWorkspaceView | null>(null);

  useEffect(() => {
    if (!fullscreenWorkspaceView) return;
    if (expectedViewsForFullscreen(fullscreenWorkspaceView).includes(activeView)) return;

    const timeoutId = window.setTimeout(() => {
      setFullscreenWorkspaceView(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeView, fullscreenWorkspaceView]);

  useEffect(() => {
    if (!fullscreenWorkspaceView) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"][aria-modal="true"]')
      ) return;
      setFullscreenWorkspaceView(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenWorkspaceView]);

  const toggleWorkspaceFullscreen = (view: FullscreenWorkspaceView) => {
    setFullscreenWorkspaceView((current) => (current === view ? null : view));
  };

  return {
    fullscreenWorkspaceView,
    setFullscreenWorkspaceView,
    toggleWorkspaceFullscreen,
  };
}
