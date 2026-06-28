import { useEffect, useState } from "react";
import type { AppView, FullscreenWorkspaceView } from "../app/routes";

function expectedViewForFullscreen(
  fullscreenWorkspaceView: FullscreenWorkspaceView,
) {
  return fullscreenWorkspaceView === "overview-milestones-by-phase" ||
    fullscreenWorkspaceView === "overview-milestones-all"
    ? "project-schedule"
    : fullscreenWorkspaceView;
}

export function useWorkspaceFullscreen(activeView: AppView) {
  const [fullscreenWorkspaceView, setFullscreenWorkspaceView] =
    useState<FullscreenWorkspaceView | null>(null);

  useEffect(() => {
    if (!fullscreenWorkspaceView) return;
    if (activeView === expectedViewForFullscreen(fullscreenWorkspaceView)) return;

    const timeoutId = window.setTimeout(() => {
      setFullscreenWorkspaceView(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeView, fullscreenWorkspaceView]);

  useEffect(() => {
    if (!fullscreenWorkspaceView) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenWorkspaceView(null);
      }
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
