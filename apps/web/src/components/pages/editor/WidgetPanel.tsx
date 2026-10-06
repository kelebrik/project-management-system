import { useState, type ComponentType } from "react";
import { CalendarRange, ChartArea, ChartBar, ChartColumn, ChartColumnStacked, ChartLine, ChartPie, CircleDot, Donut, Grid2x2, Hash, LayoutGrid, List, Loader, Table2 } from "lucide-react";
import {
  PAGE_METRIC_GROUPS,
  PAGE_METRICS,
  PAGE_SOURCES,
  PAGE_TEXT_WIDGETS,
  pageBuckets,
  pageMetric,
  pageTones,
  type PageBucket,
  type PageFieldDef,
  type PageFilter,
  type PageFilterOp,
  type PageWidget,
  type PageWidgetData,
} from "@pms/shared";
import { widgetFields, widgetSource, type ScopeOptions } from "../../../app/pages/pageModel";
import { ScopePicker } from "./ScopePicker";
import { PAGE_VIZ, applyViz, vizOf, vizProblem, type PageVizId } from "../../../app/pages/pageViz";
import { useI18n } from "../../../i18n/I18nProvider";

/**
 * The panel of the chosen widget: four steps in a fixed order — what to
 * count, split by, filter, show as — then its title and look. Only the looks
 * that suit the answer can be chosen; the others say why not.
 */

type Props = {
  widget: PageWidget;
  onChange: (next: PageWidget, mergeKey?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  options: ScopeOptions | null;
};

const VIZ_ICON: Record<PageVizId, ComponentType<{ size?: number }>> = { kpi: Hash, traffic: CircleDot, progress: Loader, grid: Grid2x2, timeline: CalendarRange, columns: ChartColumn, bars: ChartBar, line: ChartLine, area: ChartArea, donut: Donut, pie: ChartPie, stacked: ChartColumnStacked, table: Table2, list: List, tiles: LayoutGrid };

const OPS_BY_KIND: Record<PageFieldDef["kind"], PageFilterOp[]> = {
  number: ["gt", "gte", "lt", "lte", "eq", "between", "empty", "notEmpty"],
  date: ["lt", "gt", "between", "empty", "notEmpty"],
  enum: ["in", "notIn", "empty", "notEmpty"],
  boolean: ["isTrue", "isFalse"],
  text: ["contains", "eq", "neq", "empty", "notEmpty"],
  list: ["contains", "empty", "notEmpty"],
};
const NO_VALUE = new Set<PageFilterOp>(["empty", "notEmpty", "isTrue", "isFalse"]);

function FilterAdder({ fields, onAdd }: { fields: readonly PageFieldDef[]; onAdd: (filter: PageFilter) => void }) {
  const { t, locale } = useI18n();
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? "");
  const field = fields.find((entry) => entry.key === fieldKey) ?? fields[0];
  const ops = field ? OPS_BY_KIND[field.kind] : [];
  const [op, setOp] = useState<PageFilterOp>(ops[0] ?? "eq");
  const [value, setValue] = useState<string>("");
  const [value2, setValue2] = useState<string>("");
  const [chosen, setChosen] = useState<string[]>([]);
  if (!field) return null;
  const activeOp = ops.includes(op) ? op : ops[0];
  const inputType = field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text";
  const add = () => {
    const typed = (raw: string) => (field.kind === "number" ? Number(raw) : raw);
    const filter: PageFilter =
      activeOp === "in" || activeOp === "notIn"
        ? { field: field.key, op: activeOp, value: chosen }
        : NO_VALUE.has(activeOp)
          ? { field: field.key, op: activeOp }
          : { field: field.key, op: activeOp, value: typed(value), ...(activeOp === "between" ? { value2: typed(value2) } : {}) };
    onAdd(filter);
    setValue("");
    setValue2("");
    setChosen([]);
  };
  const incomplete = activeOp === "in" || activeOp === "notIn" ? chosen.length === 0 : !NO_VALUE.has(activeOp) && (value === "" || (activeOp === "between" && value2 === ""));
  return (
    <div className="mp-filter-adder">
      <label>
        <span>{t("ui.pages.filter.field")}</span>
        <select onChange={(event) => setFieldKey(event.target.value)} value={field.key}>
          {fields.map((entry) => <option key={entry.key} value={entry.key}>{entry.label[locale]}</option>)}
        </select>
      </label>
      <label>
        <span>{t("ui.pages.filter.condition")}</span>
        <select onChange={(event) => setOp(event.target.value as PageFilterOp)} value={activeOp}>
          {ops.map((entry) => <option key={entry} value={entry}>{t(`ui.pages.op.${entry}` as "ui.pages.op.eq")}</option>)}
        </select>
      </label>
      {(activeOp === "in" || activeOp === "notIn") && (
        <fieldset className="mp-filter-values">
          <legend className="mp-visually-hidden">{t("ui.pages.filter.values")}</legend>
          {Object.entries(field.values ?? {}).map(([key, label]) => (
            <label key={key}>
              <input checked={chosen.includes(key)} onChange={(event) => setChosen(event.target.checked ? [...chosen, key] : chosen.filter((entry) => entry !== key))} type="checkbox" />
              {label[locale]}
            </label>
          ))}
        </fieldset>
      )}
      {!NO_VALUE.has(activeOp) && activeOp !== "in" && activeOp !== "notIn" && (
        <label>
          <span>{t("ui.pages.filter.value")}</span>
          <input onChange={(event) => setValue(event.target.value)} type={inputType} value={value} />
        </label>
      )}
      {activeOp === "between" && (
        <label>
          <span>{t("ui.pages.filter.value2")}</span>
          <input onChange={(event) => setValue2(event.target.value)} type={inputType} value={value2} />
        </label>
      )}
      <button disabled={incomplete} onClick={add} type="button">{t("ui.pages.filter.add")}</button>
    </div>
  );
}

