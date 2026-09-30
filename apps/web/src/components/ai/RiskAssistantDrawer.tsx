import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "../../api/client";
import { riskSuggestionRows, type FactRef, type RiskSuggestionRow, type RiskSuggestions } from "../../app/aiDrafts";
import type { AiStatus } from "../../hooks/useAiStatus";
import { useOpenFactRef } from "../../hooks/useOpenFactRef";
import { useI18n } from "../../i18n/I18nProvider";
import { AutomationError } from "../automation/AutomationPanel";
import { AiDrawer, AiModelNote } from "./AiDrawer";

type RowState = { selected: boolean; state?: "saved" | "error" | "unknown"; message?: string };

/**
 * New risks, scores and mitigation plans suggested from slips, overlaps and
 * stale Jira tickets. Only the ticked suggestions are applied, one by one,
 * through the register's own create and update requests and their checks.
 */
export function RiskAssistantDrawer({
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
  const { t, locale } = useI18n();
  const openRef = useOpenFactRef();
  const [rows, setRows] = useState<RiskSuggestionRow[]>([]);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [refs, setRefs] = useState<Record<string, FactRef>>({});
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
      const answer = await apiClient.post<RiskSuggestions & { droppedRefs: number; model: string }>(
        `/api/projects/${projectId}/ai/risk-suggestions`,
        { locale },
        t("ui.ai.riskFailed"),
        controller.signal,
      );
      const next = riskSuggestionRows(answer);
      setRows(next);
      setStates({});
      setRefs(answer.refs);
      setDroppedRefs(answer.droppedRefs);
      setNotice(next.length === 0 ? t("ui.ai.riskEmpty") : t("ui.ai.riskPreparedBy", { model: answer.model, count: next.length }));
    } catch (failure) {
      if (controller.signal.aborted) setNotice(t("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : t("ui.ai.riskFailed"));
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  };

  const edit = (key: string, patch: Partial<RiskSuggestionRow["body"]>) =>
    setRows((current) => current.map((row) => (row.key === key ? ({ ...row, body: { ...row.body, ...patch } } as RiskSuggestionRow) : row)));
  const toggle = (key: string, selected: boolean) => setStates((current) => ({ ...current, [key]: { ...current[key], selected } }));

  const apply = async () => {
    setBusy(true);
    setError("");
    let applied = 0;
    for (const row of rows) {
      if (!states[row.key]?.selected) continue;
      try {
        if (row.kind === "new") {
          const { basisRefs, ...risk } = row.body;
          const basis = basisRefs.map((ref) => refs[ref]?.label).filter(Boolean).join("; ");
          await apiClient.post(
            `/api/projects/${projectId}/raid-items`,
            { type: "RISK", ...risk, description: [risk.description || risk.title, basis && `${t("ui.ai.riskBasis")} ${basis}`].filter(Boolean).join("\n") },
            t("ui.ai.riskApplyFailed"),
          );
        } else {
          await apiClient.patch(`/api/raid-items/${row.riskId}`, row.body, t("ui.ai.riskApplyFailed"));
        }
        applied += 1;
        setStates((current) => ({ ...current, [row.key]: { selected: false, state: "saved", message: t("ui.ai.riskApplied") } }));
      } catch (failure) {
        // A refused request says why (for example a high risk without an owner); anything else may have been saved.
        const known = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
        setStates((current) => ({
          ...current,
          [row.key]: { selected: false, state: known ? "error" : "unknown", message: known ? failure.message : t("meeting.unknown") },
        }));
      }
    }
    setNotice(t("ui.ai.riskAppliedCount", { count: applied }));
    try {
      if (applied > 0) await onApplied();
    } catch (failure) {
      // What was applied stays applied; only the register did not reload.
      setError(failure instanceof Error ? failure.message : t("ui.ai.riskApplyFailed"));
    } finally {
      setBusy(false);
    }
  };

  const label = (ref: string) => refs[ref]?.label ?? ref;
  const selectedCount = rows.filter((row) => states[row.key]?.selected).length;
  const heading = { new: "ui.ai.riskNew", score: "ui.ai.riskScore", mitigation: "ui.ai.riskMitigation" } as const;

  return (
    <AiDrawer className="wbs-draft-drawer" labelId="risk-assistant-title" onClose={onClose} title={t("ui.ai.riskTitle")}>
      <AiModelNote model={ai.model ?? ""} textKey="ui.ai.riskIntro" />
      <div className="automation-actions">
        <button disabled={preparing || busy} onClick={() => void prepare()} type="button">
          <Sparkles aria-hidden="true" size={14} />
          {preparing ? t("ui.ai.reportPreparing") : rows.length ? t("ui.ai.reportAgain") : t("ui.ai.riskPrepare")}
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
      {rows.map((row, index) => {
        const state = states[row.key] ?? { selected: false };
        const locked = busy || state.state === "saved";
        return (
          <article className="automation-card risk-suggestion" key={row.key}>
            <label className="risk-suggestion-pick">
              <input
                aria-label={t("ui.ai.riskPick", { index: index + 1 })}
                checked={state.selected}
                disabled={locked}
                onChange={(event) => toggle(row.key, event.target.checked)}
                type="checkbox"
              />
              <strong>{t(heading[row.kind])}</strong>
              {row.kind !== "new" && (
                <button className="link-button" onClick={() => { onClose(); openRef(refs[`risk:${row.riskId}`] ?? { kind: "risk", id: row.riskId, label: row.riskId }); }} type="button">
                  {label(`risk:${row.riskId}`)}
                </button>
              )}
            </label>
            {row.kind === "new" && (
              <>
                <label>
                  {t("ui.ai.riskFieldTitle")}
                  <input disabled={locked} onChange={(event) => edit(row.key, { title: event.target.value })} value={row.body.title} />
                </label>
                <label>
                  {t("ui.ai.riskFieldDescription")}
                  <textarea disabled={locked} onChange={(event) => edit(row.key, { description: event.target.value })} value={row.body.description} />
                </label>
                <label>
                  {t("ui.ai.riskFieldOwner")}
                  <input disabled={locked} onChange={(event) => edit(row.key, { owner: event.target.value })} value={row.body.owner} />
                </label>
                <label>
                  {t("ui.ai.riskFieldMitigation")}
                  <textarea disabled={locked} onChange={(event) => edit(row.key, { mitigationPlan: event.target.value })} value={row.body.mitigationPlan} />
                </label>
                <p className="automation-ai-note">
                  {t("ui.ai.riskBasis")}{" "}
                  {row.body.basisRefs.map((ref) => (
                    <span key={ref} className="risk-suggestion-basis">
                      {refs[ref]?.kind === "jira" ? (
                        label(ref)
                      ) : (
                        <button className="link-button" onClick={() => { onClose(); openRef(refs[ref]); }} type="button">
                          {label(ref)}
                        </button>
                      )}
                    </span>
                  ))}
                </p>
              </>
            )}
            {(row.kind === "new" || row.kind === "score") && (
              <div className="risk-suggestion-grades">
                {(["probability", "impact"] as const).map((field) => (
                  <label key={field}>
                    {t(field === "probability" ? "ui.ai.riskProbability" : "ui.ai.riskImpact")}
                    <input
                      disabled={locked}
                      max={5}
                      min={1}
                      onChange={(event) => edit(row.key, { [field]: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })}
                      type="number"
                      value={(row.body as { probability: number; impact: number })[field]}
                    />
                  </label>
                ))}
                <span>{t("ui.ai.riskScoreValue", { score: (row.body as { probability: number }).probability * (row.body as { impact: number }).impact })}</span>
              </div>
            )}
            {row.kind === "score" && row.reason && <p className="automation-ai-note">{row.reason}</p>}
            {row.kind === "mitigation" && (
              <label>
                {t("ui.ai.riskFieldMitigation")}
                <textarea disabled={locked} onChange={(event) => edit(row.key, { mitigationPlan: event.target.value })} value={row.body.mitigationPlan} />
              </label>
            )}
            {state.message && (
              <p className={state.state === "saved" ? "automation-ai-note" : "automation-error"} role={state.state === "saved" ? "status" : "alert"}>
                {state.message}
              </p>
            )}
          </article>
        );
      })}
      {rows.length > 0 && (
        <div className="automation-actions">
          <button className="primary" disabled={busy || selectedCount === 0} onClick={() => void apply()} type="button">
            {busy ? t("ui.ai.wbsApplying") : t("ui.ai.riskApply", { count: selectedCount })}
          </button>
        </div>
      )}
    </AiDrawer>
  );
}
