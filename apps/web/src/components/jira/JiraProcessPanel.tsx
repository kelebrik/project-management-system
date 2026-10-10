import { encodeJiraSlice, jiraSliceIsEmpty } from "@pms/shared";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { useAppChartColors } from "../../app/charts/appChartTheme";
import { jiraProcessMatrixOption, jiraProcessTimeOption, type JiraProcessEdge, type JiraProcessStatusStat, type JiraProcessText } from "../../app/charts/jiraProcessOptions";
import { useJiraSlice } from "../../hooks/useJiraSlice";
import { useI18n } from "../../i18n/I18nProvider";
import { HighchartsLabChart } from "../charts/HighchartsLabChart";
import { useHighchartsExtras } from "../charts/useHighchartsExtras";
import { JiraSliceBar } from "./JiraSliceBar";

type Process = {
  periodDays: number;
  statuses: string[];
  statusStats: JiraProcessStatusStat[];
  edges: JiraProcessEdge[];
  rework: { issues: number; ofIssues: number; rate: number | null; loops: Array<{ from: string; to: string; count: number }> };
  variants: Array<{ path: string[]; count: number; medianLeadDays: number | null }>;
  stuck: Array<{ issueKey: string; issueUrl: string; status: string; days: number; p85Days: number; assignee: string | null }>;
  kpi: { issues: number; resolved: number; medianLeadDays: number | null; bottleneck: string | null };
  quality: { issues: number; incompleteHistory: number; unknownStart: number; statusesWithoutBaseline: string[] };
};

/**
 * Where the project's Jira work goes and where it waits, from the stored
 * status history: time in each status, the moves between statuses, returns,
 * the usual paths and the issues stuck longer than usual. Jira is not asked.
 */
