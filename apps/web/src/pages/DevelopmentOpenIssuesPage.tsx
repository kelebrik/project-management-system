import { ChevronDown, ChevronUp, CircleAlert, Clock3, ExternalLink, History, Link2, Save, ShieldAlert, Tag, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { Issue } from "../app/domainTypes";
import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

type ActionKey = "section" | "phase" | "risk" | "history";

function sortedStatusUpdates(issue: Issue) {
  return [...issue.statusUpdates].sort((left, right) =>
    new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime(),
  );
}

export function DevelopmentOpenIssuesPage() {
  const { t } = useI18n();
  const {
    closeOpenIssue,
    convertIssueToProblem,
    date,
    isReadOnly,
    project,
    saveOpenIssueWithPayload,
    setError,
    setNotice,
  } = usePageContext();
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{ issueId: string; action: ActionKey } | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const issues = useMemo(
    () => [...(project.issues as Issue[])].sort((left, right) => (
      (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
    )),
    [project.issues],
  );
  const phases = useMemo(
    () => project.wbsItems.filter((item: { type: string }) => item.type === "PHASE"),
    [project.wbsItems],
  );
  const risks = useMemo(
    () => project.raidItems.filter((item: { type: string; status: string }) => (
      item.type === "RISK" && !["CLOSED", "VALIDATED"].includes(item.status)
    )),
    [project.raidItems],
  );

  const toggleExpanded = (issueId: string) => {
    setExpandedIssueId((current) => current === issueId ? null : issueId);
    setActiveAction(null);
  };

  const toggleAction = (issue: Issue, action: ActionKey) => {
    setExpandedIssueId(issue.id);
    setActiveAction((current) => current?.issueId === issue.id && current.action === action ? null : { issueId: issue.id, action });
    if (action === "section") setDraftValues((current) => ({ ...current, [`${issue.id}:section`]: issue.category }));
    if (action === "phase") setDraftValues((current) => ({ ...current, [`${issue.id}:phase`]: issue.phaseId ?? "" }));
    if (action === "risk") setDraftValues((current) => ({ ...current, [`${issue.id}:risk`]: issue.riskId ?? "" }));
  };

  const saveAction = async (issue: Issue, action: "section" | "phase" | "risk") => {
    const value = draftValues[`${issue.id}:${action}`] ?? "";
    const payload = action === "section"
      ? { category: value }
      : action === "phase"
        ? { phaseId: value || null }
        : { riskId: value || null };
    const result = await saveOpenIssueWithPayload(issue.id, payload, { quiet: true, refresh: action === "phase" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActiveAction(null);
    setNotice(t("ui.projects.openIssuesPrototypeSaved"));
  };

  const renderEditor = (issue: Issue, action: ActionKey) => {
    if (action === "history") {
      const statuses = sortedStatusUpdates(issue);
      return (
        <div className="open-issues-prototype-history">
          {statuses.length === 0 ? <span className="muted-inline">{t("ui.projects.openIssuesPrototypeNoHistory")}</span> : statuses.map((status) => (
            <div key={status.id}>
              <time dateTime={status.statusAt}>{date(status.statusAt)}</time>
              <span>{status.text}</span>
            </div>
          ))}
        </div>
      );
    }
    if (action === "section") {
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.projects.section")}
            <input
              autoFocus
              value={draftValues[`${issue.id}:section`] ?? ""}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:section`]: event.target.value }))}
            />
          </label>
          <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    if (action === "phase") {
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.projects.phase")}
            <select
              autoFocus
              value={draftValues[`${issue.id}:phase`] ?? ""}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:phase`]: event.target.value }))}
            >
              <option value="">{t("ui.projects.noPhase")}</option>
              {phases.map((phase: { id: string; code: string; title: string }) => <option value={phase.id} key={phase.id}>{phase.code} · {phase.title}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    return (
      <div className="open-issues-prototype-editor">
        <label>{t("ui.projects.linkedRiskLabel")}
          <select
            autoFocus
            value={draftValues[`${issue.id}:risk`] ?? ""}
            onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:risk`]: event.target.value }))}
          >
            <option value="">{t("ui.projects.noLinkedRiskValue")}</option>
            {risks.map((risk: { id: string; title: string }) => <option value={risk.id} key={risk.id}>{risk.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
      </div>
    );
  };

  return (
    <article className="panel project-card project-module-page open-issues-prototype-page">
      <div className="panel-title">
        <div>
          <h2>{t("ui.projects.openIssuesPrototypeTitle")}</h2>
          <p>{t("ui.projects.openIssuesPrototypeDescription")}</p>
        </div>
        <span className="open-issues-prototype-count">{issues.length}</span>
      </div>
      {issues.length === 0 ? <div className="empty-state">{t("ui.projects.noOpenQuestions")}</div> : (
        <div className="open-issues-prototype-table-shell">
          <table className="open-issues-prototype-table">
            <thead>
              <tr>
                <th scope="col">{t("ui.projects.issueColumnNumber")}</th>
                <th scope="col">{t("ui.projects.issueColumnTask")}</th>
                <th scope="col">{t("ui.projects.issueColumnStatus")}</th>
                <th scope="col">{t("ui.projects.issueColumnOwner")}</th>
                <th scope="col">{t("ui.projects.issueColumnReadiness")}</th>
                <th scope="col" aria-label={t("ui.projects.openIssuesPrototypeActions")} />
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, index) => {
                const expanded = expandedIssueId === issue.id;
                const action = activeAction?.issueId === issue.id ? activeAction.action : null;
                const phase = phases.find((item: { id: string }) => item.id === issue.phaseId);
                const linkedRisk = risks.find((item: { id: string }) => item.id === issue.riskId);
                return (
                  <Fragment key={issue.id}>
                    <tr className={`open-issues-prototype-row ${expanded ? "is-expanded" : ""}`}>
                      <td className="open-issues-prototype-number">{index + 1}</td>
                      <td>
                        <strong>{issue.title}</strong>
                        <small>{issue.category || t("ui.projects.issueNoSection")}</small>
                        {issue.referenceLabel && <a href={issue.referenceUrl ?? "#"} className="open-issues-prototype-reference"><ExternalLink size={13} />{issue.referenceLabel}</a>}
                      </td>
                      <td><span className="open-issues-prototype-status">{issue.status}</span><small>{issue.dueDate ? `${t("ui.projects.openIssuesPrototypeDue")} ${date(issue.dueDate)}` : t("ui.projects.openIssuesPrototypeNoDueDate")}</small></td>
                      <td>{issue.owner || t("ui.projects.notAssignedLowercase")}</td>
                      <td><span className={`open-issues-prototype-readiness ${issue.readiness.toLowerCase()}`}>{issue.readiness}</span></td>
                      <td className="open-issues-prototype-expand-cell">
                        <button type="button" className="open-issues-prototype-expand" onClick={() => toggleExpanded(issue.id)} aria-expanded={expanded}>
                          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{expanded ? t("ui.projects.openIssuesPrototypeCollapse") : t("ui.projects.openIssuesPrototypeExpand")}
                        </button>
                      </td>
                    </tr>
                    {expanded && <tr className="open-issues-prototype-actions-row" key={`${issue.id}-actions`}><td colSpan={6}>
                      <div className="open-issues-prototype-action-bar">
                        <button type="button" className={action === "section" ? "active" : ""} onClick={() => toggleAction(issue, "section")}><Tag size={15} />{t("ui.projects.openIssuesPrototypeSection")}</button>
                        <button type="button" className={action === "phase" ? "active" : ""} onClick={() => toggleAction(issue, "phase")}><CircleAlert size={15} />{t("ui.projects.openIssuesPrototypePhase")}{phase ? ` · ${phase.code}` : ""}</button>
                        <button type="button" className={action === "risk" ? "active" : ""} onClick={() => toggleAction(issue, "risk")}><Link2 size={15} />{t("ui.projects.openIssuesPrototypeRisk")}{linkedRisk ? ` · ${linkedRisk.title}` : ""}</button>
                        <button type="button" onClick={() => void convertIssueToProblem(issue.id)} disabled={isReadOnly}><ShieldAlert size={15} />{t("ui.projects.openIssuesPrototypeConvert")}</button>
                        <button type="button" onClick={() => void closeOpenIssue(issue.id)} disabled={isReadOnly}><X size={15} />{t("ui.projects.openIssuesPrototypeClose")}</button>
                        <button type="button" className={action === "history" ? "active" : ""} onClick={() => toggleAction(issue, "history")}><History size={15} />{t("ui.projects.openIssuesPrototypeHistory")}</button>
                      </div>
                      {action ? renderEditor(issue, action) : <span className="open-issues-prototype-action-hint"><Clock3 size={15} />{t("ui.projects.openIssuesPrototypeActionHint")}</span>}
                    </td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
