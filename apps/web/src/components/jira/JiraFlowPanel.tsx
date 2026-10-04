import { encodeJiraSlice, jiraSliceIsEmpty } from "@pms/shared";
import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { useJiraSlice } from "../../hooks/useJiraSlice";
import { useI18n } from "../../i18n/I18nProvider";
import { JiraSliceBar } from "./JiraSliceBar";

type Category = "new" | "indeterminate" | "done";
type Bucket = { start: string; end: string; created: number; resolved: number; open: number; byCategory: Record<Category, number>; scope: number; done: number };
type Flow = { step: string; metric: string; buckets: Bucket[]; quality: { issues: number; incompleteHistory: number; withoutCreationDate: number; missingStoryPoints: number; unknownStatuses: string[] } };
type Series = { key: string; label: string; color: string; values: number[] };

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { left: 40, right: 12, top: 10, bottom: 24 };
const CATEGORY_COLORS: Record<Category, string> = { new: "#94a3b8", indeterminate: "#3b82f6", done: "#22c55e" };

/** Lines over the steps, or stacked areas when `stacked`; the x axis shows the first day of a few steps. */
function Chart({ title, labels, series, stacked = false }: { title: string; labels: string[]; series: Series[]; stacked?: boolean }) {
  const count = labels.length;
  const totals = labels.map((_, index) => (stacked ? series.reduce((sum, line) => sum + line.values[index], 0) : Math.max(0, ...series.map((line) => line.values[index]))));
  const maximum = Math.max(1, ...totals);
  const x = (index: number) => PAD.left + (count <= 1 ? 0 : (index / (count - 1)) * (WIDTH - PAD.left - PAD.right));
  const y = (value: number) => HEIGHT - PAD.bottom - (value / maximum) * (HEIGHT - PAD.top - PAD.bottom);
  const base = new Array<number>(count).fill(0);
  const shapes = series.map((line) => {
    if (!stacked) return <polyline fill="none" key={line.key} points={line.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} stroke={line.color} strokeWidth={2} />;
    const lower = [...base];
    line.values.forEach((value, index) => (base[index] += value));
    const top = base.map((value, index) => `${x(index)},${y(value)}`);
    const bottom = lower.map((value, index) => `${x(index)},${y(value)}`).reverse();
    return <polygon fill={line.color} fillOpacity={0.75} key={line.key} points={[...top, ...bottom].join(" ")} />;
  });
  const tickEvery = Math.max(1, Math.ceil(count / 6));
  return (
    <figure className="jira-flow-chart">
      <figcaption>{title}</figcaption>
      <svg aria-label={title} role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <line stroke="currentColor" strokeOpacity={0.2} x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} />
        <text fontSize={10} x={4} y={y(maximum) + 4}>{Math.round(maximum)}</text>
        <text fontSize={10} x={4} y={y(0)}>0</text>
        {shapes}
        {labels.map((label, index) => (index % tickEvery === 0 ? <text fontSize={10} key={label} textAnchor="middle" x={x(index)} y={HEIGHT - 6}>{label}</text> : null))}
      </svg>
      <ul className="jira-flow-legend">
        {series.map((line) => (
          <li key={line.key}><span style={{ background: line.color }} />{line.label}: <b>{Math.round(line.values.at(-1) ?? 0)}</b></li>
        ))}
      </ul>
    </figure>
  );
}

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
            <Chart labels={labels} series={[{ key: "created", label: t("ui.jiraFlow.created"), color: "#f97316", values: pick("created") }, { key: "resolved", label: t("ui.jiraFlow.resolved"), color: "#22c55e", values: pick("resolved") }]} title={t("ui.jiraFlow.createdResolved")} />
            <Chart labels={labels} series={[{ key: "open", label: t("ui.jiraFlow.open"), color: "#3b82f6", values: pick("open") }]} title={t("ui.jiraFlow.wip")} />
            <Chart labels={labels} series={(["done", "indeterminate", "new"] as Category[]).map((category) => ({ key: category, label: t(`ui.jiraSlice.category.${category}`), color: CATEGORY_COLORS[category], values: buckets.map((bucket) => bucket.byCategory[category]) }))} stacked title={t("ui.jiraFlow.cfd")} />
            <Chart labels={labels} series={[{ key: "scope", label: t("ui.jiraFlow.scope"), color: "#64748b", values: pick("scope") }, { key: "done", label: t("ui.jiraFlow.done"), color: "#22c55e", values: pick("done") }]} title={t("ui.jiraFlow.burnup")} />
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