export function JiraProcessPanel({ projectId, revision, userId, isAdmin }: { projectId: string; revision: number; userId: string | null; isAdmin: boolean }) {
  const { t, locale, formatters } = useI18n();
  const colors = useAppChartColors();
  const chartsReady = useHighchartsExtras(locale);
  const sliceState = useJiraSlice(projectId);
  const [periodDays, setPeriodDays] = useState(90);
  const [process, setProcess] = useState<Process | null>(null);
  const [error, setError] = useState("");
  const sliceParam = jiraSliceIsEmpty(sliceState.slice) ? "" : `&slice=${encodeJiraSlice(sliceState.slice)}`;

  useEffect(() => {
    if (!sliceState.ready) return;
    let alive = true;
    apiClient
      .get<Process>(`/api/projects/${projectId}/jira/process?periodDays=${periodDays}${sliceParam}`, t("ui.jiraProcess.failed"))
      .then((next) => {
        if (!alive) return;
        setProcess(next);
        setError("");
      })
      .catch((failure) => alive && setError(failure instanceof Error ? failure.message : t("ui.jiraProcess.failed")));
    return () => {
      alive = false;
    };
  }, [periodDays, projectId, revision, sliceParam, sliceState.ready, t]);

  const hours = (value: number) => (value >= 48 ? t("ui.jiraProcess.days", { value: formatters.formatNumber(Math.round(value / 2.4) / 10) }) : t("ui.jiraProcess.hours", { value: formatters.formatNumber(Math.round(value * 10) / 10) }));
  const text = useMemo<JiraProcessText>(() => ({
    median: t("ui.jiraProcess.median"), p85: t("ui.jiraProcess.p85"), hours, moves: t("ui.jiraProcess.moves"),
    from: t("ui.jiraProcess.from"), to: t("ui.jiraProcess.to"), waitBefore: t("ui.jiraProcess.waitBefore"), bottleneck: t("ui.jiraProcess.bottleneck"), samples: t("ui.jiraProcess.samples"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hours follows t and formatters.
  }), [formatters, t]);
  const charts = useMemo(() => {
    if (!process || !chartsReady) return null;
    return {
      time: jiraProcessTimeOption(process.statusStats, process.kpi.bottleneck, colors, text, t("ui.jiraProcess.timeTitle")),
      matrix: jiraProcessMatrixOption(process.statuses, process.edges, colors, text, t("ui.jiraProcess.matrixTitle")),
    };
  }, [chartsReady, colors, process, t, text]);
  const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
  const incomplete = process && (process.quality.incompleteHistory > 0 || process.quality.unknownStart > 0);

  return (
    <div className="jira-process-panel">
      <JiraSliceBar isAdmin={isAdmin} projectId={projectId} revision={revision} state={sliceState} userId={userId} />
      <div className="jira-analytics-toolbar">
        <label><span>{t("ui.jiraFlow.period")}</span><select onChange={(event) => setPeriodDays(Number(event.target.value))} value={periodDays}>{[30, 90, 180, 365].map((days) => <option key={days} value={days}>{t("ui.jiraFlow.days", { count: days })}</option>)}</select></label>
      </div>
      {error && <p className="automation-error" role="alert">{error}</p>}
      {!process && !error && <p className="jira-analytics-empty">{t("ui.jiraFlow.loading")}</p>}
      {process && (
        <>
          {incomplete && (
            <p className="jira-process-warning" role="note">
              <AlertTriangle aria-hidden="true" size={15} />
              {t("ui.jiraProcess.incomplete", { incomplete: process.quality.incompleteHistory, unknown: process.quality.unknownStart, issues: process.quality.issues })}
            </p>
          )}
          <div className="jira-process-kpis">
            <div><span>{t("ui.jiraProcess.kpiIssues")}</span><b>{process.kpi.issues}</b></div>
            <div><span>{t("ui.jiraProcess.kpiResolved")}</span><b>{process.kpi.resolved}</b></div>
            <div><span>{t("ui.jiraProcess.kpiLead")}</span><b>{process.kpi.medianLeadDays === null ? "—" : t("ui.jiraProcess.days", { value: formatters.formatNumber(process.kpi.medianLeadDays) })}</b></div>
            <div><span>{t("ui.jiraProcess.kpiRework")}</span><b>{percent(process.rework.rate)}</b><small>{t("ui.jiraProcess.ofIssues", { issues: process.rework.issues, of: process.rework.ofIssues })}</small></div>
            <div className={process.kpi.bottleneck ? "is-bottleneck" : ""}><span>{t("ui.jiraProcess.bottleneck")}</span><b>{process.kpi.bottleneck ?? "—"}</b></div>
          </div>
          <div className="jira-process-grid">
            <section aria-label={t("ui.jiraProcess.timeTitle")}>
              <h3>{t("ui.jiraProcess.timeTitle")}</h3>
              {charts?.time ? <HighchartsLabChart label={t("ui.jiraProcess.timeTitle")} options={charts.time} /> : <p className="jira-analytics-empty">{t("ui.jiraProcess.noStays")}</p>}
            </section>
            <section aria-label={t("ui.jiraProcess.matrixTitle")}>
              <h3>{t("ui.jiraProcess.matrixTitle")}</h3>
              {charts?.matrix ? <HighchartsLabChart label={t("ui.jiraProcess.matrixTitle")} options={charts.matrix} /> : <p className="jira-analytics-empty">{t("ui.jiraProcess.noMoves")}</p>}
            </section>
          </div>
          <div className="jira-process-grid">
            <section aria-label={t("ui.jiraProcess.stuckTitle")}>
              <h3>{t("ui.jiraProcess.stuckTitle")}</h3>
              <p className="jira-process-hint">{t("ui.jiraProcess.stuckHint")}</p>
              {process.stuck.length === 0 ? <p className="jira-analytics-empty">{t("ui.jiraProcess.noStuck")}</p> : (
                <table className="jira-process-table">
                  <thead><tr><th>{t("ui.jiraProcess.issue")}</th><th>{t("ui.jiraProcess.status")}</th><th>{t("ui.jiraProcess.waiting")}</th><th>{t("ui.jiraProcess.usual")}</th><th>{t("ui.jiraProcess.assignee")}</th></tr></thead>
                  <tbody>
                    {process.stuck.map((item) => (
                      <tr key={item.issueKey}>
                        <td><a href={item.issueUrl} target="_blank" rel="noreferrer">{item.issueKey} <ExternalLink aria-hidden="true" size={12} /></a></td>
                        <td>{item.status}</td>
                        <td><b>{t("ui.jiraProcess.days", { value: formatters.formatNumber(item.days) })}</b></td>
                        <td>{t("ui.jiraProcess.days", { value: formatters.formatNumber(item.p85Days) })}</td>
                        <td>{item.assignee ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {process.quality.statusesWithoutBaseline.length > 0 && <p className="jira-process-hint">{t("ui.jiraProcess.noBaseline", { statuses: process.quality.statusesWithoutBaseline.join(", ") })}</p>}
            </section>
            <section aria-label={t("ui.jiraProcess.variantsTitle")}>
              <h3>{t("ui.jiraProcess.variantsTitle")}</h3>
              {process.variants.length === 0 ? <p className="jira-analytics-empty">{t("ui.jiraProcess.noVariants")}</p> : (
                <ol className="jira-process-variants">
                  {process.variants.map((variant) => (
                    <li key={variant.path.join(">")}>
                      <span className="jira-process-path">{variant.path.join(" → ")}</span>
                      <small>{t("ui.jiraProcess.variantStat", { count: variant.count, lead: variant.medianLeadDays === null ? "—" : formatters.formatNumber(variant.medianLeadDays) })}</small>
                    </li>
                  ))}
                </ol>
              )}
              {process.rework.loops.length > 0 && (
                <>
                  <h4>{t("ui.jiraProcess.loopsTitle")}</h4>
                  <ul className="jira-process-variants">
                    {process.rework.loops.map((loop) => <li key={`${loop.from}>${loop.to}`}><span className="jira-process-path">{loop.from} → {loop.to}</span><small>{t("ui.jiraProcess.loopCount", { count: loop.count })}</small></li>)}
                  </ul>
                </>
              )}
            </section>
          </div>
          <p className="jira-analytics-quality">{t("ui.jiraProcess.quality", { issues: process.quality.issues, days: process.periodDays })}</p>
        </>
      )}
    </div>
  );
}
