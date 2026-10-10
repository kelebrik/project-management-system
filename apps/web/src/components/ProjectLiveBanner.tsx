import { RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { summarizeLiveEvents, type ProjectLiveEvent } from "../app/useProjectLiveUpdates";
import { useI18n } from "../i18n/I18nProvider";
import type { SimpleTranslationKey } from "../i18n/types";

const SECTION_KEYS: Record<string, SimpleTranslationKey> = {
  structure: "ui.live.section.structure",
  issues: "ui.live.section.issues",
  raid: "ui.live.section.raid",
  decisions: "ui.live.section.decisions",
  changes: "ui.live.section.changes",
  jira: "ui.live.section.jira",
  passport: "ui.live.section.passport",
  requirements: "ui.live.section.requirements",
  artifacts: "ui.live.section.artifacts",
  calendar: "ui.live.section.calendar",
  schedule: "ui.live.section.schedule",
  lessons: "ui.live.section.lessons",
  project: "ui.live.section.project",
};

/**
 * Says that someone else changed the open project and offers to load the new
 * state; nothing reloads by itself, as many pages hold unsaved edits.
 */
export function ProjectLiveBanner({ events, onRefresh, onDismiss }: { events: ProjectLiveEvent[]; onRefresh: () => Promise<void>; onDismiss: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (events.length === 0) return null;
  const { people, sections, count } = summarizeLiveEvents(events);
  const who = people.length > 0 ? people.join(", ") : t("ui.live.someone");
  const what = sections.map((section) => t(SECTION_KEYS[section] ?? "ui.live.section.project")).join(", ");
  return (
    <div className="project-live-banner" role="status" aria-live="polite">
      <span>
        <b>{who}</b> {t("ui.live.changed", { sections: what })}
        {count > 1 && <small> · {t("ui.live.count", { count })}</small>}
      </span>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onRefresh().finally(() => setBusy(false));
        }}
      >
        <RefreshCw aria-hidden="true" size={14} /> {t("ui.live.refresh")}
      </button>
      <button type="button" className="icon-button" aria-label={t("ui.live.dismiss")} title={t("ui.live.dismiss")} onClick={onDismiss}>
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
