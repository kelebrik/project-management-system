import { useState } from "react";
import { PAGE_FORMATS, PAGE_TEMPLATES, type PageScope, type PageTemplate, type PageWidget } from "@pms/shared";
import { scopeProjectCount, type PagesList, type SavedPage, type ScopeOptions } from "../../app/pages/pageModel";
import { useI18n } from "../../i18n/I18nProvider";
import { ScopePicker } from "./editor/ScopePicker";

/**
 * The way in: my pages as little pictures of their layout (no data is asked
 * for them), then "For which meeting?" — a template, the projects it covers,
 * and a page with live data a moment later.
 */

function Thumbnail({ widgets, format }: { widgets: ReadonlyArray<Pick<PageWidget, "id" | "type" | "x" | "y" | "w" | "h">>; format: keyof typeof PAGE_FORMATS }) {
  const sheet = PAGE_FORMATS[format];
  return (
    <div aria-hidden="true" className="mp-thumb" style={{ aspectRatio: `${sheet.width} / ${sheet.height}`, gridTemplateRows: `repeat(${sheet.rows}, 1fr)` }}>
      {widgets.map((widget) => (
        <i className={`mp-thumb-${widget.type}`} key={widget.id} style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }} />
      ))}
    </div>
  );
}

function PageCard({ page, onOpen, onDuplicate, onDelete }: { page: SavedPage; onOpen: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { t, formatters } = useI18n();
  return (
    <article className="mp-card">
      <button aria-label={t("ui.pages.gallery.open", { title: page.title })} className="mp-card-open" onClick={onOpen} type="button">
        <Thumbnail format={page.document.format} widgets={page.document.widgets} />
        <b>{page.title}</b>
        <small>{t("ui.pages.gallery.changed", { when: formatters.dateTime(page.updatedAt) })} · {t("ui.pages.gallery.widgets", { count: page.document.widgets.length })}</small>
      </button>
      <div className="mp-card-actions">
        <button onClick={onDuplicate} type="button">{t("ui.pages.gallery.duplicate")}</button>
        <button className="danger" onClick={onDelete} type="button">{t("ui.pages.gallery.delete")}</button>
      </div>
    </article>
  );
}

export function PagesGallery({ list, options, busy, onOpen, onCreate, onDuplicate, onDelete }: {
  list: PagesList | null;
  options: ScopeOptions | null;
  busy: boolean;
  onOpen: (page: SavedPage) => void;
  onCreate: (template: PageTemplate, scope: PageScope) => void;
  onDuplicate: (page: SavedPage) => void;
  onDelete: (page: SavedPage) => void;
}) {
  const { t, locale } = useI18n();
  const [templateId, setTemplateId] = useState(PAGE_TEMPLATES[0].id);
  const [scope, setScope] = useState<PageScope>({ mode: "all" });
  const [search, setSearch] = useState("");
  const template = PAGE_TEMPLATES.find((entry) => entry.id === templateId) ?? PAGE_TEMPLATES[0];
  const count = scopeProjectCount(scope, options);
  const pages = (list?.pages ?? []).filter((page) => !search.trim() || page.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
  return (
    <div className="mp-gallery">
      {list?.canSave !== false && (
        <section aria-labelledby="mp-my-pages">
          <div className="mp-gallery-head">
            <h3 id="mp-my-pages">{t("ui.pages.gallery.mine", { count: list?.pages.length ?? 0 })}</h3>
            {(list?.pages.length ?? 0) > 6 && <input aria-label={t("ui.pages.gallery.search")} onChange={(event) => setSearch(event.target.value)} placeholder={t("ui.pages.gallery.search")} type="search" value={search} />}
          </div>
          {list && list.pages.length === 0 && <p className="mp-hint">{t("ui.pages.gallery.empty")}</p>}
          <div className="mp-cards">
            {pages.map((page) => <PageCard key={page.id} onDelete={() => onDelete(page)} onDuplicate={() => onDuplicate(page)} onOpen={() => onOpen(page)} page={page} />)}
          </div>
        </section>
      )}
      <section aria-labelledby="mp-meeting">
        <h3 id="mp-meeting">{t("ui.pages.gallery.meeting")}</h3>
        <div className="mp-templates">
          {PAGE_TEMPLATES.map((entry) => (
            <button aria-pressed={entry.id === templateId} className={`mp-template ${entry.id === templateId ? "active" : ""}`} key={entry.id} onClick={() => setTemplateId(entry.id)} type="button">
              <Thumbnail format={entry.format} widgets={entry.widgets} />
              <b>{entry.label[locale]}</b>
              <span>{entry.description[locale]}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="mp-create" aria-label={t("ui.pages.gallery.createFor")}>
        <ScopePicker onChange={setScope} options={options} scope={scope} />
        <div className="mp-create-side">
          <p className="mp-hint">{t("ui.pages.gallery.chosen", { template: template.label[locale] })}</p>
          {template.scopeHint === "portfolio" && count === 1 && <p className="mp-hint mp-warn">{t("ui.pages.gallery.portfolioOne")}</p>}
          <button className="primary" disabled={busy || count === 0} onClick={() => onCreate(template, scope)} type="button">{list?.canSave === false ? t("ui.pages.gallery.try") : t("ui.pages.gallery.create")}</button>
          {list?.canSave === false && <p className="mp-hint">{t("ui.pages.demoNote")}</p>}
        </div>
      </section>
    </div>
  );
}
