import { useCallback, useMemo, type ReactNode } from "react";
import type { PageQueryResult, PageWidget } from "@pms/shared";
import { chartSummary, type ChartColors, type ChartInput } from "../../../app/pages/chartOption";
import { widgetFields, widgetUnit } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";
import { ChartView } from "../charts/ChartView";
import { KpiWidget, ListWidget, StatusGridWidget, TableWidget } from "./DataWidgets";
import { MetricGridWidget, ProgressWidget, TimelineWidget, TrafficLightWidget } from "./MoreWidgets";

/**
 * The inside of a widget: its picture for the answer it got, or a calm word
 * when there is nothing to show yet (loading, no data, an error).
 */

function ChartWidget({ widget, result, colors, drillable }: { widget: PageWidget; result: Extract<PageQueryResult, { kind: "groups" }>; colors: ChartColors; drillable: boolean }) {
  const { locale, t } = useI18n();
  const fields = widgetFields(widget);
  const input = useMemo<ChartInput>(
    () => ({
      result,
      kind: widget.chart ?? "columns",
      field: fields.find((field) => field.key === widget.data?.groupBy) ?? null,
      subField: fields.find((field) => field.key === widget.data?.groupBy2) ?? null,
      unit: widgetUnit(widget),
      showValues: Boolean(widget.showValues),
      colors,
      locale,
      title: widget.title,
      alert: widget.alert,
    }),
    [colors, fields, locale, result, widget],
  );
  const summary = chartSummary(input);
  // Outside the editor a bar of a project opens that project.
  const onPick = useCallback((index: number) => {
    const key = result.groups[index]?.key;
    if (key && !key.startsWith("__")) window.location.assign(`/${encodeURIComponent(key)}/overview`);
  }, [result]);
  return (
    <>
      <ChartView input={input} label={summary} onPick={drillable && widget.data?.groupBy === "project" ? onPick : undefined} />
      {result.multiValued && <div className="mp-multi-note">{t("ui.pages.multiValued")}</div>}
    </>
  );
}

/** Text written on the page: paragraphs, "- " points and **bold**. */
function RichText({ value }: { value: string }) {
  const blocks = value.split(/\n{2,}/);
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <b key={index}>{part.slice(2, -2)}</b> : part));
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return <ul key={index}>{lines.map((line, item) => <li key={item}>{inline(line.replace(/^\s*[-•]\s+/, ""))}</li>)}</ul>;
        }
        return <p key={index}>{lines.map((line, item) => <span key={item}>{item > 0 && <br />}{inline(line)}</span>)}</p>;
      })}
    </>
  );
}

export function WidgetBody({ widget, result, colors, periodDays, loading, today, drillable = false }: { widget: PageWidget; result: PageQueryResult | undefined; colors: ChartColors; periodDays: number; loading: boolean; today: string; drillable?: boolean }) {
  const { t, locale } = useI18n();
  if (widget.type === "heading") return <div className="mp-heading">{widget.text || widget.title}</div>;
  if (widget.type === "divider") return <hr className="mp-divider" />;
  if (widget.type === "text" || widget.type === "callout") {
    return <div className="mp-text">{widget.text ? <RichText value={widget.text} /> : <span className="mp-placeholder">{t("ui.pages.text.empty")}</span>}</div>;
  }
  const note = (message: ReactNode, kind = "") => <div className={`mp-note ${kind}`}>{message}</div>;
  if (!result) return loading ? <div aria-label={t("ui.pages.loading")} className="mp-skeleton" /> : note(t("ui.pages.noAnswer"));
  if (result.kind === "error") return note(locale === "ru" || !result.code ? result.error : t(`ui.pages.error.${result.code}` as "ui.pages.error.PAGE_QUERY_INVALID"), "mp-note-error");
  if (result.kind === "value") {
    if (widget.type === "kpi") return <KpiWidget periodDays={periodDays} result={result} widget={widget} />;
    if (widget.type === "traffic-light") return <TrafficLightWidget result={result} widget={widget} />;
    if (widget.type === "progress") return <ProgressWidget result={result} widget={widget} />;
    return note(t("ui.pages.wrongShape"));
  }
  if (result.kind === "groups") {
    if (result.groups.length === 0 || result.rowCount === 0) return note(t("ui.pages.noData"));
    const multiNote = result.multiValued ? <div className="mp-multi-note">{t("ui.pages.multiValued")}</div> : null;
    if (widget.type === "table") return <><TableWidget result={result} widget={widget} />{multiNote}</>;
    if (widget.type === "metric-grid") return <><MetricGridWidget result={result} widget={widget} />{multiNote}</>;
    return <ChartWidget colors={colors} drillable={drillable} result={result} widget={widget} />;
  }
  if (result.total === 0) return note(t("ui.pages.noRows"));
  if (widget.type === "list") return <ListWidget result={result} widget={widget} />;
  if (widget.type === "status-grid") return <StatusGridWidget result={result} widget={widget} />;
  if (widget.type === "timeline") return <TimelineWidget result={result} today={today} widget={widget} />;
  return <TableWidget result={result} widget={widget} />;
}
