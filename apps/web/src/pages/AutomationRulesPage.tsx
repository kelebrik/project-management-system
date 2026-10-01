import { automationTemplates } from "@pms/shared";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { Firing, RuleSettings, RulesOverview } from "../app/automationRules";
import { ProposalsList } from "../components/automationRules/ProposalsList";
import { RuleCard } from "../components/automationRules/RuleCard";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/automation-rules.css";
import { usePageContext } from "./PageContext";

type Tab = "rules" | "proposals" | "journal";

/**
 * Rules of the selected project (Development section): five templates that
 * notice events and tell people or prepare a change; the proposals waiting
 * for a person; and what the rules did.
 */
export default function AutomationRulesPage() {
  const { t, formatters } = useI18n();
  const { project, selectProject } = usePageContext();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("tab") === "proposals" ? "proposals" : "rules"));
  const [overview, setOverview] = useState<RulesOverview | null>(null);
  const [firings, setFirings] = useState<Firing[] | null>(null);
  const [error, setError] = useState("");
  const projectId = project?.id ?? null;

  // A bell entry names its project in the link; the page follows it.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("project");
    if (wanted && wanted !== projectId) selectProject(wanted, "automation-rules");
    // Only the link the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    if (!projectId) return;
    apiClient
      .get<RulesOverview>(`/api/projects/${projectId}/automation-rules`, t("ui.rules.failed"))
      .then((answer) => {
        setOverview(answer);
        setError("");
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.rules.failed")));
  }, [projectId, t]);
  useEffect(load, [load]);

  useEffect(() => {
    if (tab !== "journal" || !projectId) return;
    let cancelled = false;
    apiClient
      .get<Firing[]>(`/api/projects/${projectId}/automation/firings`, t("ui.rules.failed"))
      .then((rows) => !cancelled && setFirings(rows))
      .catch((failure) => !cancelled && setError(failure instanceof Error ? failure.message : t("ui.rules.failed")));
    return () => {
      cancelled = true;
    };
  }, [tab, projectId, t]);

  if (!project) return <p>{t("ui.rules.chooseProject")}</p>;
  const current = overview && overview.rules.length > 0 ? overview : null;
  const replaceRule = (template: string, rule: RuleSettings) =>
    setOverview((value) => (value ? { ...value, rules: value.rules.map((entry) => (entry.template === template ? { ...entry, rule } : entry)) } : value));

  return (
    <section className="panel rules-page" aria-labelledby="rules-title">
      <div className="panel-title">
        <div>
          <h2 id="rules-title">
            {t("ui.rules.title")} · {project.code}
          </h2>
          <p>{t("ui.rules.description")}</p>
        </div>
      </div>
      <div className="rules-tabs" role="group">
        <button aria-pressed={tab === "rules"} onClick={() => setTab("rules")} type="button">
          {t("ui.rules.tabRules")}
        </button>
        <button aria-pressed={tab === "proposals"} onClick={() => setTab("proposals")} type="button">
          {t("ui.rules.tabProposals", { count: overview?.pendingProposals ?? 0 })}
        </button>
        <button aria-pressed={tab === "journal"} onClick={() => setTab("journal")} type="button">
          {t("ui.rules.tabJournal")}
        </button>
      </div>
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
      {tab === "rules" && current && (
        <>
          {!current.canWrite && <p>{t("ui.rules.readOnly")}</p>}
          <div className="rules-grid">
            {automationTemplates.map((template) => {
              const entry = current.rules.find((rule) => rule.template === template);
              return (
                <RuleCard
                  canWrite={current.canWrite}
                  key={`${project.id}:${template}`}
                  onSaved={(rule) => replaceRule(template, rule)}
                  projectId={project.id}
                  rule={entry?.rule ?? null}
                  template={template}
                  users={current.users}
                />
              );
            })}
          </div>
        </>
      )}
      {tab === "proposals" && <ProposalsList canWrite={Boolean(current?.canWrite)} key={project.id} onDecided={load} projectId={project.id} />}
      {tab === "journal" &&
        firings &&
        (firings.length === 0 ? (
          <p>{t("ui.rules.noFirings")}</p>
        ) : (
          <ul className="rules-list">
            {firings.map((firing) => (
              <li key={firing.id}>
                <span>
                  <strong>{t(`ui.rules.template.${firing.template}`)}</strong> · <time dateTime={firing.firedAt}>{formatters.dateTime(firing.firedAt)}</time>
                </span>
                <small>{t("ui.rules.firingCounts", { notifications: firing.notifications, proposals: firing.proposals })}</small>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
