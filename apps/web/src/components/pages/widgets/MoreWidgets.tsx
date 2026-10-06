import { useRef } from "react";
import { PAGE_SOURCES, pageMetric, type PageFieldDef, type PageQueryResult, type PageWidget } from "@pms/shared";
import { dayPosition, fitRows, formatNumber, formatPageValue, groupLabel, trafficLevel, widgetFields, widgetSource, widgetUnit } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";
import { useBoxSize } from "../useBoxSize";

/**
 * More looks of an answer: a traffic light, a progress bar, figures per group
 * and checkpoints on a strip of time with plan and forecast.
 */

type Rows = Extract<PageQueryResult, { kind: "rows" }>;
type Groups = Extract<PageQueryResult, { kind: "groups" }>;
type Value = Extract<PageQueryResult, { kind: "value" }>;

const metricOf = (widget: PageWidget) => (widget.data && widget.data.metric !== "custom" ? pageMetric(widget.data.metric) : null);

export function TrafficLightWidget({ widget, result }: { widget: PageWidget; result: Value }) {
  const { locale, t } = useI18n();
  const unit = widgetUnit(widget);
  const level = trafficLevel(result.value, widget.thresholds, metricOf(widget)?.higherIsWorse ?? true, unit);
  return (
    <div className="mp-light">
      <span aria-hidden="true" className={`mp-light-lamp ${level ? `mp-light-${level}` : ""}`} />
      <span className="mp-light-text">
        <b>{formatNumber(result.value, unit, locale)}</b>
        <span>{level ? t(`ui.pages.light.${level}` as "ui.pages.light.GREEN") : "—"}</span>
      </span>
    </div>
  );
}

