import { useRef } from "react";
import { PAGE_SOURCES, pageMetric, type PageDatasetRow, type PageFieldDef, type PageQueryResult, type PageWidget } from "@pms/shared";
import { beyondAlert, fitRows, formatNumber, formatPageValue, groupLabel, widgetFields, widgetSource, widgetUnit, type Locale } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";
import { useBoxSize } from "../useBoxSize";

/**
 * Widgets that show numbers and rows: a big number with its change, a table,
 * a list and project tiles. Each shows only what fits its box and says how
 * many more there are — nothing spills off the printed sheet.
 */

type Rows = Extract<PageQueryResult, { kind: "rows" }>;
type Groups = Extract<PageQueryResult, { kind: "groups" }>;
type Value = Extract<PageQueryResult, { kind: "value" }>;

const RAG_LETTER: Record<Locale, Record<string, string>> = { ru: { GREEN: "З", AMBER: "Ж", RED: "К" }, en: { GREEN: "G", AMBER: "A", RED: "R" } };

export function Cell({ field, value, row, locale }: { field: PageFieldDef | null; value: PageDatasetRow["values"][string] | undefined; row?: PageDatasetRow; locale: Locale }) {
  if (field?.format === "rag" && typeof value === "string") {
    const label = formatPageValue(value, field, locale);
    return (
      <span className={`mp-rag mp-rag-${value}`} title={label}>
        <span aria-hidden="true">{RAG_LETTER[locale][value] ?? "?"}</span>
        <span className="mp-visually-hidden">{label}</span>
      </span>
    );
  }
  if (field?.format === "percent" && typeof value === "number") {
    return (
      <span className="mp-progress">
        <span className="mp-progress-bar"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
        {formatNumber(value, "percent", locale)}
      </span>
    );
  }
  const textValue = formatPageValue(value, field, locale);
  if (field?.format === "days" && typeof value === "number") return <span className={value > 0 ? "mp-late" : value < 0 ? "mp-early" : ""}>{textValue}</span>;
  if (field?.key === "project" && row?.href) return <a className="mp-code" href={row.href} title={String(row.values.projectName ?? "")}>{textValue}</a>;
  if (field?.format === "code") return <span className="mp-code">{textValue}</span>;
  return <span title={textValue.length > 24 ? textValue : undefined}>{textValue}</span>;
}

