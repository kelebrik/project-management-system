import { Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/automation.css";

/** A side drawer for an AI helper, with the same frame as the meeting notes tool. */
export function AiDrawer({ title, labelId, onClose, children, className = "" }: { title: string; labelId: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        aria-labelledby={labelId}
        aria-modal="true"
        className={`side-drawer meeting-notes-drawer ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
        ref={containerRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="drawer-title">
          <div>
            <h2 id={labelId}>{title}</h2>
          </div>
          <button aria-label={t("ui.projects.closePanel")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="automation-body">{children}</div>
      </aside>
    </div>
  );
}

/** Which model answers and where the text goes. */
export function AiModelNote({ model, textKey }: { model: string; textKey: "ui.ai.reportIntro" | "ui.ai.wbsIntro" }) {
  const { t } = useI18n();
  return (
    <p className="automation-ai-note">
      <Sparkles aria-hidden="true" size={14} />
      {t(textKey, { model })}
    </p>
  );
}
