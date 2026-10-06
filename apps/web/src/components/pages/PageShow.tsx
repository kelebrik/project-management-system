import { useEffect, useRef, useState } from "react";
import type { PageDocument } from "@pms/shared";
import { scopeLabel, type PageAnswer, type ScopeOptions } from "../../app/pages/pageModel";
import { usePageAnswers } from "../../app/pages/usePageAnswers";
import { useI18n } from "../../i18n/I18nProvider";
import { PageCanvas } from "./PageCanvas";

/**
 * The show: pages full screen, one after another, scaled to the screen. Live
 * pages refresh every five minutes; a release shows its frozen answers. Esc
 * leaves, arrows turn the pages.
 */

export const SHOW_REFRESH_MS = 5 * 60_000;

export type ShowPage = { title: string; document: PageDocument };

export function PageShow({ pages, start = 0, frozen = null, frozenLabel = null, options, onExit }: { pages: ShowPage[]; start?: number; frozen?: PageAnswer | null; frozenLabel?: string | null; options: ScopeOptions | null; onExit: () => void }) {
  const { t, locale, formatters } = useI18n();
  const [index, setIndex] = useState(Math.min(start, pages.length - 1));
  const [tick, setTick] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const page = pages[index];
  const live = usePageAnswers(frozen ? null : page.document, tick);
  const answer = frozen ?? live.answer;
  const exit = useRef(onExit);
  useEffect(() => {
    exit.current = onExit;
  }, [onExit]);

  useEffect(() => {
    if (frozen) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), SHOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [frozen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit.current();
      else if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") setIndex((value) => Math.min(pages.length - 1, value + 1));
      else if (event.key === "ArrowLeft" || event.key === "PageUp") setIndex((value) => Math.max(0, value - 1));
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages.length]);

  // Full screen when the browser allows it; leaving full screen leaves the show.
  useEffect(() => {
    const element = root.current;
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) exit.current();
    };
    document.addEventListener("fullscreenchange", onChange);
    element?.requestFullscreen?.().catch(() => undefined);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const meta = (
    <>
      <span>{scopeLabel(page.document.scope, options, locale)}</span>
      <span>{t("ui.pages.periodDays", { days: page.document.periodDays })}</span>
      {answer && <span>{t("ui.pages.dataAt", { when: formatters.dateTime(answer.generatedAt) })}</span>}
      {page.document.subtitle && <span>{page.document.subtitle}</span>}
    </>
  );
  return (
    <div aria-label={t("ui.pages.show.title", { title: page.title })} aria-modal="true" className="mp-show" ref={root} role="dialog">
      <PageCanvas document={page.document} editable={false} fit="screen" sheetId="dashboard-show" loading={live.loading} meta={meta} results={answer?.results ?? {}} selectedId={null} title={page.title} today={answer?.today ?? new Date().toISOString().slice(0, 10)} />
      <footer className="mp-show-bar">
        <span>{page.title}</span>
        {pages.length > 1 && <span>{index + 1} / {pages.length}</span>}
        {frozenLabel ? <span>{frozenLabel}</span> : answer && <span>{t("ui.pages.show.updated", { when: formatters.dateTime(answer.generatedAt) })}</span>}
        <span>{t("ui.pages.show.keys")}</span>
        <button onClick={onExit} type="button">{t("ui.pages.show.exit")}</button>
      </footer>
    </div>
  );
}
