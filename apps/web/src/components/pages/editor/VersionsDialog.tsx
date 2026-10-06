import { useCallback, useEffect, useState } from "react";
import type { PageDocument } from "@pms/shared";
import { apiClient } from "../../../api/client";
import { pageErrorText } from "../../../app/pages/pageErrors";
import type { PageAnswer, SavedPage } from "../../../app/pages/pageModel";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { useI18n } from "../../../i18n/I18nProvider";

/**
 * Versions, releases and links of a page in one dialog: keep a version to go
 * back to, freeze a release for a meeting, give a read-only link to the live
 * page or to a release, and take a link back.
 */

type Entry = { id: string; title: string; label: string; createdAt: string };
type Share = { id: string; releaseId: string | null; releaseLabel: string | null; releaseAt: string | null; expiresAt: string | null; revoked: boolean; createdAt: string };
export type OpenedRelease = Entry & { document: PageDocument; answer: PageAnswer };

const linkOf = (token: string) => `${window.location.origin}/shared-page?token=${encodeURIComponent(token)}`;

export function VersionsDialog({ pageId, currentRevision, saved, onRestored, onOpenRelease, onClose }: {
  pageId: string;
  /** The revision the page is at now, read when going back. */
  currentRevision: () => number;
  /** All changes are saved: a version and a release copy the saved page. */
  saved: boolean;
  onRestored: (page: SavedPage) => void;
  onOpenRelease: (release: OpenedRelease) => void;
  onClose: () => void;
}) {
  const { t, formatters } = useI18n();
  const trap = useFocusTrap<HTMLDivElement>(true, onClose);
  const [versions, setVersions] = useState<Entry[]>([]);
  const [releases, setReleases] = useState<Entry[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [label, setLabel] = useState("");
  const [releaseLabel, setReleaseLabel] = useState("");
  const [days, setDays] = useState<number | null>(30);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/pages/${encodeURIComponent(pageId)}`;

  const load = useCallback(() => {
    Promise.all([apiClient.get<Entry[]>(`${base}/revisions`), apiClient.get<Entry[]>(`${base}/releases`), apiClient.get<Share[]>(`${base}/shares`)])
      .then(([nextVersions, nextReleases, nextShares]) => {
        setVersions(nextVersions);
        setReleases(nextReleases);
        setShares(nextShares);
      })
      .catch((failure) => setError(pageErrorText(failure, t, t("ui.pages.versions.failed"))));
  }, [base, t]);
  useEffect(load, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
    } catch (failure) {
      setError(pageErrorText(failure, t, t("ui.pages.versions.failed")));
    } finally {
      setBusy(false);
    }
  };
  const share = (releaseId: string | null) =>
    run(async () => {
      const created = await apiClient.post<{ token: string }>(`${base}/shares`, { releaseId, days });
      setLink(linkOf(created.token));
      await navigator.clipboard?.writeText(linkOf(created.token)).catch(() => undefined);
    });
  const when = (value: string) => formatters.dateTime(value);

  return (
    <div className="mp-modal-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-label={t("ui.pages.versions.title")} aria-modal="true" className="mp-modal mp-versions" ref={trap} role="dialog">
        <div className="mp-modal-head">
          <h2>{t("ui.pages.versions.title")}</h2>
          <span className="mp-toolbar-gap" />
          <button aria-label={t("ui.pages.close")} onClick={onClose} type="button">×</button>
        </div>
        <div className="mp-versions-body">
          {error && <p className="automation-error" role="alert">{error}</p>}
          {!saved && <p className="mp-hint mp-warn">{t("ui.pages.versions.unsaved")}</p>}

          <section>
            <h3>{t("ui.pages.versions.versions")}</h3>
            <p className="mp-hint">{t("ui.pages.versions.versionsHint")}</p>
            <div className="mp-inline">
              <input aria-label={t("ui.pages.versions.label")} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder={t("ui.pages.versions.labelHint")} value={label} />
              <button disabled={busy || !saved} onClick={() => void run(async () => { await apiClient.post(`${base}/revisions`, { label }); setLabel(""); })} type="button">{t("ui.pages.versions.keep")}</button>
            </div>
            <ul className="mp-entries">
              {versions.map((entry) => (
                <li key={entry.id}>
                  <span><b>{entry.label || entry.title}</b> · {when(entry.createdAt)}</span>
                  <button disabled={busy || !saved} onClick={() => void run(async () => onRestored(await apiClient.post<SavedPage>(`${base}/revisions/${entry.id}/restore`, { expectedRevision: currentRevision() })))} type="button">{t("ui.pages.versions.restore")}</button>
                </li>
              ))}
              {versions.length === 0 && <li className="mp-hint">{t("ui.pages.versions.none")}</li>}
            </ul>
          </section>

          <section>
            <h3>{t("ui.pages.versions.releases")}</h3>
            <p className="mp-hint">{t("ui.pages.versions.releasesHint")}</p>
            <div className="mp-inline">
              <input aria-label={t("ui.pages.versions.releaseLabel")} maxLength={120} onChange={(event) => setReleaseLabel(event.target.value)} placeholder={t("ui.pages.versions.releaseLabelHint")} value={releaseLabel} />
              <button disabled={busy || !saved} onClick={() => void run(async () => { await apiClient.post(`${base}/releases`, { label: releaseLabel }); setReleaseLabel(""); })} type="button">{t("ui.pages.versions.freeze")}</button>
            </div>
            <ul className="mp-entries">
              {releases.map((entry) => (
                <li key={entry.id}>
                  <span><b>{entry.label || entry.title}</b> · {when(entry.createdAt)}</span>
                  <span className="mp-inline">
                    <button disabled={busy} onClick={() => void run(async () => onOpenRelease(await apiClient.get<OpenedRelease>(`${base}/releases/${entry.id}`)))} type="button">{t("ui.pages.versions.open")}</button>
                    <button disabled={busy} onClick={() => void share(entry.id)} type="button">{t("ui.pages.versions.link")}</button>
                    <button className="danger" disabled={busy} onClick={() => void run(async () => { await apiClient.delete(`${base}/releases/${entry.id}`); })} type="button">{t("ui.pages.versions.delete")}</button>
                  </span>
                </li>
              ))}
              {releases.length === 0 && <li className="mp-hint">{t("ui.pages.versions.noReleases")}</li>}
            </ul>
          </section>

          <section>
            <h3>{t("ui.pages.versions.links")}</h3>
            <p className="mp-hint">{t("ui.pages.versions.linksHint")}</p>
            <div className="mp-inline">
              <select aria-label={t("ui.pages.versions.expires")} onChange={(event) => setDays(event.target.value ? Number(event.target.value) : null)} value={days ?? ""}>
                <option value="7">{t("ui.pages.versions.days", { days: 7 })}</option>
                <option value="30">{t("ui.pages.versions.days", { days: 30 })}</option>
                <option value="90">{t("ui.pages.versions.days", { days: 90 })}</option>
                <option value="">{t("ui.pages.versions.forever")}</option>
              </select>
              <button disabled={busy} onClick={() => void share(null)} type="button">{t("ui.pages.versions.liveLink")}</button>
            </div>
            {link && (
              <p className="mp-link" role="status">
                {t("ui.pages.versions.copied")} <input aria-label={t("ui.pages.versions.link")} readOnly value={link} onFocus={(event) => event.target.select()} />
              </p>
            )}
            <ul className="mp-entries">
              {shares.map((entry) => (
                <li className={entry.revoked ? "mp-revoked" : ""} key={entry.id}>
                  <span>
                    {entry.releaseId ? t("ui.pages.versions.toRelease", { release: entry.releaseLabel || when(entry.releaseAt ?? entry.createdAt) }) : t("ui.pages.versions.toLive")} · {when(entry.createdAt)}
                    {entry.expiresAt ? ` · ${t("ui.pages.versions.until", { when: when(entry.expiresAt) })}` : ""}
                    {entry.revoked ? ` · ${t("ui.pages.versions.revoked")}` : ""}
                  </span>
                  {!entry.revoked && <button className="danger" disabled={busy} onClick={() => void run(async () => { await apiClient.delete(`${base}/shares/${entry.id}`); })} type="button">{t("ui.pages.versions.revoke")}</button>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
