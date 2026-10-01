import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { Proposal } from "../../app/automationRules";
import { useI18n } from "../../i18n/I18nProvider";

type Draft = { title: string; owner: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" };

/** What the rules prepared and nobody has decided yet: a person applies or rejects each one. */
export function ProposalsList({ projectId, canWrite, onDecided }: { projectId: string; canWrite: boolean; onDecided: () => void }) {
  const { t, labels } = useI18n();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    apiClient
      .get<Proposal[]>(`/api/projects/${projectId}/automation/proposals`, t("ui.rules.failed"))
      .then(setProposals)
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.rules.failed")));
  }, [projectId, t]);
  useEffect(load, [load]);

  const draftOf = (proposal: Proposal): Draft =>
    drafts[proposal.id] ?? { title: proposal.payload.title ?? "", owner: proposal.payload.owner ?? "", severity: proposal.payload.severity ?? "HIGH" };
  const setDraft = (proposal: Proposal, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [proposal.id]: { ...draftOf(proposal), ...patch } }));

  const decide = async (proposal: Proposal, decision: "apply" | "reject") => {
    setBusyId(proposal.id);
    setError("");
    setNotice("");
    try {
      const body = decision === "apply" && proposal.kind === "CREATE_ISSUE" ? { version: proposal.version, ...draftOf(proposal) } : { version: proposal.version };
      await apiClient.post(`/api/projects/${projectId}/automation/proposals/${proposal.id}/${decision}`, body, t("ui.rules.decideFailed"));
      setNotice(decision === "apply" ? t("ui.rules.applied") : t("ui.rules.rejected"));
      onDecided();
    } catch (failure) {
      // A stale or already decided proposal leaves the list on the reload below.
      setError(failure instanceof Error ? failure.message : t("ui.rules.decideFailed"));
    } finally {
      setBusyId(null);
      load();
    }
  };

  if (!proposals) return error ? <p className="automation-error" role="alert">{error}</p> : null;
  return (
    <section className="rules-page" aria-label={t("ui.rules.tabProposals", { count: proposals.length })}>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
      {proposals.length === 0 ? (
        <p>{t("ui.rules.noProposals")}</p>
      ) : (
        <ul className="rules-list">
          {proposals.map((proposal) => {
            const row = proposal.payload.row;
            const draft = draftOf(proposal);
            const busy = busyId === proposal.id;
            return (
              <li key={proposal.id}>
                {proposal.kind === "CREATE_ISSUE" ? (
                  <>
                    <strong>{t("ui.rules.proposalIssue")}</strong>
                    {row && <small>{t("ui.rules.proposalFrom", { person: proposal.payload.person ?? "", code: row.code, title: row.title })}</small>}
                    <div className="proposal-fields">
                      <label>
                        {t("ui.rules.issueTitle")}
                        <input disabled={!canWrite || busy} maxLength={500} onChange={(event) => setDraft(proposal, { title: event.target.value })} value={draft.title} />
                      </label>
                      <label>
                        {t("ui.rules.issueOwner")}
                        <input disabled={!canWrite || busy} maxLength={200} onChange={(event) => setDraft(proposal, { owner: event.target.value })} value={draft.owner} />
                      </label>
                      <label>
                        {t("ui.rules.issueSeverity")}
                        <select disabled={!canWrite || busy} onChange={(event) => setDraft(proposal, { severity: event.target.value as Draft["severity"] })} value={draft.severity}>
                          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((severity) => (
                            <option key={severity} value={severity}>
                              {labels.issueSeverityLabel(severity)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {proposal.payload.impact && <small>{proposal.payload.impact}</small>}
                  </>
                ) : (
                  <strong>{t("ui.rules.proposalStatus", { code: row?.code ?? "", title: row?.title ?? "", key: proposal.payload.expectedJira?.key ?? "" })}</strong>
                )}
                {canWrite && (
                  <div className="rule-actions">
                    <button className="primary" disabled={busy || (proposal.kind === "CREATE_ISSUE" && !draft.title.trim())} onClick={() => void decide(proposal, "apply")} type="button">
                      {t("ui.rules.apply")}
                    </button>
                    <button disabled={busy} onClick={() => void decide(proposal, "reject")} type="button">
                      {t("ui.rules.reject")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