function filterText(filter: PageFilter, fields: readonly PageFieldDef[], locale: "ru" | "en", opLabel: (op: PageFilterOp) => string) {
  const field = fields.find((entry) => entry.key === filter.field);
  const name = field?.label[locale] ?? filter.field;
  const show = (value: unknown) => (Array.isArray(value) ? value.map((entry) => field?.values?.[String(entry)]?.[locale] ?? String(entry)).join(", ") : field?.values?.[String(value)]?.[locale] ?? String(value));
  if (NO_VALUE.has(filter.op)) return `${name}: ${opLabel(filter.op)}`;
  if (filter.op === "between") return `${name}: ${show(filter.value)} – ${show(filter.value2)}`;
  return `${name} ${opLabel(filter.op)} ${show(filter.value)}`;
}

export function WidgetPanel({ widget, onChange, onDelete, onDuplicate, options }: Props) {
  const { t, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const data = widget.data;
  const fields = widgetFields(widget);
  const source = widgetSource(widget);
  const metric = data && data.metric !== "custom" ? pageMetric(data.metric) : null;
  const viz = vizOf(widget);
  const setData = (patch: Partial<PageWidgetData>, mergeKey?: string) => data && onChange({ ...widget, data: { ...data, ...patch } }, mergeKey);
  const groupable = fields.filter((field) => field.groupable);
  const groupField = fields.find((field) => field.key === data?.groupBy) ?? null;
  const rowsShown = widget.type === "list" || widget.type === "status-grid" || widget.type === "timeline" || (widget.type === "table" && !data?.groupBy);
  const valueShown = viz === "kpi" || viz === "traffic" || viz === "progress";
  const opLabel = (op: PageFilterOp) => t(`ui.pages.op.${op}` as "ui.pages.op.eq");

  const changeMetric = (id: string) => {
    if (!data) return;
    const next = pageMetric(id);
    if (!next) return;
    const nextFields = PAGE_SOURCES[next.source].fields;
    const keep = (key: string | null | undefined) => (key && nextFields.some((field) => field.key === key && field.groupable) ? key : null);
    const sameSource = next.source === metric?.source;
    const autoTitle = !widget.title || widget.title === metric?.label[locale];
    const changed: PageWidget = {
      ...widget,
      title: autoTitle ? next.label[locale] : widget.title,
      data: {
        metric: id,
        filters: sameSource ? data.filters : [],
        groupBy: keep(data.groupBy),
        groupBy2: keep(data.groupBy2),
        bucket: data.bucket,
        ...(sameSource ? { columns: data.columns, sort: data.sort, limit: data.limit } : { limit: data.limit }),
        ...(next.periodField && data.compare ? { compare: true } : {}),
      },
    };
    // A chart of another source needs a split of that source: the look fills one in.
    onChange((viz && widget.type === "chart" && !changed.data?.groupBy ? applyViz(changed, viz) : null) ?? changed);
  };

  return (
    <aside aria-label={t("ui.pages.panel.widget")} className="mp-panel">
      <div className="mp-panel-head">
        <b>{t("ui.pages.panel.widget")}</b>
        <span>
          <button onClick={onDuplicate} title={t("ui.pages.panel.duplicateHint")} type="button">{t("ui.pages.panel.duplicate")}</button>
          <button className="danger" onClick={onDelete} type="button">{t("ui.pages.panel.delete")}</button>
        </span>
      </div>
      <label className="mp-field">
        <span>{t("ui.pages.panel.title")}</span>
        <input maxLength={120} onChange={(event) => onChange({ ...widget, title: event.target.value }, `title:${widget.id}`)} value={widget.title} />
      </label>

      {PAGE_TEXT_WIDGETS.has(widget.type) ? (
        <>
          {widget.type !== "divider" && (
            <label className="mp-field">
              <span>{t("ui.pages.panel.text")}</span>
              <textarea maxLength={4000} onChange={(event) => onChange({ ...widget, text: event.target.value }, `text:${widget.id}`)} rows={8} value={widget.text ?? ""} />
              <small>{t("ui.pages.panel.textHint")}</small>
            </label>
          )}
          {widget.type === "callout" && (
            <label className="mp-field">
              <span>{t("ui.pages.panel.tone")}</span>
              <select onChange={(event) => onChange({ ...widget, tone: event.target.value as PageWidget["tone"] })} value={widget.tone ?? "neutral"}>
                {pageTones.map((tone) => <option key={tone} value={tone}>{t(`ui.pages.tone.${tone}` as "ui.pages.tone.neutral")}</option>)}
              </select>
            </label>
          )}
        </>
      ) : data ? (
        <>
          <section className="mp-step">
            <h3><span className="mp-step-n">1</span>{t("ui.pages.step.what")}</h3>
            <select aria-label={t("ui.pages.step.what")} onChange={(event) => changeMetric(event.target.value)} value={data.metric}>
              {Object.entries(PAGE_METRIC_GROUPS).map(([group, label]) => (
                <optgroup key={group} label={label[locale]}>
                  {PAGE_METRICS.filter((entry) => entry.group === group).map((entry) => <option key={entry.id} value={entry.id}>{entry.label[locale]}</option>)}
                </optgroup>
              ))}
            </select>
            {metric && <p className="mp-hint">{metric.definition[locale]}</p>}
            <p className="mp-hint">{metric?.periodField ? t("ui.pages.step.periodApplies") : t("ui.pages.step.periodNotApplies")}</p>
          </section>

          {!valueShown && !rowsShown && (
            <section className="mp-step">
              <h3><span className="mp-step-n">2</span>{t("ui.pages.step.split")}</h3>
              <select aria-label={t("ui.pages.step.split")} onChange={(event) => setData({ groupBy: event.target.value || null, ...(event.target.value === data.groupBy2 ? { groupBy2: null } : {}) })} value={data.groupBy ?? ""}>
                {widget.type === "table" && <option value="">{t("ui.pages.step.noSplit")}</option>}
                {groupable.map((field) => <option key={field.key} value={field.key}>{field.label[locale]}</option>)}
              </select>
              {groupField?.kind === "date" && (
                <select aria-label={t("ui.pages.step.bucket")} onChange={(event) => setData({ bucket: event.target.value as PageBucket })} value={data.bucket ?? "week"}>
                  {pageBuckets.map((bucket) => <option key={bucket} value={bucket}>{t(`ui.pages.bucket.${bucket}` as "ui.pages.bucket.week")}</option>)}
                </select>
              )}
              {(widget.chart === "stacked" || widget.type === "table") && data.groupBy && (
                <label className="mp-field">
                  <span>{t("ui.pages.step.split2")}</span>
                  <select onChange={(event) => setData({ groupBy2: event.target.value || null })} value={data.groupBy2 ?? ""}>
                    <option value="">{t("ui.pages.step.noSplit")}</option>
                    {groupable.filter((field) => field.key !== data.groupBy && field.kind !== "date").map((field) => <option key={field.key} value={field.key}>{field.label[locale]}</option>)}
                  </select>
                </label>
              )}
            </section>
          )}
          {(valueShown || rowsShown) && (
            <section className="mp-step mp-step-muted">
              <h3><span className="mp-step-n">2</span>{t("ui.pages.step.split")}</h3>
              <p className="mp-hint">{valueShown ? t("ui.pages.step.splitKpi") : t("ui.pages.step.splitRows")}</p>
            </section>
          )}

          <section className="mp-step">
            <h3><span className="mp-step-n">3</span>{t("ui.pages.step.filter")}</h3>
            {metric && metric.filters.length > 0 && <p className="mp-hint">{t("ui.pages.step.metricFilters", { filters: metric.filters.map((filter) => filterText(filter, fields, locale, opLabel)).join("; ") })}</p>}
            <ul className="mp-chips">
              {data.filters.map((filter, index) => (
                <li key={`${filter.field}-${index}`}>
                  {filterText(filter, fields, locale, opLabel)}
                  <button aria-label={t("ui.pages.filter.remove")} onClick={() => setData({ filters: data.filters.filter((_, position) => position !== index) })} type="button">×</button>
                </li>
              ))}
            </ul>
            {adding ? (
              <FilterAdder fields={fields} onAdd={(filter) => { setData({ filters: [...data.filters, filter].slice(0, 12) }); setAdding(false); }} />
            ) : (
              <button disabled={data.filters.length >= 12} onClick={() => setAdding(true)} type="button">{t("ui.pages.filter.new")}</button>
            )}
          </section>

          <section className="mp-step">
            <h3><span className="mp-step-n">4</span>{t("ui.pages.step.show")}</h3>
            <div className="mp-viz" role="radiogroup" aria-label={t("ui.pages.step.show")}>
              {PAGE_VIZ.map((entry) => {
                const problem = vizProblem(widget, entry);
                const label = t(`ui.pages.viz.${entry}` as "ui.pages.viz.kpi");
                const Icon = VIZ_ICON[entry];
                return (
                  <button
                    aria-checked={viz === entry}
                    className={viz === entry ? "active" : ""}
                    disabled={Boolean(problem)}
                    key={entry}
                    onClick={() => { const next = applyViz(widget, entry); if (next) onChange(next); }}
                    role="radio"
                    title={problem ? `${label}: ${t(`ui.pages.viz.problem.${problem}` as "ui.pages.viz.problem.needsTime")}` : label}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={16} />
                    <span className="mp-visually-hidden">{label}</span>
                  </button>
                );
              })}
            </div>
            {viz === "traffic" && (
              <div className="mp-field">
                <span>{metric?.higherIsWorse === false ? t("ui.pages.option.thresholdsLower") : t("ui.pages.option.thresholds")}</span>
                <span className="mp-inline">
                  <input aria-label={t("ui.pages.option.amber")} onChange={(event) => onChange({ ...widget, thresholds: { amber: Number(event.target.value), red: widget.thresholds?.red ?? 5 } }, `thresholds:${widget.id}`)} type="number" value={widget.thresholds?.amber ?? 1} />
                  <input aria-label={t("ui.pages.option.red")} onChange={(event) => onChange({ ...widget, thresholds: { amber: widget.thresholds?.amber ?? 1, red: Number(event.target.value) } }, `thresholds:${widget.id}`)} type="number" value={widget.thresholds?.red ?? 5} />
                </span>
              </div>
            )}
            {viz === "progress" && (
              <label className="mp-field">
                <span>{t("ui.pages.option.target")}</span>
                <input min={1} onChange={(event) => onChange({ ...widget, target: Math.max(1, Number(event.target.value) || 1) }, `target:${widget.id}`)} type="number" value={widget.target ?? 100} />
              </label>
            )}
            {viz === "kpi" && metric?.periodField && (
              <label className="mp-check"><input checked={Boolean(data.compare)} onChange={(event) => setData({ compare: event.target.checked })} type="checkbox" />{t("ui.pages.option.compare")}</label>
            )}
            {widget.type === "chart" && (
              <label className="mp-check"><input checked={Boolean(widget.showValues)} onChange={(event) => onChange({ ...widget, showValues: event.target.checked })} type="checkbox" />{t("ui.pages.option.showValues")}</label>
            )}
          </section>

          {rowsShown && source && (
            <details className="mp-step" open>
              <summary>{t("ui.pages.option.rows")}</summary>
              <label className="mp-field">
                <span>{t("ui.pages.option.sort")}</span>
                <span className="mp-inline">
                  <select onChange={(event) => setData({ sort: event.target.value ? { by: event.target.value, dir: data.sort?.dir ?? "asc" } : null })} value={data.sort?.by ?? ""}>
                    <option value="">{t("ui.pages.option.sortNone")}</option>
                    {fields.filter((field) => field.kind !== "list").map((field) => <option key={field.key} value={field.key}>{field.label[locale]}</option>)}
                  </select>
                  <select aria-label={t("ui.pages.option.sortDir")} disabled={!data.sort} onChange={(event) => data.sort && setData({ sort: { ...data.sort, dir: event.target.value as "asc" | "desc" } })} value={data.sort?.dir ?? "asc"}>
                    <option value="asc">{t("ui.pages.option.asc")}</option>
                    <option value="desc">{t("ui.pages.option.desc")}</option>
                  </select>
                </span>
              </label>
              <label className="mp-field">
                <span>{t("ui.pages.option.limit")}</span>
                <input max={500} min={1} onChange={(event) => setData({ limit: Math.max(1, Math.min(500, Number(event.target.value) || 1)) }, `limit:${widget.id}`)} type="number" value={data.limit ?? 50} />
              </label>
              <fieldset className="mp-columns">
                <legend>{t("ui.pages.option.columns")}</legend>
                {fields.map((field) => {
                  const columns = data.columns?.length ? data.columns : [...PAGE_SOURCES[source].defaultColumns];
                  const on = columns.includes(field.key);
                  return (
                    <label key={field.key}>
                      <input checked={on} disabled={!on && columns.length >= 12} onChange={() => setData({ columns: on ? columns.filter((key) => key !== field.key) : [...columns, field.key] })} type="checkbox" />
                      {field.label[locale]}
                    </label>
                  );
                })}
              </fieldset>
            </details>
          )}
          <section className="mp-step">
            <h3>{t("ui.pages.option.scope")}</h3>
            <div className="mp-scope-modes" role="radiogroup" aria-label={t("ui.pages.option.scope")}>
              <label><input checked={!widget.scope} name={`scope-${widget.id}`} onChange={() => onChange({ ...widget, scope: undefined })} type="radio" />{t("ui.pages.option.scopePage")}</label>
              <label><input checked={Boolean(widget.scope)} name={`scope-${widget.id}`} onChange={() => onChange({ ...widget, scope: { mode: "all" } })} type="radio" />{t("ui.pages.option.scopeOwn")}</label>
            </div>
            {widget.scope && <ScopePicker onChange={(scope) => onChange({ ...widget, scope })} options={options} scope={widget.scope} />}
          </section>
          {!rowsShown && !valueShown && (
            <label className="mp-field">
              <span>{t("ui.pages.option.groupLimit")}</span>
              <input max={50} min={1} onChange={(event) => setData({ limit: Math.max(1, Math.min(50, Number(event.target.value) || 1)) }, `limit:${widget.id}`)} type="number" value={data.limit ?? 20} />
            </label>
          )}
        </>
      ) : null}
      <p className="mp-hint mp-keys">{t("ui.pages.panel.keys")}</p>
    </aside>
  );
}
