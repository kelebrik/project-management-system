import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { PageDocument, PageFormat, PageQuestion, PageWidget } from "@pms/shared";
import { ArrowLeft, History, ImageDown, Play, Plus, Printer, Redo2, RefreshCw, Undo2 } from "lucide-react";
import { ApiError, apiClient } from "../../api/client";
import { pushHistory, redoHistory, startHistory, undoHistory, type PageHistory } from "../../app/pages/pageHistory";
import { changeFormat, duplicateWidget, placeNewWidget, scopeLabel, updateWidget, type SavedPage, type ScopeOptions } from "../../app/pages/pageModel";
import { exportPagePng } from "../../app/pages/pageExport";
import { printDashboardPage } from "../../app/pages/pagePrint";
import { usePageAnswers } from "../../app/pages/usePageAnswers";
import { pageErrorText } from "../../app/pages/pageErrors";
import { useI18n } from "../../i18n/I18nProvider";
import { PageSettingsPanel } from "./editor/PageSettingsPanel";
import { QuestionPalette } from "./editor/QuestionPalette";
import { WidgetPanel } from "./editor/WidgetPanel";
import { VersionsDialog, type OpenedRelease } from "./editor/VersionsDialog";
import { PageCanvas } from "./PageCanvas";
import { PageShow } from "./PageShow";

/**
 * The editor of one page: the toolbar, the sheet and the panel of the chosen
 * widget (or of the page). Every change is a step of undo; the page saves
 * itself a moment after the last change, refusing to overwrite a newer save
 * from another tab. The public demo edits without saving.
 */

type Draft = { title: string; document: PageDocument };
type SaveState = "saved" | "pending" | "saving" | "failed" | "conflict" | "local";

export type EditorPage = { id: string | null; title: string; document: PageDocument; revision: number; updatedAt: string | null };