export function ProgressWidget({ widget, result }: { widget: PageWidget; result: Value }) {
  const { locale, t } = useI18n();
  const unit = widgetUnit(widget);
  const target = widget.target ?? (unit === "percent" ? 100 : Math.max(1, result.value ?? 1));
  const share = result.value === null ? 0 : Math.max(0, Math.min(1, result.value / target));
  return (
    <div className="mp-progress-widget">
      <div className="mp-progress-figures">
        <b>{formatNumber(result.value, unit, locale)}</b>
        <span>{t("ui.pages.progress.of", { target: formatNumber(target, unit, locale) })}</span>
      </div>
      <div aria-valuemax={target} aria-valuemin={0} aria-valuenow={result.value ?? 0} className="mp-progress-track" role="progressbar">
        <i style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

export function MetricGridWidget({ widget, result }: { widget: PageWidget; result: Groups }) {
  const { locale, t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const { width, height } = useBoxSize(box);
  const fields = widgetFields(widget);
  const field = fields.find((entry) => entry.key === widget.data?.groupBy) ?? null;
  const unit = widgetUnit(widget);
  const higherIsWorse = metricOf(widget)?.higherIsWorse ?? false;
  const columns = Math.max(1, Math.floor((width + 6) / 120));
  const capacity = columns * Math.max(1, Math.floor((height + 6) / 56));
  const shown = result.groups.length <= capacity ? result.groups.length : capacity - 1;
  return (
    <div className="mp-fill" ref={box}>
      <div className="mp-figures" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {result.groups.slice(0, shown).map((group) => (
          <div className={`mp-figure ${higherIsWorse && (group.value ?? 0) > 0 ? "mp-figure-attention" : ""}`} key={String(group.key)}>
            <b>{formatNumber(group.value, unit, locale)}</b>
            <span title={groupLabel(group.key, field, result.bucket, locale)}>{groupLabel(group.key, field, result.bucket, locale)}</span>
          </div>
        ))}
        {shown < result.groups.length && <div className="mp-figure mp-figure-more">{t("ui.pages.more", { count: result.groups.length - shown })}</div>}
      </div>
    </div>
  );
}

const LANE = 22;
const AXIS = 18;

/** Checkpoints on a strip of time: the forecast as a dot, the plan as a ring, a red line when the forecast is later. */
export function TimelineWidget({ widget, result, today }: { widget: PageWidget; result: Rows; today: string }) {
  const { locale, t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const { width, height } = useBoxSize(box);
  const source = widgetSource(widget);
  const fields = widgetFields(widget);
  const dateFields = result.columns.map((key) => fields.find((field) => field.key === key)).filter((field): field is PageFieldDef => field?.kind === "date");
  const primary = dateFields.find((field) => field.key === "forecastDate") ?? dateFields[0] ?? null;
  const planned = primary?.key === "forecastDate" ? dateFields.find((field) => field.key === "plannedDate") ?? null : null;
  if (!primary) return <div className="mp-note">{t("ui.pages.timeline.noDates")}</div>;
  const titleField = source ? PAGE_SOURCES[source].titleField : "title";
  const { shown, more } = fitRows(height - AXIS, LANE, result.total, result.rows.length);
  const rows = result.rows.slice(0, shown).filter((row) => typeof row.values[primary.key] === "string");
  const days = rows.flatMap((row) => [row.values[primary.key], planned ? row.values[planned.key] : null]).filter((day): day is string => typeof day === "string").map((day) => day.slice(0, 10));
  days.push(today);
  const from = days.reduce((a, b) => (a < b ? a : b));
  const to = days.reduce((a, b) => (a > b ? a : b));
  const labelWidth = Math.min(260, Math.max(120, width * 0.36));
  const plotLeft = labelWidth + 8;
  const plotWidth = Math.max(40, width - plotLeft - 12);
  const x = (day: string) => plotLeft + dayPosition(day, from, to) * plotWidth;
  const months: string[] = [];
  for (let cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); cursor.toISOString().slice(0, 10) <= to; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const day = cursor.toISOString().slice(0, 10);
    if (day >= from) months.push(day);
  }
  return (
    <div className="mp-fill" ref={box}>
      <svg aria-label={widget.title} className="mp-timeline" height={Math.max(0, rows.length * LANE + AXIS)} role="img" width={Math.max(0, width)}>
        {months.map((day) => (
          <g key={day}>
            <line className="mp-timeline-grid" x1={x(day)} x2={x(day)} y1={0} y2={rows.length * LANE} />
            <text className="mp-timeline-axis" x={x(day) + 2} y={rows.length * LANE + 13}>{groupLabel(day, primary, "month", locale)}</text>
          </g>
        ))}
        <line className="mp-timeline-today" x1={x(today)} x2={x(today)} y1={0} y2={rows.length * LANE} />
        {rows.map((row, index) => {
          const y = index * LANE + LANE / 2;
          const forecast = String(row.values[primary.key]).slice(0, 10);
          const plan = planned && typeof row.values[planned.key] === "string" ? String(row.values[planned.key]).slice(0, 10) : null;
          const late = plan !== null && forecast > plan;
          const label = `${source === "workload" ? "" : `${String(row.values.project ?? "")} · `}${formatPageValue(row.values[titleField], null, locale)}`;
          return (
            <g key={row.id}>
              <text className="mp-timeline-label" x={0} y={y + 4}>
                <title>{`${label}: ${formatPageValue(forecast, primary, locale)}${plan ? ` (${planned!.label[locale]} ${formatPageValue(plan, planned, locale)})` : ""}`}</title>
                {label.length > Math.floor(labelWidth / 6.4) ? `${label.slice(0, Math.floor(labelWidth / 6.4) - 1)}…` : label}
              </text>
              {plan && plan !== forecast && <line className={late ? "mp-timeline-slip" : "mp-timeline-gain"} x1={x(plan)} x2={x(forecast)} y1={y} y2={y} />}
              {plan && <circle className="mp-timeline-plan" cx={x(plan)} cy={y} r={4.5} />}
              <circle className={`mp-timeline-dot ${late ? "mp-timeline-late" : ""}`} cx={x(forecast)} cy={y} r={4.5} />
            </g>
          );
        })}
      </svg>
      {more > 0 && <div className="mp-more mp-timeline-more">{t("ui.pages.more", { count: more })}</div>}
    </div>
  );
}
