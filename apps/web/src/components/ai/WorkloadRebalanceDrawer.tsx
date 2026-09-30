import { Sparkles, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../../api/client";
import { rebalanceChange, workChangeBody, type RebalanceItem, type RebalanceSuggestion, type WorkChange } from "../../app/aiDrafts";
import type { AiStatus } from "../../hooks/useAiStatus";
import { useI18n } from "../../i18n/I18nProvider";
import { AutomationError } from "../automation/AutomationPanel";
import { AiDrawer, AiModelNote } from "./AiDrawer";

const HORIZONS = [30, 60, 90] as const;

type Applied = { itemId: string; updatedAt: string; undo: WorkChange };
type RowState = { selected: boolean; state?: "saved" | "error"; message?: string };
type SavedItem = { item: { updatedAt: string } };

/**
 * Who should take which work and when, to remove overloads and work that
 * falls on leave. The ticked suggestions are saved one by one with the same
 * edit and version check as dragging on the workload page, and can be undone
 * together.
 */
export function WorkloadRebalanceDrawer({ ai, onApplied, onClose }: { ai: AiStatus; onApplied: () => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [horizonDays, setHorizonDays] = useState<(typeof HORIZONS)[number]>(30);
  const [suggestions, setSuggestions] = useState<RebalanceSuggestion[]>([]);
  const [items, setItems] = useState<Record<string, RebalanceItem>>({});
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [applied, setApplied] = useState<Applied[]>([]);
  const [droppedRefs, setDroppedRefs] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const prepare = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setError("");
    setNotice("");
    try {
      const answer = await apiClient.post<{ suggestions: RebalanceSuggestion[]; items: Record<string, RebalanceItem>; droppedRefs: number; model?: string; nothingToMove?: boolean }>(
        "/api/ai/workload-rebalance",
        { horizonDays, locale },
        t("ui.ai.rebalanceFailed"),
        controller.signal,
      );
      setSuggestions(answer.suggestions);
      setItems(answer.items);
      setStates({});
      setApplied([]);
      setDroppedRefs(answer.droppedRefs);
      setNotice(
        answer.nothingToMove
          ? t("ui.ai.rebalanceNothingToMove")
          : answer.suggestions.length === 0
            ? t("ui.ai.rebalanceEmpty")
            : t("ui.ai.rebalancePreparedBy", { model: answer.model ?? "", count: answer.suggestions.length }),
      );
    } catch (failure) {
      if (controller.signal.aborted) setNotice(t("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : t("ui.ai.rebalanceFailed"));
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setError("");
    const done: Applied[] = [];
    for (const suggestion of suggestions) {
      if (!states[suggestion.itemId]?.selected) continue;
      const item = items[suggestion.itemId];
      const change = rebalanceChange(suggestion);
      try {
        const saved = await apiClient.patch<SavedItem>(`/api/wbs-items/${item.id}`, workChangeBody(change, item.updatedAt), t("ui.ai.rebalanceApplyFailed"));
        done.push({
          itemId: item.id,
          updatedAt: saved.item.updatedAt,
          undo: {
            ...(change.owner ? { owner: item.owner } : {}),
            ...(change.startDate ? { startDate: item.startDate } : {}),
            ...(change.dueDate ? { dueDate: item.dueDate } : {}),
          },
        });
        setStates((current) => ({ ...current, [suggestion.itemId]: { selected: false, state: "saved", message: t("ui.ai.riskApplied") } }));
      } catch (failure) {
        // A 409 means someone changed the work meanwhile; nothing is retried.
        const message = failure instanceof ApiError ? failure.message : t("ui.ai.rebalanceApplyFailed");
        setStates((current) => ({ ...current, [suggestion.itemId]: { selected: false, state: "error", message } }));
      }
    }
    setApplied((current) => [...current, ...done]);
    setNotice(t("ui.ai.riskAppliedCount", { count: done.length }));
    if (done.length > 0) onApplied();
    setBusy(false);
  };

  /** Puts back what was applied, last first, each with the version its save returned. */
  const undoAll = async () => {
    setBusy(true);
    setError("");
    const left: Applied[] = [];
    for (const entry of [...applied].reverse()) {
      try {
        await apiClient.patch(`/api/wbs-items/${entry.itemId}`, workChangeBody(entry.undo, entry.updatedAt), t("ui.ai.rebalanceUndoFailed"));
        setStates((current) => ({ ...current, [entry.itemId]: { selected: false, message: t("ui.ai.rebalanceUndone") } }));
      } catch (failure) {
        left.unshift(entry);
        setStates((current) => ({
          ...current,
          [entry.itemId]: { selected: false, state: "error", message: failure instanceof Error ? failure.message : t("ui.ai.rebalanceUndoFailed") },
        }));
      }
    }
    setApplied(left);
    setNotice(left.length === 0 ? t("ui.ai.rebalanceUndoneAll") : t("ui.ai.rebalanceUndoLeft", { count: left.length }));
    onApplied();
    setBusy(false);
  };

  const selectedCount = suggestions.filter((suggestion) => states[suggestion.itemId]?.selected).length;
  return (
    <AiDrawer className="wbs-draft-drawer" labelId="workload-rebalance-title" onClose={onClose} title={t("ui.ai.rebalanceTitle")}>
      <AiModelNote model={ai.model ?? ""} textKey="ui.ai.rebalanceIntro" />
      <div className="automation-actions">
        <div className="ai-period" role="group" aria-label={t("ui.ai.prepHorizon")}>
          {HORIZONS.map((days) => (
            <button aria-pressed={horizonDays === days} className={horizonDays === days ? "active" : ""} disabled={preparing || busy} key={days} onClick={() => setHorizonDays(days)} type="button">
              {t("ui.ai.reportDays", { days })}
            </button>
          ))}
        </div>
        <button disabled={preparing || busy} onClick={() => void prepare()} type="button">
          <Sparkles aria-hidden="true" size={14} />
          {preparing ? t("ui.ai.reportPreparing") : suggestions.length ? t("ui.ai.reportAgain") : t("ui.ai.rebalancePrepare")}
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
      {suggestions.map((suggestion, index) => {
        const item = items[suggestion.itemId];
        const state = states[suggestion.itemId] ?? { selected: false };
        const saved = applied.some((entry) => entry.itemId === suggestion.itemId);
        return (
          <article className="automation-card rebalance-suggestion" key={suggestion.itemId}>
            <label className="risk-suggestion-pick">
              <input
                aria-label={t("ui.ai.riskPick", { index: index + 1 })}
                checked={state.selected}
                // Once saved, refused or undone, the version the suggestion read is stale: prepare again to retry.
                disabled={busy || saved || Boolean(state.message)}
                onChange={(event) => setStates((current) => ({ ...current, [suggestion.itemId]: { ...current[suggestion.itemId], selected: event.target.checked } }))}
                type="checkbox"
              />
              <strong>
                {item.projectCode} {item.code} {item.title}
              </strong>
            </label>
            <dl className="rebalance-change">
              {suggestion.newOwner && (
                <>
                  <dt>{t("ui.ai.riskFieldOwner")}</dt>
                  <dd>
                    {item.owner} → <strong>{suggestion.newOwner}</strong>
                  </dd>
                </>
              )}
              {(suggestion.newStartDate || suggestion.newDueDate) && (
                <>
                  <dt>{t("ui.ai.rebalanceDates")}</dt>
                  <dd>
                    {item.startDate} – {item.dueDate} →{" "}
                    <strong>
                      {suggestion.newStartDate ?? item.startDate} – {suggestion.newDueDate ?? item.dueDate}
                    </strong>
                  </dd>
                </>
              )}
            </dl>
            {suggestion.reason && <p className="automation-ai-note">{suggestion.reason}</p>}
            {state.message && (
              <p className={state.state === "error" ? "automation-error" : "automation-ai-note"} role={state.state === "error" ? "alert" : "status"}>
                {state.message}
              </p>
            )}
          </article>
        );
      })}
      {suggestions.length > 0 && (
        <div className="automation-actions">
          <button className="primary" disabled={busy || selectedCount === 0} onClick={() => void apply()} type="button">
            {busy ? t("ui.ai.wbsApplying") : t("ui.ai.riskApply", { count: selectedCount })}
          </button>
          {applied.length > 0 && (
            <button disabled={busy} onClick={() => void undoAll()} type="button">
              <Undo2 aria-hidden="true" size={14} />
              {t("ui.ai.rebalanceUndo", { count: applied.length })}
            </button>
          )}
        </div>
      )}
    </AiDrawer>
  );
}