export function PageEditor({ page, canSave, options, onBack }: { page: EditorPage; canSave: boolean; options: ScopeOptions | null; onBack: () => void }) {
  const { t, locale, formatters } = useI18n();
  const [history, setHistory] = useState<PageHistory<Draft>>(() => startHistory({ title: page.title, document: page.document }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>(page.id && canSave ? "saved" : "local");
  const [savedAt, setSavedAt] = useState<string | null>(page.updatedAt);
  const [conflict, setConflict] = useState<SavedPage | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [show, setShow] = useState<{ release: OpenedRelease | null } | null>(null);
  const revision = useRef(page.revision);
  const lastSaved = useRef<Draft>(history.present);
  const draft = history.present;
  const { answer, loading, error } = usePageAnswers(draft.document, refreshKey);

  const commit = useCallback((next: Draft, mergeKey?: string) => setHistory((current) => pushHistory(current, next, mergeKey ?? null)), []);
  const setDocument = (document: PageDocument, mergeKey?: string) => commit({ ...draft, document }, mergeKey);
  const say = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage((current) => (current === text ? "" : current)), 4000);
  };

  // Saves a moment after the last change; one save at a time, each based on the revision the last one returned.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const inFlight = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!page.id || !canSave || conflict || draft === lastSaved.current) return;
    setSaveState("pending");
    (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = true;
    const timer = window.setTimeout(async () => {
      if (inFlight.current) await inFlight.current;
      const sending = latest.current;
      if (sending === lastSaved.current) return;
      setSaveState("saving");
      const run = (async () => {
        try {
          const saved = await apiClient.patch<SavedPage>(`/api/pages/${page.id}`, { title: sending.title.trim() || t("ui.pages.untitled"), document: sending.document, expectedRevision: revision.current }, t("ui.pages.saveFailed"));
          revision.current = saved.revision;
          lastSaved.current = sending;
          setSavedAt(saved.updatedAt);
          if (latest.current === sending) {
            setSaveState("saved");
            (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = false;
          }
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 409) {
            setConflict((failure.details as { page?: SavedPage })?.page ?? null);
            setSaveState("conflict");
          } else {
            setSaveState("failed");
            say(pageErrorText(failure, t, t("ui.pages.saveFailed")));
          }
        }
      })();
      inFlight.current = run;
      await run;
      if (inFlight.current === run) inFlight.current = null;
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saving follows the draft only
  }, [draft, conflict]);

  useEffect(() => () => {
    (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = false;
  }, []);

  const selected = draft.document.widgets.find((widget) => widget.id === selectedId) ?? null;
  const addQuestion = (question: PageQuestion) => {
    const next = placeNewWidget(draft.document, question.widget, locale);
    setPalette(false);
    if (!next) {
      say(t("ui.pages.canvas.full"));
      return;
    }
    setDocument(next);
    setSelectedId(next.widgets[next.widgets.length - 1].id);
  };
  const removeWidget = (id: string) => {
    setDocument({ ...draft.document, widgets: draft.document.widgets.filter((widget) => widget.id !== id) });
    setSelectedId(null);
    say(t("ui.pages.widget.deleted"));
  };
  const copyWidget = (id: string) => {
    const next = duplicateWidget(draft.document, id);
    if (!next) {
      say(t("ui.pages.canvas.full"));
      return;
    }
    setDocument(next);
    setSelectedId(next.widgets[next.widgets.length - 1].id);
  };
  const setFormat = (format: PageFormat) => {
    const next = changeFormat(draft.document, format);
    if (next) setDocument(next);
    else say(t("ui.pages.canvas.formatNoRoom"));
  };
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      setHistory((current) => (event.shiftKey ? redoHistory(current) : undoHistory(current)));
    } else if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      setHistory(redoHistory);
    }
  };
  const resolveConflict = (take: "theirs" | "mine") => {
    if (!conflict) return;
    revision.current = conflict.revision;
    if (take === "theirs") {
      const theirs = { title: conflict.title, document: conflict.document };
      lastSaved.current = theirs;
      setHistory(startHistory(theirs));
      setSaveState("saved");
    } else {
      lastSaved.current = { ...draft };
    }
    setConflict(null);
  };

  const restored = (saved: SavedPage) => {
    const next = { title: saved.title, document: saved.document };
    revision.current = saved.revision;
    lastSaved.current = next;
    setHistory(startHistory(next));
    setSelectedId(null);
    setSavedAt(saved.updatedAt);
    setSaveState("saved");
    setVersionsOpen(false);
    say(t("ui.pages.versions.restored"));
  };
  const exportPng = async () => {
    const sheet = document.getElementById("dashboard-page");
    if (!sheet) return;
    setSelectedId(null);
    try {
      await exportPagePng(sheet, draft.document.format, draft.title);
    } catch {
      say(t("ui.pages.exportFailed"));
    }
  };

  const generated = answer ? formatters.dateTime(answer.generatedAt) : null;
  const meta = (
    <>
      <span>{scopeLabel(draft.document.scope, options, locale)}{answer ? ` · ${t("ui.pages.projectsCount", { count: answer.projects.length })}` : ""}</span>
      <span>{t("ui.pages.periodDays", { days: draft.document.periodDays })}</span>
      {generated && <span>{t("ui.pages.dataAt", { when: generated })}</span>}
      {draft.document.subtitle && <span>{draft.document.subtitle}</span>}
    </>
  );
  const status = {
    saved: savedAt ? t("ui.pages.save.savedAt", { when: formatters.dateTime(savedAt) }) : t("ui.pages.save.saved"),
    pending: t("ui.pages.save.pending"),
    saving: t("ui.pages.save.saving"),
    failed: t("ui.pages.save.failed"),
    conflict: t("ui.pages.save.conflict"),
    local: t("ui.pages.save.local"),
  }[saveState];

  return (
    <div className="mp-editor" onKeyDown={onKeyDown}>
      <div className="mp-toolbar" role="toolbar" aria-label={t("ui.pages.toolbar")}>
        <button onClick={onBack} type="button"><ArrowLeft aria-hidden="true" size={15} /> {t("ui.pages.back")}</button>
        <input aria-label={t("ui.pages.pageTitle")} className="mp-title-input" maxLength={120} onChange={(event) => commit({ ...draft, title: event.target.value }, "page-title")} value={draft.title} />
        <button className="primary" onClick={() => setPalette(true)} type="button"><Plus aria-hidden="true" size={15} /> {t("ui.pages.addWidget")}</button>
        <button aria-label={t("ui.pages.undo")} disabled={history.past.length === 0} onClick={() => setHistory(undoHistory)} title={`${t("ui.pages.undo")} (Ctrl+Z)`} type="button"><Undo2 aria-hidden="true" size={15} /></button>
        <button aria-label={t("ui.pages.redo")} disabled={history.future.length === 0} onClick={() => setHistory(redoHistory)} title={`${t("ui.pages.redo")} (Ctrl+Y)`} type="button"><Redo2 aria-hidden="true" size={15} /></button>
        <button onClick={() => setRefreshKey((key) => key + 1)} title={t("ui.pages.refreshHint")} type="button"><RefreshCw aria-hidden="true" size={15} /> {t("ui.pages.refresh")}</button>
        <span className={`mp-save mp-save-${saveState}`} role="status">{status}</span>
        <span className="mp-toolbar-gap" />
        {page.id && canSave && <button onClick={() => setVersionsOpen(true)} type="button"><History aria-hidden="true" size={15} /> {t("ui.pages.versions.button")}</button>}
        <button onClick={() => void exportPng()} title={t("ui.pages.pngHint")} type="button"><ImageDown aria-hidden="true" size={15} /> PNG</button>
        <button onClick={() => printDashboardPage(draft.document.format, draft.title)} type="button"><Printer aria-hidden="true" size={15} /> {t("ui.pages.print")}</button>
        <button className="primary" onClick={() => setShow({ release: null })} type="button"><Play aria-hidden="true" size={15} /> {t("ui.pages.present")}</button>
      </div>
      {conflict && (
        <div className="mp-banner mp-banner-warn" role="alert">
          {t("ui.pages.conflict")}
          <button onClick={() => resolveConflict("theirs")} type="button">{t("ui.pages.conflictTheirs")}</button>
          <button onClick={() => resolveConflict("mine")} type="button">{t("ui.pages.conflictMine")}</button>
        </div>
      )}
      {!canSave && <div className="mp-banner">{t("ui.pages.demoNote")}</div>}
      {error && <div className="mp-banner mp-banner-warn" role="alert">{error}</div>}
      <div aria-live="polite" className="mp-live">{message}</div>
      <div className="mp-workspace">
        <PageCanvas
          document={draft.document}
          editable
          fit="width"
          loading={loading}
          meta={meta}
          onDelete={removeWidget}
          onDuplicate={copyWidget}
          onLayout={(widgets: PageWidget[], mergeKey?: string) => setDocument({ ...draft.document, widgets }, mergeKey)}
          onRefuse={say}
          onSelect={setSelectedId}
          results={answer?.results ?? {}}
          today={answer?.today ?? new Date().toISOString().slice(0, 10)}
          selectedId={selectedId}
          title={draft.title}
        />
        {selected ? (
          <WidgetPanel
            key={selected.id}
            onChange={(next, mergeKey) => setDocument(updateWidget(draft.document, selected.id, next), mergeKey)}
            onDelete={() => removeWidget(selected.id)}
            onDuplicate={() => copyWidget(selected.id)}
            options={options}
            result={answer?.results[selected.id]}
            widget={selected}
          />
        ) : (
          <PageSettingsPanel document={draft.document} onChange={setDocument} onFormat={setFormat} options={options} />
        )}
      </div>
      {palette && <QuestionPalette onClose={() => setPalette(false)} onPick={addQuestion} />}
      {versionsOpen && page.id && (
        <VersionsDialog
          onClose={() => setVersionsOpen(false)}
          onOpenRelease={(release) => {
            setVersionsOpen(false);
            setShow({ release });
          }}
          onRestored={restored}
          pageId={page.id}
          currentRevision={() => revision.current}
          saved={saveState === "saved"}
        />
      )}
      {show && (
        <PageShow
          frozen={show.release?.answer ?? null}
          frozenLabel={show.release ? t("ui.pages.show.release", { label: show.release.label || show.release.title, when: formatters.dateTime(show.release.createdAt) }) : null}
          onExit={() => setShow(null)}
          options={options}
          pages={[show.release ? { title: show.release.title, document: show.release.document } : draft]}
        />
      )}
    </div>
  );
}
