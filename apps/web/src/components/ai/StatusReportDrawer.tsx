import { Copy, Download, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import type { AiStatus } from "../../hooks/useAiStatus";
import { useI18n } from "../../i18n/I18nProvider";
import { AutomationError } from "../automation/AutomationPanel";
import { AiDrawer, AiModelNote } from "./AiDrawer";
import { downloadMarkdown } from "./download";
import { statusReportText, type StatusReport } from "../../app/aiDrafts";

const PERIODS = [7, 14, 30] as const;

/**
 * A status report for management written by the model from the project's
 * facts. It is only shown: the user edits it, copies it or downloads it.
 */
export function StatusReportDrawer({ projectId, projectName, ai, onClose }: { projectId: string; projectName: string; ai: AiStatus; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [periodDays, setPeriodDays] = useState<(typeof PERIODS)[number]>(7);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const usable = ai.enabled && ai.allowed;

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepare = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setError("");
    setNotice("");
    try {
      const answer = await apiClient.post<{ report: StatusReport; model: string; periodDays: number }>(
        `/api/projects/${projectId}/ai/status-report`,
        { periodDays, locale },
        t("ui.ai.reportFailed"),
        controller.signal,
      );
      setText(statusReportText(answer.report, projectName, answer.periodDays, t));
      setPreparedBy(answer.model);
    } catch (failure) {
      if (controller.signal.aborted) setNotice(t("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : t("ui.ai.reportFailed"));
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
    <AiDrawer labelId="status-report-title" onClose={onClose} title={t("ui.ai.reportTitle")}>
      {usable && <AiModelNote model={ai.model ?? ""} textKey="ui.ai.reportIntro" />}
      <div className="automation-actions">
        <div className="ai-period" role="group" aria-label={t("ui.ai.reportPeriod")}>
          {PERIODS.map((days) => (
            <button
              aria-pressed={periodDays === days}
              className={periodDays === days ? "active" : ""}
              disabled={preparing}
              key={days}
              onClick={() => setPeriodDays(days)}
              type="button"
            >
              {t("ui.ai.reportDays", { days })}
            </button>
          ))}
        </div>
        <button disabled={!usable || preparing} onClick={() => void prepare()} type="button">
          <Sparkles aria-hidden="true" size={14} />
          {preparing ? t("ui.ai.reportPreparing") : text ? t("ui.ai.reportAgain") : t("ui.ai.reportPrepare")}
        </button>
        {preparing && (
          <button onClick={() => abortRef.current?.abort()} type="button">
            {t("ui.automation.aiCancel")}
          </button>
        )}
      </div>
      <AutomationError error={error} />
      {notice && <p role="status">{notice}</p>}
      {text && (
        <>
          <p className="automation-ai-note">{t("ui.ai.reportPreparedBy", { model: preparedBy })}</p>
          <label>
            {t("ui.ai.reportText")}
            <textarea className="automation-textarea status-report-text" onChange={(event) => setText(event.target.value)} value={text} />
          </label>
          <div className="automation-actions">
            <button onClick={() => void copy()} type="button">
              <Copy aria-hidden="true" size={14} />
              {t("ui.ai.copy")}
            </button>
            <button onClick={() => downloadMarkdown(text, "status-report")} type="button">
              <Download aria-hidden="true" size={14} />
              {t("ui.ai.download")}
            </button>
          </div>
        </>
      )}
    </AiDrawer>
  );
}
