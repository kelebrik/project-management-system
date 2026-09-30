import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { filterDecisions, supersededBy, type Decision, type DecisionFilter } from "../app/decisions";
import type { FactRef } from "../app/factRefs";
import { DecisionCard } from "../components/decisions/DecisionCard";
import { DecisionForm, type DecisionLinkOptions } from "../components/decisions/DecisionForm";
import { SegmentedFilter } from "../components/SegmentedFilter";
import { useOpenFactRef } from "../hooks/useOpenFactRef";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/decisions.css";
import { usePageContext } from "./PageContext";

type Named = { id: string; title: string; code?: string; type?: string; status?: string };

/**
 * The project's decision log: what was decided, why, by whom and when, what it
 * settles, and decisions waiting for an approver's answer.
 */
export function ProjectDecisionsPage() {
  const { t } = useI18n();
  const ctx = usePageContext();
  const project = ctx.project;
  const openRef = useOpenFactRef();
  const userId: string | null = ctx.currentUser?.id ?? null;
  const canWrite = !ctx.isReadOnly && !ctx.isClosedProject;
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [form, setForm] = useState<{ editing: Decision | null; supersedes: Decision | null } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiClient
      .get<Decision[]>(`/api/projects/${project.id}/decisions`, t("ui.decisions.loadFailed"))
      .then((rows) => {
        setDecisions(rows);
        setError("");
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.decisions.loadFailed")));
  }, [project.id, t]);
  useEffect(load, [load]);

  const issues: Named[] = useMemo(() => [...(project.issues ?? []), ...(project.closedIssues ?? [])], [project.closedIssues, project.issues]);
  const risks: Named[] = useMemo(() => project.raidItems ?? [], [project.raidItems]);
  const rows: Named[] = useMemo(() => project.wbsItems ?? [], [project.wbsItems]);
  const changes: Named[] = useMemo(() => (project.changeRequests ?? []) as Named[], [project.changeRequests]);
  const options: DecisionLinkOptions = useMemo(
    () => ({
      issues: issues.map((item) => ({ id: item.id, label: item.title })),
      risks: risks.map((item) => ({ id: item.id, label: item.title })),
      rows: rows.map((item) => ({ id: item.id, label: `${item.code} ${item.title}` })),
      changes: changes.map((item) => ({ id: item.id, label: item.title })),
    }),
    [changes, issues, risks, rows],
  );
  const linksOf = (decision: Decision) => {
    const found: Array<{ label: string; ref: FactRef | null }> = [];
    const issue = issues.find((item) => item.id === decision.issueId);
    if (decision.issueId) found.push({ label: `${t("ui.decisions.linkIssue")}: ${issue?.title ?? t("ui.decisions.gone")}`, ref: issue && issue.status !== "Closed" ? { kind: "issue", id: issue.id, label: issue.title } : null });
    const risk = risks.find((item) => item.id === decision.raidItemId);
    if (decision.raidItemId) found.push({ label: `${t("ui.decisions.linkRisk")}: ${risk?.title ?? t("ui.decisions.gone")}`, ref: risk ? { kind: "risk", id: risk.id, label: risk.title, type: risk.type } : null });
    const row = rows.find((item) => item.id === decision.wbsItemId);
    if (decision.wbsItemId) found.push({ label: `${t("ui.decisions.linkRow")}: ${row ? `${row.code} ${row.title}` : t("ui.decisions.gone")}`, ref: row ? { kind: "wbs", id: row.id, label: row.code ?? "" } : null });
    const change = changes.find((item) => item.id === decision.changeRequestId);
    if (decision.changeRequestId) found.push({ label: `${t("ui.decisions.linkChange")}: ${change?.title ?? t("ui.decisions.gone")}`, ref: null });
    return found;
  };

  const shown = filterDecisions(decisions, filter, userId);
  const mine = decisions.filter((decision) => decision.status === "PENDING_APPROVAL" && decision.approverUserId === userId).length;
  return (
    <section className="v2-page decisions-page">
      <div className="v2-compact-header">
        <div>
          <h2>{t("ui.decisions.title")}</h2>
          <span>{t("ui.decisions.description")}</span>
        </div>
        {canWrite && (
          <button className="primary" onClick={() => setForm({ editing: null, supersedes: null })} type="button">
            <Plus aria-hidden="true" size={15} />
            {t("ui.decisions.new")}
          </button>
        )}
      </div>
      <SegmentedFilter<DecisionFilter>
        ariaLabel={t("ui.decisions.filter")}
        onChange={setFilter}
        options={[
          { value: "all", label: t("ui.decisions.filterAll") },
          { value: "mine", label: mine > 0 ? t("ui.decisions.filterMineCount", { count: mine }) : t("ui.decisions.filterMine") },
          { value: "PENDING_APPROVAL", label: t("ui.decisions.status.PENDING_APPROVAL") },
          { value: "APPROVED", label: t("ui.decisions.status.APPROVED") },
          { value: "PROPOSED", label: t("ui.decisions.status.PROPOSED") },
          { value: "REJECTED", label: t("ui.decisions.status.REJECTED") },
          { value: "SUPERSEDED", label: t("ui.decisions.status.SUPERSEDED") },
        ]}
        value={filter}
      />
      {error && <p className="automation-error">{error}</p>}
      {shown.length === 0 && !error && <p className="decisions-empty">{t("ui.decisions.empty")}</p>}
      <div className="decisions-list">
        {shown.map((decision) => (
          <DecisionCard
            canWrite={canWrite}
            decision={decision}
            key={decision.id}
            links={linksOf(decision)}
            onChanged={load}
            onEdit={() => setForm({ editing: decision, supersedes: null })}
            onOpen={openRef}
            onReplace={() => setForm({ editing: null, supersedes: decision })}
            replacedBy={supersededBy(decisions, decision.id)}
            userId={userId}
          />
        ))}
      </div>
      {form && (
        <DecisionForm
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
          options={options}
          projectId={project.id}
          supersedes={form.supersedes}
        />
      )}
    </section>
  );
}
