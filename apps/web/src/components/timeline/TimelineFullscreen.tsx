import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FullscreenWorkspaceView } from "../../app/routes";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";

type TimelineView = Extract<FullscreenWorkspaceView, "leave-schedule" | "workload">;

/** How far the page or the grid scrolls down before full screen is suggested, as on the structure. */
const HINT_SCROLL_TOP = 180;

/**
 * Full screen for a people × days page, like the structure's: a toggle for the
 * toolbar and, once the user scrolls down, a one-time tip suggesting it.
 */
export function useTimelineFullscreen(view: TimelineView) {
  const { t } = useI18n();
  const { fullscreenWorkspaceView, toggleWorkspaceFullscreen } = usePageContext();
  const isFullscreen = fullscreenWorkspaceView === view;
  const [showHint, setShowHint] = useState(false);
  const hintShownRef = useRef(false);

  useEffect(() => {
    if (isFullscreen) return;
    // Scroll does not bubble: listen in the capture phase to see the grid's own scrolling too.
    const onScroll = (event: Event) => {
      if (hintShownRef.current) return;
      const target = event.target;
      const top = target instanceof Element ? target.scrollTop : window.scrollY;
      if (top < HINT_SCROLL_TOP) return;
      hintShownRef.current = true;
      setShowHint(true);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [isFullscreen]);

  const toggle = () => {
    setShowHint(false);
    toggleWorkspaceFullscreen(view);
  };

  const button = (
    <button
      aria-label={isFullscreen ? t("ui.common.exitFullscreen") : t("ui.common.fullScreen")}
      aria-pressed={isFullscreen}
      className="workspace-fullscreen-button"
      onClick={toggle}
      title={isFullscreen ? t("ui.common.exitFullscreen") : t("ui.common.fullScreen")}
      type="button"
    >
      {isFullscreen ? <Minimize2 aria-hidden="true" size={15} /> : <Maximize2 aria-hidden="true" size={15} />}
      {isFullscreen ? t("ui.common.normalMode") : t("ui.common.fullScreen")}
    </button>
  );

  const hint =
    showHint && !isFullscreen
      ? createPortal(
          <aside aria-label={t("ui.projects.structureViewModeTipLabel")} className="structure-fullscreen-hint">
            <button
              aria-label={t("ui.projects.closeTipAction")}
              className="structure-fullscreen-hint-close"
              onClick={() => setShowHint(false)}
              type="button"
            >
              <X size={16} />
            </button>
            <strong>{t(view === "workload" ? "ui.timeline.workloadTipTitle" : "ui.timeline.leaveTipTitle")}</strong>
            <span>{t("ui.timeline.fullScreenTipBody")}</span>
            <button className="structure-fullscreen-hint-action" onClick={toggle} type="button">
              <Maximize2 size={15} />
              {t("ui.common.fullScreen")}
            </button>
          </aside>,
          document.body,
        )
      : null;

  return { isFullscreen, button, hint };
}
