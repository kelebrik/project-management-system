import { useRef, useState } from "react";
import { pageDocumentSchema, pageFormats, pagePeriods, pageThemes, type PageDocument, type PageFormat } from "@pms/shared";
import { fileName, saveDownload } from "../../../app/pages/pageExport";
import type { ScopeOptions } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";
import { ScopePicker } from "./ScopePicker";

/** The page itself when no widget is chosen: what it covers, over which period, its format and look. */
export function PageSettingsPanel({ title, document, options, onChange, onFormat, onImport }: { title: string; document: PageDocument; options: ScopeOptions | null; onChange: (next: PageDocument, mergeKey?: string) => void; onFormat: (format: PageFormat) => void; onImport: (title: string, document: PageDocument) => void }) {
  const { t } = useI18n();
  const file = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState("");
  const exportJson = () => saveDownload(new Blob([JSON.stringify({ title, document }, null, 2)], { type: "application/json" }), fileName(title, "json"));
  /** A page from a file: checked like a saved page, so a broken file changes nothing. */
  const importJson = async (chosen: File | undefined) => {
    setImportError("");
    if (!chosen) return;
    try {
      const raw = JSON.parse(await chosen.text()) as { title?: unknown; document?: unknown };
      const parsed = pageDocumentSchema.safeParse(raw.document ?? raw);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "");
      onImport(typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : title, parsed.data);
    } catch (failure) {
      setImportError(t("ui.pages.json.invalid", { reason: failure instanceof Error ? failure.message : "" }));
    } finally {
      if (file.current) file.current.value = "";
    }
  };
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
      <div className="mp-field">
        <span>{t("ui.pages.json.title")}</span>
        <span className="mp-inline">
          <button onClick={exportJson} type="button">{t("ui.pages.json.export")}</button>
          <button onClick={() => file.current?.click()} type="button">{t("ui.pages.json.import")}</button>
          <input accept="application/json,.json" aria-label={t("ui.pages.json.import")} hidden onChange={(event) => void importJson(event.target.files?.[0])} ref={file} type="file" />
        </span>
        <small>{t("ui.pages.json.hint")}</small>
        {importError && <small className="mp-warn" role="alert">{importError}</small>}
      </div>
      <p className="mp-hint">{t("ui.pages.panel.pageHint")}</p>
      <p className="mp-hint mp-keys">{t("ui.pages.panel.keys")}</p>
    </aside>
  );
}
