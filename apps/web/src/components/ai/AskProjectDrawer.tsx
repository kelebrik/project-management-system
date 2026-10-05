import { MessageCircleQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import type { FactRef } from "../../app/aiDrafts";
import type { AiStatus } from "../../hooks/useAiStatus";
import { useOpenFactRef } from "../../hooks/useOpenFactRef";
import { useI18n } from "../../i18n/I18nProvider";
import { AutomationError } from "../automation/AutomationPanel";
import { AiDrawer, AiModelNote } from "./AiDrawer";

type Answer = { question: string; answer: string; citations: string[]; insufficientData: boolean; refs: Record<string, FactRef>; droppedRefs: number };

/**
 * Questions about the project in plain words, answered only from its data,
 * with the rows each answer relies on. The answers stay in this panel only.
 */
export function AskProjectDrawer({ projectId, ai, onClose }: { projectId: string; ai: AiStatus; onClose: () => void }) {
  const { t, locale } = useI18n();
  const openRef = useOpenFactRef();
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = async () => {
    const asked = question.trim();
    const controller = new AbortController();
    abortRef.current = controller;
    setAsking(true);
    setError("");
    setNotice("");
    try {
      const answer = await apiClient.postAi<Omit<Answer, "question">>(
        `/api/projects/${projectId}/ai/ask`,
        { question: asked, locale },
        t("ui.ai.askFailed"),
        controller.signal,
      );
      setAnswers((current) => [{ ...answer, question: asked }, ...current]);
      setQuestion("");
    } catch (failure) {
      if (controller.signal.aborted) setNotice(t("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : t("ui.ai.askFailed"));
    } finally {
      abortRef.current = null;
      setAsking(false);
    }
  };

  return (
    <AiDrawer labelId="ask-project-title" onClose={onClose} title={t("ui.ai.askTitle")}>
      <AiModelNote model={ai.model ?? ""} textKey="ui.ai.askIntro" />
      <label>
        {t("ui.ai.askQuestion")}
        <textarea
          className="automation-textarea ask-question"
          disabled={asking}
          maxLength={500}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && question.trim().length >= 5) void ask();
          }}
          placeholder={t("ui.ai.askPlaceholder")}
          value={question}
        />
      </label>
      <div className="automation-actions">
        <button disabled={asking || question.trim().length < 5} onClick={() => void ask()} type="button">
          <MessageCircleQuestion aria-hidden="true" size={14} />
          {asking ? t("ui.ai.askAsking") : t("ui.ai.askButton")}
        </button>
        {asking && (
          <button onClick={() => abortRef.current?.abort()} type="button">
            {t("ui.automation.aiCancel")}
          </button>
        )}
      </div>
      <AutomationError error={error} />
      {notice && <p role="status">{notice}</p>}
      {answers.map((entry, index) => (
        <article className="automation-card ask-answer" key={`${answers.length - index}`}>
          <p className="ask-answer-question">{entry.question}</p>
          <p className="ask-answer-text">{entry.answer}</p>
          {entry.insufficientData && <p className="automation-warning">{t("ui.ai.askInsufficient")}</p>}
          {entry.citations.length > 0 && (
            <div className="ai-ref-links" role="group" aria-label={t("ui.ai.relatedRows")}>
              <span>{t("ui.ai.relatedRows")}</span>
              {entry.citations.map((ref) => {
                const known = entry.refs[ref];
                if (!known) return null;
                return known.kind === "jira" ? (
                  <span className="ai-ref-jira" key={ref}>
                    {known.label}
                  </span>
                ) : (
                  <button
                    key={ref}
                    onClick={() => {
                      onClose();
                      openRef(known);
                    }}
                    type="button"
                  >
                    {known.label}
                  </button>
                );
              })}
            </div>
          )}
          {entry.droppedRefs > 0 && <p className="automation-warning">{t("ui.ai.droppedRefs", { count: entry.droppedRefs })}</p>}
        </article>
      ))}
    </AiDrawer>
  );
}
