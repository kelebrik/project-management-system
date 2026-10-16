import { encodeJiraSlice, jiraSliceIsEmpty } from "@pms/shared";
import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { useJiraSlice } from "../../hooks/useJiraSlice";
import { useI18n } from "../../i18n/I18nProvider";
import { JiraFlowChart } from "./JiraCharts";
import { JiraSliceBar } from "./JiraSliceBar";

type Category = "new" | "indeterminate" | "done";
type Bucket = { start: string; end: string; created: number; resolved: number; open: number; byCategory: Record<Category, number>; scope: number; done: number };
type Flow = { step: string; metric: string; buckets: Bucket[]; quality: { issues: number; incompleteHistory: number; withoutCreationDate: number; missingStoryPoints: number; unknownStatuses: string[] } };

const CATEGORY_COLORS: Record<Category, string> = { new: "#94a3b8", indeterminate: "#3b82f6", done: "#22c55e" };

/**
 * The flow of the project's Jira work over time: created against resolved,
 * work in progress, the status categories (a cumulative flow) and a burnup of
 * scope against done, in the same slice as the widgets.
 */
export function JiraFlowPanel({ projectId, revision, userId, isAdmin }: { projectId: string; revision: number; userId: string | null; isAdmin: boolean }) {
  const { t, formatters } = useI18n();
  const sliceState = useJiraSlice(projectId);
  const [periodDays, setPeriodDays] = useState(90);
  const [step, setStep] = useState<"day" | "week" | "month">("week");
  const [metric, setMetric] = useState<"count" | "storyPoints">("count");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [error, setError] = useState("");
  const sliceParam = jiraSliceIsEmpty(sliceState.slice) ? "" : `&slice=${encodeJiraSlice(sliceState.slice)}`;

  useEffect(() => {
    if (!sliceState.ready) return;
    let alive = true;
    apiClient
      .get<Flow>(`/api/projects/${projectId}/jira/flow-series?periodDays=${periodDays}&step=${step}&metric=${metric}${sliceParam}`, t("ui.jiraFlow.failed"))
      .then((next) => {
        if (!alive) return;
        setFlow(next);
        setError("");
      })
      .catch((failure) => alive && setError(failure instanceof Error ? failure.message : t("ui.jiraFlow.failed")));
    return () => {
      alive = false;
    };
  }, [metric, periodDays, projectId, revision, sliceParam, sliceState.ready, step, t]);

  const buckets = flow?.buckets ?? [];
  const labels = buckets.map((bucket) => formatters.date(bucket.start.slice(0, 10)));
  const pick = (key: keyof Omit<Bucket, "start" | "end" | "byCategory">) => buckets.map((bucket) => bucket[key]);
  const format = (value: number) => formatters.formatNumber(Math.round(value * 10) / 10);
  return (
    <div className="jira-flow-panel">
      <JiraSliceBar isAdmin={isAdmin} projectId={projectId} revision={revision} state={sliceState} userId={userId} />
      <div className="jira-analytics-toolbar">
        <label><span>{t("ui.jiraFlow.period")}</span><select onChange={(event) => setPeriodDays(Number(event.target.value))} value={periodDays}>{[30, 90, 180, 365].map((days) => <option key={days} value={days}>{t("ui.jiraFlow.days", { count: days })}</option>)}</select></label>
        <label><span>{t("ui.jiraFlow.step")}</span><select onChange={(event) => setStep(event.target.value as typeof step)} value={step}><option value="day">{t("ui.jiraFlow.step.day")}</option><option value="week">{t("ui.jiraFlow.step.week")}</option><option value="month">{t("ui.jiraFlow.step.month")}</option></select></label>
        <label><span>{t("ui.jiraFlow.metric")}</span><select onChange={(event) => setMetric(event.target.value as typeof metric)} value={metric}><option value="count">{t("ui.jiraFlow.metric.count")}</option><option value="storyPoints">{t("ui.jiraFlow.metric.storyPoints")}</option></select></label>
      </div>
      {error && <p className="automation-error" role="alert">{error}</p>}
      {!flow && !error && <p className="jira-analytics-empty">{t("ui.jiraFlow.loading")}</p>}
      {flow && (
        <>
          <div className="jira-flow-grid">
            <JiraFlowChart format={format} labels={labels} series={[{ key: "created", label: t("ui.jiraFlow.created"), color: "#f97316", values: pick("created") }, { key: "resolved", label: t("ui.jiraFlow.resolved"), color: "#22c55e", values: pick("resolved") }]} title={t("ui.jiraFlow.createdResolved")} />
            <JiraFlowChart format={format} labels={labels} series={[{ key: "open", label: t("ui.jiraFlow.open"), color: "#3b82f6", values: pick("open") }]} title={t("ui.jiraFlow.wip")} />
            <JiraFlowChart format={format} labels={labels} series={(["done", "indeterminate", "new"] as Category[]).map((category) => ({ key: category, label: t(`ui.jiraSlice.category.${category}`), color: CATEGORY_COLORS[category], values: buckets.map((bucket) => bucket.byCategory[category]) }))} stacked title={t("ui.jiraFlow.cfd")} />
            <JiraFlowChart format={format} labels={labels} series={[{ key: "scope", label: t("ui.jiraFlow.scope"), color: "#64748b", values: pick("scope") }, { key: "done", label: t("ui.jiraFlow.done"), color: "#22c55e", values: pick("done") }]} title={t("ui.jiraFlow.burnup")} />
          </div>
          <p className="jira-analytics-quality">
            {t("ui.jiraFlow.quality", { issues: flow.quality.issues, incomplete: flow.quality.incompleteHistory })}
            {flow.metric === "storyPoints" && flow.quality.missingStoryPoints > 0 ? ` ${t("ui.jiraFlow.missingPoints", { count: flow.quality.missingStoryPoints })}` : ""}
            {flow.quality.unknownStatuses.length > 0 ? ` ${t("ui.jiraFlow.unknownStatuses", { statuses: flow.quality.unknownStatuses.join(", ") })}` : ""}
          </p>
        </>
      )}
    </div>
  );
}