export function KpiWidget({ widget, result, periodDays }: { widget: PageWidget; result: Value; periodDays: number }) {
  const { locale, t } = useI18n();
  const unit = widgetUnit(widget);
  const metric = widget.data && widget.data.metric !== "custom" ? pageMetric(widget.data.metric) : null;
  const delta = result.previous === undefined || result.previous === null || result.value === null ? null : Math.round((result.value - result.previous) * 10) / 10;
  const worse = delta !== null && delta !== 0 && (metric?.higherIsWorse ? delta > 0 : delta < 0);
  return (
    <div className="mp-kpi">
      <b className={`mp-kpi-value ${(widget.alert ? beyondAlert(result.value, widget.alert) : metric?.higherIsWorse && !widget.formula && (result.value ?? 0) > 0 && unit !== "percent") ? "mp-kpi-attention" : ""}`}>{formatNumber(result.value, unit, locale)}</b>
      {delta !== null && (
        <span className={`mp-kpi-delta ${delta === 0 ? "" : worse ? "mp-worse" : "mp-better"}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {delta > 0 ? "+" : ""}
          {formatNumber(delta, unit === "days" ? "plain" : unit, locale)} {t("ui.pages.kpi.vsPrevious", { days: periodDays })}
        </span>
      )}
    </div>
  );
}

function GroupTable({ widget, result, locale, height }: { widget: PageWidget; result: Groups; locale: Locale; height: number }) {
  const fields = widgetFields(widget);
  const field = fields.find((entry) => entry.key === widget.data?.groupBy) ?? null;
  const subField = fields.find((entry) => entry.key === widget.data?.groupBy2) ?? null;
  const unit = widgetUnit(widget);
  const { shown, more } = fitRows(height - 26, 24, result.groups.length);
  const { t } = useI18n();
  return (
    <table className="mp-table">
      <thead>
        <tr>
          <th>{field?.label[locale] ?? ""}</th>
          {subField ? result.subKeys.map((key) => <th className="mp-num" key={String(key)}>{groupLabel(key, subField, null, locale)}</th>) : null}
          <th className="mp-num">{t("ui.pages.table.value")}</th>
        </tr>
      </thead>
      <tbody>
        {result.groups.slice(0, shown).map((group) => (
          <tr key={String(group.key)}>
            <td>{groupLabel(group.key, field, result.bucket, locale)}</td>
            {subField ? group.sub?.map((part) => <td className="mp-num" key={String(part.key)}>{formatNumber(part.value, unit, locale)}</td>) : null}
            <td className={`mp-num ${beyondAlert(group.value, widget.alert) ? "mp-late" : ""}`}><b>{formatNumber(group.value, unit, locale)}</b></td>
          </tr>
        ))}
        {more > 0 && <tr className="mp-more"><td colSpan={2 + (subField ? result.subKeys.length : 0)}>{t("ui.pages.more", { count: more })}</td></tr>}
      </tbody>
    </table>
  );
}

export function TableWidget({ widget, result }: { widget: PageWidget; result: Rows | Groups }) {
  const { locale, t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const { height } = useBoxSize(box);
  const fields = widgetFields(widget);
  if (result.kind === "groups") {
    return <div className="mp-fill" ref={box}><GroupTable height={height} locale={locale} result={result} widget={widget} /></div>;
  }
  const columns = result.columns.map((key) => fields.find((field) => field.key === key) ?? null).filter((field): field is PageFieldDef => field !== null);
  const { shown, more } = fitRows(height - 26, 24, result.total, result.rows.length);
  return (
    <div className="mp-fill" ref={box}>
      <table className="mp-table">
        <thead>
          <tr>{columns.map((field) => <th className={field.kind === "number" ? "mp-num" : ""} key={field.key}>{field.label[locale]}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.slice(0, shown).map((row) => (
            <tr key={row.id}>
              {columns.map((field) => (
                <td className={`${field.kind === "number" ? "mp-num" : ""} ${field.key === widget.data?.sort?.by && typeof row.values[field.key] === "number" && beyondAlert(row.values[field.key] as number, widget.alert) ? "mp-alert-cell" : ""}`} key={field.key}>
                  <Cell field={field} locale={locale} row={row} value={row.values[field.key]} />
                </td>
              ))}
            </tr>
          ))}
          {more > 0 && <tr className="mp-more"><td colSpan={columns.length}>{t("ui.pages.more", { count: more })}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function ListWidget({ widget, result }: { widget: PageWidget; result: Rows }) {
  const { locale, t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const { height } = useBoxSize(box);
  const source = widgetSource(widget);
  const fields = widgetFields(widget);
  const titleField = source ? PAGE_SOURCES[source].titleField : "title";
  const details = result.columns.filter((key) => key !== titleField && key !== "project").map((key) => fields.find((field) => field.key === key) ?? null).filter((field): field is PageFieldDef => field !== null);
  const { shown, more } = fitRows(height, 34, result.total, result.rows.length);
  return (
    <div className="mp-fill" ref={box}>
      <ul className="mp-list">
        {result.rows.slice(0, shown).map((row) => (
          <li key={row.id}>
            <span className="mp-list-title" title={formatPageValue(row.values[titleField], null, locale)}>
              {row.href ? <a href={row.href}>{formatPageValue(row.values[titleField], null, locale)}</a> : formatPageValue(row.values[titleField], null, locale)}
            </span>
            <span className="mp-list-meta">
              {source !== "projects" && <span className="mp-code">{String(row.values.project ?? "")}</span>}
              {details.map((field) => (
                <span key={field.key} title={field.label[locale]}>
                  <Cell field={field} locale={locale} value={row.values[field.key]} />
                </span>
              ))}
            </span>
          </li>
        ))}
        {more > 0 && <li className="mp-more">{t("ui.pages.more", { count: more })}</li>}
      </ul>
    </div>
  );
}

export function StatusGridWidget({ widget, result }: { widget: PageWidget; result: Rows }) {
  const { locale, t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const { width, height } = useBoxSize(box);
  const source = widgetSource(widget);
  const fields = widgetFields(widget);
  const titleField = source ? PAGE_SOURCES[source].titleField : "title";
  const details = result.columns.filter((key) => key !== titleField && key !== "rag" && key !== "project").map((key) => fields.find((field) => field.key === key) ?? null).filter((field): field is PageFieldDef => field !== null).slice(0, 4);
  const columns = Math.max(1, Math.floor((width + 8) / 178));
  const tileHeight = 40 + details.length * 18;
  const capacity = columns * Math.max(1, Math.floor((height + 8) / (tileHeight + 8)));
  const shown = Math.min(result.rows.length, result.total <= capacity ? result.total : capacity - 1);
  const more = result.total - shown;
  return (
    <div className="mp-fill" ref={box}>
      <div className="mp-tiles" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {result.rows.slice(0, shown).map((row) => {
          const rag = typeof row.values.rag === "string" ? row.values.rag : null;
          return (
            <article className={`mp-tile ${rag ? `mp-tile-${rag}` : ""}`} key={row.id} style={{ height: tileHeight }}>
              <header>
                {rag && <Cell field={fields.find((field) => field.key === "rag") ?? null} locale={locale} value={rag} />}
                {row.href ? <a href={row.href} title={formatPageValue(row.values[titleField], null, locale)}>{formatPageValue(row.values[titleField], null, locale)}</a> : <b title={formatPageValue(row.values[titleField], null, locale)}>{formatPageValue(row.values[titleField], null, locale)}</b>}
                {source === "projects" && <span className="mp-tile-name" title={String(row.values.projectName ?? "")}>{String(row.values.projectName ?? "")}</span>}
              </header>
              {details.map((field) => (
                <div className="mp-tile-line" key={field.key} title={`${field.label[locale]}: ${formatPageValue(row.values[field.key], field, locale)}`}>
                  <span>{field.label[locale]}</span>
                  <Cell field={field} locale={locale} value={row.values[field.key]} />
                </div>
              ))}
            </article>
          );
        })}
        {more > 0 && <div className="mp-tile mp-tile-more" style={{ height: tileHeight }}>{t("ui.pages.more", { count: more })}</div>}
      </div>
    </div>
  );
}
