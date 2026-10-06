import { useEffect, useState } from "react";
import type { PageDocument } from "@pms/shared";
import { Play, Printer } from "lucide-react";
import { apiClient } from "../api/client";
import { pageErrorText } from "../app/pages/pageErrors";
import type { PageAnswer } from "../app/pages/pageModel";
import { printDashboardPage } from "../app/pages/pagePrint";
import { PageCanvas } from "../components/pages/PageCanvas";
import { PageShow, SHOW_REFRESH_MS } from "../components/pages/PageShow";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/my-page.css";

/**
 * A page opened by a link: read-only, for anyone signed in. A live page shows
 * the reader the data they may see; a release shows what was shown at the
 * meeting, frozen.
 */

type Shared = { title: string; document: PageDocument; release: { label: string; createdAt: string } | null; answer: PageAnswer };

export function SharedPagePage() {
  const { t, formatters } = useI18n();
  const [shared, setShared] = useState<Shared | null>(null);
  const [error, setError] = useState("");
  const [showing, setShowing] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [tick, setTick] = useState(0);
  const live = shared !== null && shared.release === null;

  // Each load checks the link again (revoked, expired, access); a live page is loaded again every five minutes.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    apiClient
      .get<Shared>(`/api/page-links/${encodeURIComponent(token)}`, t("ui.pages.shared.failed"))
      .then((next) => {
        if (!alive) return;
        setShared(next);
        setError("");
      })
      .catch((failure) => {
        if (!alive) return;
        setShared(null);
        setError(pageErrorText(failure, t, t("ui.pages.shared.failed")));
      });
    return () => {
      alive = false;
    };
  }, [t, tick, token]);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), SHOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live]);

  if (!token) return <section className="v2-page mp-page"><p className="automation-error">{t("ui.pages.shared.noToken")}</p></section>;
  if (error) return <section className="v2-page mp-page"><p className="automation-error" role="alert">{error}</p></section>;
  if (!shared) return <section className="v2-page mp-page"><p className="mp-hint">{t("ui.pages.loading")}</p></section>;
  const note = shared.release
    ? t("ui.pages.shared.release", { label: shared.release.label || shared.title, when: formatters.dateTime(shared.release.createdAt) })
    : t("ui.pages.shared.live", { when: formatters.dateTime(shared.answer.generatedAt) });
  return (
    <section className="v2-page mp-page">
      <div className="mp-toolbar" role="toolbar" aria-label={t("ui.pages.toolbar")}>
        <b>{shared.title}</b>
        <span className="mp-save">{note}</span>
        <span className="mp-toolbar-gap" />
        <button onClick={() => printDashboardPage(shared.document.format, shared.title)} type="button"><Printer aria-hidden="true" size={15} /> {t("ui.pages.print")}</button>
        <button className="primary" onClick={() => setShowing(true)} type="button"><Play aria-hidden="true" size={15} /> {t("ui.pages.present")}</button>
      </div>
      <div className="mp-editor">
        <PageCanvas
          document={shared.document}
          editable={false}
          fit="width"
          loading={false}
          meta={<span>{note}</span>}
          results={shared.answer.results}
          selectedId={null}
          title={shared.title}
          today={shared.answer.today}
        />
      </div>
      {showing && <PageShow frozen={shared.answer} frozenLabel={note} onExit={() => setShowing(false)} options={null} pages={[{ title: shared.title, document: shared.document }]} />}
    </section>
  );
}
