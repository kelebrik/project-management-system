import { ClipboardList, Copy, Download, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import { meetingPrepText, type FactRef, type MeetingPrep } from "../../app/aiDrafts";
import type { AiStatus } from "../../hooks/useAiStatus";
import { useOpenFactRef } from "../../hooks/useOpenFactRef";
import { useI18n } from "../../i18n/I18nProvider";
import { AutomationError } from "../automation/AutomationPanel";
import { AiDrawer, AiModelNote } from "./AiDrawer";
import { downloadMarkdown } from "./download";

const HORIZONS = [7, 14] as const;

/**
 * An agenda for the next team meeting and whom to ask what, from the issues,
 * overdue work, checkpoints and risks of the project. Nothing is saved; after
 * the meeting the notes go through "From meeting notes".
 */
export function MeetingPrepDrawer({
  projectId,
  projectName,
  ai,
  onClose,
  onOpenMeetingNotes,
}: {
  projectId: string;
  projectName: string;
  ai: AiStatus;
  onClose: () => void;
  onOpenMeetingNotes: () => void;
}) {
  const { t, locale } = useI18n();
  const openRef = useOpenFactRef();
  const [horizonDays, setHorizonDays] = useState<(typeof HORIZONS)[number]>(7);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [links, setLinks] = useState<FactRef[]>([]);
  const [droppedRefs, setDroppedRefs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepare = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setError("");
    setNotice("");
    try {
      const answer = await apiClient.post<MeetingPrep & { droppedRefs: number; model: string }>(
        `/api/projects/${projectId}/ai/meeting-prep`,
        { horizonDays, locale },
        t("ui.ai.prepFailed"),
        controller.signal,
      );
      setText(meetingPrepText(answer, projectName, t));
      setLinks(Object.values(answer.refs));
      setDroppedRefs(answer.droppedRefs);
      setNotice(answer.agenda.length === 0 ? t("ui.ai.prepEmpty") : t("ui.ai.prepPreparedBy", { model: answer.model }));
    } catch (failure) {
      if (controller.signal.aborted) setNotice(t("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : t("ui.ai.prepFailed"));
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t("ui.ai.copied"));
    } catch {
      setError(t("ui.ai.copyFailed"));
    }
  };

  return (
    <AiDrawer labelId="meeting-prep-title" onClose={onClose} title={t("ui.ai.prepTitle")}>
      <AiModelNote model={ai.model ?? ""} textKey="ui.ai.prepIntro" />
      <div className="automation-actions">
        <div className="ai-period" role="group" aria-label={t("ui.ai.prepHorizon")}>
          {HORIZONS.map((days) => (
            <button
              aria-pressed={horizonDays === days}
              className={horizonDays === days ? "active" : ""}
              disabled={preparing}
              key={days}
              onClick={() => setHorizonDays(days)}
              type="button"
            >
              {t("ui.ai.reportDays", { days })}
            </button>
          ))}
        </div>
        <button disabled={preparing} onClick={() => void prepare()} type="button">
          <Sparkles aria-hidden="true" size={14} />
          {preparing ? t("ui.ai.reportPreparing") : text ? t("ui.ai.reportAgain") : t("ui.ai.prepPrepare")}
        </button>
        {preparing && (
          <button onClick={() => abortRef.current?.abort()} type="button">
            {t("ui.automation.aiCancel")}
          </button>
        )}
      </div>
      <AutomationError error={error} />
      {notice && <p role="status">{notice}</p>}
      {droppedRefs > 0 && <p className="automation-warning">{t("ui.ai.droppedRefs", { count: droppedRefs })}</p>}
      {text && (
        <>
          <label>
            {t("ui.ai.prepText")}
            <textarea className="automation-textarea status-report-text" onChange={(event) => setText(event.target.value)} value={text} />
          </label>
          {links.length > 0 && (
            <div className="ai-ref-links" aria-label={t("ui.ai.relatedRows")} role="group">
              <span>{t("ui.ai.relatedRows")}</span>
              {links.map((ref) => (
                <button
                  key={`${ref.kind}:${ref.id}`}
                  onClick={() => {
                    onClose();
                    openRef(ref);
                  }}
                  type="button"
                >
                  {ref.label}
                </button>
              ))}
            </div>
          )}
          <div className="automation-actions">
            <button onClick={() => void copy()} type="button">
              <Copy aria-hidden="true" size={14} />
              {t("ui.ai.copy")}
            </button>
            <button onClick={() => downloadMarkdown(text, "meeting-agenda")} type="button">
              <Download aria-hidden="true" size={14} />
              {t("ui.ai.download")}
            </button>
            <button onClick={onOpenMeetingNotes} type="button">
              <ClipboardList aria-hidden="true" size={14} />
              {t("ui.ai.prepAfterMeeting")}
            </button>
          </div>
        </>
      )}
    </AiDrawer>
  );
}
