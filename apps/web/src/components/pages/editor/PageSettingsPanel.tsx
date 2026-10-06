import { pageFormats, pagePeriods, pageThemes, type PageDocument, type PageFormat } from "@pms/shared";
import type { ScopeOptions } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";
import { ScopePicker } from "./ScopePicker";

/** The page itself when no widget is chosen: what it covers, over which period, its format and look. */
export function PageSettingsPanel({ document, options, onChange, onFormat }: { document: PageDocument; options: ScopeOptions | null; onChange: (next: PageDocument, mergeKey?: string) => void; onFormat: (format: PageFormat) => void }) {
  const { t } = useI18n();
  return (
    <aside aria-label={t("ui.pages.panel.page")} className="mp-panel">
      <div className="mp-panel-head"><b>{t("ui.pages.panel.page")}</b></div>
      <label className="mp-field">
        <span>{t("ui.pages.panel.subtitle")}</span>
        <input maxLength={200} onChange={(event) => onChange({ ...document, subtitle: event.target.value }, "subtitle")} placeholder={t("ui.pages.panel.subtitleHint")} value={document.subtitle} />
      </label>
      <ScopePicker onChange={(scope) => onChange({ ...document, scope })} options={options} scope={document.scope} />
      <label className="mp-field">
        <span>{t("ui.pages.panel.period")}</span>
        <select onChange={(event) => onChange({ ...document, periodDays: Number(event.target.value) })} value={document.periodDays}>
          {pagePeriods.map((days) => <option key={days} value={days}>{t("ui.pages.periodDays", { days })}</option>)}
        </select>
        <small>{t("ui.pages.panel.periodHint")}</small>
      </label>
      <label className="mp-field">
        <span>{t("ui.pages.panel.format")}</span>
        <select onChange={(event) => onFormat(event.target.value as PageFormat)} value={document.format}>
          {pageFormats.map((format) => <option key={format} value={format}>{t(`ui.pages.format.${format}` as "ui.pages.format.wide")}</option>)}
        </select>
      </label>
      <label className="mp-field">
        <span>{t("ui.pages.panel.theme")}</span>
        <select onChange={(event) => onChange({ ...document, theme: event.target.value as PageDocument["theme"] })} value={document.theme}>
          {pageThemes.map((theme) => <option key={theme} value={theme}>{t(`ui.pages.theme.${theme}` as "ui.pages.theme.light")}</option>)}
        </select>
      </label>
      <p className="mp-hint">{t("ui.pages.panel.pageHint")}</p>
      <p className="mp-hint mp-keys">{t("ui.pages.panel.keys")}</p>
    </aside>
  );
}
