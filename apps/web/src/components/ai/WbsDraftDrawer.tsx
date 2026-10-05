import { Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../../api/client";
import type { AiStatus } from "../../hooks/useAiStatus";
import { useI18n } from "../../i18n/I18nProvider";
import { AutomationError } from "../automation/AutomationPanel";
import { AiDrawer, AiModelNote } from "./AiDrawer";
import { withoutDraftRow, type WbsDraftItem } from "../../app/aiDrafts";

const TYPE_KEYS = {
  PHASE: "ui.ai.wbsPhase",
  WORK_PACKAGE: "ui.ai.wbsPackage",
  TASK: "ui.ai.wbsTask",
  MILESTONE: "ui.ai.wbsMilestone",
} as const;

const newDraftKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * A structure draft written by the model from a project description. The user
 * trims it and adds it after the existing rows; the added rows can be removed
 * again with one click. Nothing is created before "Add to the structure".
 */
export function WbsDraftDrawer({
  projectId,
  ai,
  onApplied,
  onClose,
}: {
  projectId: string;
  ai: AiStatus;
  onApplied: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<WbsDraftItem[]>([]);
  const [droppedLinks, setDroppedLinks] = useState(0);
  const [draftKey, setDraftKey] = useState("");
  const [created, setCreated] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const usable = ai.enabled && ai.allowed;

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepare = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setError("");
    setNotice("");
    setCreated([]);
    try {
      const answer = await apiClient.postAi<{ items: WbsDraftItem[]; droppedLinks: number; model: string }>(
        `/api/projects/${projectId}/ai/wbs-draft`,
        { description },
        t("ui.ai.wbsFailed"),
        controller.signal,
      );
      setItems(answer.items);
      setDroppedLinks(answer.droppedLinks);
      setDraftKey(newDraftKey());
      setNotice(answer.items.length === 0 ? t("ui.ai.wbsEmpty") : t("ui.ai.wbsPreparedBy", { model: answer.model, count: answer.items.length }));
    } catch (failure) {
      if (controller.signal.aborted) setNotice(t("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : t("ui.ai.wbsFailed"));
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const answer = await apiClient.post<{ createdIds: string[] }>(
        `/api/projects/${projectId}/wbs-draft/apply`,
        { items, startDate, draftKey },
        t("ui.ai.wbsApplyFailed"),
      );
      setCreated(answer.createdIds);
      setNotice(t("ui.ai.wbsApplied", { count: answer.createdIds.length }));
      await onApplied();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.ai.wbsApplyFailed"));
    } finally {
      setBusy(false);
    }
  };

  /** Removes exactly the rows this draft added, nothing else. */
  const undo = async () => {
    setBusy(true);
    setError("");
    try {
      await apiClient.delete(`/api/projects/${projectId}/wbs-items`, t("ui.ai.wbsUndoFailed"), { itemIds: created });
      setCreated([]);
      setNotice(t("ui.ai.wbsUndone"));
      await onApplied();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t("ui.ai.wbsUndoFailed"));
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || preparing;
  return (
    <AiDrawer className="wbs-draft-drawer" labelId="wbs-draft-title" onClose={onClose} title={t("ui.ai.wbsTitle")}>
      {usable && <AiModelNote model={ai.model ?? ""} textKey="ui.ai.wbsIntro" />}
      <label>
        {t("ui.ai.wbsDescription")}
        <textarea
          className="automation-textarea"
          disabled={locked || !usable}
          maxLength={8000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("ui.ai.wbsDescriptionPlaceholder")}
          value={description}
        />
      </label>
      <div className="automation-actions">
        <button disabled={locked || !usable || description.trim().length < 20} onClick={() => void prepare()} type="button">
          <Sparkles aria-hidden="true" size={14} />
          {preparing ? t("ui.ai.wbsPreparing") : t("ui.ai.wbsPrepare")}
        </button>
        {preparing && (
          <button onClick={() => abortRef.current?.abort()} type="button">
            {t("ui.automation.aiCancel")}
          </button>
        )}
      </div>
      <AutomationError error={error} />
      {notice && <p role="status">{notice}</p>}
      {droppedLinks > 0 && items.length > 0 && <p className="automation-warning">{t("ui.ai.wbsDroppedLinks", { count: droppedLinks })}</p>}
      {items.length > 0 && (
        <>
          <ul className="wbs-draft-tree" aria-label={t("ui.ai.wbsTitle")}>
            {items.map((item) => (
              <li className={`wbs-draft-row level-${item.ref.split(".").length} ${item.type.toLowerCase()}`} key={item.ref}>
                <span className="wbs-draft-ref">{item.ref}</span>
                <input
                  aria-label={t("ui.ai.wbsRowTitle", { ref: item.ref })}
                  disabled={locked || created.length > 0}
                  onChange={(event) => setItems((current) => current.map((row) => (row.ref === item.ref ? { ...row, title: event.target.value } : row)))}
                  value={item.title}
                />
                <span className="wbs-draft-type">{t(TYPE_KEYS[item.type])}</span>
                <span className="wbs-draft-days">{item.type === "TASK" ? t("ui.ai.wbsDays", { days: item.workDays }) : ""}</span>
                <span className="wbs-draft-links" title={item.predecessors.join(", ")}>
                  {item.predecessors.length > 0 ? `← ${item.predecessors.join(", ")}` : ""}
                </span>
                <button
                  aria-label={t("ui.ai.wbsRemoveRow", { ref: item.ref })}
                  disabled={locked || created.length > 0}
                  onClick={() => setItems((current) => withoutDraftRow(current, item.ref))}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="automation-actions">
            <label>
              {t("ui.ai.wbsStart")}
              <input disabled={locked || created.length > 0} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
            </label>
            {created.length === 0 ? (
              <button className="primary" disabled={locked || items.length === 0 || !startDate} onClick={() => void apply()} type="button">
                {busy ? t("ui.ai.wbsApplying") : t("ui.ai.wbsApply", { count: items.length })}
              </button>
            ) : (
              <button disabled={locked} onClick={() => void undo()} type="button">
                <Undo2 aria-hidden="true" size={14} />
                {t("ui.ai.wbsUndo")}
              </button>
            )}
          </div>
          <p className="automation-warning">{t("ui.ai.wbsWhereRowsGo")}</p>
        </>
      )}
    </AiDrawer>
  );
}
